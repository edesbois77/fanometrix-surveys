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

/** The migration-200 additions that make a row self-describing. */
function extendedRow(a: AnswerInput, ctx: CampaignEvidenceContext, client: AnswerClientContext, nowIso: string) {
  return {
    ...baseRow(a, ctx, client, nowIso),
    question_id: a.questionId ?? null,
    canonical_question_key: a.canonicalQuestionKey ?? null,
    group_id: ctx.groupId,
    publisher: ctx.publisher,
    placement: client.placement ?? null,
    placement_id: client.placementId ?? null,
    creative_id: client.creativeId ?? null,
    renderer: client.renderer ?? null,
    survey_language: ctx.surveyLanguage,
    country_code: ctx.countryCode,
  };
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
      .upsert(answers.map((a) => extendedRow(a, ctx, client, nowIso)), opts);
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
