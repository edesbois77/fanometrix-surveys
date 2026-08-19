// ── Research Reasoner — enqueue bridge: flag + isolation (mock.module) ───────
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

test("flag absent / false → NO enqueue (Studio analysis path untouched)", async () => {
  await mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "R1" }, {});
  await mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "R1" }, { RESEARCH_REASONER_ENABLED: "false" });
  assert.equal(calls.length, 0);
});

test("flag on → enqueues the exact analysis run id with an idempotent dedupe key", async () => {
  await mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "R2" }, { RESEARCH_REASONER_ENABLED: "true" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "research.reasoner");
  assert.equal(calls[0].payload.analysis_run_id, "R2");
  assert.equal(calls[0].dedupeKey, "research.reasoner:survey:R2");
});

test("enqueue FAILURE is swallowed — the helper never throws into the authoritative path", async () => {
  await assert.doesNotReject(() => mod.enqueueResearchReasoner({ sourceKind: "survey", analysisRunId: "THROW" }, { RESEARCH_REASONER_ENABLED: "true" }));
});
