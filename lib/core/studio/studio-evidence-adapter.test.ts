// ── Stage 5C — Studio evidence_snapshot → Core governed input (deterministic) ──
import { test } from "node:test";
import assert from "node:assert/strict";
import { studioEvidenceToGovernedInput, type StudioEvidenceSnapshot } from "./studio-evidence-adapter";
import { studioToDiscoveryInput } from "./adapter";
import { runAnalysis } from "../pipeline/analyse";
import { FixtureGroupingProposer } from "../semantic";

const snapshot: StudioEvidenceSnapshot = {
  study: { id: "STU1", objective: "Understand sponsor fit." },
  evidence: [
    { canonicalQuestionKey: "q_fit", question: "Fit?", scope: "combined", optionId: "a", optionLabel: "Strong", count: 92, base: 274 },
    { canonicalQuestionKey: "q_fit", question: "Fit?", scope: "combined", optionId: "b", optionLabel: "Unclear", count: 85, base: 274 },
    { canonicalQuestionKey: "q_fit", question: "Fit?", scope: "combined", optionId: "c", optionLabel: "None", count: 97, base: 274 },
    // survey-scoped rows are per-source detail — must be ignored as separate questions.
    { canonicalQuestionKey: "q_fit", question: "Fit?", scope: "survey", optionId: "a", optionLabel: "Strong", count: 62, base: 196 },
  ],
};

test("preserves ids/labels/counts/base; uses only combined-scope; no scale conversion", () => {
  const gi = studioEvidenceToGovernedInput(snapshot, { kind: "study", id: "STU1" });
  assert.equal(gi.source.id, "STU1");
  assert.equal(gi.objective, "Understand sponsor fit.");
  assert.equal(gi.questions.length, 1);               // survey-scoped row did not add a question
  const q = gi.questions[0];
  assert.equal(q.canonicalQuestionKey, "q_fit");
  assert.equal(q.base, 274);
  assert.deepEqual(q.options.map((o) => [o.optionId, o.count]), [["a", 92], ["b", 85], ["c", 97]]);
});

test("no governed semantic metadata is fabricated (production has none → Core will abstain)", () => {
  const gi = studioEvidenceToGovernedInput(snapshot, { kind: "study", id: "STU1" });
  const di = studioToDiscoveryInput(gi);
  assert.equal(di.questions[0].semantics, undefined); // no constructId/scale/polarity invented
});

test("end-to-end: a model-only grouping over real Studio input stays PROVISIONAL, never Primary", () => {
  const gi = studioEvidenceToGovernedInput(snapshot, { kind: "study", id: "STU1" });
  const di = studioToDiscoveryInput(gi);
  // With no governed metadata the generator's top-2 grouping (a+c) is entailment-unable;
  // even if the model proposes a construct it is PROVISIONAL and capped at Contextual.
  const o = runAnalysis(di, { groupingProposer: new FixtureGroupingProposer({ "q_fit#grouping": { proposedConstruct: "some fit", ambiguity: "low", competingInterpretations: false, rationale: [] } }) })
    .outcomes.find((x) => x.candidate.id === "q_fit#grouping");
  if (o) {
    const interp = (o.candidate.results ?? []).map((r) => r.interpretation).find(Boolean);
    assert.notEqual(interp?.authority, "derived");
    assert.notEqual(o.priority, "primary");
  }
});
