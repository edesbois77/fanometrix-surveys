// Server-only. Fetches recent Reddit posts (and comments matching a
// search's keywords on those posts) from a configured list of subreddits.
//
// Uses Reddit's OAuth2 "application only" client-credentials grant — no
// bot/user login needed, which is sufficient for the public read-only
// search and listing endpoints used here. Requires REDDIT_CLIENT_ID,
// REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT (a Reddit "script" app
// registered at reddit.com/prefs/apps).
//
// Reddit's own search endpoint only indexes posts, not comments, so
// comment matching is done by fetching each matched post's comment tree
// and filtering client-side for keyword matches.

type RedditSession = { accessToken: string; userAgent: string; expiresAt: number };
let cachedSession: RedditSession | null = null;

async function getSession(): Promise<RedditSession> {
  if (cachedSession && cachedSession.expiresAt > Date.now()) return cachedSession;

  const clientId     = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent     = process.env.REDDIT_USER_AGENT;
  if (!clientId || !clientSecret || !userAgent) {
    throw new Error("REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET and REDDIT_USER_AGENT must be set");
  }

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
  const json = await res.json();
  if (!json.access_token) throw new Error("Reddit auth failed: no access token returned");

  cachedSession = {
    accessToken: json.access_token,
    userAgent,
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  };
  return cachedSession;
}

async function redditGet(path: string, session: RedditSession) {
  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: { Authorization: `Bearer ${session.accessToken}`, "User-Agent": session.userAgent },
  });
  if (res.status === 429) throw new Error("Reddit rate limit hit, try again shortly");
  if (!res.ok) throw new Error(`Reddit API error: ${res.status} (${path})`);
  return res.json();
}

export type RedditMention = {
  external_id:  string;
  subreddit:    string;
  author:       string | null;
  content:      string;
  source_url:   string;
  published_at: string;
};

const POSTS_PER_SUBREDDIT = 25; // posts to search for, per subreddit
const COMMENTS_POST_LIMIT = 5;  // how many of those posts to also scan comments on
const COMMENTS_PER_POST   = 5;  // matching comments to keep per post

function buildQuery(keywords: string[]): string {
  return keywords.length > 1 ? `(${keywords.join(" OR ")})` : keywords[0];
}

function matchesKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

type RedditData = Record<string, unknown>;
type RedditThing = { kind: string; data: RedditData };
type RedditListing = { data?: { children?: RedditThing[] } };

function postToMention(data: RedditData, subreddit: string): RedditMention {
  const title    = String(data.title ?? "");
  const selftext = String(data.selftext ?? "");
  return {
    external_id:  String(data.name),
    subreddit:    String(data.subreddit ?? subreddit),
    author:       data.author ? String(data.author) : null,
    content:      selftext ? `${title}\n\n${selftext}` : title,
    source_url:   `https://www.reddit.com${String(data.permalink ?? "")}`,
    published_at: new Date(Number(data.created_utc) * 1000).toISOString(),
  };
}

function commentToMention(data: RedditData, subreddit: string): RedditMention | null {
  const body = String(data.body ?? "");
  if (!body || !data.permalink) return null;
  return {
    external_id:  String(data.name),
    subreddit:    String(data.subreddit ?? subreddit),
    author:       data.author ? String(data.author) : null,
    content:      body,
    source_url:   `https://www.reddit.com${String(data.permalink ?? "")}`,
    published_at: new Date(Number(data.created_utc) * 1000).toISOString(),
  };
}

// Reddit's comment tree nests replies as another Listing under
// data.replies (or "" when there are none) — flatten it depth-first.
function flattenComments(listing: unknown): RedditData[] {
  const children = (listing as RedditListing)?.data?.children ?? [];
  return children.flatMap(c => {
    if (c.kind !== "t1") return [];
    const replies = c.data?.replies ? flattenComments(c.data.replies) : [];
    return [c.data, ...replies];
  });
}

type RedditQueryOptions = { query?: string; matchTerms?: string[] };

async function fetchSubredditMentions(subreddit: string, keywords: string[], session: RedditSession, options?: RedditQueryOptions): Promise<RedditMention[]> {
  // Compiled Search-Strategy query when provided (anchored boolean); otherwise
  // the flat keyword OR. Comment matching uses the strategy's subject+context
  // terms when given, else the raw keywords.
  const q = options?.query ?? buildQuery(keywords);
  const matchTerms = options?.matchTerms?.length ? options.matchTerms : keywords;
  const searchPath = `/r/${encodeURIComponent(subreddit)}/search?` + new URLSearchParams({
    q, restrict_sr: "on", sort: "new", limit: String(POSTS_PER_SUBREDDIT), type: "link", raw_json: "1",
  }).toString();

  const searchJson = await redditGet(searchPath, session);
  const posts: RedditData[] = ((searchJson?.data?.children ?? []) as RedditThing[]).map(c => c.data);

  const mentions = posts.map(p => postToMention(p, subreddit));

  for (const post of posts.slice(0, COMMENTS_POST_LIMIT)) {
    try {
      const commentsPath = `/r/${encodeURIComponent(subreddit)}/comments/${post.id}?limit=100&depth=4&raw_json=1`;
      const [, commentListing] = await redditGet(commentsPath, session);
      const matching = flattenComments(commentListing)
        .filter(c => matchesKeyword(String(c.body ?? ""), matchTerms))
        .slice(0, COMMENTS_PER_POST);
      for (const c of matching) {
        const mention = commentToMention(c, subreddit);
        if (mention) mentions.push(mention);
      }
    } catch {
      // Comment tree fetch failed for this post — keep the post itself, skip its comments.
    }
  }

  return mentions;
}

/** Fetch recent posts + matching comments across all given subreddits. `options`
 *  carries a compiled Search-Strategy query + match terms; without it, the flat
 *  keyword behaviour is unchanged. */
export async function fetchRedditMentions(subreddits: string[], keywords: string[], options?: RedditQueryOptions): Promise<RedditMention[]> {
  const session = await getSession();

  const mentions: RedditMention[] = [];
  for (const raw of subreddits) {
    const subreddit = raw.replace(/^\/?r\//i, "").trim();
    if (!subreddit) continue;
    mentions.push(...await fetchSubredditMentions(subreddit, keywords, session, options));
  }

  const seen = new Set<string>();
  return mentions.filter(m => (seen.has(m.external_id) ? false : (seen.add(m.external_id), true)));
}
