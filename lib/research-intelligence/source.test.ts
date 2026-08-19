// ── Research source adapter — survey resolution + reserved-kind safety (mock) ─
// Run with: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

type Row = Record<string, unknown>;
const db: { survey_analysis_runs: Row[] } = { survey_analysis_runs: [] };
function chain() {
  const filters: Array<[string, unknown]> = [];
  let desc = false, lim: number | null = null;
  const match = () => {
    let rows = db.survey_analysis_runs.filter((r) => filters.every(([k, v]) => r[k] === v));
    if (desc) rows = rows.slice().sort((a, b) => Number(b.created_at) - Number(a.created_at));
    if (lim != null) rows = rows.slice(0, lim);
    return rows;
  };
  const c: Record<string, unknown> = {
    select() { return c; },
    eq(col: string, val: unknown) { filters.push([col, val]); return c; },
    order() { desc = true; return c; }, limit(n: number) { lim = n; return c; },
    single() { const r = match()[0] ?? null; return Promise.resolve({ data: r, error: r ? null : { message: "no rows" } }); },
    maybeSingle() { return Promise.resolve({ data: match()[0] ?? null, error: null }); },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: () => chain() } } });

let mod: typeof import("./source");
before(async () => { mod = await import("./source"); });
beforeEach(() => { db.survey_analysis_runs = []; });

const SNAP = { evidence: [{ ref: "r1" }] };

test("resolveCurrent: latest COMPLETED run + its fingerprint", async () => {
  db.survey_analysis_runs.push({ id: "OLD", survey_id: "S1", status: "completed", evidence_hash: "FP1", created_at: 1 });
  db.survey_analysis_runs.push({ id: "NEW", survey_id: "S1", status: "completed", evidence_hash: "FP2", created_at: 2 });
  const cur = await mod.surveyResearchSource("S1").resolveCurrent();
  assert.deepEqual(cur, { analysisRunId: "NEW", evidenceFingerprint: "FP2" });
});

test("resolveCurrent: a run without a fingerprint yields null (nothing stably reusable)", async () => {
  db.survey_analysis_runs.push({ id: "R", survey_id: "S1", status: "completed", evidence_hash: null, created_at: 1 });
  assert.equal(await mod.surveyResearchSource("S1").resolveCurrent(), null);
});

test("resolveRun: returns snapshot + fingerprint + tenant identity from the trusted stored record", async () => {
  db.survey_analysis_runs.push({ id: "R", survey_id: "S1", evidence_snapshot: SNAP, evidence_hash: "FP1" });
  const a = await mod.surveyResearchSource("S1").resolveRun("R");
  assert.ok(a);
  assert.equal(a!.sourceKind, "survey");
  assert.equal(a!.sourceId, "S1");
  assert.equal(a!.analysisRunId, "R");
  assert.equal(a!.evidenceFingerprint, "FP1");
  assert.deepEqual(a!.snapshot, SNAP);
});

test("resolveRun: missing snapshot / empty evidence / missing fingerprint → null (never persist without a stable identity)", async () => {
  db.survey_analysis_runs.push({ id: "NO_SNAP", survey_id: "S1", evidence_snapshot: null, evidence_hash: "FP" });
  db.survey_analysis_runs.push({ id: "EMPTY", survey_id: "S1", evidence_snapshot: { evidence: [] }, evidence_hash: "FP" });
  db.survey_analysis_runs.push({ id: "NO_FP", survey_id: "S1", evidence_snapshot: SNAP, evidence_hash: null });
  const s = mod.surveyResearchSource("S1");
  assert.equal(await s.resolveRun("NO_SNAP"), null);
  assert.equal(await s.resolveRun("EMPTY"), null);
  assert.equal(await s.resolveRun("NO_FP"), null);
});

test("researchSourceFor: 'survey' + 'study' are wired; remaining reserved kinds return null (fail safe, not guess)", () => {
  assert.ok(mod.researchSourceFor("survey", "S1"));
  const study = mod.researchSourceFor("study", "STUDY1");
  assert.ok(study && study.kind === "study" && study.sourceId === "STUDY1");
  assert.equal(mod.researchSourceFor("report", "X"), null);
  assert.equal(mod.researchSourceFor("comparison", "X"), null);
});
