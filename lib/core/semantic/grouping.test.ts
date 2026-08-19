import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGroupingStructure, FixtureGroupingProposer, verdictToProposal, type GroupingVerdict } from "./grouping";
import type { Candidate } from "../candidates/types";
import { proportion } from "../evidence/scale";

const ev = (q: string, id: string, num: number, base: number) => ({ id: `${q}:${id}`, kind: "base" as const, contribution: "elicited_perception" as const, sourceType: "survey" as const, sourceId: "s", question: { canonicalKey: q }, option: { id }, numerator: num, denominator: base, denominatorType: "respondents" as const, quantity: proportion(num / base) });
const grpCandidate = (evs: ReturnType<typeof ev>[], value: number, labels: string[]): Candidate => ({
  id: "g", kind: "semantic_grouping", claim: "grp", sourceQuestionKeys: [evs[0].question.canonicalKey], evidence: evs,
  results: [{ id: "r", operation: "grouping", quantity: proportion(value), components: evs.map((e) => e.id), grouping: { kind: "governed_semantic", componentLabels: labels, parentConstruct: "(unverified)" } }],
  provenance: { generator: "t", deterministic: true, modelProposed: false }, reviewRequirements: [], state: "held_for_semantic_review",
});

test("structural validation: same-question grouping is valid (any value — no hard-coding)", () => {
  const g646 = grpCandidate([ev("q", "a", 92, 274), ev("q", "b", 85, 274)], 177 / 274, ["A", "B"]);
  const g558 = grpCandidate([ev("q", "b", 85, 274), ev("q", "c", 68, 274)], 153 / 274, ["B", "C"]);
  assert.equal(validateGroupingStructure(g646).ok, true); // 64.6 structurally valid
  assert.equal(validateGroupingStructure(g558).ok, true); // 55.8 ALSO structurally valid — semantics decide
});

test("structural validation rejects cross-question, double-count and denominator mismatch", () => {
  assert.equal(validateGroupingStructure(grpCandidate([ev("q1", "a", 10, 100), ev("q2", "b", 20, 100)], 0.3, ["A", "B"])).ok, false);
  assert.equal(validateGroupingStructure(grpCandidate([ev("q", "a", 10, 100), ev("q", "a", 10, 100)], 0.2, ["A", "A"])).ok, false);
  assert.equal(validateGroupingStructure(grpCandidate([ev("q", "a", 10, 100), ev("q", "b", 20, 80)], 0.3, ["A", "B"])).ok, false);
});

test("the model is a non-authoritative proposer: it proposes a construct or abstains; no field grants authority (5R.5)", () => {
  const proposer = new FixtureGroupingProposer({ g: { proposedConstruct: "some relevance", ambiguity: "low", competingInterpretations: false, rationale: [] } });
  assert.equal(proposer.propose({ candidateId: "g", questionText: "", componentLabels: [] }).proposedConstruct, "some relevance");
  // An unknown candidate ABSTAINS (offers no construct) — nothing is invented.
  assert.equal(proposer.propose({ candidateId: "unknown", questionText: "", componentLabels: [] }).proposedConstruct, null);
  // Legacy verdict → proposal: an affirmed construct becomes a proposal; a "no"
  // coherence becomes abstention; `humanReviewRequired` is ignored (no approval role).
  const coherent: GroupingVerdict = { constructCoherent: "yes", labelFaithful: "yes", informationGain: "yes", competingRisk: "low", humanReviewRequired: false, construct: "some relevance", reasons: [] };
  assert.equal(verdictToProposal(coherent).proposedConstruct, "some relevance");
  const incoherent: GroupingVerdict = { constructCoherent: "no", labelFaithful: "no", informationGain: "unclear", competingRisk: "high", humanReviewRequired: false, reasons: [] };
  assert.equal(verdictToProposal(incoherent).proposedConstruct, null);
});
