// ── Stage B — the STANDARD fresh-research lifecycle, end to end ───────────────
// Drives the FULL chain a brand-new eligible survey follows: authoritative analysis
// completes → the standard lifecycle hook ENQUEUES (real `enqueueResearchReasoner`, with
// the generation gate + fingerprint dedupe) → a worker DRAINS the job through the REAL
// handler → verifier/shaper → persist against the fingerprint identity → the REAL gated
// read returns the verified intelligence. Faithful in-memory doubles for the jobs queue
// (models LIVE-only dedupe), the DB (honours .eq + UPSERT onConflict identity) and a
// call-COUNTING model stub. No live DB, no live o3.
//
// Stage A proved REUSE for FedEx; this proves FIRST-GENERATION, and that generation is
// automatic + decoupled from display + cost-safe under duplication/concurrency.
// Run with: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── In-memory JOBS queue: at most one LIVE (queued|running) job per dedupe_key ─
type Job = { id: string; dedupe_key: string | null; payload: Record<string, unknown>; status: "queued" | "running" | "completed" | "failed" };
let jobs: Job[] = [];
let jid = 0;
mock.module("@/lib/jobs/enqueue", {
  namedExports: {
    enqueueJob: async (o: { type: string; payload: Record<string, unknown>; dedupeKey?: string }) => {
      const live = jobs.find((j) => j.dedupe_key === (o.dedupeKey ?? null) && (j.status === "queued" || j.status === "running"));
      if (live) return { job: null, deduped: true };            // active-dedupe: idempotent no-op
      const job: Job = { id: `j${++jid}`, dedupe_key: o.dedupeKey ?? null, payload: o.payload, status: "queued" };
      jobs.push(job);
      return { job, deduped: false };
    },
  },
});

// ── In-memory DB: survey_analysis_runs + research_reasoner_runs ────────────────
type Row = Record<string, unknown>;
const db: { survey_analysis_runs: Row[]; research_reasoner_runs: Row[] } = { survey_analysis_runs: [], research_reasoner_runs: [] };
function chain(table: keyof typeof db) {
  const filters: Array<[string, unknown]> = [];
  const match = () => db[table].filter((r) => filters.every(([k, v]) => r[k] === v));
  const c: Record<string, unknown> = {
    select() { return c; },
    eq(col: string, val: unknown) { filters.push([col, val]); return c; },
    order() { return c; }, limit() { return c; },
    single() { const r = match()[0] ?? null; return Promise.resolve({ data: r, error: r ? null : { message: "no rows" } }); },
    maybeSingle() { return Promise.resolve({ data: match()[0] ?? null, error: null }); },
    upsert(row: Row, opts?: { onConflict?: string }) {
      const cols = (opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const idx = cols.length ? db[table].findIndex((r) => cols.every((k) => r[k] === row[k])) : -1;
      if (idx >= 0) db[table][idx] = { ...db[table][idx], ...row }; else db[table].push({ ...row });
      return Promise.resolve({ error: null });
    },
  };
  return c;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: keyof typeof db) => chain(t) } } });

// ── Model: counting stub; `failNextStatus` makes the next call throw (a 4xx = permanent) ─
let modelCalls = 0;
let failNextStatus: number | null = null;
const OUTPUT = {
  executiveStory: { headline: "Perception is split", summary: "Strong fit 31.6%, never noticed 27%.", evidenceRefs: ["e1", "e2"] },
  insights: [{ id: "s", title: "Split", type: "synthesis", statement: "Strong fit 31.6% vs never noticed 27%.", whyItMatters: "a recognition gap worth understanding", evidenceRefs: ["e1", "e2"], counterEvidenceRefs: [], confidence: "high", caveat: "" }],
  supportingObservations: [], tensions: [], openQuestions: [], cannotConclude: ["No causal claims."],
};
mock.module("@/lib/research-intelligence/model", {
  namedExports: {
    REASONER_MODEL: "o3", REASONER_PROMPT_VERSION: "reasoner-proto-v3", REASONER_SCHEMA_VERSION: "reasoner-schema-v1",
    makeDefaultReasonerCaller: () => async () => {
      modelCalls++;
      if (failNextStatus != null) { const s = failNextStatus; failNextStatus = null; const e = new Error("model refused") as Error & { status: number }; e.status = s; throw e; }
      return { parsed: OUTPUT, usage: { totalTokens: 1 }, latencyMs: 1, model: "o3" };
    },
  },
});
mock.module("@/lib/studio/core-intelligence", { namedExports: { getSurveyCoreIntelligence: async () => null } });
mock.module("@/lib/studio/survey-results-compose", { namedExports: { composeSurveyResults: () => ({ mode: "none" }) } });

import { getHandler } from "@/lib/jobs/registry";
import { PermanentJobError } from "@/lib/jobs/types";
import { RESEARCH_REASONER_JOB } from "@/lib/jobs/handlers/research-reasoner.constants";
let enqueueResearchReasoner: typeof import("./enqueue").enqueueResearchReasoner;
let getSurveyResearchIntelligence: typeof import("./read").getSurveyResearchIntelligence;
before(async () => {
  await import("@/lib/jobs/handlers/research-reasoner");
  ({ enqueueResearchReasoner } = await import("./enqueue"));
  ({ getSurveyResearchIntelligence } = await import("./read"));
});
beforeEach(() => { jobs = []; jid = 0; db.survey_analysis_runs = []; db.research_reasoner_runs = []; modelCalls = 0; failNextStatus = null; });

const SNAP = {
  study: { name: "T", objective: null, completedResponses: 196, respondentUniquenessProven: false },
  evidence: [
    { ref: "r1", scope: "combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Strong fit", count: 62, base: 196, percentage: 0.316 },
    { ref: "r2", scope: "combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Never noticed", count: 53, base: 196, percentage: 0.27 },
  ],
  derived: [], segmentDerived: [],
};
let clock = 0;

/** Simulate an authoritative analysis COMPLETING for a survey, then the route's standard
 *  lifecycle hook enqueuing Research Intelligence (exactly as app/api/.../analysis does). */
async function analysisCompletes(runId: string, surveyId: string, fingerprint: string, env: Record<string, string | undefined> = {}) {
  db.survey_analysis_runs.push({ id: runId, survey_id: surveyId, status: "completed", evidence_snapshot: SNAP, evidence_hash: fingerprint, created_at: ++clock });
  await enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: runId, evidenceFingerprint: fingerprint }, env);
}
/** A worker draining the queue through the REAL handler (sequential, like the real drain). */
async function drain() {
  const def = getHandler(RESEARCH_REASONER_JOB);
  assert.ok(def, "handler registered");
  for (const job of jobs.filter((j) => j.status === "queued")) {
    job.status = "running";
    try {
      await def!.run({ job: { id: job.id } as never, payload: job.payload, attempts: 1, maxAttempts: 5, heartbeat: async () => {}, log: () => {} });
      job.status = "completed";
    } catch (e) { job.status = e instanceof PermanentJobError ? "failed" : "queued"; }
  }
}
const fedexRows = (surveyId: string) => db.research_reasoner_runs.filter((r) => r.source_id === surveyId);

// ── CASE 1 — first analysis / new fingerprint ─────────────────────────────────
test("FIRST GENERATION: brand-new survey → auto-enqueue → exactly 1 model call → verified artefact → Findings returns it", async () => {
  await analysisCompletes("RUN_A", "NEW1", "FP_X");
  assert.equal(jobs.filter((j) => j.status === "queued").length, 1, "analysis completion automatically enqueued exactly one job");
  await drain();
  assert.equal(modelCalls, 1, "reasoned exactly once");
  assert.equal(fedexRows("NEW1").length, 1, "one verified artefact persisted");
  assert.ok(await getSurveyResearchIntelligence("NEW1", true), "the gated read returns the verified intelligence");
});

// ── CASE 2 — same evidence again ──────────────────────────────────────────────
test("REUSE (sequential re-analysis): same fingerprint → 0 additional model calls, no duplicate row, same artefact served", async () => {
  await analysisCompletes("RUN_A", "NEW1", "FP_X"); await drain();
  await analysisCompletes("RUN_B", "NEW1", "FP_X"); await drain();   // re-analysis, identical evidence
  assert.equal(modelCalls, 1, "the handler skip-guard prevented a second o3 call");
  assert.equal(fedexRows("NEW1").length, 1, "no duplicate artefact");
  assert.ok(await getSurveyResearchIntelligence("NEW1", true), "Findings keeps serving the existing intelligence");
});

test("REUSE (concurrent re-analysis): overlapping jobs for the same fingerprint collapse to ONE via the live dedupe → 1 model call", async () => {
  await analysisCompletes("RUN_A", "NEW1", "FP_X");
  await analysisCompletes("RUN_B", "NEW1", "FP_X");   // second enqueue while the first job is still LIVE
  assert.equal(jobs.length, 1, "the fingerprint dedupe collapsed the two overlapping enqueues to one job");
  await drain();
  assert.equal(modelCalls, 1, "the paid model was called at most once for the fingerprint");
  assert.equal(fedexRows("NEW1").length, 1);
});

// ── CASE 3 — genuinely changed evidence ───────────────────────────────────────
test("CHANGED EVIDENCE: a new fingerprint → exactly 1 additional model call → new artefact → current read selects the NEW one", async () => {
  await analysisCompletes("RUN_A", "NEW1", "FP_X"); await drain();
  await analysisCompletes("RUN_C", "NEW1", "FP_Y"); await drain();   // evidence genuinely changed
  assert.equal(modelCalls, 2, "the new fingerprint was reasoned once");
  assert.equal(fedexRows("NEW1").length, 2, "old artefact retained as history; new one added");
  assert.ok(db.research_reasoner_runs.find((r) => r.evidence_fingerprint === "FP_Y"), "the Y artefact exists");
  assert.ok(await getSurveyResearchIntelligence("NEW1", true), "the read (current fingerprint = Y) returns intelligence");
});

// ── Cost / duplication safety ─────────────────────────────────────────────────
test("duplicate enqueue for the SAME run before draining → one job (idempotent enqueue)", async () => {
  await analysisCompletes("RUN_A", "NEW1", "FP_X");
  await enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "RUN_A", evidenceFingerprint: "FP_X" }, {});
  assert.equal(jobs.length, 1, "a double trigger creates no duplicate work");
});

test("retry after successful persistence → 0 new model calls (re-running a completed job is a skip)", async () => {
  await analysisCompletes("RUN_A", "NEW1", "FP_X"); await drain();
  // simulate the framework re-running the same job (e.g. an at-least-once redelivery)
  const def = getHandler(RESEARCH_REASONER_JOB);
  await def!.run({ job: { id: "redeliver" } as never, payload: { source_kind: "survey", analysis_run_id: "RUN_A" }, attempts: 2, maxAttempts: 5, heartbeat: async () => {}, log: () => {} });
  assert.equal(modelCalls, 1, "the persisted fingerprint short-circuits any retry");
  assert.equal(fedexRows("NEW1").length, 1);
});

// ── CASE 4 — failure / fallback isolation ─────────────────────────────────────
test("reasoner PERMANENT failure: authoritative analysis stays valid, Findings falls back to deterministic (null), no displayable artefact", async () => {
  failNextStatus = 422;                                  // model refuses permanently
  await analysisCompletes("RUN_A", "NEW1", "FP_X"); await drain();
  assert.equal(await getSurveyResearchIntelligence("NEW1", true), null, "Findings falls back to deterministic");
  const run = db.survey_analysis_runs.find((r) => r.id === "RUN_A");
  assert.equal(run?.status, "completed", "the authoritative analysis run is untouched and still valid");
});

test("recovery: after a permanent failure, a later successful lifecycle for the same fingerprint produces the verified artefact", async () => {
  failNextStatus = 422;
  await analysisCompletes("RUN_A", "NEW1", "FP_X"); await drain();   // fails
  assert.equal(await getSurveyResearchIntelligence("NEW1", true), null);
  await analysisCompletes("RUN_B", "NEW1", "FP_X"); await drain();   // succeeds (skip-guard ignores the failed row)
  assert.ok(await getSurveyResearchIntelligence("NEW1", true), "verified intelligence is now served");
});

// ── Generation vs exposure + kill-switch ──────────────────────────────────────
test("GENERATION vs EXPOSURE: display OFF still GENERATES (decoupled) — the artefact is produced even when non-admins cannot see it", async () => {
  await analysisCompletes("RUN_A", "NEW1", "FP_X", { RESEARCH_REASONER_ENABLED: "false" }); // display off
  await drain();
  assert.equal(modelCalls, 1, "generation ran despite display being off");
  assert.equal(fedexRows("NEW1").length, 1, "the artefact is persisted, ready for whenever it is exposed");
  // display gate is a SEPARATE decision at read time:
  assert.equal(await getSurveyResearchIntelligence("NEW1", false), null, "read with exposure=false returns null (display, not generation)");
  assert.ok(await getSurveyResearchIntelligence("NEW1", true), "read with exposure=true returns the already-generated artefact");
});

test("generation KILL-SWITCH: RESEARCH_INTELLIGENCE_GENERATION_ENABLED=false → no job, no model call, authoritative analysis unaffected", async () => {
  await analysisCompletes("RUN_A", "NEW1", "FP_X", { RESEARCH_INTELLIGENCE_GENERATION_ENABLED: "false" });
  assert.equal(jobs.length, 0, "generation was suppressed");
  await drain();
  assert.equal(modelCalls, 0);
  assert.equal(db.survey_analysis_runs.find((r) => r.id === "RUN_A")?.status, "completed", "the authoritative analysis still completed");
});
