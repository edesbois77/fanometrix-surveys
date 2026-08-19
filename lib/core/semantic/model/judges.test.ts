// Real semantic adapter behaviour WITHOUT a live model — the `complete` fn is
// injected (mock). Proves validation, safe degradation and provenance capture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGroupingVerdicts } from "./judges";
import type { Candidate } from "../../candidates/types";
import { proportion } from "../../evidence/scale";

function grouping(id: string): Candidate {
  return {
    id, kind: "semantic_grouping", claim: "grp", sourceQuestionKeys: ["q"],
    evidence: [{ id: "q:a", kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", question: { canonicalKey: "q", text: "Q?" }, option: { id: "a" } }],
    results: [{ id: "r", operation: "grouping", quantity: proportion(0.6), components: ["q:a", "q:b"], grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "(unverified)" } }],
    derivation: { operation: "grouping", componentIds: ["q:a", "q:b"] },
    provenance: { generator: "t", deterministic: true, modelProposed: false }, reviewRequirements: [], state: "held_for_semantic_review",
  };
}

test("a valid model verdict is used and provenance is captured with the rubric version", async () => {
  const complete = async () => ({ constructCoherent: "yes", labelFaithful: "yes", informationGain: "yes", competingRisk: "low", humanReviewRequired: false, construct: "a construct", reasons: ["ok"] });
  const { verdicts, provenance } = await resolveGroupingVerdicts([grouping("g1")], "obj", complete as never);
  assert.equal(verdicts["g1"].constructCoherent, "yes");
  assert.equal(provenance[0].outcome, "used");
  assert.equal(provenance[0].rubricVersion, "grouping_semantic_v1");
  assert.equal(provenance[0].validationPassed, true);
});

test("a model failure degrades safely to HELD (deterministic default), captured in provenance", async () => {
  const complete = async () => { throw new Error("model down"); };
  const { verdicts, provenance } = await resolveGroupingVerdicts([grouping("g2")], "obj", complete as never);
  assert.equal(verdicts["g2"].humanReviewRequired, true);
  assert.equal(provenance[0].outcome, "held");
  assert.equal(provenance[0].validationPassed, false);
});

test("invalid model output (introduced number) is rejected → HELD, not silently used", async () => {
  const complete = async () => ({ constructCoherent: "yes", labelFaithful: "yes", informationGain: "yes", competingRisk: "low", humanReviewRequired: false, reasons: ["they sum to 60%"] });
  const { verdicts, provenance } = await resolveGroupingVerdicts([grouping("g3")], "obj", complete as never);
  assert.equal(verdicts["g3"].humanReviewRequired, true); // held
  assert.equal(provenance[0].validationPassed, false);
});
