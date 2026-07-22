// Bluesky connector — the AT Protocol AppView as a Conversation Intelligence
// source. Implements the SAME Connector contract as YouTube, Reddit and News, so
// it runs through the identical pipeline: authenticate → search → collect →
// normalise, then the shared pipeline classifies, scores relevance, gates through
// evidence review and feeds Analysis. Nothing here is aware of any of that.
//
// Replies and quote-posts are FIRST-CLASS evidence, not extras: a quote-post is
// somebody commenting ABOUT something, which is exactly where sponsorship
// reaction lives. Both are normalised as ordinary items with parent_external_id
// set, so the pipeline's existing threading, dedup and append-only behaviour
// handle them with no special cases.
//
// AUTH: keyword search is the one gated endpoint (403 unauthenticated on the
// public AppView, 401 on bsky.social). Everything else, profiles, author feeds,
// post threads and quotes, is public. Auth is an APP PASSWORD, generated
// instantly in account settings, with no application or approval process.
import type { Connector, CollectContext, CollectResult, NormalisedItem } from "@/lib/connectors/types";
import type { SearchStrategy } from "@/lib/search-strategy";

const APPVIEW = "https://public.api.bsky.app/xrpc";
const PDS = "https://bsky.social/xrpc";
const UA = "Fanometrix/1.0 (research)";

const DEFAULT_MAX_POSTS = 60;
const DEFAULT_REPLIES_PER_POST = 25;
const PAGE_SIZE = 25;            // Bluesky caps searchPosts at 100; keep runs modest
const MAX_PAGES = 8;
const MAX_RATE_RETRIES = 2;

// ── Rate limiting ────────────────────────────────────────────────────────────
// Bluesky advertises limits via ratelimit-* headers rather than a fixed public
// quota. Honour them adaptively instead of guessing a ceiling.
async function bskyFetch(url: string, init?: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init?.headers ?? {}) } });
  if (res.status !== 429 || attempt >= MAX_RATE_RETRIES) return res;
  const reset = Number(res.headers.get("ratelimit-reset"));
  const retryAfter = Number(res.headers.get("retry-after"));
  const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1000
    : Number.isFinite(reset) && reset > 0
      ? Math.max(0, reset * 1000 - Date.now())
      : 2000 * (attempt + 1);
  await new Promise(r => setTimeout(r, Math.min(waitMs, 15_000)));
  return bskyFetch(url, init, attempt + 1);
}

// ── Auth ─────────────────────────────────────────────────────────────────────
let cachedToken: { jwt: string; expires: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.jwt;
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return null;
  const res = await bskyFetch(`${PDS}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { accessJwt?: string };
  if (!json.accessJwt) return null;
  // Access tokens are short-lived; re-auth well inside the window.
  cachedToken = { jwt: json.accessJwt, expires: Date.now() + 60 * 60 * 1000 };
  return json.accessJwt;
}

// ── Query compilation ────────────────────────────────────────────────────────
const quote = (t: string): string => (t.trim().includes(" ") ? `"${t.trim()}"` : t.trim());

/** Bluesky search ANDs terms and supports quoted phrases, but has no reliable
 *  boolean OR/NOT. So the query anchors the subject plus its single strongest
 *  context term, and exclusions are applied client-side below. */
function compileQuery(strategy: SearchStrategy | null | undefined, keywords: string[]): string {
  const primary = strategy?.primary_entity?.term?.trim();
  if (primary) {
    const context = (strategy?.context_entities ?? []).map(e => e.term.trim()).filter(Boolean);
    const anchor = strategy?.breadth === "broad" ? "" : context[0] ?? "";
    return [quote(primary), anchor ? quote(anchor) : ""].filter(Boolean).join(" ");
  }
  return keywords.map(k => k.trim()).filter(Boolean).slice(0, 3).map(quote).join(" ");
}

// ── Normalisation ────────────────────────────────────────────────────────────
type BskyPost = {
  uri?: string; cid?: string; indexedAt?: string;
  author?: { handle?: string; displayName?: string; did?: string };
  record?: { text?: string; createdAt?: string; langs?: string[] };
  likeCount?: number; repostCount?: number; replyCount?: number; quoteCount?: number; bookmarkCount?: number;
};

/** at://did/app.bsky.feed.post/rkey → https://bsky.app/profile/{handle}/post/{rkey} */
function postUrl(uri: string, handle: string | null): string | null {
  const rkey = uri.split("/").pop();
  if (!rkey || !handle) return null;
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

function normalise(post: BskyPost, kind: string, parentUri: string | null): NormalisedItem | null {
  const uri = (post.uri ?? "").trim();
  const text = (post.record?.text ?? "").trim();
  if (!uri || !text) return null;
  const handle = (post.author?.handle ?? "").trim() || null;
  return {
    external_id: uri,                    // AT-URI: stable and globally unique
    content_kind: kind,
    content: text,
    author: post.author?.displayName?.trim() || handle,
    source_url: postUrl(uri, handle),
    published_at: post.record?.createdAt ?? post.indexedAt ?? null,
    market: null,                        // Bluesky exposes no region on a post
    language: post.record?.langs?.[0] ?? null,
    parent_external_id: parentUri,
    metadata: {
      handle, did: post.author?.did ?? null, cid: post.cid ?? null,
      like_count: post.likeCount ?? 0,
      repost_count: post.repostCount ?? 0,
      reply_count: post.replyCount ?? 0,
      quote_count: post.quoteCount ?? 0,
      bookmark_count: post.bookmarkCount ?? 0,
      indexed_at: post.indexedAt ?? null,
    },
  };
}

/** Flatten a post thread into replies at any depth. */
function collectReplies(node: unknown, parentUri: string, out: BskyPost[], cap: number) {
  const replies = (node as { replies?: unknown[] } | null)?.replies ?? [];
  for (const r of replies) {
    if (out.length >= cap) return;
    const post = (r as { post?: BskyPost }).post;
    if (post?.uri) { out.push(post); collectReplies(r, post.uri, out, cap); }
  }
}

export const blueskyConnector: Connector = {
  id: "bluesky",
  name: "Bluesky",
  platform: "Bluesky",
  capabilities: {
    contentKinds: ["post", "reply", "quote"],
    supportsSearch: true,
    supportsComments: true,          // replies, via getPostThread
    supportsRegionFilter: false,     // no region on Bluesky posts or search
    supportsLanguageFilter: true,    // searchPosts `lang`
    supportsDateWindow: true,        // searchPosts `since` / `until`
    paginated: true,                 // cursor paging
    // Genuinely incremental: search is newest-first and cursor-paged, so paging
    // stops as soon as it reaches evidence already in the base.
    incremental: true,
    configSchema: {
      max_posts: { type: "number", label: "Max posts per run", default: DEFAULT_MAX_POSTS },
      replies_per_post: { type: "number", label: "Replies per post", default: DEFAULT_REPLIES_PER_POST },
    },
    quota: { note: "App-password auth. Limits are advertised per response; the connector backs off on 429." },
    env: ["BLUESKY_IDENTIFIER", "BLUESKY_APP_PASSWORD"],
  },

  isConfigured() {
    return !!(process.env.BLUESKY_IDENTIFIER && process.env.BLUESKY_APP_PASSWORD);
  },

  async collect(ctx: CollectContext): Promise<CollectResult> {
    const warnings: string[] = [];
    const query = compileQuery(ctx.strategy, ctx.keywords);
    if (!query) return { items: [], warnings: ["No keywords or search strategy to query"], stats: {} };

    const token = await getAccessToken();
    if (!token) {
      return { items: [], warnings, stats: {}, fatalError: "Bluesky search needs an app password (BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD)." };
    }
    const auth = { Authorization: `Bearer ${token}` };

    const maxPosts = Math.max(1, Number(ctx.config.max_posts) > 0 ? Number(ctx.config.max_posts) : DEFAULT_MAX_POSTS);
    const replyCap = Math.max(0, Number(ctx.config.replies_per_post) >= 0 ? Number(ctx.config.replies_per_post) : DEFAULT_REPLIES_PER_POST);
    const known = ctx.knownExternalIds ?? new Set<string>();
    const exclusions = (ctx.strategy?.exclusions ?? []).map(e => e.trim().toLowerCase()).filter(Boolean);
    const excluded = (text: string) => exclusions.some(x => text.toLowerCase().includes(x));

    // ── Search (newest-first, stop at known evidence) ────────────────────────
    const matched: BskyPost[] = [];
    let cursor: string | undefined;
    let reachedKnown = false;
    for (let page = 0; page < MAX_PAGES && matched.length < maxPosts && !reachedKnown; page++) {
      const params = new URLSearchParams({ q: query, limit: String(PAGE_SIZE), sort: "latest" });
      if (cursor) params.set("cursor", cursor);
      if (ctx.languages[0]) params.set("lang", ctx.languages[0]);
      if (ctx.dateFrom) params.set("since", ctx.dateFrom);
      if (ctx.dateTo) params.set("until", ctx.dateTo);

      const res = await bskyFetch(`${APPVIEW}/app.bsky.feed.searchPosts?${params}`, { headers: auth });
      if (res.status === 401 || res.status === 403) {
        return { items: [], warnings, stats: {}, fatalError: "Bluesky rejected the search credentials." };
      }
      if (!res.ok) { warnings.push(`Search stopped at page ${page + 1} (HTTP ${res.status})`); break; }

      const json = (await res.json()) as { posts?: BskyPost[]; cursor?: string };
      const posts = json.posts ?? [];
      if (!posts.length) break;
      for (const p of posts) {
        if (p.uri && known.has(p.uri)) { reachedKnown = true; break; }
        if (matched.length >= maxPosts) break;
        if (excluded(p.record?.text ?? "")) continue;   // no reliable NOT in Bluesky search
        matched.push(p);
      }
      cursor = json.cursor;
      if (!cursor) break;
    }

    const items: NormalisedItem[] = [];
    for (const p of matched) { const n = normalise(p, "post", null); if (n) items.push(n); }

    // ── Replies and quotes: first-class evidence, not extras ─────────────────
    let replyTotal = 0, quoteTotal = 0;
    for (const p of matched) {
      if (!p.uri) continue;

      if (replyCap > 0 && (p.replyCount ?? 0) > 0) {
        const res = await bskyFetch(`${APPVIEW}/app.bsky.feed.getPostThread?uri=${encodeURIComponent(p.uri)}&depth=2`, { headers: auth });
        if (res.ok) {
          const json = (await res.json()) as { thread?: unknown };
          const found: BskyPost[] = [];
          collectReplies(json.thread, p.uri, found, replyCap);
          for (const r of found) {
            if (excluded(r.record?.text ?? "")) continue;
            const n = normalise(r, "reply", p.uri);
            if (n) { items.push(n); replyTotal++; }
          }
        } else warnings.push(`Could not read replies for a post (HTTP ${res.status})`);
      }

      // A quote-post is somebody commenting ABOUT the post: the richest signal.
      if ((p.quoteCount ?? 0) > 0) {
        const res = await bskyFetch(`${APPVIEW}/app.bsky.feed.getQuotes?uri=${encodeURIComponent(p.uri)}&limit=25`, { headers: auth });
        if (res.ok) {
          const json = (await res.json()) as { posts?: BskyPost[] };
          for (const q of json.posts ?? []) {
            if (excluded(q.record?.text ?? "")) continue;
            const n = normalise(q, "quote", p.uri);
            if (n) { items.push(n); quoteTotal++; }
          }
        } else warnings.push(`Could not read quote posts (HTTP ${res.status})`);
      }
    }

    if (!items.length) warnings.push("No Bluesky posts matched this query in the selected window");
    return { items, warnings, stats: { posts: matched.length, replies: replyTotal, quotes: quoteTotal } };
  },
};
