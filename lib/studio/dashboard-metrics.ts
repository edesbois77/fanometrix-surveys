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

/** The progression events whose union IS the per-answer yield for a historical
 *  survey: QUESTION_(k+1)_REACHED counts answers to Qk (k=1…N-1), SURVEY_COMPLETED
 *  counts answers to the final question. Surveys shorter than 5 questions simply
 *  emit zero of the higher QUESTION_*_REACHED events, so this union is question-
 *  count-agnostic and conserves the known per-survey totals (verified: FedEx v1=992,
 *  v2=250). This is a COUNT/yield only — never an answer VALUE. */
export const HISTORICAL_ANSWER_EVENTS = ["QUESTION_2_REACHED", "QUESTION_3_REACHED", "QUESTION_4_REACHED", "QUESTION_5_REACHED", "SURVEY_COMPLETED"] as const;

/** Historical Answers-over-time (per ISO-hour) reconstructed from progression
 *  events — the time-distributed form of answeredFromProgression. Total is
 *  conserved because it is exactly the same events, merely time-bucketed. */
export async function historicalAnswersHourly(slugs: string[]): Promise<Record<string, number>> {
  if (!slugs.length) return {};
  const parts = await Promise.all(HISTORICAL_ANSWER_EVENTS.map((t) => seriesHourly(t, slugs)));
  return mergeCountMaps(...parts);
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
 * Per-question ANSWERED counts. Studio-native = response_answers by question_index
 * (partial-aware, has values). Historical = PROGRESSION EVENTS when available
 * (partial-aware counts via answeredFromProgression) — falling back to legacy
 * completed non-null responses.q1/q2/q3 only when no event counts are supplied.
 */
export async function perQuestionAnswerCounts(slugs: string[], questionCount: number, eventCounts?: Map<string, number>): Promise<{ counts: number[]; mode: "studio_native" | "historical" }> {
  const n = Math.max(0, Math.min(5, questionCount));
  if (!slugs.length) return { counts: Array.from({ length: n }, () => 0), mode: "studio_native" };
  const { count: raCount } = await supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("is_demo", false);
  if ((raCount ?? 0) > 0) {
    const counts = await Promise.all(Array.from({ length: n }, (_, qi) =>
      supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("question_index", qi).eq("is_demo", false).then((r) => r.count ?? 0)));
    return { counts, mode: "studio_native" };
  }
  // Historical: prefer partial-aware progression events when the caller has them.
  if (eventCounts) return { counts: answeredFromProgression(eventCounts, n), mode: "historical" };
  const legacyCols = ["q1", "q2", "q3"].slice(0, Math.min(3, n));
  const counts = await Promise.all([
    ...legacyCols.map((col) => supabaseAdmin.from("responses").select("id", { count: "exact", head: true }).in("campaign_id", slugs).eq("is_demo", false).not(col, "is", null).then((r) => r.count ?? 0)),
    ...Array.from({ length: Math.max(0, n - 3) }, () => Promise.resolve(0)),
  ]);
  return { counts, mode: "historical" };
}

export function groupBy<T>(rows: T[], key: (r: T) => string | null): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); if (!k) continue; const a = m.get(k) ?? []; a.push(r); m.set(k, a); }
  return m;
}
