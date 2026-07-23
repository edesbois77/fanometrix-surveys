// Syndication deduplication — one press release carried by eight outlets is ONE
// piece of evidence, not eight.
//
// This matters more for News than for any other source. Announcements are
// distributed, not discovered: a single brand statement is reprinted verbatim
// across trade titles and aggregators within hours. Counting each copy would
// manufacture apparent corroboration out of a single claim, and would let the
// loudest press release outweigh a piece of genuine reporting. Distribution is
// not corroboration.
//
// So articles are clustered on a TITLE FINGERPRINT (near-identical headlines,
// published close together), one REPRESENTATIVE is kept, and the copies are
// recorded on it as syndicated_copies — the pickup is preserved as a fact about
// reach without ever becoming a second piece of evidence.
//
// Client- and server-safe: pure functions, no I/O.

/** Words that carry no identity in a headline, plus the boilerplate that varies
 *  between an outlet's own rendering of the same story. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by",
  "from", "as", "is", "are", "was", "were", "be", "been", "it", "its", "this", "that",
  "new", "s", "says", "said", "after", "over", "into", "amid", "up", "out",
]);

/** Strip the " - Publisher" / " | Publisher" tail some feeds append. */
export function stripPublisherSuffix(title: string, publisher?: string | null): string {
  let t = title.trim();
  const p = publisher?.trim();
  if (p) {
    const tail = new RegExp(`\\s*[-|–—]\\s*${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    t = t.replace(tail, "");
  }
  return t.trim();
}

/**
 * Crude suffix stripping, and deliberately crude.
 *
 * Outlets rewrite a supplied headline into their own house style, and the
 * commonest rewrite is a change of voice or tense: "FedEx RENEWS Champions
 * League deal" becomes "Champions League deal RENEWED by FedEx". Without this
 * the two fingerprint differently and one story counts as two — the exact
 * failure syndication dedup exists to prevent.
 *
 * Only -ing, -ed and a plural -s are stripped, and only where a stem of at least
 * three characters survives. Nothing more aggressive: stemming "sponsorship" to
 * "sponsor" would start merging genuinely different stories, which is a worse
 * failure than missing a rewrite.
 */
function stem(token: string): string {
  for (const suffix of ["ing", "ed", "s"]) {
    if (token.length - suffix.length >= 3 && token.endsWith(suffix)) return token.slice(0, -suffix.length);
  }
  return token;
}

/** The identity of a STORY, independent of which outlet ran it. Lowercased,
 *  punctuation and stopwords removed, tokens sorted and deduped, so "FedEx
 *  renews UEFA Champions League deal" and "UEFA Champions League deal renewed by
 *  FedEx" collapse to the same key. Short titles keep every token; long ones are
 *  capped so an outlet's added standfirst can't split the cluster. */
export function titleFingerprint(title: string, publisher?: string | null): string {
  const tokens = stripPublisherSuffix(title, publisher)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
  const unique = Array.from(new Set(tokens)).sort();
  return unique.slice(0, 12).join(" ");
}

/** Canonical form of an article URL: the identity used for exact dedup and for
 *  the stable external id. Drops tracking parameters, the fragment, the default
 *  port, a trailing slash and a leading www, and lowercases the host — the same
 *  article reached three ways is one article. */
export function canonicaliseUrl(raw: string): string | null {
  const s = raw?.trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  u.protocol = "https:";
  u.port = "";
  for (const key of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|referrer$|source$|amp$|s_kwcid$|icid$|cmpid$)/i.test(key)) {
      u.searchParams.delete(key);
    }
  }
  u.search = u.searchParams.toString() ? `?${u.searchParams.toString()}` : "";
  let out = u.toString();
  if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
  return out;
}

export function domainOf(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/** The minimum an article must expose to be clustered. */
export type SyndicationCandidate = {
  canonicalUrl: string;
  title: string;
  publisher: string | null;
  publishedAt: string | null;
  /** Higher wins when choosing which copy to keep — see NEWS_SOURCE_TIER_RANK. */
  tierRank: number;
  /** True for items that arrived with a publisher-canonical URL and full
   *  metadata (a publisher feed) rather than from a search index. */
  fullMetadata: boolean;
};

export type SyndicatedCopy = { publisher: string | null; url: string; published_at: string | null };

export type SyndicationCluster<T> = {
  key: string;
  representative: T;
  copies: SyndicatedCopy[];
};

/** How far apart two copies of the same headline may be published and still be
 *  the same story. Wide enough for a release picked up over a long weekend,
 *  narrow enough that an annually repeated headline is not merged. */
const SYNDICATION_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

const time = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Cluster near-identical articles and pick one representative each.
 *
 * The representative is chosen deliberately, not arbitrarily:
 *   1. full publisher metadata beats a search-index stub (canonical URL, byline,
 *      excerpt — everything provenance depends on);
 *   2. the more independent publisher tier wins (a trade title's reporting over
 *      an aggregator's rewrite);
 *   3. the EARLIEST publication wins, because the first outlet to carry a story
 *      is the one nearest the primary source;
 *   4. the URL, so the outcome is stable across runs.
 *
 * Items with no title fingerprint (empty after normalisation) are never
 * clustered — they are returned as singletons rather than silently merged.
 */
export function clusterSyndication<T extends SyndicationCandidate>(items: T[]): SyndicationCluster<T>[] {
  const buckets = new Map<string, T[]>();
  const singletons: T[] = [];

  for (const item of items) {
    const fp = titleFingerprint(item.title, item.publisher);
    if (!fp) { singletons.push(item); continue; }
    const list = buckets.get(fp);
    if (list) list.push(item); else buckets.set(fp, [item]);
  }

  const out: SyndicationCluster<T>[] = [];

  for (const [fp, group] of buckets) {
    // Split a fingerprint bucket by publication time: the same headline a year
    // apart is two stories, not one.
    const byTime: T[][] = [];
    for (const item of [...group].sort((a, b) => (time(a.publishedAt) ?? 0) - (time(b.publishedAt) ?? 0))) {
      const t = time(item.publishedAt);
      const last = byTime[byTime.length - 1];
      const lastT = last ? time(last[last.length - 1].publishedAt) : null;
      if (last && (t === null || lastT === null || Math.abs(t - lastT) <= SYNDICATION_WINDOW_MS)) last.push(item);
      else byTime.push([item]);
    }

    for (const [i, cluster] of byTime.entries()) {
      const ranked = [...cluster].sort((a, b) => {
        if (a.fullMetadata !== b.fullMetadata) return a.fullMetadata ? -1 : 1;
        if (a.tierRank !== b.tierRank) return b.tierRank - a.tierRank;
        const ta = time(a.publishedAt), tb = time(b.publishedAt);
        if (ta !== null && tb !== null && ta !== tb) return ta - tb;
        if (ta === null !== (tb === null)) return ta === null ? 1 : -1;
        return a.canonicalUrl.localeCompare(b.canonicalUrl);
      });
      const [representative, ...rest] = ranked;
      out.push({
        key: byTime.length > 1 ? `${fp}#${i}` : fp,
        representative,
        copies: rest.map(r => ({ publisher: r.publisher, url: r.canonicalUrl, published_at: r.publishedAt })),
      });
    }
  }

  for (const s of singletons) {
    out.push({ key: `url:${s.canonicalUrl}`, representative: s, copies: [] });
  }

  return out;
}
