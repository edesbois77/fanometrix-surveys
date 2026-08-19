// ── Research Reasoner — gated read: flag / visibility / lineage (mock.module) ─
// Run with: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { REASONER_PROMPT_VERSION, REASONER_SCHEMA_VERSION } from "./reasoning/model";

const state: { runId: string | null; row: Record<string, unknown> | null; calledFindGeneration: boolean } = { runId: "RUN1", row: null, calledFindGeneration: false };
function chain(table: string) {
  const c: Record<string, unknown> = {
    select() { return c; }, eq() { return c; }, order() { return c; }, limit() { return c; },
    insert() { state.calledFindGeneration = true; return c; }, upsert() { state.calledFindGeneration = true; return c; },
    maybeSingle() {
      if (table === "survey_analysis_runs") return Promise.resolve({ data: state.runId ? { id: state.runId } : null, error: null });
      if (table === "research_reasoner_runs") return Promise.resolve({ data: state.row, error: null });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: string) => chain(t) } } });

let mod: typeof import("./research-intelligence");
before(async () => { mod = await import("./research-intelligence"); });
beforeEach(() => { state.runId = "RUN1"; state.row = null; state.calledFindGeneration = false; });

const goodRow = (over: Record<string, unknown> = {}) => ({
  status: "completed", displayable: true, product: { displayable: true, story: { headline: "h", summary: null }, keyInsights: [], toConsider: [], observations: [], tensions: [], cannotConclude: [], openQuestions: [], dropped: [] },
  versions: { prompt: REASONER_PROMPT_VERSION, schema: REASONER_SCHEMA_VERSION }, ...over,
});

test("researchReasonerEnabled: OFF by default; only 'true'/'1' enable it", () => {
  assert.equal(mod.researchReasonerEnabled({}), false);
  assert.equal(mod.researchReasonerEnabled({ RESEARCH_REASONER_ENABLED: "true" }), true);
  assert.equal(mod.researchReasonerEnabled({ RESEARCH_REASONER_ENABLED: "1" }), true);
});

test("visibility: admins always; everyone else only when the flag is on (initial exposure = admin-only)", () => {
  assert.equal(mod.researchReasonerVisibleFor({ role: "admin" }, {}), true);
  assert.equal(mod.researchReasonerVisibleFor({ role: "brand" }, {}), false);
  assert.equal(mod.researchReasonerVisibleFor({ role: "brand" }, { RESEARCH_REASONER_ENABLED: "true" }), true);
});

test("disabled → null, and NO database read/generation happens", async () => {
  const r = await mod.getSurveyResearchIntelligence("S1", false);
  assert.equal(r, null);
  assert.equal(state.calledFindGeneration, false);
});

test("a verified, current-version, displayable artefact is returned", async () => {
  state.row = goodRow();
  const r = await mod.getSurveyResearchIntelligence("S1", true);
  assert.ok(r && r.story?.headline === "h");
});

test("reading NEVER writes/generates (opening Findings cannot trigger a model call)", async () => {
  state.row = goodRow();
  await mod.getSurveyResearchIntelligence("S1", true);
  assert.equal(state.calledFindGeneration, false);
});

test("no completed analysis run → null (nothing to attach intelligence to)", async () => {
  state.runId = null; state.row = goodRow();
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
});

test("stale version (prompt/schema bump) → null (fallback until regenerated)", async () => {
  state.row = goodRow({ versions: { prompt: "old", schema: REASONER_SCHEMA_VERSION } });
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
});

test("non-displayable or failed artefact → null (deterministic fallback)", async () => {
  state.row = goodRow({ displayable: false });
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
  state.row = goodRow({ status: "failed" });
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
});
