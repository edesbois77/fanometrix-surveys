// ── Stage 5C — Studio → Core shadow enqueue: flag + isolation (mock.module) ────
// Run with the repo test flag: node --import tsx --experimental-test-module-mocks
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

let mod: typeof import("./analytical-core-shadow");
before(async () => { mod = await import("./analytical-core-shadow"); });
const enqueueCoreShadow = (...a: Parameters<typeof import("./analytical-core-shadow").enqueueCoreShadow>) => mod.enqueueCoreShadow(...a);
const coreShadowEnabled = (...a: Parameters<typeof import("./analytical-core-shadow").coreShadowEnabled>) => mod.coreShadowEnabled(...a);
afterEach(() => { calls = []; });

test("coreShadowEnabled: OFF by default; only 'true'/'1' enable it", () => {
  assert.equal(coreShadowEnabled({}), false);
  assert.equal(coreShadowEnabled({ ANALYTICAL_CORE_SHADOW_ENABLED: "false" }), false);
  assert.equal(coreShadowEnabled({ ANALYTICAL_CORE_SHADOW_ENABLED: "true" }), true);
  assert.equal(coreShadowEnabled({ ANALYTICAL_CORE_SHADOW_ENABLED: "1" }), true);
});

test("flag absent / false → NO enqueue (Studio path untouched)", async () => {
  await enqueueCoreShadow({ sourceKind: "study", analysisRunId: "R1" }, {});
  await enqueueCoreShadow({ sourceKind: "study", analysisRunId: "R1" }, { ANALYTICAL_CORE_SHADOW_ENABLED: "false" });
  assert.equal(calls.length, 0);
});

test("flag on → enqueues the exact analysis run id + dedupe key", async () => {
  await enqueueCoreShadow({ sourceKind: "survey", analysisRunId: "R2" }, { ANALYTICAL_CORE_SHADOW_ENABLED: "true" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "analytical-core.shadow");
  assert.equal(calls[0].payload.analysis_run_id, "R2");
  assert.equal(calls[0].payload.source_kind, "survey");
  assert.equal(calls[0].dedupeKey, "analytical-core.shadow:survey:R2");
});

test("enqueue FAILURE is swallowed — the helper never throws into the caller", async () => {
  await assert.doesNotReject(() => enqueueCoreShadow({ sourceKind: "study", analysisRunId: "THROW" }, { ANALYTICAL_CORE_SHADOW_ENABLED: "true" }));
  assert.equal(calls.length, 0);
});
