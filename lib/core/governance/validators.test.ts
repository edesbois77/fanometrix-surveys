import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProse, validateResult, validateFinding } from "./validators";
import type { GovernanceContext } from "./types";
import type { Finding } from "../findings/types";
import type { Result } from "../evidence/types";
import { proportion, percentagePoints } from "../evidence/scale";

const has = (issues: { ruleId: string }[], id: string) => issues.some((i) => i.ruleId === id);

// Representative FedEx source options (0–100 pp) for cross-question detection.
const SOURCE_OPTIONS = [
  { question: "q_offer", option: "rewards", pct: 36.5 },
  { question: "q_offer", option: "experiences", pct: 21.9 },
  { question: "q_help", option: "experiences_access", pct: 32.8 },
  { question: "q_help", option: "connecting", pct: 24.5 },
  { question: "q_fit", option: "strong_fit", pct: 33.6 },
  { question: "q_fit", option: "relevant_unclear", pct: 31.0 },
];

// ── Causality ─────────────────────────────────────────────────────────────────
test("causality: forbidden causal language is flagged; legitimate association is not", () => {
  assert.ok(has(validateProse("The sponsorship drove brand loyalty."), "unsupported_causation"));
  assert.ok(has(validateProse("Awareness is low because of weak visibility."), "unsupported_causation"));
  assert.ok(!has(validateProse("Rewards and experiences are both valued by fans."), "unsupported_causation"));
});

test("causality: recommendation/outcome overreach is flagged", () => {
  const issues = validateProse("FedEx should invest in experiences to drive engagement.");
  assert.ok(has(issues, "unsupported_recommendation_outcome"));
  assert.ok(has(issues, "preference_to_outcome_leap"));
});

// ── Trend / change ────────────────────────────────────────────────────────────
test("trend: unsupported change language flagged; descriptive comparison is not", () => {
  assert.ok(has(validateProse("Interest in grassroots declined since last year."), "unsupported_trend"));
  assert.ok(!has(validateProse("Survey 1 and Survey 2 differ on grassroots."), "unsupported_trend"));
});

// ── Respondent inference ──────────────────────────────────────────────────────
test("respondent: 'those who…' flagged without respondent evidence; allowed with it", () => {
  const claim = "Those who chose live matches were more likely to want experiences.";
  assert.ok(has(validateProse(claim), "aggregate_to_respondent_inference"));
  const ctx: GovernanceContext = { hasRespondentEvidence: true };
  assert.ok(!has(validateProse(claim, ctx), "aggregate_to_respondent_inference"));
});

// ── Statistical language ──────────────────────────────────────────────────────
test("statistical: 'statistically significant' allowed only when the test is supported", () => {
  const claim = "Live matches lead by a statistically significant margin.";
  assert.ok(!has(validateProse(claim, { statisticalAssessment: { status: "supported", method: "two_proportion_z", confidenceLevel: 95, pValue: 0.01, observedDifferencePp: 10, assumptions: [], caveats: [] } }), "unsupported_statistical_language"));
  assert.ok(has(validateProse(claim, { statisticalAssessment: { status: "not_assessed", method: "two_proportion_z", confidenceLevel: 95, pValue: null, observedDifferencePp: null, assumptions: [], caveats: [] } }), "unsupported_statistical_language"));
  assert.ok(has(validateProse(claim), "unsupported_statistical_language")); // no assessment supplied
});

// ── Cross-question arithmetic ─────────────────────────────────────────────────
test("cross-question: 69.3% (36.5+32.8, two questions) is a violation; same-question sum is not", () => {
  assert.ok(has(validateProse("Rewards and experiences are preferred by 69.3% of fans.", { sourceOptions: SOURCE_OPTIONS }), "cross_question_arithmetic"));
  // 64.6 = 33.6 + 31.0, both q_fit → not a cross-question sum.
  assert.ok(!has(validateProse("64.6% perceive at least some relevance.", { sourceOptions: SOURCE_OPTIONS }), "cross_question_arithmetic"));
});

// ── Grouping ──────────────────────────────────────────────────────────────────
test("grouping: a well-formed governed grouping is structurally valid; malformed is flagged", () => {
  const good: Result = {
    id: "r1", operation: "grouping", quantity: percentagePoints(64.6),
    components: ["e1", "e2"],
    grouping: { kind: "governed_semantic", componentLabels: ["Strong natural fit", "Relevant but unclear"], parentConstruct: "perceives at least some relevance" },
  };
  assert.ok(!has(validateResult(good, { sourceOptions: SOURCE_OPTIONS }), "invalid_semantic_grouping"));

  const missingConstruct: Result = { ...good, grouping: { ...good.grouping!, parentConstruct: "" } };
  assert.ok(has(validateResult(missingConstruct), "invalid_semantic_grouping"));

  const oneComponent: Result = { ...good, components: ["e1"], grouping: { ...good.grouping!, componentLabels: ["Strong natural fit"] } };
  assert.ok(has(validateResult(oneComponent), "invalid_semantic_grouping"));
});

// ── References ────────────────────────────────────────────────────────────────
test("references: invented refs flagged; valid refs pass", () => {
  assert.ok(has(validateProse("As e1 and e9 show, fit is mixed.", { governedRefs: ["e1"] }), "invalid_reference"));
  assert.ok(!has(validateProse("As e1 shows, fit is mixed.", { governedRefs: ["e1", "e9"] }), "invalid_reference"));
});

// ── Unsupported number ────────────────────────────────────────────────────────
test("unsupported number: a stat not in the governed set is flagged", () => {
  assert.ok(has(validateProse("Live leads at 58% and highlights at 88.8%.", { governedNumbers: [58, 22] }), "unsupported_number"));
  assert.ok(!has(validateProse("Live leads at 58%.", { governedNumbers: [58, 22] }), "unsupported_number"));
});

// ── Claim strength ────────────────────────────────────────────────────────────
function finding(assertionType: string, kinds: string[]): Finding {
  return {
    id: "f", statement: "A claim.", assertionType,
    evidence: kinds.map((k, i) => ({ id: `e${i}`, kind: "base" as const, sourceMeta: { contribution_kind: k } })),
    version: { standardVersion: "1.1", coreVersion: "0.1.0", runProvenance: null }, status: "candidate",
  };
}

test("claim strength: descriptive claim OK; causal on one evidence kind flagged", () => {
  assert.ok(!has(validateFinding(finding("descriptive", ["elicited_perception"])), "claim_exceeds_evidence"));
  assert.ok(has(validateFinding(finding("causal", ["elicited_perception"])), "claim_exceeds_evidence"));
  assert.ok(!has(validateFinding(finding("causal", ["elicited_perception", "documented_activity"])), "claim_exceeds_evidence"));
});

// ── Sample composition ────────────────────────────────────────────────────────
test("sample composition: factual composition OK; popularity inference flagged", () => {
  assert.ok(!has(validateProse("35% of our sample came from the UK."), "sample_composition_not_popularity"));
  assert.ok(has(validateProse("The UK is the most popular market."), "sample_composition_not_popularity"));
});

// ── Overstated leadership ─────────────────────────────────────────────────────
test("overstated leadership language is flagged", () => {
  assert.ok(has(validateProse("Strong natural fit is the dominant perception."), "overstated_leadership"));
});

// ── Enforcement labelling honesty ─────────────────────────────────────────────
test("issues record whether they were detected deterministically or heuristically", () => {
  const det = validateProse("Live leads at 88.8%.", { governedNumbers: [58] }).find((i) => i.ruleId === "unsupported_number");
  assert.equal(det?.enforcement, "deterministic");
  const heur = validateProse("The sponsorship drove loyalty.").find((i) => i.ruleId === "unsupported_causation");
  assert.equal(heur?.enforcement, "heuristic");
});
