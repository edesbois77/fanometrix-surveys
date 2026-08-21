// ── The one place an individual survey answer is persisted (server-only) ─────
//
// `response_answers` is the AUTHORITATIVE individual-answer evidence store for
// Survey Studio surveys of 1–5 questions. Every answer is written the moment it is
// selected (POST /api/answer), and the completion path (POST /api/submit) re-asserts
// the full set as a backfill, so a completed survey always holds every answer even
// if an individual per-selection write was lost to a flaky network.
//
// `responses.q1/q2/q3` remains ONLY as a legacy compatibility projection for readers
// that predate this store (vw_campaign_responses, the legacy dashboard/exports and
// historical surveys). It is NOT authoritative and cannot represent Q4/Q5.
//
// IDEMPOTENCY: rows are upserted on the (session_id, question_index) unique key from
// migration 147. A retried save, a duplicate beacon, or the completion backfill
// re-asserting an answer already written all resolve to the SAME row — they can
// never inflate an answer count. Re-selecting a different option before completing
// updates that one row in place and leaves `created_at` (first selection) intact.
//
// NULL-PRESERVING UPSERT: an upsert writes every column it is GIVEN, so a later
// write that merely lacks a field would blank whatever an earlier write had stored.
// That is a real hazard here because the completion backfill runs from /api/submit,
// whose payload is not identical to the per-selection payload — it cost us the
// `renderer` of every completed journey until this was fixed. Optional metadata is
// therefore OMITTED from the payload when it has no value, rather than sent as null:
// PostgREST's ON CONFLICT DO UPDATE only touches the columns present in the body, so
// an omitted column keeps whatever it already held. Richer metadata written at
// selection time always survives completion, whatever the completion payload carries.
//
// MIGRATION TOLERANCE: the richer columns come from migration 200, which is applied
// by hand. This module probes once per process: if the extended write is rejected
// for an unknown column, it falls back to the migration-147 column set and keeps
// going. Answer capture therefore works from the code deploy alone; migration 200
// upgrades the evidence rather than enabling it.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CampaignEvidenceContext } from "@/lib/survey-evidence-context";

export type AnswerInput = {
  sessionId: string;
  /** 0-based position of the question in the survey's authored order (0–4). This IS
   *  the question position; identity is carried by questionId/canonicalQuestionKey. */
  questionIndex: number;
  /** The selected option's canonical id, as a string. */
  answerValue: string;
  /** The authored question id actually rendered (surveys.questions[].id). */
  questionId?: string | null;
  /** Cross-survey comparability anchor, when the survey carries one. */
  canonicalQuestionKey?: string | null;
};

/** Context only the browser can know (ad-server macros, placement, renderer). */
export type AnswerClientContext = {
  country?: string | null;
  fanSegment?: string | null;
  market?: string | null;
  placement?: string | null;
  placementId?: string | null;
  creativeId?: string | null;
  renderer?: string | null;
  /** Client-declared test traffic. ORed with the campaign's own simulated flag. */
  isDemo?: boolean;
};

export type PersistResult = { saved: number; error: string | null; degraded: boolean };

/** null = not probed yet, true = migration 200 present, false = fall back this process. */
let extendedColumns: boolean | null = null;

/** Test-only: forget the migration-200 probe result. */
export function __resetAnswerStoreProbe(): void {
  extendedColumns = null;
}

/** Does this PostgREST error mean "that column does not exist (yet)"? */
function isUnknownColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST204") return true; // column not found in schema cache
  const m = (err.message ?? "").toLowerCase();
  return m.includes("column") && (m.includes("does not exist") || m.includes("schema cache"));
}

/** The migration-147 column set — always writable, on any applied schema. */
function baseRow(a: AnswerInput, ctx: CampaignEvidenceContext, client: AnswerClientContext, nowIso: string) {
  return {
    session_id: a.sessionId,
    campaign_id: ctx.campaignId,
    survey_id: ctx.surveyId,
    question_index: a.questionIndex,
    answer_value: a.answerValue,
    country: client.country ?? null,
    fan_segment: client.fanSegment ?? null,
    // Server context wins: the campaign's configured market is authoritative over
    // whatever the tag happened to pass.
    market: ctx.market ?? client.market ?? null,
    is_demo: ctx.isSimulated || !!client.isDemo,
    updated_at: nowIso,
  };
}

/** Optional metadata columns (migration 200). Each is omitted when it has no value,
 *  so a later, sparser write can never blank a richer earlier one. */
const OPTIONAL_COLUMNS = [
  "question_id", "canonical_question_key", "group_id", "publisher",
  "placement", "placement_id", "creative_id", "renderer",
  "survey_language", "country_code",
  // WP1 (migration 213). Which Studio group configuration was serving when this
  // answer was given. Set only for Studio-group traffic, and only after the
  // claim has been validated server-side; single-campaign and legacy-group
  // answers leave it out entirely, exactly as before.
  "configuration_revision_id",
] as const;

/** The migration-200 additions that make a row self-describing. Values that are
 *  null/undefined are left OUT of the object entirely — see NULL-PRESERVING UPSERT. */
function extendedValues(a: AnswerInput, ctx: CampaignEvidenceContext, client: AnswerClientContext): Record<string, string> {
  const candidate: Record<string, string | null | undefined> = {
    question_id: a.questionId,
    canonical_question_key: a.canonicalQuestionKey,
    group_id: ctx.groupId,
    publisher: ctx.publisher,
    placement: client.placement,
    placement_id: client.placementId,
    creative_id: client.creativeId,
    renderer: client.renderer,
    survey_language: ctx.surveyLanguage,
    country_code: ctx.countryCode,
    configuration_revision_id: ctx.configurationRevisionId,
  };
  const out: Record<string, string> = {};
  for (const col of OPTIONAL_COLUMNS) {
    const v = candidate[col];
    if (v != null && v !== "") out[col] = v;
  }
  return out;
}

/**
 * PostgREST requires every object in a bulk upsert to carry the SAME keys, so the
 * payload uses the union of the optional columns any row in this batch supplies.
 * A batch always shares one campaign context and one client context, so the union is
 * in practice the per-row set; using the union keeps the request valid if a caller
 * ever mixes rows, and a row lacking a unioned key sends null for it only when some
 * sibling row genuinely had a value — never spontaneously.
 */
function buildRows(answers: AnswerInput[], ctx: CampaignEvidenceContext, client: AnswerClientContext, nowIso: string) {
  const perRow = answers.map((a) => extendedValues(a, ctx, client));
  const union = [...new Set(perRow.flatMap((r) => Object.keys(r)))];
  return answers.map((a, i) => {
    const row: Record<string, unknown> = { ...baseRow(a, ctx, client, nowIso) };
    for (const col of union) row[col] = perRow[i][col] ?? null;
    return row;
  });
}

/**
 * Persist one or more answers for a single survey journey. Upsert-based, so calling
 * this twice with the same (session, question) is a no-op on the count.
 * Never throws — the caller decides how to surface a failure.
 */
export async function persistAnswers(
  answers: AnswerInput[],
  ctx: CampaignEvidenceContext,
  client: AnswerClientContext = {},
): Promise<PersistResult> {
  if (answers.length === 0) return { saved: 0, error: null, degraded: false };
  const nowIso = new Date().toISOString();
  const opts = { onConflict: "session_id,question_index" } as const;

  if (extendedColumns !== false) {
    const { error } = await supabaseAdmin
      .from("response_answers")
      .upsert(buildRows(answers, ctx, client, nowIso), opts);
    if (!error) {
      extendedColumns = true;
      return { saved: answers.length, error: null, degraded: false };
    }
    if (!isUnknownColumnError(error)) {
      return { saved: 0, error: error.message ?? "upsert failed", degraded: false };
    }
    // Migration 200 is not applied on this database yet. Record it for the life of
    // this process and degrade to the columns that certainly exist, so a pending
    // hand-applied migration can never cost us a single answer.
    console.warn("[answers] migration 200 columns absent — persisting the base column set");
    extendedColumns = false;
  }

  const { error } = await supabaseAdmin
    .from("response_answers")
    .upsert(answers.map((a) => baseRow(a, ctx, client, nowIso)), opts);
  if (error) return { saved: 0, error: error.message ?? "upsert failed", degraded: true };
  return { saved: answers.length, error: null, degraded: true };
}
