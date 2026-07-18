// Reddit connector — wraps the existing lib/reddit-collector fetcher in the
// generic Connector contract so it runs through the same shared pipeline as
// YouTube (and every future source). The low-level Reddit auth/fetch logic is
// unchanged; this only normalises its output and declares its capabilities.
import { fetchRedditMentions } from "@/lib/reddit-collector";
import type { Connector, CollectContext, CollectResult, NormalisedItem } from "@/lib/connectors/types";
import type { SearchStrategy } from "@/lib/search-strategy";

const rp = (t: string): string => (t.trim().includes(" ") ? `"${t.trim()}"` : t.trim());

// Compile a Search Strategy into an anchored Reddit boolean query (Reddit search
// supports full AND/OR/NOT), plus the subject+context terms used to keep only
// on-topic comments. Returns null when there's no primary subject (fall back to
// the flat keyword OR). e.g. `FedEx AND ("Champions League" OR sponsorship) NOT
// (parcel OR delivery)`.
function compileRedditQuery(s: SearchStrategy): { query: string; matchTerms: string[] } | null {
  const primary = s.primary_entity?.term?.trim();
  if (!primary) return null;
  const context = s.context_entities.map(e => e.term.trim()).filter(Boolean);
  const excl = s.exclusions.map(e => e.trim()).filter(Boolean);
  let query = rp(primary);
  if (context.length && s.breadth !== "broad") query += ` AND (${context.map(rp).join(" OR ")})`;
  if (excl.length) query += ` NOT (${excl.map(rp).join(" OR ")})`;
  return { query, matchTerms: [primary, ...context] };
}

export const redditConnector: Connector = {
  id: "reddit",
  name: "Reddit",
  platform: "Reddit",
  capabilities: {
    contentKinds: ["post", "comment"],
    supportsSearch: true,
    supportsComments: true,
    supportsRegionFilter: false,   // Reddit search isn't region-scoped
    supportsLanguageFilter: false,
    supportsDateWindow: false,     // uses "new" ordering, not an explicit window
    paginated: false,
    // The current fetcher returns a search/top sample, not a reliable
    // "everything since last seen" stream — so it is NOT incremental. The
    // pipeline still dedups its output against the base (no re-imports); it just
    // won't proactively discover new comments beyond what its search returns.
    incremental: false,
    configSchema: {
      subreddits: { type: "string[]", label: "Target subreddits", required: true },
    },
    quota: { note: "No hard quota; rate-limited. Keep subreddit lists focused." },
    env: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"],
  },

  isConfigured() {
    return !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET && process.env.REDDIT_USER_AGENT);
  },

  async collect(ctx: CollectContext): Promise<CollectResult> {
    const warnings: string[] = [];
    const subreddits = Array.isArray(ctx.config.subreddits) ? (ctx.config.subreddits as string[]) : [];
    if (!subreddits.length) return { items: [], warnings: ["No target subreddits configured"], stats: {} };
    if (!ctx.keywords.length) return { items: [], warnings: ["No keywords to search"], stats: {} };

    const compiled = ctx.strategy?.primary_entity?.term ? compileRedditQuery(ctx.strategy) : null;
    let raw;
    try {
      raw = await fetchRedditMentions(subreddits, ctx.keywords, compiled ?? undefined);
    } catch (err) {
      return { items: [], warnings, stats: {}, fatalError: err instanceof Error ? err.message : "Reddit collection failed" };
    }

    const items: NormalisedItem[] = raw.map(m => ({
      external_id: m.external_id,
      // Reddit "thing" ids: t3_ = post, t1_ = comment.
      content_kind: m.external_id.startsWith("t1_") ? "comment" : "post",
      content: m.content,
      author: m.author,
      source_url: m.source_url,
      published_at: m.published_at,
      market: null,
      language: null,
      parent_external_id: null,
      metadata: { subreddit: m.subreddit },
    }));

    const posts = items.filter(i => i.content_kind === "post").length;
    return { items, warnings, stats: { posts, comments: items.length - posts } };
  },
};
