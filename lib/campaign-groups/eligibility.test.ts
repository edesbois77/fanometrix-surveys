import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateMember, evaluateMembers, EXCLUSION_COPY, type CampaignFacts, type RoutingContext, type ExclusionReason } from "./eligibility";
import type { RevisionMember } from "./model";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const HOUR = 3_600_000;

const member = (o: Partial<RevisionMember> = {}): RevisionMember => ({
  campaignId: "c1", campaignSlug: "zzz-c1", weight: 1, membershipState: "active", ...o,
});

const facts = (o: Partial<CampaignFacts> = {}): CampaignFacts => ({
  id: "c1", slug: "zzz-c1", status: "live", deletedAt: null,
  startsAt: at(-HOUR), endsAt: at(HOUR),
  countryCode: "GB", market: "United Kingdom",
  publisherName: "FotMob", publisherOrgId: "org-fotmob",
  targetResponses: 1000, responseCount: 10,
  surveyId: "s1", surveyValid: true, ...o,
});

const NO_CTX: RoutingContext = { country: null, market: null, publisher: null };

const expectReason = (f: Partial<CampaignFacts>, reason: ExclusionReason, ctx = NO_CTX, m = member()) => {
  const d = evaluateMember(m, facts(f), ctx, NOW);
  assert.equal(d.eligible, false);
  assert.equal(d.reason, reason);
};

describe("evaluateMember — the happy path", () => {
  test("a live, in-range, in-target campaign with a valid survey is eligible", () => {
    const d = evaluateMember(member(), facts(), NO_CTX, NOW);
    assert.equal(d.eligible, true);
    assert.equal(d.reason, null);
  });
});

describe("evaluateMember — campaign state", () => {
  test("a paused MEMBER is excluded before the campaign is even consulted", () => {
    const d = evaluateMember(member({ membershipState: "paused" }), undefined, NO_CTX, NOW);
    assert.equal(d.reason, "paused");
  });
  test("a missing campaign row is excluded, not assumed eligible", () => {
    const d = evaluateMember(member(), undefined, NO_CTX, NOW);
    assert.equal(d.eligible, false);
    assert.equal(d.reason, "campaign_missing");
  });
  test("a soft-deleted campaign is excluded", () => expectReason({ deletedAt: "2026-01-01" }, "campaign_deleted"));
  test("a non-live campaign is excluded", () => expectReason({ status: "paused" }, "campaign_not_live"));
  test("a draft campaign is excluded", () => expectReason({ status: "draft" }, "campaign_not_live"));
});

describe("evaluateMember — the date window", () => {
  test("before the start instant it is excluded", () => expectReason({ startsAt: at(1) }, "not_started"));
  test("exactly at the start instant it is eligible", () => {
    assert.equal(evaluateMember(member(), facts({ startsAt: NOW }), NO_CTX, NOW).eligible, true);
  });
  test("after the end instant it is excluded", () => expectReason({ endsAt: at(-1) }, "ended"));
  test("exactly at the end instant it is still eligible", () => {
    assert.equal(evaluateMember(member(), facts({ endsAt: NOW }), NO_CTX, NOW).eligible, true);
  });
  test("null dates mean no window, not a closed window", () => {
    assert.equal(evaluateMember(member(), facts({ startsAt: null, endsAt: null }), NO_CTX, NOW).eligible, true);
  });
});

describe("evaluateMember — routing filters treat NULL as wildcard", () => {
  // This mirrors the legacy serve path exactly. Narrowing it would silently
  // stop serving live inventory, so it is pinned by test.
  test("a campaign with no country accepts any claimed country", () => {
    assert.equal(evaluateMember(member(), facts({ countryCode: null }), { ...NO_CTX, country: "DE" }, NOW).eligible, true);
  });
  test("a campaign with no publisher accepts any claimed publisher", () => {
    assert.equal(evaluateMember(member(), facts({ publisherName: null }), { ...NO_CTX, publisher: "LiveScore" }, NOW).eligible, true);
  });
  test("a campaign with no market accepts any claimed market", () => {
    assert.equal(evaluateMember(member(), facts({ market: null }), { ...NO_CTX, market: "Germany" }, NOW).eligible, true);
  });
  test("an omitted claim does not filter anything", () => {
    assert.equal(evaluateMember(member(), facts(), NO_CTX, NOW).eligible, true);
  });
});

describe("evaluateMember — routing filters when both sides are set", () => {
  test("country mismatch excludes", () => expectReason({}, "country_mismatch", { ...NO_CTX, country: "DE" }));
  test("country matches case-insensitively", () => {
    assert.equal(evaluateMember(member(), facts({ countryCode: "gb" }), { ...NO_CTX, country: "GB" }, NOW).eligible, true);
  });
  test("market mismatch excludes", () => expectReason({}, "market_mismatch", { ...NO_CTX, market: "Germany" }));
  test("market matches case- and whitespace-insensitively", () => {
    assert.equal(evaluateMember(member(), facts({ market: "  united KINGDOM " }), { ...NO_CTX, market: "United Kingdom" }, NOW).eligible, true);
  });
  test("publisher mismatch excludes", () => expectReason({}, "publisher_mismatch", { ...NO_CTX, publisher: "LiveScore" }));
  test("publisher matches case-insensitively", () => {
    assert.equal(evaluateMember(member(), facts(), { ...NO_CTX, publisher: "fotmob" }, NOW).eligible, true);
  });
});

describe("evaluateMember — capacity and survey", () => {
  test("reaching the target excludes", () => expectReason({ targetResponses: 100, responseCount: 100 }, "target_reached"));
  test("exceeding the target excludes", () => expectReason({ targetResponses: 100, responseCount: 250 }, "target_reached"));
  test("one below the target is still eligible", () => {
    assert.equal(evaluateMember(member(), facts({ targetResponses: 100, responseCount: 99 }), NO_CTX, NOW).eligible, true);
  });
  test("a null target means uncapped", () => {
    assert.equal(evaluateMember(member(), facts({ targetResponses: null, responseCount: 1e6 }), NO_CTX, NOW).eligible, true);
  });
  test("no survey excludes", () => expectReason({ surveyId: null }, "survey_missing"));
  test("an invalid survey excludes", () => expectReason({ surveyValid: false }, "survey_invalid"));
});

describe("evaluateMembers", () => {
  test("returns one decision per member, preserving order", () => {
    const members = [member({ campaignId: "a" }), member({ campaignId: "b" }), member({ campaignId: "c" })];
    const map = new Map([
      ["a", facts({ id: "a" })],
      ["c", facts({ id: "c", status: "paused" })],
    ]);
    const out = evaluateMembers(members, map, NO_CTX, NOW);
    assert.deepEqual(out.map(d => d.member.campaignId), ["a", "b", "c"]);
    assert.deepEqual(out.map(d => d.eligible), [true, false, false]);
    assert.deepEqual(out.map(d => d.reason), [null, "campaign_missing", "campaign_not_live"]);
  });
});

describe("EXCLUSION_COPY", () => {
  test("every reason an evaluation can produce has operator-facing copy", () => {
    const produced: ExclusionReason[] = [
      "paused", "campaign_missing", "campaign_deleted", "campaign_not_live",
      "not_started", "ended", "country_mismatch", "market_mismatch",
      "publisher_mismatch", "target_reached", "survey_missing", "survey_invalid",
    ];
    for (const r of produced) {
      assert.ok(EXCLUSION_COPY[r] && EXCLUSION_COPY[r].length > 0, `no copy for ${r}`);
    }
    assert.equal(Object.keys(EXCLUSION_COPY).length, produced.length, "copy map has drifted from the reason union");
  });
});
