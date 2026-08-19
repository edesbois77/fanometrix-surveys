import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canCurateFindings,
  cleanFilters,
  buildAnswerFindingSnapshot,
  isSnapshotError,
  validateEditorial,
  editorialPatch,
  PROTECTED_FINDING_FIELDS,
  findingCard,
  type FindingRow,
} from "./survey-finding";
import { canManageSurvey } from "./collection-health";
import { buildQuestionResults, mapShownCounts, aggregateAnswers } from "./survey-results";
import type { LocalisedQuestion } from "@/lib/survey-locale";

// A resolved "brand" question in en/de, from partial-inclusive answers.
const BRAND: LocalisedQuestion = {
  id: "q-brand", text: { en: "Which brand?", de: "Welche Marke?" },
  options: [
    { id: 0, text: { en: "Nike", de: "Nike" } },
    { id: 1, text: { en: "Adidas", de: "Adidas" } },
  ],
};
function resolvedQuestions(displayLang = "en") {
  // 4 answered Q1 (3 Nike, 1 Adidas); shown Q1 = 5 (one saw but didn't answer).
  return buildQuestionResults([BRAND],
    mapShownCounts([{ event_type: "QUESTION_1_SHOWN", event_count: 5 }], 1),
    aggregateAnswers([
      { question_index: 0, answer_value: "0" },
      { question_index: 0, answer_value: "0" },
      { question_index: 0, answer_value: "0" },
      { question_index: 0, answer_value: "1" },
    ]), displayLang);
}

// ── 1,3–10,21. Snapshot from a REAL, server-resolved answer result ───────────
test("1,3-9,10,21. snapshot carries canonical provenance + correct numbers (partials included)", () => {
  const snap = buildAnswerFindingSnapshot(resolvedQuestions("en"), { questionIndex: 0, optionId: "0", displayLanguage: "en" });
  assert.ok(!isSnapshotError(snap));
  if (isSnapshotError(snap)) return;
  assert.equal(snap.questionId, "q-brand");        // question identity (4)
  assert.equal(snap.base_n, 4);                    // n (7)
  assert.equal(snap.answer_count, 3);              // Nike count (8)
  assert.ok(Math.abs((snap.percentage ?? 0) - 3 / 4) < 1e-9); // 75% (9)
  assert.equal(snap.shown, 5);                     // shown
  assert.equal(snap.answered, 4);                  // answered (includes the partial who never completed) (10)
  assert.ok(Math.abs((snap.question_completion ?? 0) - 4 / 5) < 1e-9);
  assert.equal(snap.snapshot.optionId, "0");       // canonical option identity (5, 21)
  assert.equal(snap.snapshot.optionLabel, "Nike");
});

test("21. option identity is canonical; display label follows language", () => {
  const snapDe = buildAnswerFindingSnapshot(resolvedQuestions("de"), { questionIndex: 0, optionId: "0", displayLanguage: "de" });
  assert.ok(!isSnapshotError(snapDe));
  if (isSnapshotError(snapDe)) return;
  assert.equal(snapDe.snapshot.optionId, "0");        // same canonical id
  assert.equal(snapDe.snapshot.questionText, "Welche Marke?");
});

// ── 2. Numbers come from the resolved result, never the caller ───────────────
test("2. snapshot ignores any client-claimed numbers — only the resolved result is used", () => {
  // buildAnswerFindingSnapshot takes ONLY the resolved questions + identity; there is
  // no parameter through which a browser could inject n/percentage/count.
  const snap = buildAnswerFindingSnapshot(resolvedQuestions(), { questionIndex: 0, optionId: "1", displayLanguage: "en" });
  assert.ok(!isSnapshotError(snap));
  if (isSnapshotError(snap)) return;
  assert.equal(snap.answer_count, 1);              // Adidas = 1, regardless of any claim
  assert.ok(Math.abs((snap.percentage ?? 0) - 1 / 4) < 1e-9);
});

// ── 22. Zero-base result cannot become a Finding ─────────────────────────────
test("22. a zero-base (no valid answers) result is refused", () => {
  const empty = buildQuestionResults([BRAND], [0], aggregateAnswers([]), "en");
  const snap = buildAnswerFindingSnapshot(empty, { questionIndex: 0, optionId: "0", displayLanguage: "en" });
  assert.ok(isSnapshotError(snap));
  if (isSnapshotError(snap)) assert.equal(snap.error, "zero_base");
});

// ── 23. Deleted/invalid question or option fails safely ──────────────────────
test("23. invalid question or option fails safely (no snapshot)", () => {
  const qs = resolvedQuestions();
  const badQ = buildAnswerFindingSnapshot(qs, { questionIndex: 3, optionId: "0", displayLanguage: "en" });
  assert.ok(isSnapshotError(badQ) && badQ.error === "question_not_found");
  const badOpt = buildAnswerFindingSnapshot(qs, { questionIndex: 0, optionId: "999", displayLanguage: "en" });
  assert.ok(isSnapshotError(badOpt) && badOpt.error === "option_not_found");
});

// ── 6. Filters normalised to the four governed keys ──────────────────────────
test("6. filters clean to the four governed keys only", () => {
  assert.deepEqual(cleanFilters({ publisher: "pub-1", market: "GB", campaign: "", language: null, junk: "x" }),
    { publisher: "pub-1", market: "GB", campaign: null, language: null });
});

// ── 12,13. Editorial editable; provenance immutable through the editorial path ─
test("12 & 13. editorial patch touches ONLY headline/commentary; never provenance/snapshot", () => {
  const ed = validateEditorial({ headline: "  Nearly three quarters choose Nike  ", commentary: "" });
  assert.ok(!("error" in ed));
  if ("error" in ed) return;
  assert.equal(ed.headline, "Nearly three quarters choose Nike");
  assert.equal(ed.commentary, null);
  // A hostile PATCH cannot rewrite the numbers or identity.
  const patch = editorialPatch({ headline: "New headline", commentary: "note", percentage: 0.99, base_n: 1, question_index: 4, option_id: "9", snapshot: {}, status: "published" });
  assert.deepEqual(Object.keys(patch).sort(), ["commentary", "headline"]);
  for (const f of PROTECTED_FINDING_FIELDS) assert.equal(f in patch, false);
});

test("empty headline is rejected on create", () => {
  assert.ok("error" in validateEditorial({ headline: "   " }));
});

// ── 18. Curation is Fanometrix (admin) only; 15–17 Manage ownership ──────────
test("18. only admin/operator may curate Findings", () => {
  assert.equal(canCurateFindings({ role: "admin" }), true);
  for (const role of ["publisher", "brand", "agency"]) assert.equal(canCurateFindings({ role }), false);
});

test("15,16,17. Manage ownership still gates the survey (curation needs BOTH)", () => {
  const survey = { organisation_id: "org-fanometrix" };
  assert.equal(canManageSurvey({ role: "publisher", organisationId: "org-livescore" }, survey), false); // distributor
  assert.equal(canManageSurvey({ role: "publisher", organisationId: "org-guess" }, survey), false); // cross-org
  assert.equal(canManageSurvey({ role: "admin", organisationId: null }, survey), true);
});

// ── 24. Deliberate non-idempotency: multiple Findings may come from one result ─
test("24. the domain enforces no uniqueness — multiple Findings from one result is allowed", () => {
  // Two findings from the identical source identity are BOTH legitimate (different
  // editorial). There is no dedup key in the model; the client guards double-submit.
  const id = { questionIndex: 0, optionId: "0", displayLanguage: "en" };
  const a = buildAnswerFindingSnapshot(resolvedQuestions(), id);
  const b = buildAnswerFindingSnapshot(resolvedQuestions(), id);
  assert.deepEqual(a, b); // same source resolves identically; creating two rows is a deliberate act
});

// ── List-card projection ─────────────────────────────────────────────────────
test("findingCard projects the list summary from a stored row", () => {
  const row: FindingRow = {
    id: "f1", survey_id: "s1", status: "published", headline: "Nike leads", commentary: null,
    source_type: "answer", question_index: 0, question_id: "q-brand", option_id: "0",
    filters: { market: "GB" }, display_language: "en", base_n: 286, answer_count: 212, percentage: 0.74,
    shown: 400, answered: 286, question_completion: 0.715, snapshot: { optionLabel: "Nike" },
    created_at: "2026-08-13T10:00:00Z", published_at: "2026-08-13T11:00:00Z", published_by: "ed@fx", created_by: "ed@fx",
  };
  const card = findingCard(row);
  assert.equal(card.optionLabel, "Nike");
  assert.equal(card.percentage, 0.74);
  assert.equal(card.baseN, 286);
  assert.equal(card.status, "published");
});
