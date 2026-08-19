import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSynthesis, validateSynthesisClaim, buildSynthesisCandidate, FixtureSynthesisProposer, type SynthesisProposal } from "./synthesis";
import type { Candidate } from "../candidates/types";

const cand = (id: string, q: string): Candidate => ({ id, kind: "leading_option", claim: id, sourceQuestionKeys: [q], evidence: [{ id: `${q}:x`, kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s" }], provenance: { generator: "t", deterministic: true, modelProposed: false }, reviewRequirements: [], state: "generated" });
const byId = new Map([["a", cand("a", "q1")], ["b", cand("b", "q2")]]);

test("a synthesis must span ≥2 questions, cite real components, and assert NO new percentage", () => {
  const good: SynthesisProposal = { id: "s", claim: "Across questions fans favour value and access.", construct: "value/access", questionKeys: ["q1", "q2"], componentCandidateIds: ["a", "b"] };
  assert.equal(validateSynthesis(good, byId).ok, true);
  const withPct: SynthesisProposal = { ...good, claim: "69.3% of fans value benefits and access." };
  assert.equal(validateSynthesis(withPct, byId).ok, false); // cross-question percentage prohibited
  const oneQ: SynthesisProposal = { ...good, questionKeys: ["q1"] };
  assert.equal(validateSynthesis(oneQ, byId).ok, false);
});

test("build: a synthesis retains provenance + derivedFrom, creates no percentage, is never model-elevated (5R.6)", () => {
  const p: SynthesisProposal = { id: "s", claim: "Fans favour value and access across offers.", construct: "value/access", questionKeys: ["q1", "q2"], componentCandidateIds: ["a", "b"] };
  assert.equal(validateSynthesis(p, byId).ok, true);
  assert.equal(validateSynthesisClaim(p, [byId.get("a")!, byId.get("b")!]).ok, true); // descriptive → supported
  // The model proposer is non-authoritative: it forms a story or abstains.
  const proposer = new FixtureSynthesisProposer({ s: { formsStory: true, ambiguity: "low", rationale: [] } });
  assert.equal(proposer.propose(p).formsStory, true);
  assert.equal(proposer.propose({ ...p, id: "unknown" }).formsStory, false); // abstains
  const c = buildSynthesisCandidate(p, [byId.get("a")!, byId.get("b")!]);
  assert.equal(c.kind, "cross_question_synthesis");
  assert.deepEqual(c.derivedFromCandidates, ["a", "b"]);
  assert.ok(!(c.results ?? []).some((r) => !!r.quantity)); // no new percentage
  assert.equal(c.synthesisElevation, undefined);          // never elevated by the model
  assert.equal(c.provenance.modelProposed, true);
});

test("claim-aware: a causal synthesis over elicited-perception components is unsupported; a temporal one needs governed change", () => {
  const base: SynthesisProposal = { id: "s", claim: "story", construct: "c", questionKeys: ["q1", "q2"], componentCandidateIds: ["a", "b"] };
  const comps = [byId.get("a")!, byId.get("b")!];
  assert.equal(validateSynthesisClaim({ ...base, claimType: "causal" }, comps).unsupported, "causal");
  assert.equal(validateSynthesisClaim({ ...base, claimType: "predictive" }, comps).unsupported, "causal");
  assert.equal(validateSynthesisClaim({ ...base, claimType: "temporal" }, comps).unsupported, "temporal");
  assert.equal(validateSynthesisClaim({ ...base, assertsSignificance: true }, comps).unsupported, "statistical");
});
