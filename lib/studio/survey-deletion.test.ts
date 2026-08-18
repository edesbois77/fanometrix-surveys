import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideSurveyDeletion,
  campaignHasEvidence,
  campaignIsSafeToSoftDelete,
  type CampaignRow,
  type CampaignEvidence,
  type SurveyDeletionInput,
} from "./survey-deletion";

// Builders mirroring the persisted shapes verified against the live DB.
const camp = (id: string, campaign_id: string | null, status: string): CampaignRow => ({ id, campaign_id, status });
const noEvidence: CampaignEvidence = { events: 0, responses: 0, answers: 0 };
const input = (over: Partial<SurveyDeletionInput> & { campaigns: CampaignRow[] }): SurveyDeletionInput => ({
  evidenceByCampaignId: {},
  surveyResponseCount: 0,
  ...over,
});

// ── Adidas - WWC - v1 (verified record) ──────────────────────────────────────
// One legacy campaign: slug "adidas_test_gb_livescore_2026", status "closed",
// zero events/responses/answers. Deletable; its empty campaign row is cleared.
test("Adidas — legacy closed campaign, no evidence → deletable, campaign soft-deleted", () => {
  const c = camp("adidas-camp-1", "adidas_test_gb_livescore_2026", "closed");
  const d = decideSurveyDeletion(input({
    campaigns: [c],
    evidenceByCampaignId: { [c.id]: noEvidence },
  }));
  assert.equal(d.deletable, true);
  assert.deepEqual(d.deletable && d.campaignIdsToSoftDelete, ["adidas-camp-1"]);
});

// ── Beyond Visibility … | OMD (verified record) ──────────────────────────────
// One legacy DRAFT campaign: slug "reagerger" (RP-linked), zero evidence.
// Deletable; the campaign row is cleared and nothing about the RP is referenced.
test("Beyond Visibility — legacy draft RP-linked campaign, no evidence → deletable", () => {
  const c = camp("beyond-camp-1", "reagerger", "draft");
  const d = decideSurveyDeletion(input({
    campaigns: [c],
    evidenceByCampaignId: { [c.id]: noEvidence },
  }));
  assert.equal(d.deletable, true);
  assert.deepEqual(d.deletable && d.campaignIdsToSoftDelete, ["beyond-camp-1"]);
  // The decision carries no RP field of any kind — RP data is out of scope.
  assert.equal("researchProjectId" in (d as object), false);
});

// ── A genuinely live survey ──────────────────────────────────────────────────
test("Live campaign → blocked (live_campaign), no campaigns cleared", () => {
  const c = camp("live-camp-1", "studio_live_gb", "live");
  const d = decideSurveyDeletion(input({
    campaigns: [c],
    evidenceByCampaignId: { [c.id]: noEvidence },
  }));
  assert.equal(d.deletable, false);
  assert.equal(!d.deletable && d.reason, "live_campaign");
  assert.match((d as { message: string }).message, /live campaign/i);
});

test("Live campaign blocks even when a sibling draft has no evidence", () => {
  const live = camp("live-2", "studio_a", "live");
  const draft = camp("draft-2", "studio_b", "draft");
  const d = decideSurveyDeletion(input({
    campaigns: [live, draft],
    evidenceByCampaignId: { [live.id]: noEvidence, [draft.id]: noEvidence },
  }));
  assert.equal(d.deletable, false);
  assert.equal(!d.deletable && d.reason, "live_campaign");
});

// ── A survey with historical event / response data ───────────────────────────
test("Historical events on a non-live campaign → blocked (collected_evidence)", () => {
  const c = camp("hist-1", "fedex_ucl_v1", "closed");
  const d = decideSurveyDeletion(input({
    campaigns: [c],
    evidenceByCampaignId: { [c.id]: { events: 992, responses: 196, answers: 1242 } },
  }));
  assert.equal(d.deletable, false);
  assert.equal(!d.deletable && d.reason, "collected_evidence");
  assert.match((d as { message: string }).message, /collected response data/i);
});

test("Responses attributed to the survey (not via a slug) → blocked", () => {
  const c = camp("hist-2", "some_slug", "closed");
  const d = decideSurveyDeletion(input({
    campaigns: [c],
    evidenceByCampaignId: { [c.id]: noEvidence },
    surveyResponseCount: 5,
  }));
  assert.equal(d.deletable, false);
  assert.equal(!d.deletable && d.reason, "collected_evidence");
});

test("Answers-only evidence (no events, no responses) still blocks", () => {
  const c = camp("hist-3", "answers_only", "draft");
  const d = decideSurveyDeletion(input({
    campaigns: [c],
    evidenceByCampaignId: { [c.id]: { events: 0, responses: 0, answers: 3 } },
  }));
  assert.equal(d.deletable, false);
  assert.equal(!d.deletable && d.reason, "collected_evidence");
});

// ── Mixed / boundary behaviour ───────────────────────────────────────────────
test("No campaigns at all → deletable with an empty clear-set", () => {
  const d = decideSurveyDeletion(input({ campaigns: [] }));
  assert.equal(d.deletable, true);
  assert.deepEqual(d.deletable && d.campaignIdsToSoftDelete, []);
});

test("Studio-native and legacy non-live, no-evidence campaigns are both cleared", () => {
  const studio = camp("s1", "studio_gb", "draft");
  const legacy = camp("l1", "legacy_slug", "closed");
  const d = decideSurveyDeletion(input({
    campaigns: [studio, legacy],
    evidenceByCampaignId: { [studio.id]: noEvidence, [legacy.id]: noEvidence },
  }));
  assert.equal(d.deletable, true);
  assert.deepEqual((d.deletable && d.campaignIdsToSoftDelete)?.sort(), ["l1", "s1"]);
});

test("Live check is evaluated before the evidence check (reason ordering)", () => {
  const c = camp("both", "slug", "live");
  const d = decideSurveyDeletion(input({
    campaigns: [c],
    evidenceByCampaignId: { [c.id]: { events: 10, responses: 2, answers: 4 } },
  }));
  assert.equal(!d.deletable && d.reason, "live_campaign");
});

// ── Predicate helpers ────────────────────────────────────────────────────────
test("campaignHasEvidence: any positive count is evidence; undefined is none", () => {
  assert.equal(campaignHasEvidence(undefined), false);
  assert.equal(campaignHasEvidence(noEvidence), false);
  assert.equal(campaignHasEvidence({ events: 1, responses: 0, answers: 0 }), true);
  assert.equal(campaignHasEvidence({ events: 0, responses: 1, answers: 0 }), true);
  assert.equal(campaignHasEvidence({ events: 0, responses: 0, answers: 1 }), true);
});

test("campaignIsSafeToSoftDelete: requires non-live AND no evidence", () => {
  assert.equal(campaignIsSafeToSoftDelete(camp("x", "s", "draft"), noEvidence), true);
  assert.equal(campaignIsSafeToSoftDelete(camp("x", "s", "closed"), undefined), true);
  assert.equal(campaignIsSafeToSoftDelete(camp("x", "s", "live"), noEvidence), false);
  assert.equal(campaignIsSafeToSoftDelete(camp("x", "s", "draft"), { events: 0, responses: 1, answers: 0 }), false);
});
