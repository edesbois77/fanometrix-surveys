// News Coverage connector — credible editorial coverage, acquired legitimately.
//
// TWO ACQUISITION ROUTES, deliberately layered, because neither is sufficient
// alone and the difference between them matters to the research:
//
//   PUBLISHER FEEDS (primary).  The outlet's own RSS/Atom feed. Published BY the
//     publisher FOR machine consumption, so no scraping and no licence question,
//     and it carries what provenance needs: the canonical article URL, the
//     publisher, usually the byline, and a permitted summary/standfirst. Its
//     limitation is structural and unavoidable: a feed is the LATEST N items and
//     cannot be searched, so this route builds a corpus forwards from today and
//     cannot reach back. The connector therefore does the searching locally —
//     every feed item is matched against the task's Search Strategy before it is
//     admitted (see matchesStrategy).
//
//   SEARCH INDEX (secondary, GDELT).  A keyless, documented research API that
//     CAN be queried retrospectively, which is the one thing feeds cannot do. Its
//     limitations are equally real and are declared per item rather than
//     discovered later: it returns article METADATA only, so `content` is the
//     HEADLINE with no summary and no byline; it gives a domain rather than a
//     publisher name; and it is heavily rate limited (one request per five
//     seconds, and observed to time out under load), so it is best-effort by
//     construction and a run that loses it degrades rather than fails.
//
// WHAT WAS REJECTED, and why it is not a matter of taste: Google News RSS has by
// far the best retrospective recall of any keyless route, but
// https://news.google.com/robots.txt disallows /rss/search for User-agent: *.
// Reading it programmatically would be exactly the unauthorised access this
// connector is required to avoid, so it is not used at any setting. Paid news
// APIs (NewsAPI, Bing News, GNews, Meltwater) are excluded by the no-new-paid-
// subscription constraint.
//
// Nothing here fetches an article body. The excerpt stored is the one the
// publisher chose to syndicate in its own feed.
import type { Connector, CollectContext, CollectResult, NormalisedItem } from "@/lib/connectors/types";
import type { SearchStrategy } from "@/lib/search-strategy";
import {
  resolveFeeds, feedForDomain, NEWS_SOURCE_TIER_RANK, DEFAULT_NEWS_PACKS, type NewsFeed,
} from "@/lib/news-sources";
import {
  canonicaliseUrl, domainOf, clusterSyndication, stripPublisherSuffix,
  type SyndicationCandidate,
} from "@/lib/news-syndication";

const USER_AGENT = "Fanometrix/1.0 (research; +https://fanometrix.com)";
const DEFAULT_MAX_ARTICLES = 60;
const HARD_MAX = 250;
const FEED_TIMEOUT_MS = 20_000;
const FEED_CONCURRENCY = 4;

// GDELT
const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const GDELT_MAX_QUERY_CHARS = 900;
const GDELT_MIN_INTERVAL_MS = 5_500;   // its own stated limit is one per five seconds
const GDELT_ATTEMPTS = 3;

const LANGUAGE_NAME: Record<string, string> = {
  en: "english", de: "german", fr: "french", es: "spanish", it: "italian",
  pt: "portuguese", nl: "dutch", sv: "swedish", da: "danish", no: "norwegian",
  pl: "polish", tr: "turkish", ar: "arabic", ja: "japanese", zh: "chinese",
};

const COUNTRY_NAME: Record<string, string> = {
  gb: "UnitedKingdom", uk: "UnitedKingdom", us: "UnitedStates", ie: "Ireland",
  de: "Germany", fr: "France", es: "Spain", it: "Italy", nl: "Netherlands",
  se: "Sweden", dk: "Denmark", no: "Norway", pt: "Portugal", pl: "Poland",
  br: "Brazil", mx: "Mexico", ar: "Argentina", in: "India", cn: "China",
  jp: "Japan", au: "Australia", ca: "Canada", za: "SouthAfrica", ae: "UnitedArabEmirates",
};

// ── XML helpers ───────────────────────────────────────────────────────────────
// A small, forgiving reader rather than a dependency: feeds are RSS 2.0 or Atom,
// both flat enough that a tolerant reader beats a strict parser that rejects the
// whole document over one malformed entity.

const decodeEntities = (s: string): string =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
   .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
   .replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

const stripCdata = (s: string): string => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

/** Feed summaries legitimately contain markup. We keep the TEXT the publisher
 *  syndicated and drop the markup, images and tracking pixels around it. */
function toPlainText(html: string, max = 1200): string {
  const text = decodeEntities(
    stripCdata(html)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function firstTag(block: string, ...names: string[]): string | null {
  for (const name of names) {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i").exec(block);
    if (m) {
      const v = decodeEntities(stripCdata(m[1])).trim();
      if (v) return v;
    }
  }
  return null;
}

/** Atom links are attributes, not text: <link rel="alternate" href="…"/>. */
function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map(m => m[1]);
  const pick = (test: (attrs: string) => boolean) => {
    for (const attrs of links) {
      if (!test(attrs)) continue;
      const href = /href\s*=\s*"([^"]+)"/i.exec(attrs)?.[1] ?? /href\s*=\s*'([^']+)'/i.exec(attrs)?.[1];
      if (href) return decodeEntities(href).trim();
    }
    return null;
  };
  return pick(a => /rel\s*=\s*["']?alternate/i.test(a)) ?? pick(a => !/rel\s*=/i.test(a)) ?? pick(() => true);
}

function imageFrom(block: string): string | null {
  const media = /<media:(?:thumbnail|content)\b[^>]*\burl\s*=\s*"([^"]+)"/i.exec(block)?.[1];
  if (media) return decodeEntities(media);
  const enclosure = /<enclosure\b[^>]*\burl\s*=\s*"([^"]+)"[^>]*type\s*=\s*"image\//i.exec(block)?.[1];
  if (enclosure) return decodeEntities(enclosure);
  const inline = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(stripCdata(block))?.[1];
  return inline ? decodeEntities(inline) : null;
}

function parseDate(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type FeedItem = {
  title: string;
  url: string;
  summary: string;
  author: string | null;
  publishedAt: string | null;
  image: string | null;
  categories: string[];
  guid: string | null;
};

/** Read RSS 2.0 <item> or Atom <entry> blocks out of a feed document. */
function parseFeed(xml: string): FeedItem[] {
  const blocks = [
    ...[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => m[1]),
    ...[...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m => m[1]),
  ];
  const out: FeedItem[] = [];
  for (const b of blocks) {
    const title = firstTag(b, "title");
    const url = firstTag(b, "link") ?? atomLink(b);
    if (!title || !url) continue;
    const summaryRaw = firstTag(b, "description", "summary", "content:encoded", "content") ?? "";
    out.push({
      title: toPlainText(title, 300),
      url: url.trim(),
      summary: toPlainText(summaryRaw),
      author: firstTag(b, "dc:creator", "author", "name"),
      publishedAt: parseDate(firstTag(b, "pubDate", "published", "updated", "dc:date")),
      image: imageFrom(b),
      categories: [...b.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
        .map(m => decodeEntities(stripCdata(m[1])).trim()).filter(Boolean).slice(0, 8),
      guid: firstTag(b, "guid", "id"),
    });
  }
  return out;
}

// ── Local retrieval: matching a feed item against the Search Strategy ─────────
// A publisher feed cannot be queried, so the connector applies the task's own
// strategy to the items it receives. This is a deliberate, declared PRE-FILTER
// (cheap and deterministic) sitting in front of the AI relevance judgement
// (expensive and nuanced) — it decides what is worth judging, never what is
// relevant. An item it lets through can still be judged off-topic; an item it
// rejects never reaches the classifier, which is why the test is anchor-based
// and not a general topic match.

const norm = (s: string): string =>
  s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();

/** Whole-token containment, so "Uefa" does not match "Uefaland" and a two-word
 *  anchor must appear as a phrase. */
function containsTerm(haystack: string, term: string): boolean {
  const t = norm(term);
  if (!t) return false;
  return new RegExp(`(?:^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(haystack);
}

export type StrategyMatch = { matched: boolean; reason: string };

/**
 * EXCLUSIONS ARE A HEADLINE TEST FOR NEWS, never a body test.
 *
 * Found in live validation, and it cost the entire direct FedEx task. The Search
 * Strategist writes exclusions to disambiguate the subject's other meaning — for
 * FedEx: "logistics", "delivery", "parcel", "driver". Those are right for a short
 * social post, where the whole text is the claim. Applied to a news article they
 * are destructive, because an article of any length mentions "delivery" or a
 * "driver" in passing. Worse, in this exact case FedEx's real Champions League
 * activation IS a trophy DELIVERY ("Walk of Champions"), so a body-level
 * exclusion rejects the single best piece of direct evidence there is.
 *
 * So exclusions are tested against the HEADLINE only. A headline is the story's
 * own claim about itself: "FedEx driver charged" is genuinely the wrong FedEx,
 * while "FedEx delivers the Champions League trophy" is not, and only the
 * headline test can tell them apart.
 */
function excludedByHeadline(title: string, strategy: SearchStrategy | null | undefined): string | null {
  const hay = norm(title);
  if (!hay) return null;
  return (strategy?.exclusions ?? []).filter(Boolean).find(e => containsTerm(hay, e)) ?? null;
}

/**
 * Whether a SEARCH-INDEX result may be admitted.
 *
 * Deliberately weaker than matchesStrategy, and the reason matters. The index
 * matches an article's BODY but returns only its HEADLINE, so demanding the
 * anchor in the headline rejects sound coverage — measured at 10 out of 10 on
 * live FedEx results. The anchoring is already done by the query itself, so all
 * that is applied locally is the EXCLUSION VETO, which is what catches the
 * wrong-sense hit the query could not ("FedEx Cup", golf) when it shows up in
 * the headline. Everything surviving this still faces the relevance classifier.
 */
export function searchIndexAdmissible(title: string, strategy: SearchStrategy | null | undefined): StrategyMatch {
  if (!norm(title)) return { matched: false, reason: "no headline" };
  const hit = excludedByHeadline(title, strategy);
  if (hit) return { matched: false, reason: `excluded term "${hit}"` };
  return { matched: true, reason: "search index query" };
}

/**
 * Does this article's headline + summary satisfy the task's strategy?
 *
 *   with a primary entity (direct / comparative): the ANCHOR must appear —
 *     the subject or one of its aliases — and, unless breadth is "broad", at
 *     least one context term must appear too. That is what stops a FedEx
 *     logistics story or a bare sponsor-list mention being admitted.
 *   with no primary entity (strategic): at least TWO distinct strategy terms
 *     must appear, so a single incidental word cannot admit an article.
 *   exclusions veto in both cases.
 */
export function matchesStrategy(
  text: string,
  strategy: SearchStrategy | null | undefined,
  keywords: string[],
  /** The headline alone. Exclusions are tested against THIS, never the whole
   *  text — see excludedByHeadline. Defaults to the full text for callers that
   *  have no separate headline. */
  title?: string,
): StrategyMatch {
  const hay = norm(text);
  if (!hay) return { matched: false, reason: "no text" };

  const hitExclusion = excludedByHeadline(title ?? text, strategy);

  const primary = strategy?.primary_entity;
  const anchors = primary ? [primary.term, ...(primary.aliases ?? [])].filter(Boolean) : [];
  const context = [
    ...(strategy?.context_entities ?? []).flatMap(e => [e.term, ...(e.aliases ?? [])]),
    ...(strategy?.synonyms ?? []),
    ...(strategy?.campaigns ?? []),
  ].filter(Boolean);

  if (anchors.length) {
    const anchorHit = anchors.find(a => containsTerm(hay, a));
    if (!anchorHit) return { matched: false, reason: "the subject is not mentioned" };
    // An exclusion only vetoes once the anchor is present — that is the
    // disambiguation case it exists for (FedEx the courier vs FedEx the sponsor).
    if (hitExclusion) return { matched: false, reason: `excluded term "${hitExclusion}"` };
    if (strategy?.breadth === "broad" || !context.length) return { matched: true, reason: `anchor "${anchorHit}"` };
    const ctxHit = context.find(c => containsTerm(hay, c));
    if (!ctxHit) return { matched: false, reason: `mentions ${anchorHit} but none of its research context` };
    return { matched: true, reason: `anchor "${anchorHit}" with context "${ctxHit}"` };
  }

  // Strategic: no anchor to require, so demand corroborating breadth instead.
  const terms = Array.from(new Set([...context, ...keywords].map(t => t.trim()).filter(Boolean)));
  if (!terms.length) return { matched: false, reason: "no strategy terms to match on" };
  if (hitExclusion) return { matched: false, reason: `excluded term "${hitExclusion}"` };
  const hits = terms.filter(t => containsTerm(hay, t));
  if (hits.length >= 2) return { matched: true, reason: `terms ${hits.slice(0, 3).map(h => `"${h}"`).join(", ")}` };
  // A single multi-word phrase ("football sponsorship") is specific enough alone.
  const phraseHit = hits.find(h => h.trim().includes(" "));
  if (phraseHit) return { matched: true, reason: `phrase "${phraseHit}"` };
  return { matched: false, reason: "too few strategy terms to be materially on topic" };
}

// ── GDELT query compilation ───────────────────────────────────────────────────

const quote = (t: string): string => (t.trim().includes(" ") ? `"${t.trim()}"` : t.trim());

/**
 * The context terms specific enough to ANCHOR a search-index query.
 *
 * Learned the hard way: OR-ing every context term together, generic ones
 * included, turns `FedEx (…OR "sponsorship" OR "football")` into "FedEx and any
 * sport", which returned FedEx Cup golf and an unrelated Fifa story. A search
 * index has no relevance model of its own, so the query itself has to carry the
 * precision. Multi-word phrases and named competitions/clubs/organisations do;
 * bare words like "sponsorship" or "football" do not.
 */
function anchoringContextTerms(strategy: SearchStrategy | null | undefined): string[] {
  const entities = strategy?.context_entities ?? [];
  const specific = entities.filter(e =>
    e.term.trim().includes(" ") || /^(competition|club|organisation|organization|person|campaign)$/i.test(e.type ?? ""));
  const chosen = specific.length ? specific : entities;
  const terms = chosen.flatMap(e => [e.term, ...(e.aliases ?? [])]).map(t => t.trim()).filter(Boolean);
  return Array.from(new Set(terms)).slice(0, 8);
}

// The search index rejects short quoted phrases outright, and it rejects the
// WHOLE QUERY rather than the offending term: a three-letter alias like "UCL"
// returned "The specified phrase is too short." and cost the entire retrospective
// route. Anything below this length is therefore dropped from the index query
// (it is still used for local matching, where it is perfectly good).
const GDELT_MIN_TERM_CHARS = 5;
const gdeltUsable = (t: string): boolean => t.trim().length >= GDELT_MIN_TERM_CHARS;

function compileGdeltQuery(strategy: SearchStrategy | null | undefined, keywords: string[]): string {
  const primary = strategy?.primary_entity?.term?.trim();
  if (primary) {
    if (!gdeltUsable(primary)) return "";   // too short to query the index with
    const context = anchoringContextTerms(strategy).filter(gdeltUsable);
    let q = quote(primary);
    if (context.length && strategy?.breadth !== "broad") q += ` (${context.map(quote).join(" OR ")})`;
    // NO NEGATED EXCLUSIONS. The index matches the article BODY, so "-delivery"
    // rejects any article that says the word anywhere — including FedEx's own
    // Champions League trophy DELIVERY activation, which is the best direct
    // evidence available. Exclusions are applied to the headline instead, after
    // the results come back (searchIndexAdmissible).
    return q.slice(0, GDELT_MAX_QUERY_CHARS);
  }
  const terms = [
    ...(strategy?.context_entities ?? []).map(e => e.term),
    ...(strategy?.synonyms ?? []),
    ...keywords,
  ].map(k => k.trim()).filter(t => t && gdeltUsable(t));
  const unique = Array.from(new Set(terms)).slice(0, 8);
  if (!unique.length) return "";
  // Multi-word phrases are the specific ones; AND the two strongest so the query
  // is not a broad OR that returns the whole category.
  const phrases = unique.filter(t => t.includes(" "));
  if (phrases.length >= 2) return `${quote(phrases[0])} ${quote(phrases[1])}`.slice(0, GDELT_MAX_QUERY_CHARS);
  if (phrases.length === 1) return `${quote(phrases[0])}`.slice(0, GDELT_MAX_QUERY_CHARS);
  return `(${unique.map(quote).join(" OR ")})`.slice(0, GDELT_MAX_QUERY_CHARS);
}

/** GDELT wants a bare 14-digit YYYYMMDDHHMMSS. */
function stamp(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "");
}

function parseSeenDate(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type GdeltArticle = {
  url?: string; title?: string; seendate?: string;
  domain?: string; language?: string; sourcecountry?: string; socialimage?: string;
};

// ── The raw article shape both routes normalise into ─────────────────────────
type RawArticle = SyndicationCandidate & {
  summary: string;
  author: string | null;
  image: string | null;
  categories: string[];
  language: string | null;
  market: string | null;
  publisherSite: string | null;
  tier: string;
  tierNote: string | null;
  acquisition: "publisher_feed" | "search_index";
  feedId: string | null;
  matchReason: string;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchText(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: "", error: err instanceof Error ? err.message : "request failed" };
  }
}

/** Run tasks with a small concurrency cap so a 16-feed run does not open 16
 *  sockets at once, and one slow publisher cannot stall the rest. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean)
  : typeof v === "string" ? v.split(",").map(s => s.trim()).filter(Boolean)
  : [];

const asBool = (v: unknown, dflt: boolean): boolean =>
  typeof v === "boolean" ? v : typeof v === "string" ? !/^(false|0|no|off)$/i.test(v.trim()) : dflt;

export const newsConnector: Connector = {
  id: "news",
  name: "News Coverage",
  platform: "News",
  capabilities: {
    contentKinds: ["article"],
    supportsSearch: true,
    supportsComments: false,
    // A publisher feed establishes the PUBLISHER's country, not the story's
    // market, and it cannot be filtered by market at source. Declared false so
    // the UI never implies a market filter it cannot honour; the search index
    // does filter by source country and does so when markets are set.
    supportsRegionFilter: false,
    supportsLanguageFilter: false,
    // Feeds are latest-N and cannot be queried by date; the window is applied
    // client-side after fetching, and honoured natively by the search index.
    supportsDateWindow: true,
    paginated: false,
    // A feed returns the latest N items with no cursor, so a run cannot prove it
    // has seen everything since the last one. Gaps are possible if a task runs
    // less often than a busy feed rolls over — declared, not hidden.
    incremental: false,
    configSchema: {
      max_articles: { type: "number", label: "Max articles per run", default: DEFAULT_MAX_ARTICLES },
      feed_packs: { type: "string[]", label: "Publisher packs", default: DEFAULT_NEWS_PACKS },
      feed_ids: { type: "string[]", label: "Individual publishers" },
      feed_urls: { type: "string[]", label: "Additional feed URLs" },
      use_search_index: { type: "number", label: "Also query the search index (1 = yes)", default: 1 },
    },
    quota: {
      note: "Keyless. Publisher feeds are unmetered but return only their latest items. The search index is rate limited to one request per five seconds and is best-effort.",
    },
    env: [],
  },

  // Keyless by design: News works on every deployment with no setup.
  isConfigured() { return true; },

  async collect(ctx: CollectContext): Promise<CollectResult> {
    const warnings: string[] = [];
    const stats: Record<string, number> = {};

    const max = Math.min(HARD_MAX, Math.max(1, Number(ctx.config.max_articles) > 0 ? Number(ctx.config.max_articles) : DEFAULT_MAX_ARTICLES));
    const from = ctx.dateFrom ? new Date(ctx.dateFrom).getTime() : null;
    const to = ctx.dateTo ? new Date(ctx.dateTo).getTime() : null;
    const inWindow = (iso: string | null): boolean => {
      if (!iso) return true;                        // undated items are kept, not guessed at
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return true;
      if (from !== null && t < from) return false;
      if (to !== null && t > to) return false;
      return true;
    };

    const raw: RawArticle[] = [];
    let feedItemsSeen = 0, feedItemsMatched = 0, feedItemsOutOfWindow = 0;

    // ── Route 1: publisher feeds ────────────────────────────────────────────
    const feeds = resolveFeeds({
      // Undefined (the task said nothing) takes the defaults; an explicit empty
      // list means "no publisher feeds", which is a real setting.
      packs: ctx.config.feed_packs === undefined ? undefined : asStringArray(ctx.config.feed_packs),
      feedIds: asStringArray(ctx.config.feed_ids),
      extraUrls: asStringArray(ctx.config.feed_urls),
    });

    const results = await mapLimit(feeds, FEED_CONCURRENCY, async (feed: NewsFeed) => {
      const res = await fetchText(feed.url, FEED_TIMEOUT_MS);
      if (!res.ok) {
        return { feed, items: [] as FeedItem[], error: res.error ?? `HTTP ${res.status}` };
      }
      try {
        return { feed, items: parseFeed(res.text), error: null as string | null };
      } catch {
        return { feed, items: [] as FeedItem[], error: "the feed could not be read" };
      }
    });

    for (const { feed, items, error } of results) {
      if (error) { warnings.push(`${feed.publisher}: ${error}`); continue; }
      if (!items.length) { warnings.push(`${feed.publisher}: the feed returned no readable items`); continue; }
      stats[`feed_${feed.id.replace(/[^a-z0-9]+/gi, "_")}`] = items.length;
      feedItemsSeen += items.length;

      for (const item of items) {
        const canonical = canonicaliseUrl(item.url);
        if (!canonical || !item.title.trim()) continue;
        if (!inWindow(item.publishedAt)) { feedItemsOutOfWindow++; continue; }

        const haystack = `${item.title} ${item.summary} ${item.categories.join(" ")}`;
        const match = matchesStrategy(haystack, ctx.strategy, ctx.keywords, item.title);
        if (!match.matched) continue;
        feedItemsMatched++;

        raw.push({
          canonicalUrl: canonical,
          title: stripPublisherSuffix(item.title, feed.publisher),
          publisher: feed.publisher,
          publishedAt: item.publishedAt,
          tierRank: NEWS_SOURCE_TIER_RANK[feed.tier] ?? 1,
          fullMetadata: true,
          summary: item.summary,
          author: item.author,
          image: item.image,
          categories: item.categories,
          language: "en",
          market: feed.country || null,
          publisherSite: feed.site,
          tier: feed.tier,
          tierNote: feed.note ?? null,
          acquisition: "publisher_feed",
          feedId: feed.id,
          matchReason: match.reason,
        });
      }
    }
    stats.feeds_read = feeds.length - results.filter(r => r.error).length;
    stats.feed_items_seen = feedItemsSeen;
    stats.feed_items_matched = feedItemsMatched;
    if (feedItemsOutOfWindow) stats.feed_items_outside_window = feedItemsOutOfWindow;

    // ── Route 2: the search index, for retrospective reach ──────────────────
    const useSearch = asBool(ctx.config.use_search_index, true) && Number(ctx.config.use_search_index) !== 0;
    if (useSearch) {
      const query = compileGdeltQuery(ctx.strategy, ctx.keywords);
      if (!query) {
        warnings.push("The search index was skipped: the strategy has no terms to query with.");
      } else {
        let q = query;
        const langs = ctx.languages.map(l => LANGUAGE_NAME[l.trim().toLowerCase()]).filter(Boolean);
        const unmappedLangs = ctx.languages.filter(l => !LANGUAGE_NAME[l.trim().toLowerCase()]);
        if (unmappedLangs.length) warnings.push(`Search index: no language filter available for ${unmappedLangs.join(", ")}, so it was not applied.`);
        const countries = ctx.markets.map(m => COUNTRY_NAME[m.trim().toLowerCase()]).filter(Boolean);
        const unmappedMarkets = ctx.markets.filter(m => !COUNTRY_NAME[m.trim().toLowerCase()]);
        if (unmappedMarkets.length) warnings.push(`Search index: no market filter available for ${unmappedMarkets.join(", ")}, so it was not applied.`);
        if (langs.length === 1) q += ` sourcelang:${langs[0]}`;
        else if (langs.length > 1) q += ` (${langs.map(l => `sourcelang:${l}`).join(" OR ")})`;
        if (countries.length === 1) q += ` sourcecountry:${countries[0]}`;
        else if (countries.length > 1) q += ` (${countries.map(c => `sourcecountry:${c}`).join(" OR ")})`;

        const params = new URLSearchParams({
          query: q, mode: "artlist", format: "json", sort: "datedesc", maxrecords: String(Math.min(HARD_MAX, max)),
        });
        const f = ctx.dateFrom ? stamp(ctx.dateFrom) : null;
        const t = ctx.dateTo ? stamp(ctx.dateTo) : null;
        if (f) params.set("startdatetime", f);
        if (t) params.set("enddatetime", t);

        // Bounded, paced retry. The index is publicly rate limited and observed
        // to time out under load, so this route is BEST EFFORT: it degrades to a
        // warning and the run continues on the feeds it already has.
        let payload: { articles?: GdeltArticle[] } | null = null;
        let lastProblem = "";
        for (let attempt = 1; attempt <= GDELT_ATTEMPTS; attempt++) {
          if (attempt > 1) await sleep(GDELT_MIN_INTERVAL_MS);
          const res = await fetchText(`${GDELT_ENDPOINT}?${params.toString()}`, 45_000);
          if (res.error) { lastProblem = `could not be reached (${res.error})`; continue; }
          if (res.status === 429 || /limit requests/i.test(res.text)) { lastProblem = "is rate limiting requests"; continue; }
          if (!res.ok) { lastProblem = `returned HTTP ${res.status}`; continue; }
          if (!res.text.trim().startsWith("{")) { lastProblem = "rejected the query"; break; }
          try { payload = JSON.parse(res.text) as { articles?: GdeltArticle[] }; break; }
          catch { lastProblem = "returned a response that could not be read"; }
        }

        if (!payload) {
          warnings.push(`The search index ${lastProblem}. Publisher feeds were collected as normal, so this run covers current coverage but not the archive.`);
          stats.search_index_failed = 1;
        } else {
          const articles = payload.articles ?? [];
          stats.search_index_articles = articles.length;
          let indexRejected = 0;
          for (const a of articles) {
            const canonical = canonicaliseUrl((a.url ?? "").trim());
            const title = (a.title ?? "").trim();
            if (!canonical || !title) continue;
            const publishedAt = parseSeenDate(a.seendate);
            if (!inWindow(publishedAt)) continue;
            const indexMatch = searchIndexAdmissible(title, ctx.strategy);
            if (!indexMatch.matched) { indexRejected++; continue; }
            const domain = (a.domain ?? "").trim() || domainOf(canonical) || "";
            const known = domain ? feedForDomain(domain) : null;
            raw.push({
              canonicalUrl: canonical,
              title: stripPublisherSuffix(title, known?.publisher ?? domain),
              // A search index gives a domain, not a masthead. Where the domain
              // is one we already know, its proper name is used; otherwise the
              // domain is recorded honestly as the best identification we have.
              publisher: known?.publisher ?? domain ?? null,
              publishedAt,
              tierRank: known ? NEWS_SOURCE_TIER_RANK[known.tier] : 0,
              fullMetadata: false,
              summary: "",              // the index carries no summary
              author: null,             // and no byline
              image: (a.socialimage ?? "").trim() || null,
              categories: [],
              language: (a.language ?? "").trim() || null,
              market: (a.sourcecountry ?? "").trim() || null,
              publisherSite: known?.site ?? (domain ? `https://${domain}` : null),
              tier: known?.tier ?? "aggregator",
              tierNote: known?.note ?? null,
              acquisition: "search_index",
              feedId: null,
              matchReason: `search index, ${indexMatch.reason}`,
            });
          }
          if (indexRejected) stats.search_index_rejected = indexRejected;
        }
      }
    }

    if (!raw.length) {
      warnings.push("No news coverage matched this task in the selected window.");
      return { items: [], warnings, stats };
    }

    // ── Exact-URL dedup, then syndication clustering ────────────────────────
    const byUrl = new Map<string, RawArticle>();
    for (const a of raw) {
      const seen = byUrl.get(a.canonicalUrl);
      // The same URL from both routes: keep the copy with real metadata.
      if (!seen || (!seen.fullMetadata && a.fullMetadata)) byUrl.set(a.canonicalUrl, a);
    }
    stats.unique_urls = byUrl.size;

    const clusters = clusterSyndication([...byUrl.values()]);
    const syndicatedAway = byUrl.size - clusters.length;
    stats.after_syndication_dedup = clusters.length;
    if (syndicatedAway > 0) {
      stats.syndicated_copies_merged = syndicatedAway;
      warnings.push(`${syndicatedAway} near-identical article${syndicatedAway === 1 ? "" : "s"} merged as syndicated copies, so a single story is counted once.`);
    }

    // A story already in the base under a different URL must not come back as a
    // fresh piece of evidence just because another outlet ran it later.
    const knownKeys = ctx.knownSyndicationKeys;
    const fresh = knownKeys?.size
      ? clusters.filter(c => !knownKeys.has(c.key))
      : clusters;
    const alreadyHeld = clusters.length - fresh.length;
    if (alreadyHeld > 0) {
      stats.already_held_as_syndicated = alreadyHeld;
      warnings.push(`${alreadyHeld} article${alreadyHeld === 1 ? " was" : "s were"} another outlet's copy of a story already in the evidence base, so ${alreadyHeld === 1 ? "it was" : "they were"} not re-imported.`);
    }

    // Newest first, then cap.
    const ordered = [...fresh].sort((a, b) => {
      const ta = a.representative.publishedAt ? new Date(a.representative.publishedAt).getTime() : 0;
      const tb = b.representative.publishedAt ? new Date(b.representative.publishedAt).getTime() : 0;
      return tb - ta;
    });
    const capped = ordered.slice(0, max);
    if (ordered.length > capped.length) {
      warnings.push(`${ordered.length - capped.length} further article${ordered.length - capped.length === 1 ? "" : "s"} matched but were not collected: the per-run cap is ${max}.`);
    }

    const items: NormalisedItem[] = capped.map(({ key, representative: a, copies }) => ({
      external_id: a.canonicalUrl,
      content_kind: "article",
      // The classifier reads the headline AND the publisher's own syndicated
      // summary, so an article is judged on more than its headline wherever the
      // publisher provides one.
      content: a.summary ? `${a.title}\n\n${a.summary}` : a.title,
      author: a.author,
      source_url: a.canonicalUrl,
      published_at: a.publishedAt,
      market: a.market,
      language: a.language,
      parent_external_id: null,
      metadata: {
        headline: a.title,
        summary: a.summary || null,
        publisher: a.publisher,
        publisher_site: a.publisherSite,
        publisher_tier: a.tier,
        publisher_note: a.tierNote,
        byline: a.author,
        image_url: a.image,
        categories: a.categories,
        acquisition_source: a.acquisition,
        feed_id: a.feedId,
        // Why this article was retrieved at all — the audit trail from the
        // Evidence Requirement's strategy down to this specific item.
        matched_because: a.matchReason,
        syndication_key: key,
        syndicated_copies: copies,
        syndicated_copy_count: copies.length,
        // Declared per item rather than inferred downstream: a search-index item
        // is a headline with no summary and no byline.
        headline_only: !a.summary,
      },
    }));

    stats.articles = items.length;
    return { items, warnings, stats };
  },
};
