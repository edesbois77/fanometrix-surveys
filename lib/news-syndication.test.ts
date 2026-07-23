import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicaliseUrl, titleFingerprint, stripPublisherSuffix, clusterSyndication,
  type SyndicationCandidate,
} from "./news-syndication";

// ── URL canonicalisation ─────────────────────────────────────────────────────

test("the same article reached three ways canonicalises to one id", () => {
  const a = canonicaliseUrl("https://www.sportspromedia.com/news/fedex-ucl-deal/?utm_source=twitter&utm_campaign=x");
  const b = canonicaliseUrl("http://sportspromedia.com/news/fedex-ucl-deal#top");
  const c = canonicaliseUrl("https://SportsProMedia.com/news/fedex-ucl-deal/");
  assert.equal(a, "https://sportspromedia.com/news/fedex-ucl-deal");
  assert.equal(b, a);
  assert.equal(c, a);
});

test("a meaningful query parameter is preserved", () => {
  assert.equal(
    canonicaliseUrl("https://example.com/story?id=42&utm_medium=email"),
    "https://example.com/story?id=42",
  );
});

test("non-http schemes and junk are rejected rather than stored", () => {
  assert.equal(canonicaliseUrl("javascript:alert(1)"), null);
  assert.equal(canonicaliseUrl("not a url"), null);
  assert.equal(canonicaliseUrl(""), null);
});

// ── Title fingerprinting ─────────────────────────────────────────────────────

test("the publisher suffix a feed appends is stripped", () => {
  assert.equal(stripPublisherSuffix("Uefa upgrades FedEx to sponsor - SportsPro", "SportsPro"), "Uefa upgrades FedEx to sponsor");
  assert.equal(stripPublisherSuffix("Uefa upgrades FedEx | Sportcal", "Sportcal"), "Uefa upgrades FedEx");
  // A publisher name occurring mid-title is left alone.
  assert.equal(stripPublisherSuffix("SportsPro wins award", "SportsPro"), "SportsPro wins award");
});

test("word order, punctuation and a change of voice do not split a story", () => {
  // The commonest house-style rewrite: active becomes passive, "renews" becomes
  // "renewed". Both must fingerprint identically or one story counts as two.
  const a = titleFingerprint("FedEx renews UEFA Champions League deal");
  const b = titleFingerprint("UEFA Champions League deal renewed by FedEx!");
  assert.equal(a, b);
});

test("stemming stays conservative enough not to merge different stories", () => {
  // "sponsor" and "sponsorship" are different words about different things; over-
  // eager stemming that collapsed them would merge unrelated coverage.
  assert.notEqual(
    titleFingerprint("Heineken named Champions League sponsor"),
    titleFingerprint("Heineken reviews its Champions League sponsorship strategy"),
  );
});

test("genuinely different stories get different fingerprints", () => {
  assert.notEqual(
    titleFingerprint("Heineken renews Champions League sponsorship"),
    titleFingerprint("Mastercard renews Champions League sponsorship"),
  );
});

// ── Clustering ───────────────────────────────────────────────────────────────

const article = (over: Partial<SyndicationCandidate> & { canonicalUrl: string; title: string }): SyndicationCandidate => ({
  publisher: null, publishedAt: "2026-07-01T10:00:00.000Z", tierRank: 1, fullMetadata: false, ...over,
});

test("one press release across four outlets becomes one piece of evidence", () => {
  const items = [
    article({ canonicalUrl: "https://aggregator.example/a", title: "FedEx renews UEFA Champions League deal", publisher: "Aggregator", tierRank: 1, publishedAt: "2026-07-01T12:00:00.000Z" }),
    article({ canonicalUrl: "https://sportspro.example/b", title: "FedEx renews UEFA Champions League deal - SportsPro", publisher: "SportsPro", tierRank: 5, fullMetadata: true, publishedAt: "2026-07-01T09:00:00.000Z" }),
    article({ canonicalUrl: "https://marketing.example/c", title: "UEFA Champions League deal renewed by FedEx", publisher: "Campaign", tierRank: 4, fullMetadata: true, publishedAt: "2026-07-01T11:00:00.000Z" }),
    article({ canonicalUrl: "https://other.example/d", title: "FedEx renews UEFA Champions League deal!", publisher: "Other", tierRank: 1, publishedAt: "2026-07-02T08:00:00.000Z" }),
  ];
  const clusters = clusterSyndication(items);
  assert.equal(clusters.length, 1, "four copies of one story must collapse to one");
  // Full metadata first, then the strongest tier: SportsPro, which is also earliest.
  assert.equal(clusters[0].representative.publisher, "SportsPro");
  assert.equal(clusters[0].copies.length, 3);
  assert.deepEqual(
    clusters[0].copies.map(c => c.publisher).sort(),
    ["Aggregator", "Campaign", "Other"],
  );
});

test("full publisher metadata outranks an earlier search-index stub", () => {
  const clusters = clusterSyndication([
    article({ canonicalUrl: "https://stub.example/a", title: "Heineken extends Champions League partnership", publisher: "stub.example", tierRank: 5, fullMetadata: false, publishedAt: "2026-07-01T08:00:00.000Z" }),
    article({ canonicalUrl: "https://sportcal.example/b", title: "Heineken extends Champions League partnership", publisher: "Sportcal", tierRank: 5, fullMetadata: true, publishedAt: "2026-07-01T10:00:00.000Z" }),
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].representative.publisher, "Sportcal");
});

test("the same headline a year apart is two stories, not one", () => {
  const clusters = clusterSyndication([
    article({ canonicalUrl: "https://a.example/2025", title: "Heineken renews Champions League sponsorship", publishedAt: "2025-09-01T00:00:00.000Z" }),
    article({ canonicalUrl: "https://a.example/2026", title: "Heineken renews Champions League sponsorship", publishedAt: "2026-09-01T00:00:00.000Z" }),
  ]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters.every(c => c.copies.length === 0), true);
});

test("distinct stories are never merged", () => {
  const clusters = clusterSyndication([
    article({ canonicalUrl: "https://a.example/1", title: "Heineken renews Champions League sponsorship" }),
    article({ canonicalUrl: "https://a.example/2", title: "Mastercard launches new fan campaign in Madrid" }),
    article({ canonicalUrl: "https://a.example/3", title: "Fulham name ClickHouse as shirt sponsor" }),
  ]);
  assert.equal(clusters.length, 3);
});

test("earliest publication wins between equal-standing copies", () => {
  const clusters = clusterSyndication([
    article({ canonicalUrl: "https://late.example/x", title: "Mastercard unveils Champions League fan campaign", publisher: "Late", tierRank: 4, fullMetadata: true, publishedAt: "2026-07-03T00:00:00.000Z" }),
    article({ canonicalUrl: "https://early.example/y", title: "Mastercard unveils Champions League fan campaign", publisher: "Early", tierRank: 4, fullMetadata: true, publishedAt: "2026-07-01T00:00:00.000Z" }),
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].representative.publisher, "Early");
});

test("a title that normalises to nothing is kept as its own item, never merged", () => {
  const clusters = clusterSyndication([
    article({ canonicalUrl: "https://a.example/1", title: "!!!" }),
    article({ canonicalUrl: "https://a.example/2", title: "???" }),
  ]);
  assert.equal(clusters.length, 2);
});
