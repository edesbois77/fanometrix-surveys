import { supabaseAdmin } from "@/lib/supabase-admin";

export type SocialMentionStats = {
  total: number;
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
};

const EMPTY_STATS: SocialMentionStats = { total: 0, positive_pct: 0, neutral_pct: 0, negative_pct: 0 };

// Videos/trends are containers, not opinions — excluded from the conversation
// stats, same as the collection run's own by_sentiment rollup.
const NON_CONVERSATION = new Set(["video", "trend"]);

/** Batched sentiment aggregation for a set of social_searches ids — same
 * classification-count logic as app/api/social/stats/route.ts, just grouped
 * by search_id in one query instead of one request per search. Percentages are
 * over conversations with a DETERMINATE sentiment (positive+neutral+negative),
 * so they always sum to 100 — "Unknown"/null is undetermined, not a slice. */
export async function getSocialMentionStatsBySearchIds(searchIds: string[]): Promise<Map<string, SocialMentionStats>> {
  const stats = new Map<string, SocialMentionStats>(searchIds.map(id => [id, EMPTY_STATS]));
  if (searchIds.length === 0) return stats;

  const { data: mentions } = await supabaseAdmin
    .from("social_mentions")
    .select("search_id, sentiment, content_kind")
    .in("search_id", searchIds)
    .neq("import_source", "synthetic");

  const counts = new Map<string, { total: number; positive: number; neutral: number; negative: number }>();
  for (const id of searchIds) counts.set(id, { total: 0, positive: 0, neutral: 0, negative: 0 });
  for (const m of mentions ?? []) {
    if (!m.search_id) continue;
    if (m.content_kind && NON_CONVERSATION.has(m.content_kind)) continue;
    const bucket = counts.get(m.search_id);
    if (!bucket) continue;
    bucket.total++; // conversations (containers excluded)
    if (m.sentiment === "Positive") bucket.positive++;
    else if (m.sentiment === "Neutral") bucket.neutral++;
    else if (m.sentiment === "Negative") bucket.negative++;
  }

  for (const [id, b] of counts) {
    const classified = b.positive + b.neutral + b.negative;
    stats.set(id, {
      total: b.total,
      positive_pct: classified ? Math.round((b.positive / classified) * 100) : 0,
      neutral_pct:  classified ? Math.round((b.neutral  / classified) * 100) : 0,
      negative_pct: classified ? Math.round((b.negative / classified) * 100) : 0,
    });
  }
  return stats;
}
