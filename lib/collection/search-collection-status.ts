// Read model for the append-only evidence base (docs/evidence-lifecycle.md).
// CUMULATIVE state (mention_count, by_kind, sentiment) is read from the base via
// vw_conversation_search_stats — the base is deduplicated, so this is the single
// true "total evidence" with no double-counting. The LATEST run's ledger supplies
// the event-level figures (status, last collected, connectors, run count, and
// new_count = "what the last run added").
import { supabaseAdmin } from "@/lib/supabase-admin";

export type SearchCollectionStatus = {
  latest_run_status: "running" | "completed" | "partial" | "failed" | null;
  last_collected_at: string | null;
  connectors: string[];
  run_count: number;
  /** New conversations the most recent run added to the base. */
  new_count: number;
  video_count: number;
  comment_count: number;
  post_count: number;
  by_kind: Record<string, number>;
  /** Cumulative unique analysable conversations in the base (excludes containers). */
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
  stats: { new_count?: number } | null;
};

type StatRow = {
  search_id: string;
  conversations: number; video_count: number; comment_count: number; post_count: number;
  positive: number; neutral: number; negative: number;
  by_kind: Record<string, number> | null;
};

export async function getCollectionStatusBySearchIds(searchIds: string[]): Promise<Map<string, SearchCollectionStatus>> {
  const out = new Map<string, SearchCollectionStatus>();
  if (!searchIds.length) return out;

  const [{ data: runs }, { data: stats }] = await Promise.all([
    supabaseAdmin
      .from("collection_runs")
      .select("search_id, status, started_at, completed_at, connectors, stats")
      .in("search_id", searchIds)
      .order("started_at", { ascending: false }),
    supabaseAdmin
      .from("vw_conversation_search_stats")
      .select("search_id, conversations, video_count, comment_count, post_count, positive, neutral, negative, by_kind")
      .in("search_id", searchIds),
  ]);

  const latest = new Map<string, RunRow>();
  const runCount = new Map<string, number>();
  for (const r of (runs ?? []) as RunRow[]) {
    runCount.set(r.search_id, (runCount.get(r.search_id) ?? 0) + 1);
    if (!latest.has(r.search_id)) latest.set(r.search_id, r);
  }
  const statBySearch = new Map<string, StatRow>((stats ?? []).map(s => [(s as StatRow).search_id, s as StatRow]));

  for (const sid of searchIds) {
    const run = latest.get(sid);
    if (!run) continue; // no live runs → caller keeps the legacy fallback
    const st = statBySearch.get(sid);
    const classified = (st?.positive ?? 0) + (st?.neutral ?? 0) + (st?.negative ?? 0);
    out.set(sid, {
      latest_run_status: run.status,
      last_collected_at: run.completed_at ?? run.started_at,
      connectors: run.connectors ?? [],
      run_count: runCount.get(sid) ?? 0,
      new_count: run.stats?.new_count ?? 0,
      video_count: st?.video_count ?? 0,
      comment_count: st?.comment_count ?? 0,
      post_count: st?.post_count ?? 0,
      by_kind: st?.by_kind ?? {},
      mention_count: st?.conversations ?? 0,
      positive_pct: classified ? Math.round(((st?.positive ?? 0) / classified) * 100) : 0,
      neutral_pct:  classified ? Math.round(((st?.neutral  ?? 0) / classified) * 100) : 0,
      negative_pct: classified ? Math.round(((st?.negative ?? 0) / classified) * 100) : 0,
    });
  }
  return out;
}
