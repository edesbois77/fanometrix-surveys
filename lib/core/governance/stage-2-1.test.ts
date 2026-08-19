// Stage 2.1 — canonical policy resolution + precedence + first-class evidence
// contribution. Deterministic, no live AI.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProse, validateFinding } from "./validators";
import type { GovernanceContext } from "./types";
import type { Finding } from "../findings/types";
import type { ContributionKind } from "../vocabulary";
import { fromRpFinding } from "../adapters/rp-finding";
import { fromStudyFinding } from "../adapters/study-finding";
import type { FindingRow, EvidenceRow } from "@/lib/analysis/finding-store";

const has = (issues: { ruleId: string }[], id: string) => issues.some((i) => i.ruleId === id);
const blocking = (issues: { ruleId: string; blocking: boolean }[], id: string) => issues.some((i) => i.ruleId === id && i.blocking);

// ── Causation precedence ──────────────────────────────────────────────────────
test("causation: blocked without causal support; allowed with governed causal support", () => {
  const claim = "Weak visibility caused low awareness.";
  assert.ok(blocking(validateProse(claim), "unsupported_causation"));
  assert.ok(!has(validateProse(claim, { causalSupportEstablished: true }), "unsupported_causation"));
});

test("causation: preference rephrased as a causal outcome is blocked", () => {
  // No explicit 'cause' verb, but an outcome is asserted from a preference.
  const claim = "Providing experiences will improve engagement.";
  assert.ok(blocking(validateProse(claim), "preference_to_outcome_leap"));
});

// ── Temporal precedence ───────────────────────────────────────────────────────
test("temporal: 'declined' blocked for dataset_difference; allowed for comparable_change", () => {
  assert.ok(blocking(validateProse("Interest declined.", { changeState: "dataset_difference" }), "unsupported_trend"));
  assert.ok(!has(validateProse("Interest declined.", { changeState: "comparable_change" }), "unsupported_trend"));
});

test("temporal: 'trend' needs a governed trend state, not merely comparable_change", () => {
  assert.ok(blocking(validateProse("Awareness shows a rising trend.", { changeState: "comparable_change" }), "unsupported_trend"));
  assert.ok(!has(validateProse("Awareness shows a rising trend.", { changeState: "trend" }), "unsupported_trend"));
});

test("temporal: broadened vocabulary catches 'collapsed' and 'shrank'", () => {
  assert.ok(has(validateProse("Interest in grassroots collapsed."), "unsupported_trend"));
  assert.ok(has(validateProse("The audience shrank."), "unsupported_trend"));
});

// ── Significance ──────────────────────────────────────────────────────────────
test("significance: statistical wording allowed only with a supported test", () => {
  const claim = "There is a significant difference between markets.";
  assert.ok(blocking(validateProse(claim, { statisticalAssessment: { status: "not_assessed", method: "two_proportion_z", confidenceLevel: 95, pValue: null, observedDifferencePp: null, assumptions: [], caveats: [] } }), "unsupported_statistical_language"));
  assert.ok(!has(validateProse(claim, { statisticalAssessment: { status: "supported", method: "two_proportion_z", confidenceLevel: 95, pValue: 0.01, observedDifferencePp: 12, assumptions: [], caveats: [] } }), "unsupported_statistical_language"));
});

test("significance: colloquial 'a significant proportion' is an advisory wording issue, not a statistical claim", () => {
  const issues = validateProse("A significant proportion of fans chose live matches.");
  assert.ok(has(issues, "imprecise_significance_wording"));
  assert.ok(!has(issues, "unsupported_statistical_language"));
  assert.ok(!issues.find((i) => i.ruleId === "imprecise_significance_wording")!.blocking); // advisory
});

// ── Respondent inference ──────────────────────────────────────────────────────
test("respondent: association allowed with governed respondent evidence; causal reading still blocked", () => {
  const assoc = "Those who chose live matches were more likely to want experiences.";
  assert.ok(blocking(validateProse(assoc), "aggregate_to_respondent_inference"));
  assert.ok(!has(validateProse(assoc, { hasRespondentEvidence: true }), "aggregate_to_respondent_inference"));
  // A causal reading of the relationship stays blocked even with respondent evidence.
  const causal = "Choosing live matches caused fans to want experiences.";
  assert.ok(blocking(validateProse(causal, { hasRespondentEvidence: true }), "unsupported_causation"));
});

// ── Recommendation / outcome ──────────────────────────────────────────────────
test("recommendation: 'consider testing' allowed; unsupported action→outcome blocked", () => {
  assert.ok(validateProse("Consider testing experience-led activation.").length === 0);
  assert.ok(blocking(validateProse("Use experiences to improve perception."), "preference_to_outcome_leap"));
  assert.ok(!has(validateProse("Use experiences to improve perception.", { outcomeEvidenceEstablished: true }), "preference_to_outcome_leap"));
});

// ── Evidence contribution role (first-class) ──────────────────────────────────
function finding(assertionType: string, contributions: (ContributionKind | undefined)[]): Finding {
  return {
    id: "f", statement: "A claim.", assertionType,
    evidence: contributions.map((c, i) => ({ id: `e${i}`, kind: "base" as const, contribution: c })),
    version: { standardVersion: "1.1", coreVersion: "0.1.0", runProvenance: null }, status: "candidate",
  };
}

test("claim-strength uses the canonical contribution field, not RP sourceMeta", () => {
  assert.ok(has(validateFinding(finding("causal", ["elicited_perception"])), "claim_exceeds_evidence"));
  assert.ok(!has(validateFinding(finding("causal", ["elicited_perception", "documented_activity"])), "claim_exceeds_evidence"));
  assert.ok(!has(validateFinding(finding("descriptive", ["elicited_perception"])), "claim_exceeds_evidence"));
});

test("RP adapter maps contribution + stance; Studio adapter maps definitional contribution; unavailable stays absent", () => {
  const row = { id: "f1", research_project_id: "p", requirement_key: "r", requirement_text: "", need_id: "n", need_text: "", aspect: null, statement: "s", assertion_type: "descriptive", scope: null, temporal_validity: "point_in_time", warrant: null, reading: null, is_null: false, confidence_level: "High", evidence_strength: "moderate", assessment: {}, disconfirmed: false, disconfirmation: {}, rank: 1, status: "candidate", authored_by: "engine", version: 1, run_id: "run", model: null, matrix_version: 1, assertion_taxonomy_version: 1 } as FindingRow;
  const ev = [{ finding_id: "f1", evidence_ref: "obs1", stance: "establishes", admissibility: "admissible", constraint_note: null, contribution_kind: "unprompted_discourse", evidence_role: "direct", observation_key: "k", observations: 1, bearing: 0.8, rejected: false, rejected_reason: null, snippet: null, provenance: null }] as EvidenceRow[];
  const rp = fromRpFinding(row, ev);
  assert.equal(rp.evidence[0].contribution, "unprompted_discourse");
  assert.equal(rp.evidence[0].stance, "establishes");

  const studio = fromStudyFinding(
    { id: "s", study_id: "st", headline: "h", status: "published" },
    [{ evidenceClass: "base", ref: "e1", optionLabel: "x", count: 5, base: 50, percentage: 0.1 }],
  );
  assert.equal(studio.evidence[0].contribution, "elicited_perception"); // definitional
  assert.equal(studio.evidence[0].stance, undefined);                    // Studio models no stance
});

// ── Future-product reasoning (proves the vocabulary is not survey-only) ───────
test("future products: the same rules govern social / document / qualitative evidence", () => {
  // Social listening: a volume 'rose' claim needs a governed change state.
  assert.ok(blocking(validateProse("Conversation volume rose 40%."), "unsupported_trend"));
  assert.ok(!has(validateProse("Conversation volume rose 40%.", { changeState: "comparable_change" }), "unsupported_trend"));
  // Honesty: 'became more negative' carries no change VERB, so the lexical trend
  // rule does not catch it — this is a semantic magnitude/change claim that needs
  // the model-assisted tier, not a false claim of deterministic coverage.
  assert.ok(!has(validateProse("Fans became more negative."), "unsupported_trend"));
  // Documents: a doc that CLAIMS an increase is interested_claim evidence, not proof.
  const docFinding: Finding = {
    id: "d", statement: "Awareness increased, per the report.", assertionType: "temporal",
    evidence: [{ id: "e0", kind: "base", contribution: "interested_claim", sourceType: "document", sourceId: "doc1" }],
    version: { standardVersion: "1.1", coreVersion: "0.1.0", runProvenance: null }, status: "candidate",
  };
  // Temporal claim on a single interested_claim source with no change state → flagged.
  assert.ok(has(validateFinding(docFinding, { changeState: "dataset_difference" }), "unsupported_trend"));
  // Qualitative: "several participants mentioned X" is fine; "fans generally prefer X" would be an over-generalisation caught elsewhere (magnitude).
  assert.equal(validateProse("Several participants mentioned experiences.").length, 0);
});
