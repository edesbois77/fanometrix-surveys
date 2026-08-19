import { test } from "node:test";
import assert from "node:assert/strict";
import type { Finding } from "../findings/types";
import type { Evidence, Result, StatisticalAssessment } from "../evidence/types";
import type { ContributionKind, CitationStance } from "../vocabulary";
import { proportion, percentagePoints } from "../evidence/scale";
import { assessEligibility } from "./eligibility";
import { assessConfidence } from "./confidence";
import { assessRelevance } from "./relevance";
import { assessMateriality } from "./materiality";
import { assessFindings, groupByPriority } from "./assess";

const V = { standardVersion: "1.1", coreVersion: "0.1.0", runProvenance: null };
function ev(id: string, base: number, opts: { contribution?: ContributionKind; stance?: CitationStance; question?: string; option?: string } = {}): Evidence {
  return { id, kind: "base", contribution: opts.contribution ?? "elicited_perception", stance: opts.stance, sourceType: "survey", sourceId: "s", question: { canonicalKey: opts.question ?? "q1" }, option: { id: opts.option ?? id }, numerator: Math.round(base / 2), denominator: base, denominatorType: "respondents", quantity: proportion(0.5) };
}
function mk(o: Partial<Finding> & { statement: string }): Finding {
  return { id: "f", evidence: [ev("e1", 274)], version: V, status: "candidate", ...o } as Finding;
}

// ── Eligibility ───────────────────────────────────────────────────────────────
test("eligibility: blocking governance violation → ineligible", () => {
  const f = mk({ statement: "Weak visibility caused low awareness.", assertionType: "causal", evidence: [ev("e1", 274)] });
  assert.equal(assessEligibility(f).level, "ineligible");
});
test("eligibility: advisory issue → eligible_with_caveat, not ineligible", () => {
  const f = mk({ statement: "The UK is the most popular market.", assertionType: "descriptive" });
  const el = assessEligibility(f);
  assert.equal(el.level, "eligible_with_caveat");
  assert.notEqual(el.level, "ineligible");
});
test("eligibility: no evidence → unable_to_assess; clean valid → eligible", () => {
  assert.equal(assessEligibility(mk({ statement: "x", evidence: [] })).level, "unable_to_assess");
  assert.equal(assessEligibility(mk({ statement: "Live matches lead the distribution.", assertionType: "descriptive" })).level, "eligible");
});

// ── Confidence ────────────────────────────────────────────────────────────────
const supported: StatisticalAssessment = { status: "supported", method: "two_proportion_z", confidenceLevel: 95, pValue: 0.01, observedDifferencePp: 12, assumptions: [], caveats: [] };
const notSupported: StatisticalAssessment = { ...supported, status: "not_supported", pValue: 0.4 };
const notAssessed: StatisticalAssessment = { ...supported, status: "not_assessed", pValue: null };

test("confidence: strong direct evidence + adequate base → high; low base constrains", () => {
  assert.equal(assessConfidence(mk({ statement: "s", assertionType: "descriptive", evidence: [ev("e1", 274), ev("e2", 274, { option: "b" })] })).level, "high");
  assert.equal(assessConfidence(mk({ statement: "s", assertionType: "descriptive", evidence: [ev("e1", 25)] })).level, "low");
});
test("confidence: supported test strengthens a comparative; not_supported → unsupported; not_assessed ≠ failed", () => {
  assert.equal(assessConfidence(mk({ statement: "s", assertionType: "comparative", evidence: [ev("e1", 200), ev("e2", 200, { option: "b" })], statisticalAssessment: supported })).level, "high");
  assert.equal(assessConfidence(mk({ statement: "s", assertionType: "comparative", evidence: [ev("e1", 200)], statisticalAssessment: notSupported })).level, "unsupported");
  const na = assessConfidence(mk({ statement: "s", assertionType: "comparative", evidence: [ev("e1", 200), ev("e2", 200, { option: "b" })], statisticalAssessment: notAssessed }));
  assert.notEqual(na.level, "unsupported");
});
test("confidence: contesting evidence reduces confidence; causal on one kind is unsupported", () => {
  const contested = assessConfidence(mk({ statement: "s", assertionType: "descriptive", evidence: [ev("e1", 274), ev("e2", 274, { option: "b", stance: "contests" })] }));
  assert.notEqual(contested.level, "high");
  assert.equal(assessConfidence(mk({ statement: "s", assertionType: "causal", evidence: [ev("e1", 274)] })).level, "unsupported");
});

// ── Materiality ───────────────────────────────────────────────────────────────
const noCtx = {};
const objCtx = { objective: "Understand fan perception and what value and access sponsorship offers to fans." };
const comp = (pp: number): Result => ({ id: "c", operation: "comparison", quantity: percentagePoints(pp) });

test("materiality: magnitude alone does not guarantee high; explanatory value + relevance lead", () => {
  // Big magnitude but no objective context and only a leading-option → not high.
  const big = mk({ statement: "Option A leads.", assertionType: "descriptive", evidence: [ev("e1", 274)], results: [comp(20)] });
  const rel = assessRelevance(big, noCtx);
  assert.notEqual(assessMateriality(big, rel, noCtx).level, "high");
  // A cross-question synthesis with objective overlap → high.
  const synth = mk({ statement: "Fans favour value and access across sponsorship offers.", assertionType: "descriptive", questions: ["q_offer", "q_help"], evidence: [ev("e1", 274, { question: "q_offer" }), ev("e2", 274, { question: "q_help", option: "b" })] });
  assert.equal(assessMateriality(synth, assessRelevance(synth, objCtx), objCtx).level, "high");
});
test("materiality: missing objective does not fabricate relevance (unable), and high confidence ≠ high materiality", () => {
  const f = mk({ statement: "Option A leads.", assertionType: "descriptive", evidence: [ev("e1", 274)] });
  assert.equal(assessRelevance(f, noCtx).level, "unable_to_assess");
  assert.notEqual(assessMateriality(f, assessRelevance(f, noCtx), noCtx).level, "high");
});

// ── Ranking ───────────────────────────────────────────────────────────────────
test("ranking: ineligible cannot be primary; priorities are categories only", () => {
  const set: Finding[] = [
    { ...mk({ statement: "Weak visibility caused awareness.", assertionType: "causal" }), id: "bad" },
    { ...mk({ statement: "Live matches lead general sponsor expectations across the distribution.", assertionType: "descriptive", questions: ["q_offer"], evidence: [ev("e1", 274), ev("e2", 274, { option: "b" }), ev("e3", 274, { option: "c" })] }), id: "good" },
  ];
  const a = assessFindings(set, objCtx);
  const byId = new Map(a.map((x) => [x.findingId, x]));
  assert.equal(byId.get("bad")!.priority, "suppressed");
  assert.notEqual(byId.get("good")!.priority, "suppressed");
  for (const x of a) assert.ok(["primary", "secondary", "contextual", "suppressed"].includes(x.priority));
});
test("ranking: a synthesis (high explanatory value) can outrank a repetitive observation", () => {
  const set: Finding[] = [
    { ...mk({ statement: "Fans favour value and access across sponsorship offers.", assertionType: "descriptive", questions: ["q_offer", "q_help"], evidence: [ev("e1", 274, { question: "q_offer" }), ev("e2", 274, { question: "q_help", option: "b" })] }), id: "synth" },
    { ...mk({ statement: "One option leads a single question.", assertionType: "descriptive", questions: ["q_x"], evidence: [ev("e9", 274, { question: "q_x" })] }), id: "obs" },
  ];
  const byId = new Map(assessFindings(set, objCtx).map((x) => [x.findingId, x]));
  const order = { primary: 0, secondary: 1, contextual: 2, suppressed: 3 };
  assert.ok(order[byId.get("synth")!.priority] <= order[byId.get("obs")!.priority]);
});
test("groupByPriority returns the four classes", () => {
  const g = groupByPriority([], []);
  assert.deepEqual(Object.keys(g).sort(), ["contextual", "primary", "secondary", "suppressed"]);
});
