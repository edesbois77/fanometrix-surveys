// ── Stage C1 — Study Research Intelligence lifecycle, end to end ──────────────
// The SAME shared engine as surveys, driven through the STUDY source adapter. Proves the
// full chain (study analysis completes → enqueue(study) → REAL handler → verify → persist
// source_kind='study' → REAL study read), reuse / changed-evidence / idempotency /
// failure-fallback, AND the load-bearing Study evidence-safety guarantee: the reasoner sees
// only the governed cross-survey COMBINED evidence (per-survey rows are filtered out) and
// the respondent-level prohibition applies. No live DB, no live o3.
// Run with: node --import tsx --experimental-test-module-mocks
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── In-memory JOBS queue (live-only dedupe) ──────────────────────────────────
type Job = { id: string; dedupe_key: string | null; payload: Record<string, unknown>; status: "queued" | "running" | "completed" | "failed" };
let jobs: Job[] = [];
let jid = 0;
mock.module("@/lib/jobs/enqueue", {
  namedExports: {
    enqueueJob: async (o: { type: string; payload: Record<string, unknown>; dedupeKey?: string }) => {
      const live = jobs.find((j) => j.dedupe_key === (o.dedupeKey ?? null) && (j.status === "queued" || j.status === "running"));
      if (live) return { job: null, deduped: true };
      const job: Job = { id: `j${++jid}`, dedupe_key: o.dedupeKey ?? null, payload: o.payload, status: "queued" };
      jobs.push(job);
      return { job, deduped: false };
    },
  },
});

// ── In-memory DB: study_analysis_runs + research_reasoner_runs ────────────────
type Row = Record<string, unknown>;
const db: { study_analysis_runs: Row[]; research_reasoner_runs: Row[] } = { study_analysis_runs: [], research_reasoner_runs: [] };
function chain(table: keyof typeof db) {
  const filters: Array<[string, unknown]> = [];
  const match = () => db[table].filter((r) => filters.every(([k, v]) => r[k] === v));
  const c: Record<string, unknown> = {
    select() { return c; }, eq(col: string, val: unknown) { filters.push([col, val]); return c; },
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

// ── Model: counting stub; failNextStatus throws (4xx = permanent) ─────────────
let modelCalls = 0;
let failNextStatus: number | null = null;
const OUTPUT = {
  executiveStory: { headline: "The two markets diverge on recognition", summary: "Combined strong-fit 31.6%, never-noticed 27%.", evidenceRefs: ["e1", "e2"] },
  insights: [{ id: "s", title: "Recognition splits the study", type: "synthesis", statement: "Combined strong fit 31.6% vs never noticed 27%.", whyItMatters: "a study-wide recognition gap worth understanding", evidenceRefs: ["e1", "e2"], counterEvidenceRefs: [], confidence: "high", caveat: "" }],
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

import { getHandler } from "@/lib/jobs/registry";
import { PermanentJobError } from "@/lib/jobs/types";
import { RESEARCH_REASONER_JOB } from "@/lib/jobs/handlers/research-reasoner.constants";
// NB: ./source, ./read, ./evidence-package are imported DYNAMICALLY in before() so they
// (and their supabase-admin dependency) load AFTER the mock.module calls above register.
let enqueueResearchReasoner: typeof import("./enqueue").enqueueResearchReasoner;
let getStudyResearchIntelligence: typeof import("./read").getStudyResearchIntelligence;
let studyResearchSource: typeof import("./source").studyResearchSource;
let researchSourceFor: typeof import("./source").researchSourceFor;
let buildReasonerPackage: typeof import("./evidence-package").buildReasonerPackage;
before(async () => {
  await import("@/lib/jobs/handlers/research-reasoner");
  ({ enqueueResearchReasoner } = await import("./enqueue"));
  ({ getStudyResearchIntelligence } = await import("./read"));
  ({ studyResearchSource, researchSourceFor } = await import("./source"));
  ({ buildReasonerPackage } = await import("./evidence-package"));
});
beforeEach(() => { jobs = []; jid = 0; db.study_analysis_runs = []; db.research_reasoner_runs = []; modelCalls = 0; failNextStatus = null; });

// A STUDY evidence snapshot: study meta + COMBINED cross-survey evidence + a PER-SURVEY row
// (which must be filtered out of the reasoner package) + a study-level derived fact.
const STUDY_SNAP = {
  study: { id: "STUDY1", name: "FedEx UCL study", objective: "Assess sponsorship perception", surveyCount: 2, completedResponses: 274, respondentUniquenessProven: false, surveyIds: ["svA", "svB"] },
  evidence: [
    { ref: "study#STUDY1|q#q1|opt#o1|src#combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Strong fit", count: 87, base: 274, percentage: 0.316, scope: "combined" },
    { ref: "study#STUDY1|q#q1|opt#o2|src#combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Never noticed", count: 74, base: 274, percentage: 0.27, scope: "combined" },
    // per-survey breakdown — MUST NOT reach the reasoner package:
    { ref: "study#STUDY1|q#q1|opt#o1|src#survey#svA", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Strong fit", count: 40, base: 130, percentage: 0.31, scope: "survey" },
  ],
  derived: [{ ref: "study#STUDY1|d#leader|q#q1", kind: "leader", dimension: "survey", label: "Strong fit leads combined", value: 31.6 }],
  segmentDerived: [],
};
let clock = 0;
async function studyAnalysisCompletes(runId: string, studyId: string, fingerprint: string, env: Record<string, string | undefined> = {}) {
  db.study_analysis_runs.push({ id: runId, study_id: studyId, status: "completed", evidence_snapshot: STUDY_SNAP, evidence_hash: fingerprint, created_at: ++clock });
  await enqueueResearchReasoner({ sourceKind: "study", analysisRunId: runId, evidenceFingerprint: fingerprint }, env);
}
async function drain() {
  const def = getHandler(RESEARCH_REASONER_JOB);
  for (const job of jobs.filter((j) => j.status === "queued")) {
    job.status = "running";
    try { await def!.run({ job: { id: job.id } as never, payload: job.payload, attempts: 1, maxAttempts: 5, heartbeat: async () => {}, log: () => {} }); job.status = "completed"; }
    catch (e) { job.status = e instanceof PermanentJobError ? "failed" : "queued"; }
  }
}
const studyRows = (studyId: string) => db.research_reasoner_runs.filter((r) => r.source_id === studyId && r.source_kind === "study");

// ── A. Source adapter fidelity + no fabrication ───────────────────────────────
test("A. researchSourceFor('study') returns the study adapter; report/comparison remain null", () => {
  const s = researchSourceFor("study", "STUDY1");
  assert.ok(s && s.kind === "study" && s.sourceId === "STUDY1");
  assert.equal(researchSourceFor("report", "x"), null);
  assert.equal(researchSourceFor("comparison", "x"), null);
});

test("A. study adapter reads the immutable snapshot + fingerprint from study_analysis_runs (source_id = study id), fabricating nothing", async () => {
  db.study_analysis_runs.push({ id: "RUN_A", study_id: "STUDY1", status: "completed", evidence_snapshot: STUDY_SNAP, evidence_hash: "FP_X", created_at: 1 });
  const src = studyResearchSource("STUDY1");
  assert.deepEqual(await src.resolveCurrent(), { analysisRunId: "RUN_A", evidenceFingerprint: "FP_X" });
  const auth = await src.resolveRun("RUN_A");
  assert.equal(auth?.sourceKind, "study");
  assert.equal(auth?.sourceId, "STUDY1");
  assert.equal(auth?.evidenceFingerprint, "FP_X");
  assert.deepEqual(auth?.snapshot, STUDY_SNAP);
});

// ── B. Evidence safety: combined-only + respondent prohibition ────────────────
test("B. SAFETY: the reasoner package is built from COMBINED study evidence only (per-survey rows excluded), and respondent-level claims are prohibited", () => {
  const { pkg } = buildReasonerPackage(STUDY_SNAP as never, []);
  const optionLabels = pkg.questions.flatMap((q) => q.options.map((o) => o.label));
  assert.ok(optionLabels.includes("Strong fit") && optionLabels.includes("Never noticed"), "combined evidence is present");
  // The per-survey row (base 130) must NOT appear as its own governed option/base.
  const bases = pkg.questions.map((q) => q.base);
  assert.ok(bases.every((b) => b === 274), "every governed base is the study-combined base (274), never a per-survey base (130)");
  assert.ok(pkg.survey.respondentUniquenessProven === false, "respondent uniqueness is not proven for a study");
  assert.ok(pkg.dataLimitations.some((l) => /Respondent uniqueness is NOT proven/i.test(l)), "the respondent-level prohibition travels with the evidence");
});

// ── C–F. Generation lifecycle ─────────────────────────────────────────────────
test("C. FIRST GENERATION: fresh study analysis → auto-enqueue → 1 model call → artefact (source_kind='study') → study read returns it", async () => {
  await studyAnalysisCompletes("RUN_A", "STUDY1", "FP_X");
  assert.equal(jobs.filter((j) => j.status === "queued").length, 1);
  await drain();
  assert.equal(modelCalls, 1);
  assert.equal(studyRows("STUDY1").length, 1);
  assert.equal(db.research_reasoner_runs[0].source_kind, "study");
  assert.ok(await getStudyResearchIntelligence("STUDY1", true), "the study read returns the verified intelligence");
});

test("D. REUSE: same study fingerprint → 0 additional model calls, no duplicate artefact", async () => {
  await studyAnalysisCompletes("RUN_A", "STUDY1", "FP_X"); await drain();
  await studyAnalysisCompletes("RUN_B", "STUDY1", "FP_X"); await drain();
  assert.equal(modelCalls, 1);
  assert.equal(studyRows("STUDY1").length, 1);
  assert.ok(await getStudyResearchIntelligence("STUDY1", true));
});

test("E. CHANGED EVIDENCE: new study fingerprint → exactly 1 new generation; read selects the new artefact", async () => {
  await studyAnalysisCompletes("RUN_A", "STUDY1", "FP_X"); await drain();
  await studyAnalysisCompletes("RUN_C", "STUDY1", "FP_Y"); await drain();
  assert.equal(modelCalls, 2);
  assert.equal(studyRows("STUDY1").length, 2);
  assert.ok(db.research_reasoner_runs.find((r) => r.evidence_fingerprint === "FP_Y" && r.source_kind === "study"));
});

test("F. duplicate enqueue → one job; concurrent same-fingerprint studies collapse to one; retry after persist → 0 calls", async () => {
  await studyAnalysisCompletes("RUN_A", "STUDY1", "FP_X");
  await enqueueResearchReasoner({ sourceKind: "study", analysisRunId: "RUN_A", evidenceFingerprint: "FP_X" }, {});
  assert.equal(jobs.length, 1, "duplicate enqueue deduped on fingerprint");
  await drain();
  const def = getHandler(RESEARCH_REASONER_JOB);
  await def!.run({ job: { id: "redeliver" } as never, payload: { source_kind: "study", analysis_run_id: "RUN_A" }, attempts: 2, maxAttempts: 5, heartbeat: async () => {}, log: () => {} });
  assert.equal(modelCalls, 1, "retry after persistence is a skip");
  assert.equal(studyRows("STUDY1").length, 1);
});

// ── G–H. Failure / fallback ───────────────────────────────────────────────────
test("G. reasoner PERMANENT failure → authoritative Study analysis stays valid, study read falls back (null)", async () => {
  failNextStatus = 422;
  await studyAnalysisCompletes("RUN_A", "STUDY1", "FP_X"); await drain();
  assert.equal(await getStudyResearchIntelligence("STUDY1", true), null);
  assert.equal(db.study_analysis_runs.find((r) => r.id === "RUN_A")?.status, "completed", "the study analysis run is untouched");
});

test("H. non-displayable artefact → study read returns null (deterministic fallback)", async () => {
  // Seed a completed-but-not-displayable study artefact for the current fingerprint.
  db.study_analysis_runs.push({ id: "RUN_A", study_id: "STUDY1", status: "completed", evidence_snapshot: STUDY_SNAP, evidence_hash: "FP_X", created_at: 1 });
  db.research_reasoner_runs.push({ source_kind: "study", source_id: "STUDY1", evidence_fingerprint: "FP_X", prompt_version: "reasoner-proto-v3", schema_version: "reasoner-schema-v1", model: "o3", status: "completed", displayable: false, product: null });
  assert.equal(await getStudyResearchIntelligence("STUDY1", true), null);
});

// ── I. Exposure / access ──────────────────────────────────────────────────────
test("I. exposure gate: read with exposure=false → null even though the artefact exists (generation ≠ display)", async () => {
  await studyAnalysisCompletes("RUN_A", "STUDY1", "FP_X"); await drain();
  assert.equal(await getStudyResearchIntelligence("STUDY1", false), null);
  assert.ok(await getStudyResearchIntelligence("STUDY1", true));
});

// ── J. Version stale guard ────────────────────────────────────────────────────
test("J. version stale guard: an artefact under a superseded methodology is NOT served for the current study read", async () => {
  db.study_analysis_runs.push({ id: "RUN_A", study_id: "STUDY1", status: "completed", evidence_snapshot: STUDY_SNAP, evidence_hash: "FP_X", created_at: 1 });
  db.research_reasoner_runs.push({ source_kind: "study", source_id: "STUDY1", evidence_fingerprint: "FP_X", prompt_version: "reasoner-proto-OLD", schema_version: "reasoner-schema-v1", model: "o3", status: "completed", displayable: true, product: { displayable: true, story: { headline: "old" } } });
  assert.equal(await getStudyResearchIntelligence("STUDY1", true), null);
});
