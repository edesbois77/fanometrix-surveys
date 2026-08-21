import { test, describe, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── The claimed-revision validator, with the database stubbed ────────────────
// Every case here is about a claim that should NOT be honoured, because that is
// where the risk lives: a claim that is honoured when it should not be attaches
// one configuration's provenance to another's evidence.

type RevRow = {
  id: string;
  effective_at: string;
  cancelled_at: string | null;
  created_at?: string;
  group_id?: string;
  campaign_groups?: { group_id: string; owner_model: string } | null;
  campaign_group_revision_members?: Array<{
    campaign_id: string; weight: number; membership_state: string;
    campaigns: { campaign_id: string } | null;
  }>;
} | null;

let revRow: RevRow = null;
let campaignSurveyId: string | null = null;
let queries: Array<{ table: string; filters: Record<string, unknown>; select: string }> = [];

mock.module("@/lib/supabase-admin", {
  namedExports: {
    supabaseAdmin: {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        let selected = "";
        const builder: Record<string, unknown> = {
          select(cols: string) { selected = cols ?? ""; return builder; },
          eq(col: string, val: unknown) { filters[col] = val; return builder; },
          is(col: string, val: unknown) { filters[`is:${col}`] = val; return builder; },
          maybeSingle() {
            queries.push({ table, filters, select: selected });
            if (table === "campaign_group_revisions") {
              return Promise.resolve({ data: revRow, error: null });
            }
            return Promise.resolve({ data: campaignSurveyId ? { survey_id: campaignSurveyId } : null, error: null });
          },
        };
        return builder;
      },
    },
  },
});

let resolveRevisionClaim: typeof import("./claim").resolveRevisionClaim;
let resolveSurveyIdForCampaign: typeof import("./claim").resolveSurveyIdForCampaign;
let looksLikeRevisionId: typeof import("./claim").looksLikeRevisionId;
let __resetClaimCache: typeof import("./claim").__resetClaimCache;

before(async () => {
  ({ resolveRevisionClaim, resolveSurveyIdForCampaign, looksLikeRevisionId, __resetClaimCache } =
    await import("./claim"));
});

beforeEach(() => {
  revRow = null; campaignSurveyId = null; queries = [];
  __resetClaimCache?.();
});

const ID = "9f21ab00-1111-4222-8333-444455556666";
const NOW = Date.parse("2026-08-20T12:00:00.000Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("looksLikeRevisionId", () => {
  test("accepts a canonical UUID in either case", () => {
    assert.equal(looksLikeRevisionId(ID), true);
    assert.equal(looksLikeRevisionId(ID.toUpperCase()), true);
  });
  test("rejects everything that is not one", () => {
    for (const bad of [null, undefined, 42, {}, [], "", "not-a-uuid", ID + "x", ID.slice(0, -1),
                       "'; drop table campaign_group_revisions; --", "../../etc/passwd"]) {
      assert.equal(looksLikeRevisionId(bad), false, `accepted ${JSON.stringify(bad)}`);
    }
  });
});

const CAMPAIGN = "wwc_fotmob_gb";
const GROUP = "fotmob-rotation";

/** A revision row as the joined query returns it, valid unless a field is spoiled. */
const row = (over: Partial<NonNullable<RevRow>> = {}): RevRow => ({
  id: ID,
  effective_at: iso(-60_000),
  cancelled_at: null,
  created_at: iso(-120_000),
  group_id: "group-uuid",
  campaign_groups: { group_id: GROUP, owner_model: "survey_studio" },
  campaign_group_revision_members: [
    { campaign_id: "campaign-uuid", weight: 1, membership_state: "active",
      campaigns: { campaign_id: CAMPAIGN } },
  ],
  ...over,
});

const CTX = { campaignSlug: CAMPAIGN, groupSlug: GROUP };

describe("resolveRevisionClaim", () => {
  test("NO claim is not an error and never reaches the database", async () => {
    for (const absent of [undefined, null, ""]) {
      const r = await resolveRevisionClaim(absent, CTX, NOW);
      assert.equal(r.code, "no_claim");
      assert.equal(r.revisionId, null);
      assert.equal(r.suppliedButInvalid, false, "absent must never raise an integrity signal");
    }
    assert.equal(queries.length, 0);
  });

  test("a malformed claim is REPORTED, and never reaches the database", async () => {
    const r = await resolveRevisionClaim("not-a-uuid", CTX, NOW);
    assert.equal(r.code, "malformed_claim");
    assert.equal(r.revisionId, null);
    assert.equal(r.suppliedButInvalid, true, "supplied-but-junk is not the same as absent");
    assert.equal(queries.length, 0, "a junk claim must not cost a query");
  });

  test("an unknown revision resolves to null", async () => {
    revRow = null;
    const r = await resolveRevisionClaim(ID, CTX, NOW);
    assert.equal(r.code, "unknown_revision");
    assert.equal(r.revisionId, null);
  });

  test("an effective, uncancelled revision naming this campaign resolves to itself", async () => {
    revRow = row();
    const r = await resolveRevisionClaim(ID, CTX, NOW);
    assert.equal(r.code, "valid");
    assert.equal(r.revisionId, ID);
    assert.equal(r.suppliedButInvalid, false);
  });

  test("a revision effective exactly now resolves (boundary is inclusive)", async () => {
    revRow = row({ effective_at: iso(0) });
    assert.equal((await resolveRevisionClaim(ID, CTX, NOW)).revisionId, ID);
  });

  test("a CANCELLED revision resolves to null, with the cancelled reason", async () => {
    revRow = row({ cancelled_at: iso(-30_000) });
    const r = await resolveRevisionClaim(ID, CTX, NOW);
    assert.equal(r.code, "cancelled_revision");
    assert.equal(r.revisionId, null);
  });

  test("a not-yet-effective revision resolves to null", async () => {
    revRow = row({ effective_at: iso(60_000) });
    const r = await resolveRevisionClaim(ID, CTX, NOW);
    assert.equal(r.code, "future_revision");
    assert.equal(r.revisionId, null);
  });

  // ── The tuple. These are the cases the old id-only resolver stored. ────────

  test("ANOTHER GROUP'S revision is refused", async () => {
    // Exactly the proven production exposure: a real, effective, uncancelled
    // revision — belonging to someone else's group.
    revRow = row({ campaign_groups: { group_id: "someone-elses-group", owner_model: "survey_studio" } });
    const r = await resolveRevisionClaim(ID, CTX, NOW);
    assert.equal(r.code, "wrong_group");
    assert.equal(r.revisionId, null);
    assert.equal(r.suppliedButInvalid, true);
  });

  test("the right group's revision, but a campaign NOT in it, is refused", async () => {
    revRow = row();
    const r = await resolveRevisionClaim(ID, { campaignSlug: "another_campaign", groupSlug: GROUP }, NOW);
    assert.equal(r.code, "campaign_not_in_revision");
    assert.equal(r.revisionId, null);
  });

  test("a LEGACY research-project revision is refused on owner model", async () => {
    revRow = row({ campaign_groups: { group_id: GROUP, owner_model: "research_project" } });
    const r = await resolveRevisionClaim(ID, CTX, NOW);
    assert.equal(r.code, "invalid_owner_model");
    assert.equal(r.revisionId, null);
  });

  test("omitting the group does NOT widen what is accepted", async () => {
    revRow = row();
    const ok = await resolveRevisionClaim(ID, { campaignSlug: CAMPAIGN }, NOW);
    assert.equal(ok.code, "valid", "a genuine claim without a group still passes");

    const forged = await resolveRevisionClaim(ID, { campaignSlug: "another_campaign" }, NOW);
    assert.equal(forged.code, "campaign_not_in_revision",
      "membership still pins the tuple when no group is claimed");
  });

  test("a claim with NO campaign to bind it to is refused, never stored", async () => {
    revRow = row();
    for (const bad of [undefined, null, "", 42, {}]) {
      const r = await resolveRevisionClaim(ID, { campaignSlug: bad }, NOW);
      assert.equal(r.revisionId, null, `stored an unbindable claim for ${JSON.stringify(bad)}`);
    }
  });

  test("a campaign in TWO groups validates only against its own group's revision", async () => {
    // The shared-campaign case. Same campaign, genuinely a member of both
    // revisions; only the group distinguishes them.
    revRow = row({ campaign_groups: { group_id: "alpha", owner_model: "survey_studio" } });
    assert.equal((await resolveRevisionClaim(ID, { campaignSlug: CAMPAIGN, groupSlug: "alpha" }, NOW)).code, "valid");

    __resetClaimCache();
    assert.equal((await resolveRevisionClaim(ID, { campaignSlug: CAMPAIGN, groupSlug: "beta" }, NOW)).code,
      "wrong_group", "alpha's revision must not validate for beta's traffic");
  });

  test("membership is read from the revision's own frozen list", async () => {
    // A campaign since removed from the group must still validate against the
    // revision that was serving when it answered.
    revRow = row();
    assert.equal((await resolveRevisionClaim(ID, CTX, NOW)).code, "valid");
  });

  // ── Caching ───────────────────────────────────────────────────────────────

  test("a claim is cached, so a burst of events costs one query", async () => {
    revRow = row();
    for (let i = 0; i < 25; i++) await resolveRevisionClaim(ID, CTX, NOW);
    assert.equal(queries.length, 1);
  });

  test("a REJECTED claim is cached too, so forged ids cannot hammer the database", async () => {
    revRow = null;
    for (let i = 0; i < 25; i++) await resolveRevisionClaim(ID, CTX, NOW);
    assert.equal(queries.length, 1);
  });

  test("the cache is keyed by the TUPLE, not the revision id", async () => {
    // A genuine journey must not warm the cache for a forged one riding the
    // same revision id.
    revRow = row();
    assert.equal((await resolveRevisionClaim(ID, CTX, NOW)).code, "valid");
    const forged = await resolveRevisionClaim(ID, { campaignSlug: "another_campaign", groupSlug: GROUP }, NOW);
    assert.equal(forged.code, "campaign_not_in_revision",
      "the valid tuple's cache entry was reused for a different campaign");
  });

  test("the cache expires, so a cancellation is picked up", async () => {
    revRow = row();
    assert.equal((await resolveRevisionClaim(ID, CTX, NOW)).revisionId, ID);
    revRow = row({ cancelled_at: iso(-1_000) });
    // Still cached immediately after.
    assert.equal((await resolveRevisionClaim(ID, CTX, NOW + 1_000)).revisionId, ID);
    // Past the TTL it is re-read and now refused.
    assert.equal((await resolveRevisionClaim(ID, CTX, NOW + 10_000)).revisionId, null);
    assert.equal(queries.length, 2);
  });

  test("distinct claims do not contaminate each other", async () => {
    const OTHER = "0a0a0a0a-1111-4222-8333-444455556666";
    revRow = row();
    assert.equal((await resolveRevisionClaim(ID, CTX, NOW)).revisionId, ID);
    revRow = null;
    assert.equal((await resolveRevisionClaim(OTHER, CTX, NOW)).revisionId, null);
    revRow = row();
    assert.equal((await resolveRevisionClaim(ID, CTX, NOW)).revisionId, ID, "a rejected claim overwrote a valid one");
  });

  test("the query asks for the group and member joins it needs to decide", async () => {
    // Without these embeds the resolver cannot see the tuple at all, and would
    // silently fall back to id-only validation.
    revRow = row();
    await resolveRevisionClaim(ID, CTX, NOW);
    assert.equal(queries[0].table, "campaign_group_revisions");
    assert.match(queries[0].select, /campaign_groups/);
    assert.match(queries[0].select, /owner_model/);
    assert.match(queries[0].select, /campaign_group_revision_members/);
  });
});

describe("resolveSurveyIdForCampaign", () => {
  const SURVEY = "d729de2f-00ae-487d-afc7-61aa2db0e9d8";

  test("resolves the survey from the campaign slug", async () => {
    campaignSurveyId = SURVEY;
    assert.equal(await resolveSurveyIdForCampaign("zzz-c1", NOW), SURVEY);
  });

  test("excludes deleted campaigns at the query, not afterwards", async () => {
    campaignSurveyId = SURVEY;
    await resolveSurveyIdForCampaign("zzz-c1", NOW);
    assert.equal(queries[0].filters["is:deleted_at"], null);
  });

  test("an unknown or malformed slug resolves to null without a query", async () => {
    assert.equal(await resolveSurveyIdForCampaign(null, NOW), null);
    assert.equal(await resolveSurveyIdForCampaign("", NOW), null);
    assert.equal(await resolveSurveyIdForCampaign(123, NOW), null);
    assert.equal(await resolveSurveyIdForCampaign("x".repeat(500), NOW), null);
    assert.equal(queries.length, 0);
  });

  test("the lookup is cached per slug", async () => {
    campaignSurveyId = SURVEY;
    for (let i = 0; i < 10; i++) await resolveSurveyIdForCampaign("zzz-c1", NOW);
    assert.equal(queries.length, 1);
  });
});
