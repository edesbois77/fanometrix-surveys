// Server-only. Events-based timing metrics for the survey dashboards.
//
// Both timing metrics are derived from the survey_events log (never from
// responses.response_duration_seconds), so there is a single source of truth and
// the completion metric is correct across ALL history. See docs/metrics-timing.md
// for the canonical definition.
//
//   Avg Completion Time         = avg(SURVEY_COMPLETED.created_at − SURVEY_START.created_at)
//                                 population: sessions that completed (all history)
//   Avg Time to First Interaction = avg(SURVEY_START.created_at − SURVEY_VISIBLE.created_at)
//                                 population: sessions that engaged (from the release
//                                 that introduced SURVEY_VISIBLE — forward-only)
//
// Volumes are bounded by *engaged* sessions (SURVEY_START), not renders, so a
// plain JS aggregation over a few paginated queries is sufficient and needs no
// SQL RPC or schema change. If starts ever reach the hundreds of thousands,
// promote this to a Postgres RPC / materialized rollup.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface TimingFilter {
  campaign_id?: string | null;
  /** comma-expanded list used when scoping by survey (multiple campaigns) */
  campaign_ids?: string[] | null;
  publisher?: string | null;
  placement?: string | null;
  country?: string | null;
  device?: string | null;
  browser?: string | null;
  /** full ISO instants (see getDateBounds) */
  date_from?: string | null;
  date_to?: string | null;
  /** access-control scoping: restrict to these campaign_ids (null = admin/all) */
  scopedCampaignIds?: string[] | null;
}

export interface TimingStats {
  /** SURVEY_START → SURVEY_COMPLETED, rounded seconds. null when no sample. */
  avg_completion_seconds: number | null;
  /** SURVEY_VISIBLE → SURVEY_START, rounded seconds. null when no sample. */
  avg_ttfi_seconds: number | null;
  /** # sessions contributing to completion (start+complete pairs) */
  completion_sample: number;
  /** # sessions contributing to TTFI (visible+start pairs) */
  ttfi_sample: number;
}

const PAGE = 1000;    // Supabase returns at most 1000 rows per request
const IN_CHUNK = 200; // session ids per .in() query — keeps the URL bounded

type Row = { session_id: string; created_at: string };

/** Earliest created_at per session (defensive against duplicate events). */
function earliestBySession(rows: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const t = Date.parse(r.created_at);
    if (Number.isNaN(t)) continue;
    const prev = m.get(r.session_id);
    if (prev === undefined || t < prev) m.set(r.session_id, t);
  }
  return m;
}

/** Fetch every SURVEY_START matching the dimension/scope/date filters. This is
 *  the session universe for both metrics — sessions that never started have no
 *  completion or first-interaction time. Paginated to clear the 1000-row cap. */
async function fetchStarts(db: SupabaseClient, f: TimingFilter): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from("survey_events")
      .select("session_id, created_at")
      .eq("event_type", "SURVEY_START")
      .range(from, from + PAGE - 1);

    if (f.campaign_id)        q = q.eq("campaign_id", f.campaign_id);
    else if (f.campaign_ids)  q = q.in("campaign_id", f.campaign_ids);
    if (f.publisher) q = q.eq("publisher", f.publisher);
    if (f.placement) q = q.eq("placement", f.placement);
    if (f.country)   q = q.eq("country",   f.country);
    if (f.device)    q = q.eq("device",    f.device);
    if (f.browser)   q = q.eq("browser",   f.browser);
    if (f.date_from) q = q.gte("created_at", f.date_from);
    if (f.date_to)   q = q.lte("created_at", f.date_to);
    if (f.scopedCampaignIds) q = q.in("campaign_id", f.scopedCampaignIds);

    const { data, error } = await q;
    if (error) throw error;
    const batch = (data ?? []) as Row[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/** Fetch events of one type for a bounded set of session ids (chunked .in()). */
async function fetchBySessions(
  db: SupabaseClient,
  eventType: string,
  sessionIds: string[],
): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < sessionIds.length; i += IN_CHUNK) {
    const chunk = sessionIds.slice(i, i + IN_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from("survey_events")
        .select("session_id, created_at")
        .eq("event_type", eventType)
        .in("session_id", chunk)
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = (data ?? []) as Row[];
      out.push(...batch);
      if (batch.length < PAGE) break;
    }
  }
  return out;
}

function mean(deltasMs: number[]): number | null {
  if (deltasMs.length === 0) return null;
  const sum = deltasMs.reduce((a, b) => a + b, 0);
  return Math.round(sum / deltasMs.length / 1000);
}

/**
 * Compute events-based timing for the given filter. Returns nulls (sample 0)
 * when there is no qualifying data — callers render "—" and, for TTFI, an
 * "available from this release" note.
 */
export async function getTimingStats(
  db: SupabaseClient,
  f: TimingFilter,
): Promise<TimingStats> {
  const starts = earliestBySession(await fetchStarts(db, f));
  if (starts.size === 0) {
    return { avg_completion_seconds: null, avg_ttfi_seconds: null, completion_sample: 0, ttfi_sample: 0 };
  }

  const sessionIds = [...starts.keys()];
  const [completedRows, visibleRows] = await Promise.all([
    fetchBySessions(db, "SURVEY_COMPLETED", sessionIds),
    fetchBySessions(db, "SURVEY_VISIBLE",   sessionIds),
  ]);
  const completed = earliestBySession(completedRows);
  const visible   = earliestBySession(visibleRows);

  // Completion: START → COMPLETED. Discard non-positive deltas (clock skew /
  // out-of-order inserts) rather than letting bad rows drag the mean.
  const completionDeltas: number[] = [];
  for (const [sid, startT] of starts) {
    const doneT = completed.get(sid);
    if (doneT !== undefined && doneT > startT) completionDeltas.push(doneT - startT);
  }

  // TTFI: VISIBLE → START. Allow 0 (instant answer); discard negatives.
  const ttfiDeltas: number[] = [];
  for (const [sid, startT] of starts) {
    const seenT = visible.get(sid);
    if (seenT !== undefined && startT >= seenT) ttfiDeltas.push(startT - seenT);
  }

  return {
    avg_completion_seconds: mean(completionDeltas),
    avg_ttfi_seconds:       mean(ttfiDeltas),
    completion_sample:      completionDeltas.length,
    ttfi_sample:            ttfiDeltas.length,
  };
}
