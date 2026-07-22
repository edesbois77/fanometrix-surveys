// News connector — editorial coverage via GDELT's Document API.
//
// Chosen because it needs NO API key and no per-customer approval, so News works
// out of the box on every deployment. It covers global online news in many
// languages with source country and language metadata, which maps cleanly onto
// the pipeline's market/language model.
//
// HONEST LIMITATION, declared here rather than discovered later: GDELT's artlist
// mode returns article METADATA (headline, outlet, country, language, date), not
// body text. So an item's `content` is its HEADLINE. That is legitimate evidence,
// a headline is what a reader actually sees, and the relevance classifier judges
// it like any other item, but findings drawn from News will be shallower than
// those drawn from conversation. It is not a substitute for full-text research.
//
// No pipeline or schema change: implement the contract, add one line to the
// registry (lib/connectors/index.ts) and one entry to the catalog.
import type { Connector, CollectContext, CollectResult, NormalisedItem } from "@/lib/connectors/types";
import type { SearchStrategy } from "@/lib/search-strategy";

const ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const DEFAULT_MAX_ARTICLES = 50;
const HARD_MAX = 250;          // GDELT's own ceiling for maxrecords
const MAX_QUERY_CHARS = 900;   // GDELT rejects very long queries

// GDELT names languages and countries in words, not ISO codes. Only mappings we
// can make confidently are applied; anything else is skipped with a warning
// rather than silently narrowing the search to nothing.
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

const quote = (t: string): string => (t.trim().includes(" ") ? `"${t.trim()}"` : t.trim());

/** Compile the Search Strategy into a GDELT query: the subject anchored to its
 *  context, with exclusions negated. Falls back to a flat OR of keywords. */
function compileQuery(strategy: SearchStrategy | null | undefined, keywords: string[]): string {
  const primary = strategy?.primary_entity?.term?.trim();
  if (primary) {
    const context = (strategy?.context_entities ?? []).map(e => e.term.trim()).filter(Boolean).slice(0, 6);
    const exclusions = (strategy?.exclusions ?? []).map(e => e.trim()).filter(Boolean).slice(0, 6);
    let q = quote(primary);
    // GDELT ANDs terms implicitly; a bracketed OR keeps the subject anchored to
    // its context rather than matching the subject anywhere.
    if (context.length && strategy?.breadth !== "broad") q += ` (${context.map(quote).join(" OR ")})`;
    if (exclusions.length) q += ` ${exclusions.map(e => `-${quote(e)}`).join(" ")}`;
    return q.slice(0, MAX_QUERY_CHARS);
  }
  const terms = keywords.map(k => k.trim()).filter(Boolean).slice(0, 8);
  if (!terms.length) return "";
  return (terms.length === 1 ? quote(terms[0]) : `(${terms.map(quote).join(" OR ")})`).slice(0, MAX_QUERY_CHARS);
}

/** GDELT wants a bare YYYYMMDDHHMMSS: 14 digits, no separators and no "T". */
function stamp(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "");
}

/** GDELT seendate ("20260619T053000Z") → ISO, or null when unparseable. */
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

export const newsConnector: Connector = {
  id: "news",
  name: "News",
  platform: "News",
  capabilities: {
    contentKinds: ["article"],
    supportsSearch: true,
    supportsComments: false,
    supportsRegionFilter: true,     // sourcecountry:
    supportsLanguageFilter: true,   // sourcelang:
    supportsDateWindow: true,       // startdatetime / enddatetime
    paginated: false,               // single call, capped by maxrecords
    // GDELT returns a ranked/dated SAMPLE, not a reliable "everything since last
    // seen" stream, so this is not incremental. The pipeline still dedups its
    // output against the base, so nothing is re-imported.
    incremental: false,
    configSchema: {
      max_articles: { type: "number", label: "Max articles per run", default: DEFAULT_MAX_ARTICLES },
    },
    quota: { note: "Keyless. Rate-limited by IP, so keep runs modest and expect occasional throttling." },
    env: [],
  },

  // Keyless: News is available on every deployment with no setup.
  isConfigured() { return true; },

  async collect(ctx: CollectContext): Promise<CollectResult> {
    const warnings: string[] = [];
    const query = compileQuery(ctx.strategy, ctx.keywords);
    if (!query) return { items: [], warnings: ["No keywords or search strategy to query"], stats: {} };

    const max = Math.min(
      HARD_MAX,
      Math.max(1, Number(ctx.config.max_articles) > 0 ? Number(ctx.config.max_articles) : DEFAULT_MAX_ARTICLES),
    );

    // Language + country narrow the query itself. Unmapped values are dropped
    // with a warning: silently applying a wrong filter would return nothing and
    // look like "no coverage exists".
    const langs = ctx.languages.map(l => LANGUAGE_NAME[l.trim().toLowerCase()]).filter(Boolean);
    const unmappedLangs = ctx.languages.filter(l => !LANGUAGE_NAME[l.trim().toLowerCase()]);
    if (unmappedLangs.length) warnings.push(`Language filter not applied for ${unmappedLangs.join(", ")} (unsupported by the news source)`);

    const countries = ctx.markets.map(m => COUNTRY_NAME[m.trim().toLowerCase()]).filter(Boolean);
    const unmappedMarkets = ctx.markets.filter(m => !COUNTRY_NAME[m.trim().toLowerCase()]);
    if (unmappedMarkets.length) warnings.push(`Market filter not applied for ${unmappedMarkets.join(", ")} (unsupported by the news source)`);

    let q = query;
    if (langs.length === 1) q += ` sourcelang:${langs[0]}`;
    else if (langs.length > 1) q += ` (${langs.map(l => `sourcelang:${l}`).join(" OR ")})`;
    if (countries.length === 1) q += ` sourcecountry:${countries[0]}`;
    else if (countries.length > 1) q += ` (${countries.map(c => `sourcecountry:${c}`).join(" OR ")})`;

    const params = new URLSearchParams({
      query: q, mode: "artlist", format: "json", sort: "datedesc", maxrecords: String(max),
    });
    const from = ctx.dateFrom ? stamp(ctx.dateFrom) : null;
    const to = ctx.dateTo ? stamp(ctx.dateTo) : null;
    if (from) params.set("startdatetime", from);
    if (to) params.set("enddatetime", to);

    let payload: { articles?: GdeltArticle[] };
    try {
      const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
        headers: { "User-Agent": "Fanometrix/1.0 (research)" },
      });
      if (res.status === 429) {
        return { items: [], warnings, stats: {}, fatalError: "The news source is rate limiting this request. Try again shortly." };
      }
      if (!res.ok) {
        return { items: [], warnings, stats: {}, fatalError: `News source returned ${res.status}` };
      }
      const text = await res.text();
      // GDELT returns HTML on a malformed query rather than a JSON error.
      if (!text.trim().startsWith("{")) {
        return { items: [], warnings, stats: {}, fatalError: "The news source rejected the query." };
      }
      payload = JSON.parse(text) as { articles?: GdeltArticle[] };
    } catch (err) {
      return { items: [], warnings, stats: {}, fatalError: `Could not reach the news source: ${(err as Error).message}` };
    }

    const seen = new Set<string>();
    const items: NormalisedItem[] = [];
    for (const a of payload.articles ?? []) {
      const url = (a.url ?? "").trim();
      const title = (a.title ?? "").trim();
      if (!url || !title) continue;
      if (seen.has(url)) continue;      // GDELT can repeat a url across outlets
      seen.add(url);
      items.push({
        external_id: url,               // stable and unique per article
        content_kind: "article",
        content: title,                 // headline only, see the note above
        author: (a.domain ?? "").trim() || null,
        source_url: url,
        published_at: parseSeenDate(a.seendate),
        market: (a.sourcecountry ?? "").trim() || null,
        language: (a.language ?? "").trim() || null,
        parent_external_id: null,
        metadata: {
          domain: (a.domain ?? "").trim() || null,
          source_country: (a.sourcecountry ?? "").trim() || null,
          source_language: (a.language ?? "").trim() || null,
          image: (a.socialimage ?? "").trim() || null,
          headline_only: true,          // so downstream can weigh it appropriately
        },
      });
    }

    if (!items.length) warnings.push("No news coverage matched this query in the selected window");
    return { items, warnings, stats: { articles: items.length } };
  },
};
