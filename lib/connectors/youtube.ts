// YouTube Data API v3 connector — the first live Conversation Intelligence source.
// Server-only; reads YOUTUBE_API_KEY. Searches public videos for the search's
// keywords (scoped by market/region, language and date window), then collects
// public top-level comments on the matched videos. Videos and comments are both
// returned as NormalisedItems; source-specific fields (channel, likes, reply
// counts, views) go in `metadata`, so nothing here needs a bespoke DB column.
//
// Quota note: search.list costs ~100 units/call, videos.list & commentThreads.list
// ~1 unit each (default 10,000 units/day). Caps below keep a run well inside that.
import { MARKETS } from "@/lib/social-taxonomy";
import type { Connector, CollectContext, CollectResult, NormalisedItem } from "@/lib/connectors/types";

const API = "https://www.googleapis.com/youtube/v3";

const DEFAULT_MAX_VIDEOS = 15;        // total videos per run (across markets)
const DEFAULT_COMMENTS_PER_VIDEO = 20; // classification runs inline, so keep runs bounded; raise via config
const SEARCH_PAGE_SIZE = 50;          // YouTube max per search page
const VIDEO_DETAIL_BATCH = 50;        // YouTube max ids per videos.list

// Resolve a market (stored as a name like "Germany" or a code like "DE") to an
// ISO-3166 alpha-2 regionCode. Unknown markets fall through as null (no region).
const NAME_TO_CODE = new Map(MARKETS.map(m => [m.label.toLowerCase(), m.code]));
function resolveRegionCode(market: string): string | null {
  const t = market.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return NAME_TO_CODE.get(t.toLowerCase()) ?? null;
}

type YtError = { reason: string; message: string; httpStatus: number };
class YouTubeError extends Error {
  reason: string; httpStatus: number;
  constructor(e: YtError) { super(e.message); this.reason = e.reason; this.httpStatus = e.httpStatus; }
}

async function ytGet(path: string, params: Record<string, string>, key: string): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, key }).toString();
  const res = await fetch(`${API}/${path}?${qs}`);
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok) {
    const err = (json as { error?: { message?: string; errors?: { reason?: string }[] } }).error;
    const reason = err?.errors?.[0]?.reason ?? (res.status === 403 ? "forbidden" : "httpError");
    throw new YouTubeError({ reason, message: err?.message ?? `YouTube API ${res.status}`, httpStatus: res.status });
  }
  return json as Record<string, unknown>;
}

function buildQuery(keywords: string[]): string {
  // YouTube q supports boolean OR via "|"; quote multi-word phrases.
  return keywords.map(k => (k.includes(" ") ? `"${k}"` : k)).join("|");
}

type SearchHit = { videoId: string };
async function searchVideos(
  ctx: CollectContext, regionCode: string | null, relevanceLanguage: string | null, limit: number, key: string,
): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];
  let pageToken: string | undefined;
  const params: Record<string, string> = {
    part: "snippet", type: "video", order: "relevance",
    q: buildQuery(ctx.keywords), maxResults: String(Math.min(SEARCH_PAGE_SIZE, limit)),
  };
  if (regionCode) params.regionCode = regionCode;
  if (relevanceLanguage) params.relevanceLanguage = relevanceLanguage;
  if (ctx.dateFrom) params.publishedAfter = new Date(ctx.dateFrom).toISOString();
  if (ctx.dateTo) params.publishedBefore = new Date(ctx.dateTo).toISOString();

  while (hits.length < limit) {
    const json = await ytGet("search", pageToken ? { ...params, pageToken } : params, key);
    const items = (json.items as { id?: { videoId?: string } }[]) ?? [];
    for (const it of items) {
      if (it.id?.videoId) hits.push({ videoId: it.id.videoId });
    }
    pageToken = json.nextPageToken as string | undefined;
    if (!pageToken || items.length === 0) break;
  }
  return hits.slice(0, limit);
}

type VideoDetail = {
  id: string; title: string; description: string; channel: string; channelId: string;
  publishedAt: string | null; likeCount: number; commentCount: number; viewCount: number;
};
async function fetchVideoDetails(ids: string[], key: string): Promise<Map<string, VideoDetail>> {
  const out = new Map<string, VideoDetail>();
  for (let i = 0; i < ids.length; i += VIDEO_DETAIL_BATCH) {
    const batch = ids.slice(i, i + VIDEO_DETAIL_BATCH);
    const json = await ytGet("videos", { part: "snippet,statistics", id: batch.join(",") }, key);
    for (const v of (json.items as Record<string, Record<string, unknown>>[]) ?? []) {
      const sn = v.snippet ?? {}; const st = v.statistics ?? {};
      const id = String(v.id);
      out.set(id, {
        id,
        title: String(sn.title ?? ""),
        description: String(sn.description ?? ""),
        channel: String(sn.channelTitle ?? ""),
        channelId: String(sn.channelId ?? ""),
        publishedAt: sn.publishedAt ? String(sn.publishedAt) : null,
        likeCount: Number(st.likeCount ?? 0),
        commentCount: Number(st.commentCount ?? 0),
        viewCount: Number(st.viewCount ?? 0),
      });
    }
  }
  return out;
}

type YtComment = {
  id: string; text: string; author: string | null; likeCount: number; replyCount: number; publishedAt: string | null;
};
// Incremental comment fetch: newest-first, stopping as soon as an already-seen
// comment id is reached (everything older is already in the base). This
// genuinely discovers NEW comments since the last run rather than re-fetching a
// fixed top-N. `cap` bounds one run's quota; if the cap is hit before a known
// comment, there may be more new comments than one run captured (reported).
async function fetchComments(videoId: string, cap: number, known: Set<string>, key: string): Promise<{ comments: YtComment[]; hitCap: boolean }> {
  const out: YtComment[] = [];
  let pageToken: string | undefined;
  let reachedKnown = false;
  while (out.length < cap && !reachedKnown) {
    const params: Record<string, string> = {
      part: "snippet", videoId, order: "time", maxResults: String(Math.min(100, cap - out.length)), textFormat: "plainText",
    };
    const json = await ytGet("commentThreads", pageToken ? { ...params, pageToken } : params, key);
    for (const thread of (json.items as Record<string, Record<string, unknown>>[]) ?? []) {
      const top = ((thread.snippet as Record<string, unknown>)?.topLevelComment as Record<string, unknown>) ?? {};
      const sn = (top.snippet as Record<string, unknown>) ?? {};
      const id = String(top.id ?? "");
      if (id && known.has(id)) { reachedKnown = true; break; } // older comments already stored → stop
      out.push({
        id,
        text: String(sn.textDisplay ?? sn.textOriginal ?? ""),
        author: sn.authorDisplayName ? String(sn.authorDisplayName) : null,
        likeCount: Number(sn.likeCount ?? 0),
        replyCount: Number((thread.snippet as Record<string, unknown>)?.totalReplyCount ?? 0),
        publishedAt: sn.publishedAt ? String(sn.publishedAt) : null,
      });
      if (out.length >= cap) break;
    }
    pageToken = json.nextPageToken as string | undefined;
    if (!pageToken) break;
  }
  return { comments: out.slice(0, cap), hitCap: out.length >= cap && !reachedKnown };
}

export const youtubeConnector: Connector = {
  id: "youtube",
  name: "YouTube",
  platform: "YouTube",
  capabilities: {
    contentKinds: ["video", "comment"],
    supportsSearch: true,
    supportsComments: true,
    supportsRegionFilter: true,
    supportsLanguageFilter: true,
    supportsDateWindow: true,
    paginated: true,
    // Newest-first comment paging that stops at already-seen ids — genuinely
    // discovers new comments since the last run (not a re-fetched top-N sample).
    incremental: true,
    configSchema: {
      max_videos: { type: "number", label: "Max videos per run", default: DEFAULT_MAX_VIDEOS },
      comments_per_video: { type: "number", label: "Comments per video", default: DEFAULT_COMMENTS_PER_VIDEO },
    },
    quota: { note: "search.list ~100 units/call; keep max_videos modest to stay within the daily 10k quota." },
    env: ["YOUTUBE_API_KEY"],
  },

  isConfigured() { return !!process.env.YOUTUBE_API_KEY; },

  async collect(ctx: CollectContext): Promise<CollectResult> {
    const key = process.env.YOUTUBE_API_KEY;
    const items: NormalisedItem[] = [];
    const warnings: string[] = [];
    if (!key) return { items, warnings: ["YOUTUBE_API_KEY not configured"], stats: {}, fatalError: "YOUTUBE_API_KEY not configured" };
    if (!ctx.keywords.length) return { items, warnings: ["No keywords to search"], stats: {} };

    const maxVideos = Number(ctx.config.max_videos) > 0 ? Number(ctx.config.max_videos) : DEFAULT_MAX_VIDEOS;
    const commentsPerVideo = Number(ctx.config.comments_per_video) >= 0 ? Number(ctx.config.comments_per_video) : DEFAULT_COMMENTS_PER_VIDEO;
    // One relevanceLanguage only when unambiguous; otherwise let region drive.
    const relevanceLanguage = ctx.languages.length === 1 ? ctx.languages[0] : null;
    const markets = ctx.markets.length ? ctx.markets : [""]; // one region-less pass if no markets
    let fatalError: string | undefined;

    // ── 1. Search videos across markets (dedup ids within this run) ──────────
    const perMarket = Math.max(1, Math.ceil(maxVideos / markets.length));
    const videoMarket = new Map<string, string | null>();
    const orderedIds: string[] = [];
    try {
      for (const market of markets) {
        if (orderedIds.length >= maxVideos) break;
        const regionCode = market ? resolveRegionCode(market) : null;
        if (market && !regionCode) { warnings.push(`Unknown market "${market}" — searched without a region filter`); }
        const hits = await searchVideos(ctx, regionCode, relevanceLanguage, perMarket, key);
        for (const h of hits) {
          if (!videoMarket.has(h.videoId)) { videoMarket.set(h.videoId, market || null); orderedIds.push(h.videoId); }
        }
      }
    } catch (err) {
      if (err instanceof YouTubeError && err.reason === "quotaExceeded") {
        fatalError = "YouTube quota exceeded during video search";
      } else { throw err; }
    }

    const ids = orderedIds.slice(0, maxVideos);
    if (!ids.length) return { items, warnings, stats: { videos: 0, comments: 0 }, fatalError };

    // ── 2. Video details (title/channel/stats) ──────────────────────────────
    let details = new Map<string, VideoDetail>();
    try {
      details = await fetchVideoDetails(ids, key);
    } catch (err) {
      if (err instanceof YouTubeError && err.reason === "quotaExceeded") fatalError = "YouTube quota exceeded fetching video details";
      else throw err;
    }

    let commentCount = 0;
    for (const id of ids) {
      const d = details.get(id);
      if (!d) { warnings.push(`Video ${id} unavailable (deleted or private) — skipped`); continue; }
      const market = videoMarket.get(id) ?? null;

      // Video as a context item.
      items.push({
        external_id: id,
        content_kind: "video",
        content: [d.title, d.description].filter(Boolean).join("\n\n"),
        author: d.channel || null,
        source_url: `https://www.youtube.com/watch?v=${id}`,
        published_at: d.publishedAt,
        market,
        language: relevanceLanguage,
        parent_external_id: null,
        metadata: {
          video_title: d.title, channel: d.channel, channel_id: d.channelId,
          like_count: d.likeCount, comment_count: d.commentCount, view_count: d.viewCount,
        },
      });

      // ── 3. New comments on the video (incremental: stop at already-seen) ───
      if (fatalError || commentsPerVideo === 0 || d.commentCount === 0) continue;
      try {
        const { comments, hitCap } = await fetchComments(id, commentsPerVideo, ctx.knownExternalIds ?? new Set(), key);
        if (hitCap) warnings.push(`"${d.title}" had more new comments than the per-run limit (${commentsPerVideo}) — newest kept; run again to catch up`);
        for (const c of comments) {
          if (!c.id || !c.text) continue;
          items.push({
            external_id: c.id,
            content_kind: "comment",
            content: c.text,
            author: c.author,
            source_url: `https://www.youtube.com/watch?v=${id}&lc=${c.id}`,
            published_at: c.publishedAt,
            market,
            language: relevanceLanguage,
            parent_external_id: id,
            metadata: { like_count: c.likeCount, reply_count: c.replyCount, video_title: d.title, channel: d.channel },
          });
          commentCount++;
        }
      } catch (err) {
        if (err instanceof YouTubeError && err.reason === "commentsDisabled") { warnings.push(`Comments disabled on "${d.title}" — video kept, no comments`); }
        else if (err instanceof YouTubeError && err.reason === "quotaExceeded") { fatalError = "YouTube quota exceeded fetching comments"; }
        else if (err instanceof YouTubeError && (err.httpStatus === 404 || err.reason === "videoNotFound")) { warnings.push(`Video "${d.title}" not found fetching comments — skipped`); }
        else { warnings.push(`Failed to fetch comments for "${d.title}": ${err instanceof Error ? err.message : "unknown error"}`); }
      }
    }

    return { items, warnings, stats: { videos: ids.length, comments: commentCount }, fatalError };
  },
};
