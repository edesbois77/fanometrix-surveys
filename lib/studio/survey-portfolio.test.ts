// ── Stage 8 — Discover portfolio intelligence (pure compose + mocked service) ─
// Run with the repo flag: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Mocks for the impure service dependencies ─────────────────────────────────
let scope: Record<string, unknown> = { isEmpty: false, unrestricted: true, authorisedCampaignIds: ["c1"], authorisedCampaignSlugs: ["s1", "s2"] };
let entitledSurveys: Array<{ id: string; name: string }> = [];
let analysisFor: Record<string, unknown> = {};
let coreFor: Record<string, unknown> = {};
let visible = true;
let responseRows: Array<{ response_count: number }> = [{ response_count: 100 }, { response_count: 50 }];

mock.module("@/lib/studio/dashboard-scope", { namedExports: {
  resolveDashboardScope: async () => scope,
  resolveEntitledSurveys: async () => entitledSurveys,
} });
mock.module("@/lib/studio/survey-analysis-service", { namedExports: {
  getCurrentSurveyAnalysis: async (id: string) => analysisFor[id] ?? null,
} });
mock.module("@/lib/studio/core-intelligence", { namedExports: {
  coreReadVisibleFor: () => visible,
  getSurveyCoreIntelligence: async (id: string) => { const v = coreFor[id]; if (v === "THROW") throw new Error("core down"); return v ?? null; },
} });
mock.module("@/lib/supabase-admin", { namedExports: {
  supabaseAdmin: { from: () => ({ select: () => ({ in: async () => ({ data: responseRows }) }) }) },
} });

let mod: typeof import("./survey-portfolio");
before(async () => { mod = await import("./survey-portfolio"); });
beforeEach(() => {
  visible = true;
  scope = { isEmpty: false, unrestricted: true, authorisedCampaignIds: ["c1"], authorisedCampaignSlugs: ["s1", "s2"] };
  entitledSurveys = []; analysisFor = {}; coreFor = {};
  responseRows = [{ response_count: 100 }, { response_count: 50 }];
});

const govProjection = (title: string, statistic: string) => ({ version: "v1", generatedFrom: "immutable_snapshot", deterministic: true, counts: { key: 1, supporting: 0, context: 0 }, findings: [{ id: "g", tier: "key", basis: "governed", title, statistic, question: "Q", caveats: [], evidence: [{ question: "Q", option: "A", count: 80, base: 100, percentage: 80 }] }] });

// ── Pure composition ──────────────────────────────────────────────────────────
test("compose: caps findings, counts surveys-with-findings, keeps totals as responses", () => {
  const per = Array.from({ length: 10 }, (_, i) => ({ surveyId: `s${i}`, surveyName: `Survey ${i}`, measured: i < 8 ? { title: `t${i}`, statistic: "50%" } : null }));
  const vm = mod.composePortfolioIntelligence({ surveysAccessible: 10, totalResponses: 2400, perSurvey: per, truncated: false });
  assert.equal(vm.surveysWithMeasuredFindings, 8);
  assert.ok(vm.measuredFindings.length <= mod.MEASURED_CAP);
  assert.equal(vm.totalResponses, 2400, "responses are a plain sum — never averaged or de-duplicated to 'people'");
  assert.equal(vm.didYouKnow.length, 1);
  assert.match(vm.didYouKnow[0], /8 of your 10 surveys have measured findings/);
});

test("compose §K cross-survey safety: each finding stays tied to its OWN survey (no merged claim)", () => {
  const vm = mod.composePortfolioIntelligence({ surveysAccessible: 2, totalResponses: 300, perSurvey: [
    { surveyId: "A", surveyName: "Alpha", measured: { title: "80% chose X", statistic: "80%" } },
    { surveyId: "B", surveyName: "Beta", measured: { title: "65% chose Y", statistic: "65%" } },
  ], truncated: false });
  assert.deepEqual(vm.measuredFindings.map((f) => f.surveyName).sort(), ["Alpha", "Beta"]);
  assert.ok(vm.measuredFindings.every((f) => f.surveyId && f.surveyName), "every finding names its survey");
});

test("compose §N/§O empty + one-survey portfolios", () => {
  const empty = mod.composePortfolioIntelligence({ surveysAccessible: 0, totalResponses: 0, perSurvey: [], truncated: false });
  assert.equal(empty.measuredFindings.length, 0);
  assert.equal(empty.didYouKnow.length, 0);
  const one = mod.composePortfolioIntelligence({ surveysAccessible: 1, totalResponses: 120, perSurvey: [{ surveyId: "s", surveyName: "Only", measured: { title: "t", statistic: "70%" } }], truncated: false });
  assert.match(one.didYouKnow[0], /1 of your 1 survey has a measured finding/);
});

// ── Service (access, gates, isolation) ────────────────────────────────────────
test("§A/§B/§C exposure: non-admin + flag off → visible:false, nothing computed", async () => {
  visible = false;
  const pf = await mod.getPortfolioIntelligence({ role: "publisher" } as never);
  assert.equal(pf.visible, false);
  assert.equal(pf.surveysAccessible, 0);
});

test("§E/§F only ENTITLED + whole-scope surveys contribute findings", async () => {
  entitledSurveys = [{ id: "s1", name: "Alpha" }, { id: "s2", name: "Beta" }];
  analysisFor = { s1: { narrative: null }, s2: null };   // s2 NOT whole-scope entitled → excluded
  coreFor = { s1: govProjection("80% chose X", "80%"), s2: govProjection("SHOULD-NOT-APPEAR", "99%") };
  const pf = await mod.getPortfolioIntelligence({ role: "admin" } as never);
  assert.equal(pf.surveysAccessible, 2);
  assert.equal(pf.surveysWithMeasuredFindings, 1, "only the whole-scope-entitled survey contributes");
  assert.equal(pf.measuredFindings[0].surveyName, "Alpha");
  assert.ok(!pf.measuredFindings.some((f) => f.title.includes("SHOULD-NOT-APPEAR")), "non-entitled survey never leaks a finding");
});

test("§L one survey's Core failure never fails the portfolio", async () => {
  entitledSurveys = [{ id: "s1", name: "Alpha" }, { id: "s2", name: "Beta" }];
  analysisFor = { s1: { narrative: null }, s2: { narrative: null } };
  coreFor = { s1: govProjection("80% chose X", "80%"), s2: "THROW" };
  const pf = await mod.getPortfolioIntelligence({ role: "admin" } as never);
  assert.equal(pf.surveysWithMeasuredFindings, 1, "the healthy survey still contributes; the failing one is isolated");
});

test("§G totalResponses is the summed response_count across authorised campaigns", async () => {
  entitledSurveys = [{ id: "s1", name: "Alpha" }];
  analysisFor = { s1: { narrative: null } };
  coreFor = { s1: govProjection("t", "50%") };
  const pf = await mod.getPortfolioIntelligence({ role: "admin" } as never);
  assert.equal(pf.totalResponses, 150);
});

test("§M only GOVERNED (measured) findings are surfaced — never observed/exploratory", async () => {
  entitledSurveys = [{ id: "s1", name: "Alpha" }];
  analysisFor = { s1: { narrative: null } };
  coreFor = { s1: { version: "v1", generatedFrom: "immutable_snapshot", deterministic: true, counts: {}, findings: [
    { id: "o", tier: "key", basis: "observed", title: "observed thing", statistic: "40%", caveats: [], evidence: [] },
    { id: "e", tier: "context", basis: "exploratory", title: "exploratory guess", caveats: ["possible"], evidence: [] },
  ] } };
  const pf = await mod.getPortfolioIntelligence({ role: "admin" } as never);
  assert.equal(pf.surveysWithMeasuredFindings, 0, "no governed finding ⇒ nothing measured surfaced");
});

test("empty scope → visible:true but nothing", async () => {
  scope = { isEmpty: true };
  const pf = await mod.getPortfolioIntelligence({ role: "admin" } as never);
  assert.equal(pf.visible, true);
  assert.equal(pf.surveysAccessible, 0);
});
