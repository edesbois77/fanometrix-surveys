import { test } from "node:test";
import assert from "node:assert/strict";
import { assessDisconfirmation } from "./assess";
import type { Candidate } from "../candidates/types";
import type { CitationStance } from "../vocabulary";

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  id: "c", kind: "distribution_shape", claim: "x", sourceQuestionKeys: ["q"],
  evidence: [{ id: "e1", kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", denominator: 274 }],
  provenance: { generator: "t", deterministic: true, modelProposed: false }, reviewRequirements: [], state: "generated", ...over,
});
const withStance = (s: CitationStance): Candidate => cand({ evidence: [{ id: "e1", kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", denominator: 274, stance: s }] });

test("contesting evidence contradicts; qualifying evidence qualifies", () => {
  assert.equal(assessDisconfirmation(withStance("contests")).status, "contradicted");
  assert.equal(assessDisconfirmation(withStance("qualifies")).status, "qualified");
});

test("a weak lead materially weakens a leadership claim", () => {
  const c = cand({ kind: "leading_option", signals: { leadPp: 3, band: "negligible", baseMin: 274 } });
  assert.equal(assessDisconfirmation(c).status, "materially_weakened");
});

test("a small base qualifies / weakens", () => {
  assert.equal(assessDisconfirmation(cand({ signals: { baseMin: 25 }, evidence: [{ id: "e", kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", denominator: 25 }] })).status, "qualified");
});

test("unresolved wave comparability qualifies a wave difference", () => {
  const c = cand({ kind: "wave_difference", change: { state: "dataset_difference", comparability: "not_comparable" }, signals: { baseMin: 78 } });
  assert.equal(assessDisconfirmation(c).status, "qualified");
});

test("none_found is NOT proof of absence — it requires review and says so", () => {
  const a = assessDisconfirmation(cand());
  assert.equal(a.status, "none_found");
  assert.equal(a.reviewRequired, true);
  assert.ok(a.reasons.some((r) => /not proof/i.test(r)));
});
