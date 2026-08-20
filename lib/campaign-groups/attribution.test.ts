import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { routingClaims, resolveAttribution, attributionMismatches, evidenceColumns } from "./attribution";
import type { CampaignFacts, RoutingContext } from "./eligibility";

const facts: CampaignFacts = {
  id: "uuid-c1", slug: "zzz-c1", status: "live", deletedAt: null,
  startsAt: null, endsAt: null,
  countryCode: "GB", market: "United Kingdom",
  publisherName: "FotMob", publisherOrgId: "org-fotmob",
  targetResponses: null, responseCount: 0,
  surveyId: "uuid-s1", surveyValid: true,
};

const REV = "uuid-rev-1";

describe("resolveAttribution", () => {
  test("every persisted field comes from the campaign row, never from the URL", () => {
    const r = resolveAttribution(facts, REV);
    assert.equal(r.publisherOrgId, "org-fotmob");
    assert.equal(r.market, "United Kingdom");
    assert.equal(r.countryCode, "GB");
    assert.equal(r.campaignSlug, "zzz-c1");
    assert.equal(r.surveyId, "uuid-s1");
    assert.equal(r.configurationRevisionId, REV);
  });

  test("a publisher-agnostic campaign resolves to null, which is a real state", () => {
    const r = resolveAttribution({ ...facts, publisherOrgId: null }, REV);
    assert.equal(r.publisherOrgId, null);
  });

  test("the resolved shape carries no field capable of holding a URL claim", () => {
    // Structural guard: if someone later adds `claimedPublisher` to the
    // persisted shape, this fails and forces the discussion.
    const r = resolveAttribution(facts, REV);
    const keys = Object.keys(r);
    for (const k of keys) {
      assert.doesNotMatch(k, /^claimed/i, `ResolvedAttribution must not carry ${k}`);
    }
    assert.deepEqual(keys.sort(), [
      "campaignId", "campaignSlug", "configurationRevisionId",
      "countryCode", "market", "publisherOrgId", "surveyId",
    ]);
  });
});

describe("evidenceColumns", () => {
  test("writes only server-resolved values into the migration-213 columns", () => {
    const cols = evidenceColumns(resolveAttribution(facts, REV));
    assert.deepEqual(cols, {
      campaign_id: "zzz-c1",
      survey_id: "uuid-s1",
      configuration_revision_id: REV,
    });
  });

  test("a claimed publisher never reaches the evidence columns", () => {
    const ctx: RoutingContext = { country: "DE", market: "Germany", publisher: "LiveScore" };
    const claims = routingClaims(ctx);
    const cols = evidenceColumns(resolveAttribution(facts, REV));
    const serialised = JSON.stringify(cols);
    assert.ok(!serialised.includes("LiveScore"), "a URL claim leaked into evidence");
    assert.ok(!serialised.includes("Germany"), "a URL claim leaked into evidence");
    assert.equal(claims.claimedPublisher, "LiveScore", "claims are still preserved for diagnostics");
  });
});

describe("attributionMismatches", () => {
  const resolved = resolveAttribution(facts, REV);

  test("agreeing claims produce no mismatch", () => {
    const claims = routingClaims({ country: "GB", market: "United Kingdom", publisher: "FotMob" });
    assert.deepEqual(attributionMismatches(claims, resolved, "FotMob"), []);
  });

  test("a tag pointing at the wrong publisher is reported, not reconciled", () => {
    const claims = routingClaims({ country: null, market: null, publisher: "LiveScore" });
    assert.deepEqual(attributionMismatches(claims, resolved, "FotMob"), ["publisher"]);
    // The resolved value is unchanged — the campaign's configuration still wins.
    assert.equal(resolved.publisherOrgId, "org-fotmob");
  });

  test("market and country disagreements are each reported", () => {
    const claims = routingClaims({ country: "DE", market: "Germany", publisher: null });
    assert.deepEqual(attributionMismatches(claims, resolved, "FotMob").sort(), ["country", "market"]);
  });

  test("an omitted claim is a wildcard, not a contradiction", () => {
    const claims = routingClaims({ country: null, market: null, publisher: null });
    assert.deepEqual(attributionMismatches(claims, resolved, "FotMob"), []);
  });

  test("a publisher-agnostic campaign contradicts nothing", () => {
    const agnostic = resolveAttribution({ ...facts, publisherOrgId: null }, REV);
    const claims = routingClaims({ country: null, market: null, publisher: "AnyoneAtAll" });
    assert.deepEqual(attributionMismatches(claims, agnostic, null), []);
  });

  test("comparison is case- and whitespace-insensitive on both sides", () => {
    const claims = routingClaims({ country: "gb", market: " united kingdom ", publisher: "FOTMOB" });
    assert.deepEqual(attributionMismatches(claims, resolved, "fotmob"), []);
  });
});
