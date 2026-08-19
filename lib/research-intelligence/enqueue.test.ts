// ── Research Intelligence enqueue — generation gate, fingerprint dedupe, isolation ─
// Run with: node --import tsx --experimental-test-module-mocks
import { test, mock, before, afterEach } from "node:test";
import assert from "node:assert/strict";

let calls: Array<{ type: string; payload: Record<string, unknown>; dedupeKey?: string }> = [];
mock.module("@/lib/jobs/enqueue", {
  namedExports: {
    enqueueJob: async (o: { type: string; payload: Record<string, unknown>; dedupeKey?: string }) => {
      if (o.payload?.analysis_run_id === "THROW") throw new Error("jobs table unreachable");
      calls.push(o);
      return { job: { id: "job1" }, deduped: false };
    },
  },
});

let mod: typeof import("./enqueue");
before(async () => { mod = await import("./enqueue"); });
afterEach(() => { calls = []; });

// ── Generation is ON by default and DECOUPLED from display ────────────────────
test("generation is ON by default — fresh research is enqueued with NO flag set (automatic lifecycle)", async () => {
  await mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "R1", evidenceFingerprint: "FP1" }, {});
  assert.equal(calls.length, 1, "generation happens automatically by default");
});

test("GENERATION vs EXPOSURE: display OFF (RESEARCH_REASONER_ENABLED unset/false) still GENERATES — we never fail to generate because a user cannot see it", async () => {
  await mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "R1", evidenceFingerprint: "FP1" }, { RESEARCH_REASONER_ENABLED: "false" });
  assert.equal(calls.length, 1, "the display flag does not gate generation");
});

test("generation kill-switch: RESEARCH_INTELLIGENCE_GENERATION_ENABLED=false/0 → NO enqueue (cost control)", async () => {
  await mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "R1", evidenceFingerprint: "FP1" }, { RESEARCH_INTELLIGENCE_GENERATION_ENABLED: "false" });
  await mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "R1", evidenceFingerprint: "FP1" }, { RESEARCH_INTELLIGENCE_GENERATION_ENABLED: "0" });
  assert.equal(calls.length, 0, "the kill-switch stops generation entirely");
});

// ── Fingerprint dedupe identity ───────────────────────────────────────────────
test("dedupe key is the EVIDENCE FINGERPRINT (not the run id) — Stage-A identity alignment", async () => {
  await mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "RUN_B", evidenceFingerprint: "FP_X" }, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "research.reasoner");
  assert.equal(calls[0].payload.analysis_run_id, "RUN_B", "the job still carries the concrete run id it must resolve");
  assert.equal(calls[0].dedupeKey, "research.reasoner:survey:FP_X", "two overlapping re-analyses of the same evidence collapse to one live job");
});

test("dedupe falls back to the run id only when no fingerprint is supplied (defensive)", async () => {
  await mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "RUN_B" }, {});
  assert.equal(calls[0].dedupeKey, "research.reasoner:survey:RUN_B");
});

// ── Isolation ─────────────────────────────────────────────────────────────────
test("enqueue FAILURE is swallowed — the helper never throws into the authoritative path", async () => {
  await assert.doesNotReject(() => mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "THROW", evidenceFingerprint: "FP1" }, {}));
});
