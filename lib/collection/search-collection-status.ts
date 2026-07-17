// Read model for the generic collection engine: the current snapshot of each
// search's live collection, derived from its most recent collection_run. Using
// the latest run (rather than summing all social_mentions across runs) gives a
// clean, deduped "current state" and sidesteps the cross-run double-counting
// that preserved history would otherwise cause. Run-over-run comparison is a
// separate history view; this is "where the search stands now".
import { supabaseAdmin } from "@/lib/supabase-admin";

export type SearchCollectionStatus = {
  latest_run_status: "running" | "completed" | "partial" | "failed" | null;
  last_collected_at: string | null;
  connectors: string[];
  run_count: number;
  video_count: number;
  comment_count: number;
  post_count: number;
  by_kind: Record<string, number>;
  /** Analysable mentions (comments + posts) in the latest snapshot. */
  mention_count: number;
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
};

type RunRow = {
  search_id: string;
  status: SearchCollectionStatus["latest_run_status"];
  started_at: string;
  completed_at: string | null;
  connectors: string[] | null;
  stats: { by_kind?: Record<string, number>; by_sentiment?: Record<string, number> } | null;
};

export async function getCollectionStatusBySearchIds(searchIds: string[]): Promise<Map<string, SearchCollectionStatus>> {
  const out = new Map<string, SearchCollectionStatus>();
  if (!searchIds.length) return out;

  const { data: runs } = await supabaseAdmin
    .from("collection_runs")
    .select("search_id, status, started_at, completed_at, connectors, stats")
    .in("search_id", searchIds)
    .order("started_at", { ascending: false });

  const latest = new Map<string, RunRow>();
  const runCount = new Map<string, number>();
  for (const r of (runs ?? []) as RunRow[]) {
    runCount.set(r.search_id, (runCount.get(r.search_id) ?? 0) + 1);
    if (!latest.has(r.search_id)) latest.set(r.search_id, r);
  }

  for (const sid of searchIds) {
    const run = latest.get(sid);
    if (!run) continue; // no live runs → caller keeps the legacy fallback
    const byKind = run.stats?.by_kind ?? {};
    const bySent = run.stats?.by_sentiment ?? {};
    const video = byKind.video ?? 0;
    const comment = byKind.comment ?? 0;
    const post = byKind.post ?? 0;
    const pos = bySent.Positive ?? 0, neu = bySent.Neutral ?? 0, neg = bySent.Negative ?? 0;
    const sentTotal = pos + neu + neg;
    out.set(sid, {
      latest_run_status: run.status,
      last_collected_at: run.completed_at ?? run.started_at,
      connectors: run.connectors ?? [],
      run_count: runCount.get(sid) ?? 0,
      video_count: video, comment_count: comment, post_count: post,
      by_kind: byKind,
      mention_count: comment + post,
      positive_pct: sentTotal ? Math.round((pos / sentTotal) * 100) : 0,
      neutral_pct:  sentTotal ? Math.round((neu / sentTotal) * 100) : 0,
      negative_pct: sentTotal ? Math.round((neg / sentTotal) * 100) : 0,
    });
  }
  return out;
}
