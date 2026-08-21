import { test, describe, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// ── The claimed-revision validator, with the database stubbed ────────────────
// Every case here is about a claim that should NOT be honoured, because that is
// where the risk lives: a claim that is honoured when it should not be attaches
// one configuration's provenance to another's evidence.

type RevRow = { id: string; effective_at: string; cancelled_at: string | null } | null;

let revRow: RevRow = null;
let campaignSurveyId: string | null = null;
let queries: Array<{ table: string; filters: Record<string, unknown> }> = [];

mock.module("@/lib/supabase-admin", {
  namedExports: {
    supabaseAdmin: {
      from(table: string) {
        const filters: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {
          select() { return builder; },
          eq(col: string, val: unknown) { filters[col] = val; return builder; },
          is(col: string, val: unknown) { filters[`is:${col}`] = val; return builder; },
          maybeSingle() {
            queries.push({ table, filters });
            if (table === "campaign_group_revisions") {
              // Honour the .is("cancelled_at", null) predicate, as PostgREST would.
              const row = revRow && revRow.cancelled_at === null ? revRow : null;
              return Promise.resolve({ data: row, error: null });
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

describe("resolveRevisionClaim", () => {
  test("a malformed claim never reaches the database", async () => {
    assert.equal(await resolveRevisionClaim("not-a-uuid", NOW), null);
    assert.equal(queries.length, 0, "a junk claim must not cost a query");
  });

  test("an unknown revision resolves to null", async () => {
    revRow = null;
    assert.equal(await resolveRevisionClaim(ID, NOW), null);
  });

  test("an effective, uncancelled revision resolves to itself", async () => {
    revRow = { id: ID, effective_at: iso(-60_000), cancelled_at: null };
    assert.equal(await resolveRevisionClaim(ID, NOW), ID);
  });

  test("a revision effective exactly now resolves (boundary is inclusive)", async () => {
    revRow = { id: ID, effective_at: iso(0), cancelled_at: null };
    assert.equal(await resolveRevisionClaim(ID, NOW), ID);
  });

  test("a CANCELLED revision resolves to null", async () => {
    revRow = { id: ID, effective_at: iso(-60_000), cancelled_at: iso(-30_000) };
    assert.equal(await resolveRevisionClaim(ID, NOW), null);
  });

  test("the cancelled filter is pushed to the database, not applied afterwards", async () => {
    revRow = { id: ID, effective_at: iso(-60_000), cancelled_at: null };
    await resolveRevisionClaim(ID, NOW);
    assert.equal(queries[0].table, "campaign_group_revisions");
    assert.equal(queries[0].filters["is:cancelled_at"], null,
      "the query must exclude cancelled revisions itself");
  });

  test("a not-yet-effective revision resolves to null", async () => {
    revRow = { id: ID, effective_at: iso(60_000), cancelled_at: null };
    assert.equal(await resolveRevisionClaim(ID, NOW), null);
  });

  test("a claim is cached, so a burst of events costs one query", async () => {
    revRow = { id: ID, effective_at: iso(-60_000), cancelled_at: null };
    for (let i = 0; i < 25; i++) await resolveRevisionClaim(ID, NOW);
    assert.equal(queries.length, 1);
  });

  test("a REJECTED claim is cached too, so forged ids cannot be used to hammer the database", async () => {
    revRow = null;
    for (let i = 0; i < 25; i++) await resolveRevisionClaim(ID, NOW);
    assert.equal(queries.length, 1);
  });

  test("the cache expires, so a cancellation is picked up", async () => {
    revRow = { id: ID, effective_at: iso(-60_000), cancelled_at: null };
    assert.equal(await resolveRevisionClaim(ID, NOW), ID);
    revRow = { id: ID, effective_at: iso(-60_000), cancelled_at: iso(-1_000) };
    // Still cached immediately after.
    assert.equal(await resolveRevisionClaim(ID, NOW + 1_000), ID);
    // Past the TTL it is re-read and now refused.
    assert.equal(await resolveRevisionClaim(ID, NOW + 10_000), null);
    assert.equal(queries.length, 2);
  });

  test("distinct claims do not contaminate each other", async () => {
    const OTHER = "0a0a0a0a-1111-4222-8333-444455556666";
    revRow = { id: ID, effective_at: iso(-60_000), cancelled_at: null };
    assert.equal(await resolveRevisionClaim(ID, NOW), ID);
    revRow = null;
    assert.equal(await resolveRevisionClaim(OTHER, NOW), null);
    assert.equal(await resolveRevisionClaim(ID, NOW), ID, "a rejected claim overwrote a valid one");
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
