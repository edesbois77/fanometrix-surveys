// ── Research Reasoner — orchestration service (fake model; no live OpenAI) ───
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateResearchIntelligence } from "./service";
import type { ReasonerCaller } from "./model";

const SNAP = {
  study: { name: "T", objective: null, completedResponses: 196, respondentUniquenessProven: false },
  evidence: [
    { ref: "r1", scope: "combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Strong fit", count: 62, base: 196, percentage: 0.316 },
    { ref: "r2", scope: "combined", canonicalQuestionKey: "q1", question: "Fit?", optionLabel: "Never noticed", count: 53, base: 196, percentage: 0.27 },
  ],
  derived: [], segmentDerived: [],
};
const caller = (parsed: unknown): ReasonerCaller => async () => ({ parsed, usage: { totalTokens: 100 }, latencyMs: 5, model: "o3" });

test("a clean model output → completed + displayable, with verified insights and usage recorded", async () => {
  const a = await generateResearchIntelligence({ snapshot: SNAP, coreFindings: [], caller: caller({
    executiveStory: { headline: "Perception is split", summary: "Strong fit 31.6%, never noticed 27%.", evidenceRefs: ["e1", "e2"] },
    insights: [{ id: "s", title: "Split", type: "synthesis", statement: "Strong fit 31.6% vs never noticed 27%.", whyItMatters: "recognition gap", evidenceRefs: ["e1", "e2"], counterEvidenceRefs: [], confidence: "high", caveat: "" }],
    supportingObservations: [], tensions: [], openQuestions: [], cannotConclude: ["No causal claims."],
  }) });
  assert.equal(a.status, "completed");
  assert.equal(a.displayable, true);
  assert.equal(a.product.keyInsights.length, 1);
  assert.equal(a.usage.totalTokens, 100);
  assert.equal(a.model, "o3");
});

test("adversarial output: fabrications are rejected and never surface in the product", async () => {
  const a = await generateResearchIntelligence({ snapshot: SNAP, coreFindings: [], caller: caller({
    executiveStory: { headline: "Clean", summary: "Strong fit is 31.6%.", evidenceRefs: ["e1"] },
    insights: [
      { id: "x1", title: "fab num", type: "synthesis", statement: "72% love it.", whyItMatters: "x", evidenceRefs: ["e1"], counterEvidenceRefs: [], confidence: "high", caveat: "" },
      { id: "x2", title: "fab ref", type: "interpretation", statement: "Germany leads.", whyItMatters: "x", evidenceRefs: ["e999"], counterEvidenceRefs: [], confidence: "high", caveat: "" },
    ],
    supportingObservations: [], tensions: [], openQuestions: [], cannotConclude: [],
  }) });
  assert.equal(a.product.keyInsights.length, 0, "no fabricated insight survives");
  assert.ok(a.audit.verification.counts.reject >= 2);
  assert.ok(!JSON.stringify(a.product).includes("72%") && !JSON.stringify(a.product).includes("e999"));
});

test("the artefact stores NO chain-of-thought — only product + verification + provenance", async () => {
  const a = await generateResearchIntelligence({ snapshot: SNAP, coreFindings: [], caller: caller({
    executiveStory: { headline: "Clean", summary: "Strong fit is 31.6%.", evidenceRefs: ["e1"] },
    insights: [], supportingObservations: [], tensions: [], openQuestions: [], cannotConclude: [],
  }) });
  const keys = Object.keys(a);
  assert.deepEqual(new Set(keys), new Set(["status", "displayable", "product", "audit", "model", "usage", "latencyMs", "versions"]));
  assert.ok(!JSON.stringify(a).match(/chain.?of.?thought|reasoning_trace|scratchpad/i));
});

test("a malformed model output (no executiveStory) throws a permanent (422) error, not a crash", async () => {
  await assert.rejects(
    generateResearchIntelligence({ snapshot: SNAP, coreFindings: [], caller: caller({ nonsense: true }) }),
    (e: unknown) => (e as { status?: number }).status === 422,
  );
});
