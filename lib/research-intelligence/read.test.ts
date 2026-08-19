// ── Research intelligence — gated read: flag / visibility / FINGERPRINT keying ─
// Run with: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { REASONER_MODEL, REASONER_PROMPT_VERSION, REASONER_SCHEMA_VERSION } from "./model";

// A faithful-enough store: the research_reasoner_runs chain HONOURS .eq filters, so the
// read's fingerprint + methodology identity is genuinely exercised (a row is returned only
// when EVERY identity column the read filters on matches). survey_analysis_runs answers
// resolveCurrent with the current run's id + evidence_hash.
type Row = Record<string, unknown>;
const state: { current: { id: string; evidence_hash: string } | null; rows: Row[]; wrote: boolean } = { current: null, rows: [], wrote: false };

function chain(table: string) {
  const filters: Array<[string, unknown]> = [];
  const c: Record<string, unknown> = {
    select() { return c; },
    eq(col: string, val: unknown) { filters.push([col, val]); return c; },
    order() { return c; }, limit() { return c; },
    insert() { state.wrote = true; return c; }, upsert() { state.wrote = true; return c; },
    maybeSingle() {
      if (table === "survey_analysis_runs") return Promise.resolve({ data: state.current, error: null });
      if (table === "research_reasoner_runs") {
        const hit = state.rows.find((r) => filters.every(([k, v]) => r[k] === v)) ?? null;
        return Promise.resolve({ data: hit, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: string) => chain(t) } } });

let mod: typeof import("./read");
before(async () => { mod = await import("./read"); });
beforeEach(() => { state.current = { id: "RUN_B", evidence_hash: "FP_X" }; state.rows = []; state.wrote = false; });

// A stored artefact row, identity-complete, defaulting to the CURRENT methodology + fingerprint FP_X.
const artefact = (over: Record<string, unknown> = {}): Row => ({
  source_kind: "survey", source_id: "S1", evidence_fingerprint: "FP_X",
  prompt_version: REASONER_PROMPT_VERSION, schema_version: REASONER_SCHEMA_VERSION, model: REASONER_MODEL,
  status: "completed", displayable: true,
  product: { displayable: true, story: { headline: "h", summary: null }, keyInsights: [], toConsider: [], observations: [], tensions: [], cannotConclude: [], openQuestions: [] },
  ...over,
});

// ── Flag / visibility (unchanged contract) ────────────────────────────────────
test("researchReasonerEnabled: OFF by default; only 'true'/'1' enable it", () => {
  assert.equal(mod.researchReasonerEnabled({}), false);
  assert.equal(mod.researchReasonerEnabled({ RESEARCH_REASONER_ENABLED: "true" }), true);
  assert.equal(mod.researchReasonerEnabled({ RESEARCH_REASONER_ENABLED: "1" }), true);
});
test("visibility: admins always; everyone else only when the flag is on", () => {
  assert.equal(mod.researchReasonerVisibleFor({ role: "admin" }, {}), true);
  assert.equal(mod.researchReasonerVisibleFor({ role: "brand" }, {}), false);
  assert.equal(mod.researchReasonerVisibleFor({ role: "brand" }, { RESEARCH_REASONER_ENABLED: "true" }), true);
});
const ENV = (emails?: string, flag?: string) => ({ ...(emails != null ? { RESEARCH_REASONER_PREVIEW_EMAILS: emails } : {}), ...(flag != null ? { RESEARCH_REASONER_ENABLED: flag } : {}) });
test("preview allow-list: listed email + flag OFF → visible; non-listed → not; fail-closed on blank", () => {
  assert.equal(mod.researchReasonerVisibleFor({ role: "publisher", workEmail: "ed@fanometrix.com" }, ENV("ed@fanometrix.com")), true);
  assert.equal(mod.researchReasonerVisibleFor({ role: "publisher", workEmail: "someone@else.com" }, ENV("ed@fanometrix.com")), false);
  assert.equal(mod.researchReasonerVisibleFor({ role: "publisher", workEmail: "  ED@Fanometrix.COM " }, ENV(" Ed@Fanometrix.com ")), true);
  assert.equal(mod.researchReasonerVisibleFor({ role: "publisher", workEmail: "ed@fanometrix.com" }, {}), false);
  assert.equal(mod.researchReasonerVisibleFor({ role: "publisher", workEmail: null }, ENV("ed@fanometrix.com")), false);
});

// ── Read gating + never-writes ────────────────────────────────────────────────
test("disabled → null, and NO database read/generation happens", async () => {
  const r = await mod.getSurveyResearchIntelligence("S1", false);
  assert.equal(r, null);
  assert.equal(state.wrote, false);
});
test("reading NEVER writes/generates (opening Findings cannot trigger a model call)", async () => {
  state.rows = [artefact()];
  await mod.getSurveyResearchIntelligence("S1", true);
  assert.equal(state.wrote, false);
});

// ── FINGERPRINT keying (the core of Stage A) ──────────────────────────────────
test("current fingerprint + current methodology → returns the artefact", async () => {
  state.rows = [artefact()];
  const r = await mod.getSurveyResearchIntelligence("S1", true);
  assert.ok(r && r.story?.headline === "h");
});

test("REGRESSION FIX: the artefact is keyed on the FINGERPRINT, not the run id — a NEW run id with the SAME fingerprint still returns it (no fallback flicker)", async () => {
  // The artefact was written for run RUN_A; analysis has since been re-run as RUN_B with
  // the SAME evidence (same fingerprint FP_X). The stored row carries no run id in its
  // identity, so the read matches on fingerprint alone — the old run-id keying would have
  // returned null here and regressed Findings to deterministic.
  state.current = { id: "RUN_B", evidence_hash: "FP_X" };
  state.rows = [artefact({ analysis_run_id: "RUN_A" })];
  const r = await mod.getSurveyResearchIntelligence("S1", true);
  assert.ok(r, "intelligence still returned for the new run id");
});

test("changed evidence (new fingerprint) does NOT show the old fingerprint's artefact", async () => {
  state.current = { id: "RUN_C", evidence_hash: "FP_Y" };     // evidence genuinely changed
  state.rows = [artefact({ evidence_fingerprint: "FP_X" })];  // only the OLD artefact exists
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
});

test("no completed analysis / no fingerprint yet → null", async () => {
  state.current = null; state.rows = [artefact()];
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
});

test("version incompatibility fails CLOSED: a prompt/schema/model bump means the current-identity row is not matched → null (fallback until regenerated)", async () => {
  state.rows = [artefact({ prompt_version: "reasoner-proto-OLD" })];
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
  state.rows = [artefact({ schema_version: "reasoner-schema-OLD" })];
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
  state.rows = [artefact({ model: "gpt-old" })];
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
});

test("non-displayable or failed artefact → null (deterministic fallback)", async () => {
  state.rows = [artefact({ displayable: false })];
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
  state.rows = [artefact({ status: "failed", product: null })];
  assert.equal(await mod.getSurveyResearchIntelligence("S1", true), null);
});
