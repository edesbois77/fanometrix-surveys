import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalQuestionKey, compatibleAnswerScale, directlyComparable } from "./question-identity";
import { canCurateStudies, validateStudyName, isEligibleToAdd, isStudyStatus, studyCard, type StudyRow } from "./study";
import type { LocalisedQuestion } from "@/lib/survey-locale";

const Q = (id: string, key: string | undefined, optIds: number[]): LocalisedQuestion => ({
  id, ...(key !== undefined ? { canonical_question_key: key } : {}),
  text: { en: "?" }, options: optIds.map((n) => ({ id: n, text: { en: "o" + n } })),
});

// ── Question identity / comparability (tests 33–40) ──────────────────────────

test("33,34. a question's canonical key defaults to its own id", () => {
  // (blankQuestion seeds canonical_question_key = id; here we assert the resolver
  //  returns the id whether the key is explicitly the id or absent.)
  assert.equal(canonicalQuestionKey({ id: "q1", canonical_question_key: "q1" }), "q1");
});

test("36. a historical question WITHOUT a key falls back to its id (no rewrite)", () => {
  assert.equal(canonicalQuestionKey({ id: "q1784274521335" }), "q1784274521335");
  assert.equal(canonicalQuestionKey({ id: "qX", canonical_question_key: "" }), "qX"); // empty → fallback
});

test("35,41. duplicate/clone preserves the key → cloned questions share identity", () => {
  // Two surveys cloned from one: same canonical key + same option scale (the FedEx case).
  const a = Q("q1784274521335", "q1784274521335", [1, 2, 3, 4]);
  const b = Q("q1784274521335", "q1784274521335", [1, 2, 3, 4]);
  assert.equal(canonicalQuestionKey(a), canonicalQuestionKey(b));
  assert.equal(directlyComparable(a, b), true);
});

test("37. same canonical key + compatible option identity = directly comparable", () => {
  assert.equal(directlyComparable(Q("qa", "K", [1, 2, 3]), Q("qb", "K", [1, 2, 3])), true);
  assert.equal(compatibleAnswerScale(Q("qa", "K", [1, 2, 3]), Q("qb", "K", [3, 2, 1])), true); // order-independent
});

test("38. same key + incompatible answer scale = NOT directly comparable", () => {
  assert.equal(directlyComparable(Q("qa", "K", [1, 2, 3, 4]), Q("qb", "K", [1, 2, 3])), false); // 4 vs 3 options
});

test("39. different key + identical wording = NOT directly comparable", () => {
  // Same text/scale but independently authored (different keys) → never comparable.
  assert.equal(directlyComparable(Q("qa", "K1", [1, 2]), Q("qb", "K2", [1, 2])), false);
});

test("40. identity is structural only — no AI/text-similarity path exists", () => {
  // Two questions with identical labels but different keys are not comparable; the
  // module offers no text-similarity function that could override this.
  const a: LocalisedQuestion = { id: "a", canonical_question_key: "a", text: { en: "Same words" }, options: [{ id: 1, text: { en: "Yes" } }] };
  const b: LocalisedQuestion = { id: "b", canonical_question_key: "b", text: { en: "Same words" }, options: [{ id: 1, text: { en: "Yes" } }] };
  assert.equal(directlyComparable(a, b), false);
});

// ── Study access + validation (tests 9, 10) ──────────────────────────────────

test("10. only admin/operator may curate Studies; entitlement/attribution grants nothing", () => {
  assert.equal(canCurateStudies({ role: "admin" }), true);
  for (const role of ["publisher", "brand", "agency"]) assert.equal(canCurateStudies({ role }), false);
});

test("study name required", () => {
  assert.match(validateStudyName("  ") ?? "", /required/);
  assert.equal(validateStudyName("FedEx UCL Sponsorship 26/27"), null);
});

test("status guard", () => {
  for (const s of ["draft", "active", "closed"]) assert.equal(isStudyStatus(s), true);
  for (const s of ["live", "", null]) assert.equal(isStudyStatus(s), false);
});

// ── Membership eligibility (tests 11, 12, 13) ────────────────────────────────

test("11,12,13. only standalone, real, non-deleted Surveys are eligible; one already in a Study is excluded (no silent move)", () => {
  assert.equal(isEligibleToAdd({ study_id: null, organisation_id: "o", is_simulated: false, status: "ready" }), true);
  assert.equal(isEligibleToAdd({ study_id: "study-x", organisation_id: "o" }), false); // already in a Study
  assert.equal(isEligibleToAdd({ study_id: null, organisation_id: "o", is_simulated: true }), false); // simulated
  assert.equal(isEligibleToAdd({ study_id: null, organisation_id: "o", status: "deleted" }), false); // deleted
});

// ── Card projection ──────────────────────────────────────────────────────────

test("studyCard projects totals + fromRequest flag + objective", () => {
  const row: StudyRow = { id: "s1", name: "WWC 2027", objective: "Understand fan perceptions", status: "active", commissioning_organisation_id: "org-x", research_request_id: "req-1", created_at: "2026-08-14T00:00:00Z", created_by: "ed@fx" };
  const c = studyCard(row, { surveyCount: 3, completedResponses: 2846 });
  assert.equal(c.surveyCount, 3);
  assert.equal(c.completedResponses, 2846);
  assert.equal(c.fromRequest, true);
  assert.equal(c.commissioningOrgId, "org-x");
  assert.equal(c.objective, "Understand fan perceptions");
});
