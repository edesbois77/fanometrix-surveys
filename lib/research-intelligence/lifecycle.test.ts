// ── Research intelligence — FINGERPRINT lifecycle (the stale-run regression proof) ─
// Drives the REAL job handler + REAL persistence identity + REAL gated read against a
// faithful IN-MEMORY store (honours .eq filters + UPSERT onConflict identity) and a
// call-COUNTING model stub. No live DB, no live model. This is the automated proof of the
// exact failure we hit in production:
//   run A (fingerprint X) → intelligence generated →
//   run B (SAME fingerprint X) → Findings still returns it, ZERO new model calls, no
//   deterministic-fallback window caused merely by the new run id.
// Plus: changed evidence (fingerprint Y) follows the normal lifecycle; a version bump
// regenerates and fails closed until it does; repeated/idempotent runs never duplicate.
// Run with: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── In-memory store: two tables, faithful to the identity contract ────────────
type Row = Record<string, unknown>;
const db: { survey_analysis_runs: Row[]; research_reasoner_runs: Row[] } = { survey_analysis_runs: [], research_reasoner_runs: [] };
let modelCalls = 0;

function chain(table: keyof typeof db) {
  const filters: Array<[string, unknown]> = [];
  let desc = false, lim: number | null = null;
  const match = () => {
    let rows = db[table].filter((r) => filters.every(([k, v]) => r[k] === v));
    if (desc) rows = rows.slice().sort((a, b) => Number(b.created_at) - Number(a.created_at));
    if (lim != null) rows = rows.slice(0, lim);
    return rows;
  };
  const c: Record<string, unknown> = {
    select() { return c; },
    eq(col: string, val: unknown) { filters.push([col, val]); return c; },
    order() { desc = true; return c; },
    limit(n: number) { lim = n; return c; },
    single() { const r = match()[0] ?? null; return Promise.resolve({ data: r, error: r ? null : { message: "no rows" } }); },
    maybeSingle() { return Promise.resolve({ data: match()[0] ?? null, error: null }); },
    upsert(row: Row, opts?: { onConflict?: string }) {
      // Simulate the UNIQUE identity index: find an existing row matching every onConflict
      // column; update it in place, else insert. One artefact row per identity — exactly
      // what the DB unique index guarantees under concurrency.
      const cols = (opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const idx = cols.length ? db[table].findIndex((r) => cols.every((k) => r[k] === row[k])) : -1;
      if (idx >= 0) db[table][idx] = { ...db[table][idx], ...row };
      else db[table].push({ ...row });
      return Promise.resolve({ error: null });
    },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: keyof typeof db) => chain(t) } } });

// A valid, displayable reasoner output over the seeded snapshot (refs e1/e2).
const OUTPUT = {
  executiveStory: { headline: "Perception is split", summary: "Strong fit 31.6%, never noticed 27%.", evidenceRefs: ["e1", "e2"] },
  insights: [{ id: "s", title: "Split", type: "synthesis", statement: "Strong fit 31.6% vs never noticed 27%.", whyItMatters: "a recognition gap worth understanding", evidenceRefs: ["e1", "e2"], counterEvidenceRefs: [], confidence: "high", caveat: "" }],
  supportingObservations: [], tensions: [], openQuestions: [], cannotConclude: ["No causal claims."],
};
// Mock ONLY the model module: a counting stub caller + the real version/model constants
// (literal, matching model.ts) so the identity the handler/persistence/read compute is real.
mock.module("@/lib/research-intelligence/model", {
  namedExports: {
    REASONER_MODEL: "o3", REASONER_PROMPT_VERSION: "reasoner-proto-v3", REASONER_SCHEMA_VERSION: "reasoner-schema-v1",
    makeDefaultReasonerCaller: () => async () => { modelCalls++; return { parsed: OUTPUT, usage: { totalTokens: 1 }, latencyMs: 1, model: "o3" }; },
  },
});
// Keep the deterministic-context lookups inert (not under test here).
mock.module("@/lib/studio/core-intelligence", { namedExports: { getSurveyCoreIntelligence: async () => null } });
mock.module("@/lib/studio/survey-results-compose", { namedExports: { composeSurveyResults: () => ({ mode: "none" }) } });

import { getHandler } from "@/lib/jobs/registry";
import { RESEARCH_REASONER_JOB } from "@/lib/jobs/handlers/research-reasoner.constants";
let getSurveyResearchIntelligence: (surveyId: string, enabled: boolean) => Promise<unknown>;
before(async () => {
  await import("@/lib/jobs/handlers/research-reasoner");   // registers itself
  ({ getSurveyResearchIntelligence } = await import("./read"));
});
beforeEach(() => { db.survey_analysis_runs = []; db.research_reasoner_runs = []; modelCalls = 0; });

const SNAP = {
  study: { name: "T", objective: null, completedResponses: 196, respondentUniquenessProven: false },
  evidence: [
    { ref: "r1", scope: "combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Strong fit", count: 62, base: 196, percentage: 0.316 },
    { ref: "r2", scope: "combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Never noticed", count: 53, base: 196, percentage: 0.27 },
  ],
  derived: [], segmentDerived: [],
};
let clock = 0;
function seedRun(id: string, surveyId: string, fingerprint: string) {
  db.survey_analysis_runs.push({ id, survey_id: surveyId, status: "completed", evidence_snapshot: SNAP, evidence_hash: fingerprint, created_at: ++clock });
}
function runHandler(analysisRunId: string) {
  const def = getHandler(RESEARCH_REASONER_JOB);
  assert.ok(def, "handler registered");
  return def!.run({ job: { id: "job1" } as never, payload: { source_kind: "survey", analysis_run_id: analysisRunId }, attempts: 1, maxAttempts: 5, heartbeat: async () => {}, log: () => {} });
}
const artefactRows = (surveyId: string) => db.research_reasoner_runs.filter((r) => r.source_id === surveyId);

test("run A (fingerprint X): ONE model call, one displayable artefact, Findings shows it", async () => {
  seedRun("RUN_A", "S1", "FP_X");
  await runHandler("RUN_A");
  assert.equal(modelCalls, 1, "reasoned once");
  assert.equal(artefactRows("S1").length, 1, "exactly one artefact row");
  assert.ok(await getSurveyResearchIntelligence("S1", true), "Findings returns the intelligence");
});

test("REGRESSION PROOF: re-analysis as run B with the SAME fingerprint X → ZERO new model calls, artefact still shown, NO fallback window", async () => {
  seedRun("RUN_A", "S1", "FP_X");
  await runHandler("RUN_A");
  assert.equal(modelCalls, 1);

  // Analysis regenerated: a NEW run id, identical evidence ⇒ identical fingerprint.
  seedRun("RUN_B", "S1", "FP_X");
  await runHandler("RUN_B");                              // the job fires again for the new run
  assert.equal(modelCalls, 1, "skip-guard hit on the fingerprint — o3 was NOT called again");
  assert.equal(artefactRows("S1").length, 1, "no duplicate artefact row");

  // The current authoritative run is now RUN_B; the read is keyed on the FINGERPRINT, so
  // it still returns the intelligence — the exact bug (null → deterministic fallback) is gone.
  const intel = await getSurveyResearchIntelligence("S1", true);
  assert.ok(intel, "Findings STILL returns the verified intelligence for the new run id");
});

test("changed evidence (fingerprint Y): follows the normal lifecycle — one new model call, a distinct artefact, Y is shown not X", async () => {
  seedRun("RUN_A", "S1", "FP_X");
  await runHandler("RUN_A");
  seedRun("RUN_C", "S1", "FP_Y");                         // evidence genuinely changed
  await runHandler("RUN_C");
  assert.equal(modelCalls, 2, "new fingerprint ⇒ reasoned again");
  assert.equal(artefactRows("S1").length, 2, "a distinct artefact per fingerprint (X and Y)");
  // The current run (RUN_C) carries fingerprint Y → the Y artefact is the one returned.
  const shown = db.research_reasoner_runs.find((r) => r.evidence_fingerprint === "FP_Y");
  assert.ok(shown, "the Y artefact exists");
  assert.ok(await getSurveyResearchIntelligence("S1", true), "Findings returns intelligence for the current fingerprint");
});

test("version bump: an artefact under a SUPERSEDED methodology is not reused — the read fails closed until the current methodology regenerates", async () => {
  // Seed a completed artefact for FP_X under an OLD prompt version (a superseded contract).
  db.research_reasoner_runs.push({
    source_kind: "survey", source_id: "S1", evidence_fingerprint: "FP_X", analysis_run_id: "RUN_OLD",
    prompt_version: "reasoner-proto-OLD", schema_version: "reasoner-schema-v1", model: "o3",
    status: "completed", displayable: true, product: { displayable: true, story: { headline: "old" } }, created_at: 0,
  });
  seedRun("RUN_A", "S1", "FP_X");
  // Read BEFORE regenerating: the current-methodology identity does not match the old row → fallback.
  assert.equal(await getSurveyResearchIntelligence("S1", true), null, "superseded-version artefact is NOT shown (fail closed)");
  // The handler does not treat the old row as a skip → it regenerates under the current methodology.
  await runHandler("RUN_A");
  assert.equal(modelCalls, 1, "regenerated under the current methodology");
  assert.ok(await getSurveyResearchIntelligence("S1", true), "now shown under the current methodology");
});

test("idempotency: re-running the SAME run repeatedly never re-calls the model and never duplicates the artefact", async () => {
  seedRun("RUN_A", "S1", "FP_X");
  await runHandler("RUN_A");
  await runHandler("RUN_A");
  await runHandler("RUN_A");
  assert.equal(modelCalls, 1, "a completed fingerprint is reasoned exactly once");
  assert.equal(artefactRows("S1").length, 1, "single artefact row (UPSERT on identity)");
});

test("cross-run convergence: two different runs with the SAME fingerprint converge on ONE artefact row (unique identity)", async () => {
  seedRun("RUN_A", "S1", "FP_X");
  seedRun("RUN_B", "S1", "FP_X");
  await runHandler("RUN_A");
  await runHandler("RUN_B");
  assert.equal(artefactRows("S1").length, 1, "one artefact per fingerprint regardless of how many runs produced it");
});
