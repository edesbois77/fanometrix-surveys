// ── Survey Studio → Dashboards — shared server metric fetchers ───────────────
// Bounded, governed reads reused by the Performance and Study routes. All are
// scoped by an ALREADY-AUTHORISED campaign-slug set (from the Discover scope);
// they return aggregates only, never raw respondent rows. Server-only.
import { supabaseAdmin } from "@/lib/supabase-admin";

export const RPC_NULLS = { p_from: null, p_to: null, p_publisher: null, p_placement: null, p_country: null, p_device: null, p_browser: null } as const;

export function foldHourToDay(rows: { bucket_hour: string; event_count: number }[] | null): Record<string, number> {
  const day: Record<string, number> = {};
  for (const r of rows ?? []) {
    const n = Number(r.event_count) || 0;
    const iso = new Date(r.bucket_hour).toISOString();
    day[iso.slice(0, 10)] = (day[iso.slice(0, 10)] ?? 0) + n;
  }
  return day;
}

/** Funnel event counts (by type) for a slug set, with optional dimension overrides. */
export async function eventCountsFor(slugs: string[], extra: Record<string, string | null> = {}): Promise<Map<string, number>> {
  if (!slugs.length) return new Map();
  const { data } = await supabaseAdmin.rpc("dashboard_event_counts", { p_campaign_ids: slugs, ...RPC_NULLS, ...extra });
  return new Map(((data ?? []) as { event_type: string; event_count: number }[]).map((r) => [r.event_type, Number(r.event_count) || 0]));
}

/** Per-day buckets for one event type over a slug set. */
export async function seriesDay(eventType: string, slugs: string[]): Promise<Record<string, number>> {
  if (!slugs.length) return {};
  const { data, error } = await supabaseAdmin.rpc("dashboard_event_series", { p_event_type: eventType, p_campaign_ids: slugs, ...RPC_NULLS });
  if (error) return {};
  return foldHourToDay(data as never);
}

/** Per-HOUR buckets for one event type over a slug set, keyed by ISO-hour instant
 *  (e.g. "2026-07-17T13:00:00.000Z"). The governed event_series RPC already buckets
 *  by hour, so this is exact — no fabricated resolution. */
export async function seriesHourly(eventType: string, slugs: string[]): Promise<Record<string, number>> {
  if (!slugs.length) return {};
  const { data, error } = await supabaseAdmin.rpc("dashboard_event_series", { p_event_type: eventType, p_campaign_ids: slugs, ...RPC_NULLS });
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { bucket_hour: string; event_count: number }[]) {
    const k = new Date(r.bucket_hour).toISOString();
    out[k] = (out[k] ?? 0) + (Number(r.event_count) || 0);
  }
  return out;
}

/** Sum any number of count maps key-wise (pure). */
export function mergeCountMaps(...maps: Record<string, number>[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const m of maps) for (const k of Object.keys(m)) o[k] = (o[k] ?? 0) + m[k];
  return o;
}

/** DIAGNOSTIC ONLY — an ESTIMATED progression yield, never answer evidence.
 *
 *  These events approximate a historical survey's per-answer yield: QUESTION_(k+1)_
 *  REACHED implies an answer to Qk, SURVEY_COMPLETED implies an answer to the final
 *  question. It is an INFERENCE from delivery telemetry, it carries no answer VALUE,
 *  and events are lossy (production shows ~9% fewer SURVEY_COMPLETED than real
 *  response rows). "Total answers" must therefore NEVER be computed from it — an
 *  answer is a stored answer record. Retained for funnel diagnostics only. */
export const HISTORICAL_ANSWER_EVENTS = ["QUESTION_2_REACHED", "QUESTION_3_REACHED", "QUESTION_4_REACHED", "QUESTION_5_REACHED", "SURVEY_COMPLETED"] as const;

/** DIAGNOSTIC ONLY — the time-distributed form of answeredFromProgression. Same
 *  caveats: an inference from delivery telemetry, never answer evidence. */
export async function historicalAnswersHourly(slugs: string[]): Promise<Record<string, number>> {
  if (!slugs.length) return {};
  const parts = await Promise.all(HISTORICAL_ANSWER_EVENTS.map((t) => seriesHourly(t, slugs)));
  return mergeCountMaps(...parts);
}

/**
 * Historical Answers-over-time from the REAL recorded answers: each completed
 * response contributes one answer per non-null legacy positional column, on the UTC
 * day it was submitted. Conserves the same total as the historical branch of
 * perQuestionAnswerCounts, so the chart and the metric agree.
 *
 * Bounded by `fromIso` (the chart window). Q4/Q5 are never invented — a historical
 * survey had nowhere to store them.
 */
export async function historicalAnswersDaily(slugs: string[], fromIso: string): Promise<Record<string, number>> {
  if (!slugs.length) return {};
  const day: Record<string, number> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("responses")
      .select("created_at, q1, q2, q3")
      .in("campaign_id", slugs)
      .eq("is_demo", false)
      .gte("created_at", fromIso)
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) return day;
    const rows = (data ?? []) as { created_at: string | null; q1: unknown; q2: unknown; q3: unknown }[];
    for (const r of rows) {
      if (!r.created_at) continue;             // never fabricate a date
      const n = [r.q1, r.q2, r.q3].filter((v) => v != null && v !== "").length;
      if (n === 0) continue;
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      day[key] = (day[key] ?? 0) + n;
    }
    if (rows.length < PAGE) break;
  }
  return day;
}

const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Historical per-position ANSWER counts from PROGRESSION EVENTS (partial-aware).
 *  The embed emits QUESTION_(k+1)_REACHED on ANSWERING Qk (selectAnswer → advance),
 *  and SURVEY_COMPLETED on the final answer — so:
 *    answered Qk = QUESTION_(k+1)_REACHED   (k = 1 … N-1)
 *    answered QN = SURVEY_COMPLETED
 *  This counts everyone who answered a question, NOT just completers — the true
 *  research yield (values for partials remain unavailable; counts do not). */
export function answeredFromProgression(eventCounts: Map<string, number>, questionCount: number): number[] {
  const n = Math.max(0, Math.min(5, questionCount));
  return Array.from({ length: n }, (_, i) => (i < n - 1 ? int(eventCounts.get(`QUESTION_${i + 2}_REACHED`)) : int(eventCounts.get("SURVEY_COMPLETED"))));
}

/**
 * Per-question ANSWERED counts — the number of STORED ANSWER RECORDS per question.
 *
 * PRECEDENCE (never summed, never inferred):
 *   1. `response_answers` by question_index — authoritative, partial-aware, has values.
 *   2. legacy completed `responses.q1/q2/q3` — real recorded answers, completers only.
 *   3. nothing.
 *
 * It no longer falls back to progression events. Those are an INFERENCE from delivery
 * telemetry with no answer value behind them, and reporting them as "answers" is
 * exactly the substitution this repair removes. `eventCounts` is still accepted so
 * callers need not change, but is used only to report the diagnostic estimate
 * alongside the real count — never in place of it.
 */
export async function perQuestionAnswerCounts(slugs: string[], questionCount: number, eventCounts?: Map<string, number>): Promise<{ counts: number[]; mode: "studio_native" | "historical"; progressionEstimate?: number[] }> {
  const n = Math.max(0, Math.min(5, questionCount));
  if (!slugs.length) return { counts: Array.from({ length: n }, () => 0), mode: "studio_native" };
  const { count: raCount } = await supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("is_demo", false);
  if ((raCount ?? 0) > 0) {
    const counts = await Promise.all(Array.from({ length: n }, (_, qi) =>
      supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("question_index", qi).eq("is_demo", false).then((r) => r.count ?? 0)));
    return { counts, mode: "studio_native" };
  }
  // Historical: the real recorded answers are the legacy positional columns. Q4/Q5
  // are never invented — a historical survey could not store them anywhere.
  const legacyCols = ["q1", "q2", "q3"].slice(0, Math.min(3, n));
  const counts = await Promise.all([
    ...legacyCols.map((col) => supabaseAdmin.from("responses").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("is_demo", false).not(col, "is", null).then((r) => r.count ?? 0)),
    ...Array.from({ length: Math.max(0, n - 3) }, () => Promise.resolve(0)),
  ]);
  return {
    counts,
    mode: "historical",
    ...(eventCounts ? { progressionEstimate: answeredFromProgression(eventCounts, n) } : {}),
  };
}

export function groupBy<T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); if (!k) continue; const a = m.get(k) ?? []; a.push(r); m.set(k, a); }
  return m;
}
