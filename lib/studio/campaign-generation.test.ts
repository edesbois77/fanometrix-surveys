import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDesiredCampaigns,
  reconcile,
  buildSlug,
  governedLanguagesForMarket,
  allocateTarget,
  validateCampaignConfig,
  campaignsReadyForDeploy,
  keyOf,
  STUDIO_SLUG_PREFIX,
  type GenerationInput,
  type DistributionSelection,
  type CampaignConfig,
} from "./campaign-generation";

const SURVEY = "11111111-2222-3333-4444-555555555555";
const FOTMOB = { orgId: "aaaaaaaa-0000-0000-0000-000000000001", name: "FotMob" };
const LIVESCORE = { orgId: "bbbbbbbb-0000-0000-0000-000000000002", name: "LiveScore" };

function sel(pub: { orgId: string; name: string }, codes: string[]): DistributionSelection[] {
  return codes.map((c) => ({ publisherOrgId: pub.orgId, publisherName: pub.name, countryCode: c }));
}
function input(selections: DistributionSelection[], over: Partial<GenerationInput> = {}): GenerationInput {
  return { surveyId: SURVEY, surveyName: "Women's Football Fan Study", selections, creativeDesign: "countdown-in-banner", brandOrgId: null, agencyOrgId: null, ...over };
}

// ── Explicit Publisher × Market selection ─────────────────────────────────────

test("one campaign per selected (publisher, market), with governed language", () => {
  const d = buildDesiredCampaigns(input(sel(FOTMOB, ["GB", "DE"])));
  assert.equal(d.length, 2);
  const byMarket = Object.fromEntries(d.map((c) => [c.countryCode, c]));
  assert.equal(byMarket.GB.surveyLanguage, "en");
  assert.equal(byMarket.GB.market, "United Kingdom");
  assert.equal(byMarket.DE.surveyLanguage, "de");
  assert.equal(byMarket.DE.market, "Germany");
});

test("a publisher selected for only a SUBSET of markets yields only those campaigns", () => {
  // FotMob: GB + DE ; LiveScore: GB only. Must NOT create LiveScore × DE.
  const d = buildDesiredCampaigns(input([...sel(FOTMOB, ["GB", "DE"]), ...sel(LIVESCORE, ["GB"])]));
  assert.equal(d.length, 3);
  const pairs = d.map((c) => `${c.publisherName}:${c.countryCode}`).sort();
  assert.deepEqual(pairs, ["FotMob:DE", "FotMob:GB", "LiveScore:GB"]);
  assert.ok(!pairs.includes("LiveScore:DE"));
});

test("markets sharing a language remain separate campaigns reusing the translation", () => {
  const d = buildDesiredCampaigns(input(sel(FOTMOB, ["GB", "IN"]))); // both → en
  assert.equal(d.length, 2);
  assert.deepEqual(d.map((c) => c.surveyLanguage), ["en", "en"]);
  assert.notEqual(d[0].slug, d[1].slug);
});

test("multilingual-market fan-out: a selection fans out to one campaign per governed language", () => {
  // governedLanguagesForMarket returns one today; assert the fan-out is per-language
  // by construction (count of lines for a market == number of its governed languages).
  const langs = governedLanguagesForMarket("DE");
  const d = buildDesiredCampaigns(input(sel(FOTMOB, ["DE"])));
  assert.equal(d.length, langs.length);
  assert.deepEqual(d.map((c) => c.surveyLanguage), langs);
});

test("creative + inherited brand/agency are snapshotted onto every line", () => {
  const d = buildDesiredCampaigns(input(sel(FOTMOB, ["GB"]), { creativeDesign: "stack-v2", brandOrgId: "brand-9", agencyOrgId: "agency-7" }));
  for (const c of d) {
    assert.equal(c.creativeDesign, "stack-v2");
    assert.equal(c.brandOrgId, "brand-9");
    assert.equal(c.agencyOrgId, "agency-7");
    assert.equal(c.surveyId, SURVEY);
  }
});

// Brand/Agency are ATTRIBUTION inherited from the survey — NOT a fan-out dimension.
// The deployment unit stays Survey × Publisher × Market × required Language, so
// changing brand/agency must not change the number of campaigns or their identity.
test("brand/agency are not a fan-out dimension: same count and slugs regardless", () => {
  const selections = [...sel(FOTMOB, ["GB", "DE"]), ...sel(LIVESCORE, ["GB"])];
  const none = buildDesiredCampaigns(input(selections, { brandOrgId: null, agencyOrgId: null }));
  const attributed = buildDesiredCampaigns(input(selections, { brandOrgId: "brand-9", agencyOrgId: "agency-7" }));
  // Identical fan-out: same number of campaigns, same deterministic slugs/keys.
  assert.equal(attributed.length, none.length);
  assert.deepEqual(attributed.map((c) => c.slug), none.map((c) => c.slug));
  assert.deepEqual(
    attributed.map((c) => [c.publisherOrgId, c.countryCode, c.surveyLanguage]),
    none.map((c) => [c.publisherOrgId, c.countryCode, c.surveyLanguage]),
  );
});

test("changing only the brand keeps every campaign slug identical (slug excludes brand/agency)", () => {
  const selections = sel(FOTMOB, ["GB", "DE"]);
  const a = buildDesiredCampaigns(input(selections, { brandOrgId: "brand-1", agencyOrgId: null }));
  const b = buildDesiredCampaigns(input(selections, { brandOrgId: "brand-2", agencyOrgId: null }));
  assert.deepEqual(a.map((c) => c.slug), b.map((c) => c.slug));
});

test("unknown market codes are ignored, not fabricated", () => {
  const d = buildDesiredCampaigns(input(sel(FOTMOB, ["GB", "ZZ"])));
  assert.equal(d.length, 1);
  assert.equal(d[0].countryCode, "GB");
});

test("governedLanguagesForMarket returns a single-element list today", () => {
  assert.deepEqual(governedLanguagesForMarket("DE"), ["de"]);
  assert.deepEqual(governedLanguagesForMarket("GB"), ["en"]);
});

// ── Slug: deterministic, immutable, namespaced ────────────────────────────────

test("slug is deterministic, slug-safe and namespaced", () => {
  const a = buildSlug(SURVEY, FOTMOB.orgId, "GB", "en");
  assert.equal(a, buildSlug(SURVEY, FOTMOB.orgId, "GB", "en"));
  assert.match(a, /^studio_[a-z0-9_]+$/);
  assert.ok(a.startsWith(STUDIO_SLUG_PREFIX));
  assert.match(buildSlug(SURVEY, FOTMOB.orgId, "CN", "zh-CN"), /_zhcn$/);
});

// ── Reconciliation: idempotent, edit-preserving, selection-driven ─────────────

test("first generation creates all, keeps/removes nothing", () => {
  const d = buildDesiredCampaigns(input(sel(FOTMOB, ["GB", "DE"])));
  const plan = reconcile(d, []);
  assert.equal(plan.toCreate.length, 2);
  assert.equal(plan.toKeep.length, 0);
  assert.equal(plan.toRemove.length, 0);
});

test("re-running with the same selection is a no-op (idempotent)", () => {
  const d = buildDesiredCampaigns(input(sel(FOTMOB, ["GB", "DE"])));
  const plan = reconcile(d, d.map((c) => ({ slug: c.slug })));
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toRemove.length, 0);
  assert.equal(plan.toKeep.length, 2);
});

test("deselecting a (publisher, market) soft-removes only its line; survivors kept", () => {
  const before = buildDesiredCampaigns(input(sel(FOTMOB, ["GB", "DE"]))).map((c) => ({ slug: c.slug }));
  const after = buildDesiredCampaigns(input(sel(FOTMOB, ["GB"]))); // DE deselected
  const plan = reconcile(after, before);
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toKeep.length, 1);
  assert.equal(plan.toRemove.length, 1);
});

test("adding a publisher for one market creates only that new line", () => {
  const before = buildDesiredCampaigns(input(sel(FOTMOB, ["GB", "DE"]))).map((c) => ({ slug: c.slug }));
  const after = buildDesiredCampaigns(input([...sel(FOTMOB, ["GB", "DE"]), ...sel(LIVESCORE, ["GB"])]));
  const plan = reconcile(after, before);
  assert.equal(plan.toCreate.length, 1); // LiveScore × GB
  assert.equal(plan.toKeep.length, 2);
  assert.equal(plan.toRemove.length, 0);
});

test("keyOf is stable and unique per (publisher, country, language)", () => {
  assert.equal(keyOf({ publisherOrgId: "p", countryCode: "GB", surveyLanguage: "en" }), "p::GB::en");
});

// ── Remove → re-add lifecycle (tombstone restore, deterministic identity) ─────
// Regression for the bug where re-selecting a removed Publisher×Market tried to
// INSERT a duplicate deterministic slug (unique-constraint 500) instead of
// reviving the tombstoned row.

const DE = buildDesiredCampaigns(input(sel(FOTMOB, ["DE"])));       // FotMob × Germany
const S_DE = DE[0].slug;
const BOTH = buildDesiredCampaigns(input(sel(FOTMOB, ["DE", "GB"])));
const S_GB = BOTH.find((c) => c.countryCode === "GB")!.slug;

test("add Publisher + Germany → a Germany campaign is created", () => {
  const plan = reconcile(DE, [], []);
  assert.equal(plan.toCreate.length, 1);
  assert.equal(plan.toRestore.length, 0);
  assert.equal(plan.toCreate[0].slug, S_DE);
});

test("remove Publisher → its active Germany campaign is soft-removed", () => {
  const plan = reconcile([], [{ slug: S_DE }], []);
  assert.deepEqual(plan.toRemove, [S_DE]);
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toRestore.length, 0);
});

test("re-add same Publisher with no markets yet → nothing to create/restore/remove", () => {
  const plan = reconcile([], [], [{ slug: S_DE }]); // desired empty; DE tombstoned
  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toRestore.length, 0);
  assert.equal(plan.toRemove.length, 0);
});

test("select Germany again → the tombstoned campaign is RESTORED, not re-created (no duplicate slug)", () => {
  const plan = reconcile(DE, [], [{ slug: S_DE }]);
  assert.equal(plan.toCreate.length, 0);       // must NOT insert a duplicate
  assert.equal(plan.toRestore.length, 1);
  assert.equal(plan.toRestore[0].slug, S_DE);  // exact same deterministic identity
});

test("select Germany (tombstoned) + UK (new) → restore DE, create UK", () => {
  const plan = reconcile(BOTH, [], [{ slug: S_DE }]);
  assert.equal(plan.toRestore.length, 1);
  assert.equal(plan.toRestore[0].countryCode, "DE");
  assert.equal(plan.toCreate.length, 1);
  assert.equal(plan.toCreate[0].countryCode, "GB");
});

test("remove one market → only that market's campaign disappears", () => {
  const active = BOTH.map((c) => ({ slug: c.slug }));
  const gbOnly = buildDesiredCampaigns(input(sel(FOTMOB, ["GB"])));
  const plan = reconcile(gbOnly, active, []);
  assert.deepEqual(plan.toRemove, [S_DE]);
  assert.equal(plan.toKeep.length, 1);
  assert.equal(plan.toKeep[0], S_GB);
});

test("re-add that market → its campaign returns exactly once (restore)", () => {
  const plan = reconcile(BOTH, [{ slug: S_GB }], [{ slug: S_DE }]);
  assert.equal(plan.toRestore.length, 1);
  assert.equal(plan.toRestore[0].slug, S_DE);
  assert.equal(plan.toKeep.length, 1);   // GB kept
  assert.equal(plan.toCreate.length, 0); // never duplicated
});

test("repeated remove/re-add cycles never duplicate — a tombstoned slug always restores", () => {
  for (let i = 0; i < 5; i++) {
    const plan = reconcile(DE, [], [{ slug: S_DE }]);
    assert.equal(plan.toCreate.length, 0);
    assert.equal(plan.toRestore.length, 1);
    assert.equal(plan.toRestore[0].slug, S_DE);
  }
});

test("other Publishers' campaigns are untouched when one Publisher removes a market", () => {
  const fotmobDE = buildDesiredCampaigns(input(sel(FOTMOB, ["DE"])));
  const livescoreGB = buildDesiredCampaigns(input(sel(LIVESCORE, ["GB"])));
  const active = [...fotmobDE, ...livescoreGB].map((c) => ({ slug: c.slug }));
  // FotMob drops Germany → desired keeps only LiveScore × GB
  const plan = reconcile(livescoreGB, active, []);
  assert.deepEqual(plan.toRemove, [fotmobDE[0].slug]); // only FotMob×DE removed
  assert.equal(plan.toKeep.length, 1);
  assert.equal(plan.toKeep[0], livescoreGB[0].slug);    // LiveScore×GB untouched
});

// ── Exact-sum target allocation ───────────────────────────────────────────────

test("divisible total splits evenly and sums exactly", () => {
  const a = allocateTarget(1000, 4);
  assert.deepEqual(a, [250, 250, 250, 250]);
  assert.equal(a.reduce((s, x) => s + x, 0), 1000);
});

test("non-divisible total uses deterministic exact-sum allocation", () => {
  const a = allocateTarget(1001, 3);
  assert.deepEqual(a, [334, 334, 333]);
  assert.equal(a.reduce((s, x) => s + x, 0), 1001);
});

test("allocation always sums exactly for arbitrary totals", () => {
  for (const [total, n] of [[7, 3], [100, 7], [5, 5], [1, 4], [999999, 13]] as [number, number][]) {
    const a = allocateTarget(total, n);
    assert.equal(a.length, n);
    assert.equal(a.reduce((s, x) => s + x, 0), total);
    // spread is at most 1 between any two campaigns
    assert.ok(Math.max(...a) - Math.min(...a) <= 1);
  }
});

test("allocation guards: n<=0 → [], non-positive total → zeros", () => {
  assert.deepEqual(allocateTarget(100, 0), []);
  assert.deepEqual(allocateTarget(0, 3), [0, 0, 0]);
});

// ── Config validation + Deploy readiness ──────────────────────────────────────

// A valid baseline: continue, no target, an explicit start date, no end.
const OK: CampaignConfig = { target_responses: null, target_mode: "continue", start_date: "2026-09-01", end_date: null };

test("blank target with continue + a start date is valid (optional target)", () => {
  assert.deepEqual(validateCampaignConfig(OK), []);
});

test("stop with no target is invalid; stop with a positive target is valid", () => {
  assert.deepEqual(validateCampaignConfig({ ...OK, target_mode: "stop" }), ["Stop collecting needs a response target to stop at."]);
  assert.deepEqual(validateCampaignConfig({ ...OK, target_mode: "stop", target_responses: 500 }), []);
});

test("non-positive / non-integer target is invalid", () => {
  assert.ok(validateCampaignConfig({ ...OK, target_responses: 0 }).length > 0);
  assert.ok(validateCampaignConfig({ ...OK, target_responses: -5 }).length > 0);
  assert.ok(validateCampaignConfig({ ...OK, target_responses: 3.5 }).length > 0);
});

test("start date is REQUIRED (null is invalid)", () => {
  assert.deepEqual(validateCampaignConfig({ ...OK, start_date: null }), ["Start date is required."]);
});

test("a PAST start date is valid (means activate on deploy, not invalid)", () => {
  assert.deepEqual(validateCampaignConfig({ ...OK, start_date: "2020-01-01" }), []);
});

test("end is optional; end before start is invalid", () => {
  assert.deepEqual(validateCampaignConfig({ ...OK, end_date: null }), []);
  assert.ok(validateCampaignConfig({ ...OK, start_date: "2026-09-10", end_date: "2026-09-01" }).length > 0);
  assert.deepEqual(validateCampaignConfig({ ...OK, start_date: "2026-09-01", end_date: "2026-09-10" }), []);
});

test("Deploy readiness needs at least one campaign, all valid", () => {
  assert.equal(campaignsReadyForDeploy([]), false);
  assert.equal(campaignsReadyForDeploy([OK]), true);
  assert.equal(campaignsReadyForDeploy([OK, { ...OK, target_mode: "stop" }]), false); // stop needs a target
  assert.equal(campaignsReadyForDeploy([{ ...OK, start_date: null }]), false);        // start required
});
