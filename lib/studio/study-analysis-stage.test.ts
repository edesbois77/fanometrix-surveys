import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAnalysisMode, batchResultGroups, validateCandidates, stageCoverage, GROUPS_PER_BATCH, MAX_BATCHES } from "./study-analysis-stage";
import { buildStudyAnalysisEvidence, evidenceRef } from "./study-analysis";
import { buildStressStudy, STRESS_OBJECTIVE } from "./stress-fixture";
import type { StudyResultGroup } from "./study-results";
import type { OptionResult } from "./survey-results";

const opt = (id: string, label: string, count: number, base: number): OptionResult => ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });
function fakeGroups(n: number): StudyResultGroup[] {
  return Array.from({ length: n }, (_, qi) => ({
    canonicalQuestionKey: `k${qi}`, label: `Q${qi}`, comparability: "combined" as const,
    combined: { base: 100, sourceCount: 2, options: [opt("1", "A", 50, 100), opt("2", "B", 50, 100)] },
    sources: ["A", "B"].map((sid) => ({ surveyId: sid, surveyName: `S${sid}`, questionIndex: qi, questionId: `k${qi}`, canonicalQuestionKey: `k${qi}`, label: `Q${qi}`, resultMode: "studio_native" as const, completedResponses: 50, base: 50, shown: null, displayLanguage: "en", options: [opt("1", "A", 25, 50), opt("2", "B", 25, 50)] })),
  }));
}

// ── ROUTING (1-4) ────────────────────────────────────────────────────────────
test("1. a small study (few questions/evidence) → single_pass", () => {
  const ev = buildStudyAnalysisEvidence({ id: "s", name: "s", objective: null, surveyCount: 2, completedResponses: 999999, surveyIds: ["A", "B"] }, fakeGroups(3));
  assert.equal(chooseAnalysisMode(ev), "single_pass");
});

test("2. a complex study (many questions) → staged", () => {
  const ev = buildStudyAnalysisEvidence({ id: "s", name: "s", objective: null, surveyCount: 6, completedResponses: 10, surveyIds: ["A"] }, fakeGroups(8));
  assert.equal(chooseAnalysisMode(ev), "staged");
  const { study, resultGroups } = buildStressStudy();
  assert.equal(chooseAnalysisMode(buildStudyAnalysisEvidence({ ...study, objective: STRESS_OBJECTIVE }, resultGroups)), "staged");
});

test("3,4. routing is deterministic and does NOT use response count", () => {
  const groups = fakeGroups(3);
  const lo = buildStudyAnalysisEvidence({ id: "s", name: "s", objective: null, surveyCount: 2, completedResponses: 1, surveyIds: ["A"] }, groups);
  const hi = buildStudyAnalysisEvidence({ id: "s", name: "s", objective: null, surveyCount: 2, completedResponses: 5_000_000, surveyIds: ["A"] }, groups);
  assert.equal(chooseAnalysisMode(lo), chooseAnalysisMode(hi)); // response count irrelevant
  // Same call, same inputs → same result (deterministic).
  assert.equal(chooseAnalysisMode(hi), chooseAnalysisMode(hi));
});

// ── BATCHING (5-9) ───────────────────────────────────────────────────────────
test("5,6,7. every group is assigned to exactly one batch (no loss, no duplication)", () => {
  const groups = fakeGroups(13);
  const { ok, batches } = batchResultGroups(groups);
  assert.ok(ok);
  const flat = batches.flat();
  assert.equal(flat.length, groups.length);
  assert.deepEqual(flat.map((g) => g.canonicalQuestionKey).sort(), groups.map((g) => g.canonicalQuestionKey).sort());
});

test("8,9. batch size and batch count are bounded; over-large study fails safely", () => {
  const { batches } = batchResultGroups(fakeGroups(13));
  assert.ok(batches.every((b) => b.length <= GROUPS_PER_BATCH));
  assert.ok(batches.length <= MAX_BATCHES);
  const tooBig = batchResultGroups(fakeGroups(MAX_BATCHES * GROUPS_PER_BATCH + 1));
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.error ?? "", /too large/);
});

// ── STAGE-1 VALIDATION (11-19) ───────────────────────────────────────────────
const { study, resultGroups } = buildStressStudy();
const payload = buildStudyAnalysisEvidence({ ...study, objective: STRESS_OBJECTIVE }, resultGroups);
const someRef = payload.evidence[0].ref;
const combinedFit1 = evidenceRef("stress", "q_fit", "1", "combined");

test("11. a candidate with valid refs is accepted; 14. objectiveRelation validated/defaulted", () => {
  const { valid } = validateCandidates({ candidates: [{ type: "observation", summary: "Strong fit is common.", whyItMayMatter: "supports the objective", evidenceRefs: [combinedFit1], objectiveRelation: "supports" }] }, payload.evidence);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].objectiveRelation, "supports");
  const { valid: v2 } = validateCandidates({ candidates: [{ type: "observation", summary: "x", whyItMayMatter: "y", evidenceRefs: [someRef], objectiveRelation: "wat" }] }, payload.evidence);
  assert.equal(v2[0].objectiveRelation, "context"); // invalid → defaulted
});

test("12. a hallucinated candidate ref is rejected", () => {
  const { valid, rejected } = validateCandidates({ candidates: [{ type: "observation", summary: "x", whyItMayMatter: "y", evidenceRefs: ["study#stress|q#NOPE|opt#9|src#combined"] }] }, payload.evidence);
  assert.equal(valid.length, 0);
  assert.match(rejected[0].reasons.join(), /unknown evidence ref/);
});

test("13. an invalid comparison candidate (non-comparable / same survey) is rejected", () => {
  const sep = evidenceRef("stress", "q_expect_a", "1", "survey", "s1");
  const { valid } = validateCandidates({ candidates: [{ type: "comparison", summary: "x", whyItMayMatter: "y", evidenceRefs: [combinedFit1, sep] }] }, payload.evidence);
  assert.equal(valid.length, 0);
});

test("15,16. an important-minority and an outlier candidate are valid", () => {
  const prem = evidenceRef("stress", "q_premium", "1", "combined");
  const trustS4 = evidenceRef("stress", "q_trust", "4", "survey", "s4");
  const { valid } = validateCandidates({ candidates: [
    { type: "minority", summary: "A minority would pay a premium.", whyItMayMatter: "commercially important", evidenceRefs: [prem] },
    { type: "outlier", summary: "One audience distrusts sponsors.", whyItMayMatter: "one market only", evidenceRefs: [trustS4] },
  ] }, payload.evidence);
  assert.equal(valid.length, 2);
});

test("18,19. Stage-1 output carries no raw responses and no chain-of-thought field", () => {
  const { valid } = validateCandidates({ candidates: [{ type: "observation", summary: "s", whyItMayMatter: "w", evidenceRefs: [someRef], reasoning: "hidden step-by-step thoughts" }] }, payload.evidence);
  // The extra "reasoning" field is dropped — a candidate is only the structured artifact.
  assert.deepEqual(Object.keys(valid[0]).sort(), ["evidenceRefs", "objectiveRelation", "summary", "type", "whyItMayMatter"]);
});

// ── COVERAGE (20-22) ─────────────────────────────────────────────────────────
test("20,21,22. Stage-1 coverage is deterministic (questions/evidence/batches from code)", () => {
  const { batches } = batchResultGroups(resultGroups);
  const cov = stageCoverage(batches, payload.evidence);
  assert.equal(cov.questions, resultGroups.length);
  assert.equal(cov.evidencePoints, payload.evidence.length);
  assert.equal(cov.batchCount, batches.length);
  assert.deepEqual(cov.reviewedQuestionKeys.sort(), resultGroups.map((g) => g.canonicalQuestionKey).sort());
});
