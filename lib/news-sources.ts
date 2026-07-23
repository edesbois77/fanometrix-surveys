// The News Coverage feed catalogue — the publishers Fanometrix reads directly.
//
// WHY A CURATED LIST RATHER THAN A SEARCH ENGINE. The acquisition rules for News
// are: no paid subscription, no unauthorised scraping, and a recorded original
// publisher and URL. A publisher's own RSS/Atom feed is the one route that
// satisfies all three at once — it is published BY the outlet FOR machine
// consumption, it carries the canonical article URL, and it usually carries the
// byline and a permitted standfirst/excerpt as well. Nothing here fetches an
// article body; the feed's own summary is the excerpt we keep.
//
// Every feed below was verified live before being listed (HTTP 200, parseable,
// item count, and whether it carries an author and a description). Feeds are
// grouped into PACKS so a News task selects a purpose ("the sponsorship business
// press") rather than a list of URLs, and tiered by what kind of source it is,
// because an industry body's member showcase is not the same evidence as a trade
// title's reporting — see NewsSourceTier.
//
// Client- and server-safe: pure data + helpers, no I/O.

/** What kind of publisher this is. Travels onto every article so Analysis can
 *  weigh a trade title's reporting differently from a body's member showcase. */
export type NewsSourceTier =
  | "specialist_trade"   // sports-business / sponsorship trade press
  | "marketing_trade"    // marketing and advertising trade press
  | "general_news"       // mainstream news and sports desks
  | "industry_body"      // associations and industry organisations
  | "aggregator";        // republishers and roundup sites

/** How much independence a tier's reporting can be assumed to have. Used to
 *  PREFER a representative when the same story appears from several outlets, and
 *  never to hide anything. */
export const NEWS_SOURCE_TIER_RANK: Record<NewsSourceTier, number> = {
  specialist_trade: 5, marketing_trade: 4, general_news: 3, industry_body: 2, aggregator: 1,
};

export type NewsFeedPack = "sponsorship_business" | "marketing_trade" | "football_media";

// ── Historical routes ────────────────────────────────────────────────────────
// The main feed is the ONGOING monitoring route: latest-N, append-only, and it
// cannot reach back. A one-off BACKFILL needs different endpoints, and which of
// them a publisher offers — and permits — varies per publisher. That is a fact
// about the provider, so it is recorded here with the provider rather than
// discovered again by whoever next needs it.
//
// EVERY VERDICT BELOW WAS MEASURED on 2026-07-23: the endpoint was requested,
// its item count and date range recorded, and the publisher's robots.txt parsed
// for the User-agent:* group covering that exact path. `permitted: false` means
// robots.txt DISALLOWS it and the route must not be used, whatever it returns.

export type HistoricalRouteKind =
  /** WordPress-style search feed, /?s=QUERY&feed=rss2. Query-driven, so it is
   *  the only route that can be aimed at a research topic. */
  | "search_feed"
  /** Tag or category feed. Highest precision where the publisher maintains the
   *  tag, but only covers what they chose to tag. */
  | "tag_feed"
  /** Paged main feed, /feed/?paged=N. Walks back chronologically; cheap, but
   *  undirected and shallow. */
  | "paged_feed";

export type HistoricalRoute = {
  kind: HistoricalRouteKind;
  /** How to build the URL. `{q}` is replaced with the URL-encoded query,
   *  `{n}` with the page number. */
  template: string;
  /** False when the publisher's robots.txt disallows this path for
   *  User-agent:*. A false route is recorded so nobody re-proposes it, and must
   *  never be requested. */
  permitted: boolean;
  /** What the probe actually returned, so the next person does not re-measure. */
  observed?: string;
};

export type NewsFeed = {
  id: string;
  /** The publisher's own name, recorded on every article it yields. */
  publisher: string;
  url: string;
  /** The publisher's home page — recorded so a reader can identify the outlet. */
  site: string;
  /** ISO country of the PUBLISHER, not of the story. Recorded as the article's
   *  market because it is the only market fact a feed actually establishes: a
   *  UK trade title covering a German activation is still a UK publisher. */
  country: string;
  tier: NewsSourceTier;
  packs: NewsFeedPack[];
  /** Stated where a feed's editorial position needs declaring up front. */
  note?: string;
  /** Routes for a one-off historical backfill. Absent means "none found". */
  historical?: HistoricalRoute[];
};

/** Shorthands, so the table below stays readable. */
const searchFeed = (site: string, permitted: boolean, observed?: string): HistoricalRoute =>
  ({ kind: "search_feed", template: `${site}/?s={q}&feed=rss2`, permitted, observed });
const pagedFeed = (site: string, permitted: boolean, observed?: string): HistoricalRoute =>
  ({ kind: "paged_feed", template: `${site}/feed/?paged={n}`, permitted, observed });
const tagFeed = (url: string, permitted: boolean, observed?: string): HistoricalRoute =>
  ({ kind: "tag_feed", template: url, permitted, observed });

// THE PROVIDER REGISTRY. The single maintained place where a publisher is
// described: its ongoing feed, what kind of source it is, and what historical
// routes it offers and permits. Nothing about a publisher lives in connector
// logic — the connector only ever asks this file.
//
// Main feeds verified 2026-07-23: each returned HTTP 200 with parseable items.
// Historical routes measured the same day (endpoint response + robots.txt).
export const NEWS_FEEDS: NewsFeed[] = [
  // ── Sponsorship & sports business ───────────────────────────────────────────
  {
    id: "sportspro", country: "GB", publisher: "SportsPro Media",
    url: "https://www.sportspromedia.com/feed/", site: "https://www.sportspromedia.com",
    tier: "specialist_trade", packs: ["sponsorship_business"],
    historical: [
      searchFeed("https://www.sportspromedia.com", true, "permitted, but returns 0 items — search is not feed-enabled here"),
      tagFeed("https://www.sportspromedia.com/tag/uefa-champions-league/feed/", true, "4 items, 2026-03-04..2026-06-02"),
      tagFeed("https://www.sportspromedia.com/category/sponsorship-marketing/feed/", true, "20 items, 2026-06-04..2026-07-22"),
      pagedFeed("https://www.sportspromedia.com", true, "paged ignored — p2/p5/p10 all return the same window"),
    ],
  },
  {
    id: "sportbusiness", country: "GB", publisher: "SportBusiness",
    url: "https://www.sportbusiness.com/feed/", site: "https://www.sportbusiness.com",
    tier: "specialist_trade", packs: ["sponsorship_business"],
    historical: [searchFeed("https://www.sportbusiness.com", true, "10 items, back to 2026-03-16"), pagedFeed("https://www.sportbusiness.com", true)],
  },
  {
    id: "sportcal", country: "GB", publisher: "Sportcal",
    url: "https://www.sportcal.com/feed/", site: "https://www.sportcal.com",
    tier: "specialist_trade", packs: ["sponsorship_business"],
    historical: [
      searchFeed("https://www.sportcal.com", false, "robots.txt DISALLOWS /?s=* — must not be used"),
      tagFeed("https://www.sportcal.com/sponsorship/feed/", true, "10 items, recent only"),
      pagedFeed("https://www.sportcal.com", true, "p10 reaches 2026-07-07"),
    ],
  },
  {
    id: "sportico", country: "US", publisher: "Sportico",
    url: "https://www.sportico.com/feed/", site: "https://www.sportico.com",
    tier: "specialist_trade", packs: ["sponsorship_business"],
    historical: [
      searchFeed("https://www.sportico.com", false, "robots.txt DISALLOWS /?s= — must not be used, despite returning a year of results"),
      pagedFeed("https://www.sportico.com", true),
    ],
  },
  {
    id: "front-office-sports", country: "US", publisher: "Front Office Sports",
    url: "https://frontofficesports.com/feed/", site: "https://frontofficesports.com",
    tier: "specialist_trade", packs: ["sponsorship_business"],
    historical: [
      searchFeed("https://frontofficesports.com", true, "50 items, back to 2025-01-01 — the deepest permitted search route"),
      tagFeed("https://frontofficesports.com/tag/soccer/feed/", true, "50 items"),
      pagedFeed("https://frontofficesports.com", true, "p10 reaches 2026-06-08"),
    ],
  },
  {
    id: "sport-industry-group", country: "GB", publisher: "Sport Industry Group",
    url: "https://www.sportindustry.biz/feed/", site: "https://www.sportindustry.biz",
    tier: "specialist_trade", packs: ["sponsorship_business"],
    historical: [searchFeed("https://www.sportindustry.biz", true, "12 items, back to 2026-06-11")],
  },
  {
    id: "isportconnect", country: "GB", publisher: "iSportConnect",
    url: "https://www.isportconnect.com/feed/", site: "https://www.isportconnect.com",
    tier: "specialist_trade", packs: ["sponsorship_business"],
    historical: [searchFeed("https://www.isportconnect.com", true, "10 items, 2024-11-20..2025-12-11 — deep but stale-skewed")],
  },
  {
    id: "european-sponsorship-association", country: "GB", publisher: "European Sponsorship Association",
    url: "https://sponsorship.org/feed/", site: "https://sponsorship.org", tier: "industry_body", packs: ["sponsorship_business"],
    note: "An industry association. Much of its output showcases member campaigns, so treat it as the rights holder's or brand's account rather than independent reporting.",
    historical: [searchFeed("https://sponsorship.org", true, "10 items, back to 2026-03-12 — carries FedEx UCL activation case studies")],
  },
  {
    id: "sponsorship-com", country: "US", publisher: "Sponsorship.com (IEG)",
    url: "https://www.sponsorship.com/feed", site: "https://www.sponsorship.com", tier: "industry_body", packs: ["sponsorship_business"],
    note: "A sponsorship consultancy's own publication. Useful for practice and benchmarks; commercially interested in the category it reports on.",
    historical: [searchFeed("https://www.sponsorship.com", true, "permitted but returns 0 items")],
  },
  {
    id: "sportsmint", country: "IN", publisher: "SportsMint Media",
    url: "https://sportsmintmedia.com/feed/", site: "https://sportsmintmedia.com", tier: "aggregator", packs: ["sponsorship_business"],
    note: "Largely rewrites announcements from other outlets, so it is ranked last when the same story appears more than once.",
    historical: [searchFeed("https://sportsmintmedia.com", true, "10 items, back to 2026-06-09"), pagedFeed("https://sportsmintmedia.com", true, "p10 reaches 2026-07-02")],
  },

  // ── Marketing & advertising trade ───────────────────────────────────────────
  {
    id: "campaign-uk", country: "GB", publisher: "Campaign",
    url: "https://www.campaignlive.co.uk/rss/latest", site: "https://www.campaignlive.co.uk",
    tier: "marketing_trade", packs: ["marketing_trade"],
    note: "Search returns HTTP 403 to any non-browser client, so no historical route is available.",
  },
  {
    id: "marketing-dive", country: "US", publisher: "Marketing Dive",
    url: "https://www.marketingdive.com/feeds/news/", site: "https://www.marketingdive.com",
    tier: "marketing_trade", packs: ["marketing_trade"],
    note: "Search returns HTTP 403 to any non-browser client, so no historical route is available.",
  },
  {
    id: "adweek", country: "US", publisher: "Adweek",
    url: "https://www.adweek.com/feed/", site: "https://www.adweek.com",
    tier: "marketing_trade", packs: ["marketing_trade"],
    historical: [searchFeed("https://www.adweek.com", true, "10 items, recent only")],
  },
  {
    id: "digiday", country: "US", publisher: "Digiday",
    url: "https://digiday.com/feed/", site: "https://digiday.com",
    tier: "marketing_trade", packs: ["marketing_trade"],
    historical: [searchFeed("https://digiday.com", true, "15 items, back to 2023-08-30"), pagedFeed("https://digiday.com", true, "p10 reaches 2026-06-16")],
  },

  // ── Football news desks (opt-in: high volume, low sponsorship precision) ────
  { id: "guardian-football", country: "GB", publisher: "The Guardian", url: "https://www.theguardian.com/football/rss", site: "https://www.theguardian.com/football", tier: "general_news", packs: ["football_media"] },
  { id: "bbc-sport-football", country: "GB", publisher: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", site: "https://www.bbc.co.uk/sport/football", tier: "general_news", packs: ["football_media"] },
];

/** The packs a News task reads when it says nothing else. Football desks are
 *  excluded: they are mostly match coverage, and admitting them by default would
 *  bury sponsorship evidence under fixtures. */
export const DEFAULT_NEWS_PACKS: NewsFeedPack[] = ["sponsorship_business", "marketing_trade"];

export const NEWS_FEED_BY_ID: Record<string, NewsFeed> = Object.fromEntries(NEWS_FEEDS.map(f => [f.id, f]));

/** Resolve the feeds a run should read from its config: named packs, named feed
 *  ids, and any extra feed URLs the researcher added by hand. */
export function resolveFeeds(opts: {
  /** Undefined means "the task said nothing", so the defaults apply. An EMPTY
   *  ARRAY means "no packs", which is how a task turns publisher feeds off and
   *  runs on the search index alone — conflating the two would make that
   *  impossible to express. */
  packs?: string[];
  feedIds?: string[];
  extraUrls?: string[];
}): NewsFeed[] {
  const out = new Map<string, NewsFeed>();
  const packs = (opts.packs === undefined ? DEFAULT_NEWS_PACKS : opts.packs) as NewsFeedPack[];
  for (const f of NEWS_FEEDS) {
    if (f.packs.some(p => packs.includes(p))) out.set(f.id, f);
  }
  for (const id of opts.feedIds ?? []) {
    const f = NEWS_FEED_BY_ID[id.trim()];
    if (f) out.set(f.id, f);
  }
  for (const raw of opts.extraUrls ?? []) {
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { continue; }
    // A hand-added feed is an unknown quantity: it gets the lowest tier so it can
    // never outrank a known publisher when choosing a syndication representative.
    out.set(`custom:${url}`, {
      id: `custom:${url}`, publisher: host, url, site: `https://${host}`, country: "",
      tier: "aggregator", packs: [],
      note: "Added by hand for this task; not part of the verified catalogue.",
    });
  }
  return [...out.values()];
}

/** Domain → catalogue publisher, so an article reached by search (which reports
 *  only a domain) still gets a proper publisher name and tier where we know it. */
export function feedForDomain(domain: string): NewsFeed | null {
  const d = domain.trim().toLowerCase().replace(/^www\./, "");
  if (!d) return null;
  return NEWS_FEEDS.find(f => {
    try { return new URL(f.site).hostname.replace(/^www\./, "") === d; } catch { return false; }
  }) ?? null;
}
