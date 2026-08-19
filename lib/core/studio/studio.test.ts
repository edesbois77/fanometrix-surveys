import { test } from "node:test";
import assert from "node:assert/strict";
import { studioToDiscoveryInput, type StudioGovernedInput } from "./adapter";
import { runStudioShadow, shadowEnabled } from "./shadow";
import type { PipelineOptions } from "../pipeline/analyse";

const studioInput: StudioGovernedInput = {
  source: { kind: "survey", id: "survey-1" },
  objective: "Understand value and access preferences.",
  questions: [
    { canonicalQuestionKey: "q_fit", text: "Fit?", base: 274, options: [{ optionId: "a", label: "A", count: 92 }, { optionId: "b", label: "B", count: 85 }, { optionId: "c", count: 97 }] },
  ],
};

test("adapter preserves counts, bases and ids; missing metadata stays absent; uses counts (no scale conversion)", () => {
  const di = studioToDiscoveryInput(studioInput);
  const q = di.questions[0];
  assert.equal(q.questionKey, "q_fit");
  assert.equal(q.base, 274);
  assert.deepEqual(q.options.map((o) => o.count), [92, 85, 97]);
  assert.equal(q.options[2].label, undefined); // missing label stays absent
  assert.equal(di.objective, "Understand value and access preferences.");
});

test("adapter falls back to a stable question key when canonical/id absent", () => {
  const di = studioToDiscoveryInput({ source: { kind: "survey", id: "s" }, questions: [{ text: "Q", base: 50, options: [{ optionId: "x", count: 30 }, { optionId: "y", count: 20 }] }] });
  assert.equal(di.questions[0].questionKey, "q0");
});

test("shadow is OFF by default → skipped (no Core execution)", () => {
  assert.equal(shadowEnabled({}), false);
  const r = runStudioShadow(studioInput, { runId: "r", startedAt: "T0", completedAt: "T1" }, { env: {} });
  assert.equal(r.status, "skipped");
  assert.equal(r.run, undefined);
});

test("shadow ON → completes and returns an AnalyticalRun (never user-facing)", () => {
  const r = runStudioShadow(studioInput, { runId: "r", startedAt: "T0", completedAt: "T1" }, { env: { ANALYTICAL_CORE_SHADOW_ENABLED: "true" } });
  assert.equal(r.status, "completed");
  assert.ok(r.run);
  assert.equal(r.run!.source.id, "survey-1");
  assert.ok(r.run!.summaries.candidatesGenerated >= 1);
});

test("a Core failure is isolated — shadow returns 'failed' and NEVER throws", () => {
  const throwingJudge: PipelineOptions = { groupingProposer: { propose() { throw new Error("boom"); } } };
  const r = runStudioShadow(studioInput, { runId: "r", startedAt: "T0", completedAt: "T1" }, { env: { ANALYTICAL_CORE_SHADOW_ENABLED: "true" }, pipeline: throwingJudge });
  assert.equal(r.status, "failed");
  assert.ok(r.error && /boom/.test(r.error));
  assert.equal(r.run, undefined); // no run persisted; caller unaffected
});
