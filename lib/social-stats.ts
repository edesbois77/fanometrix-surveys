import { supabaseAdmin } from "@/lib/supabase-admin";

export type SocialMentionStats = {
  total: number;
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
};

const EMPTY_STATS: SocialMentionStats = { total: 0, positive_pct: 0, neutral_pct: 0, negative_pct: 0 };

/** Batched sentiment aggregation for a set of social_searches ids — same
 * classification-count logic as app/api/social/stats/route.ts, just grouped
 * by search_id in one query instead of one request per search. */
export async function getSocialMentionStatsBySearchIds(searchIds: string[]): Promise<Map<string, SocialMentionStats>> {
  const stats = new Map<string, SocialMentionStats>(searchIds.map(id => [id, EMPTY_STATS]));
  if (searchIds.length === 0) return stats;

  const { data: mentions } = await supabaseAdmin
    .from("social_mentions")
    .select("search_id, sentiment")
    .in("search_id", searchIds)
    .neq("import_source", "synthetic");

  const counts = new Map<string, { total: number; positive: number; neutral: number; negative: number }>();
  for (const id of searchIds) counts.set(id, { total: 0, positive: 0, neutral: 0, negative: 0 });
  for (const m of mentions ?? []) {
    if (!m.search_id) continue;
    const bucket = counts.get(m.search_id);
    if (!bucket) continue;
    bucket.total++;
    if (m.sentiment === "Positive") bucket.positive++;
    else if (m.sentiment === "Neutral") bucket.neutral++;
    else if (m.sentiment === "Negative") bucket.negative++;
  }

  for (const [id, b] of counts) {
    stats.set(id, {
      total: b.total,
      positive_pct: b.total ? Math.round((b.positive / b.total) * 100) : 0,
      neutral_pct: b.total ? Math.round((b.neutral / b.total) * 100) : 0,
      negative_pct: b.total ? Math.round((b.negative / b.total) * 100) : 0,
    });
  }
  return stats;
}
