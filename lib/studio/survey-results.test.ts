import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shownEventFor,
  mapShownCounts,
  aggregateAnswers,
  buildQuestionResults,
  filterCampaignSlugs,
  legacyAnswerRows,
  type FilterableCampaign,
} from "./survey-results";
import { canManageSurvey } from "./collection-health";
import type { LocalisedQuestion } from "@/lib/survey-locale";

// A localised question with numeric option ids (canonical) and en/de labels.
const q = (id: string, text: Record<string, string>, opts: [number, Record<string, string>][]): LocalisedQuestion => ({
  id, text, options: opts.map(([oid, t]) => ({ id: oid, text: t })),
});
const YESNO = (id: string): LocalisedQuestion => q(id, { en: "Do you attend?", de: "Gehst du hin?" }, [
  [0, { en: "Yes", de: "Ja" }],
  [1, { en: "No", de: "Nein" }],
]);

// ── Question-shown mapping (canonical events; tests 8, 21) ────────────────────

test("8 & 21. shown maps canonical events (SURVEY_START = Q1; QUESTION_k_REACHED) — no q1/q2/q3", () => {
  assert.equal(shownEventFor(0), "SURVEY_START");
  assert.equal(shownEventFor(1), "QUESTION_2_REACHED");
  assert.equal(shownEventFor(4), "QUESTION_5_REACHED");
  const shown = mapShownCounts([
    { event_type: "SURVEY_START", event_count: 100 },
    { event_type: "QUESTION_2_REACHED", event_count: 70 },
    { event_type: "QUESTION_3_REACHED", event_count: 55 },
    { event_type: "SURVEY_RENDER", event_count: 999 }, // ignored
  ], 3);
  assert.deepEqual(shown, [100, 70, 55]);
});

// ── 1-question and 5-question surveys (tests 1, 2) ────────────────────────────

test("1. a 1-question survey produces exactly one result", () => {
  const res = buildQuestionResults([YESNO("q1")], mapShownCounts([{ event_type: "SURVEY_START", event_count: 10 }], 1),
    aggregateAnswers([{ question_index: 0, answer_value: "0" }, { question_index: 0, answer_value: "1" }]), "en");
  assert.equal(res.length, 1);
  assert.equal(res[0].answered, 2);
});

test("2. a 5-question survey produces five results, in order", () => {
  const qs = [YESNO("q1"), YESNO("q2"), YESNO("q3"), YESNO("q4"), YESNO("q5")];
  const res = buildQuestionResults(qs, mapShownCounts([], 5), aggregateAnswers([]), "en");
  assert.equal(res.length, 5);
  assert.deepEqual(res.map((r) => r.questionIndex), [0, 1, 2, 3, 4]);
});

// ── Partials + distribution counts (tests 3, 6, 7, 9) ────────────────────────

test("3,6,7,9. partial answers are included; correct n, percentages, answered", () => {
  // 3 respondents answered Q1; only 2 answered Q2 (one abandoned after Q1).
  const rows = [
    { question_index: 0, answer_value: "0" },
    { question_index: 0, answer_value: "0" },
    { question_index: 0, answer_value: "1" },
    { question_index: 1, answer_value: "0" },
    { question_index: 1, answer_value: "1" },
  ];
  const res = buildQuestionResults([YESNO("q1"), YESNO("q2")],
    mapShownCounts([{ event_type: "SURVEY_START", event_count: 3 }, { event_type: "QUESTION_2_REACHED", event_count: 2 }], 2),
    aggregateAnswers(rows), "en");
  // Q1: base 3, Yes 2 (66.7%), No 1 (33.3%)
  assert.equal(res[0].answered, 3);
  assert.equal(res[0].base, 3);
  assert.equal(res[0].options[0].count, 2);
  assert.ok(Math.abs((res[0].options[0].percentage ?? 0) - 2 / 3) < 1e-9);
  assert.equal(res[0].options[1].count, 1);
  // Q2: base 2 (the partial who abandoned is simply absent here — still counted in Q1)
  assert.equal(res[1].answered, 2);
});

// ── Question completion (test 10) + zero-safety (tests 19, 20) ────────────────

test("10,19,20. question completion = answered ÷ shown; zero shown/answered never divides by zero", () => {
  const res = buildQuestionResults([YESNO("q1")],
    [10], aggregateAnswers([{ question_index: 0, answer_value: "0" }, { question_index: 0, answer_value: "0" }, { question_index: 0, answer_value: "1" }]), "en");
  assert.ok(Math.abs((res[0].completionRate ?? 0) - 3 / 10) < 1e-9);

  // Zero-response survey: no answers, shown 0 → base 0, null percentages/completion.
  const empty = buildQuestionResults([YESNO("q1")], [0], aggregateAnswers([]), "en");
  assert.equal(empty[0].answered, 0);
  assert.equal(empty[0].completionRate, null);
  assert.equal(empty[0].options[0].percentage, null);
});

// ── Canonical option identity survives localisation (test 15) ─────────────────

test("15. localisation never fragments a count; label follows display language", () => {
  // Same canonical option id "0" answered in two campaign languages — one count.
  const res = buildQuestionResults([YESNO("q1")],
    [4], aggregateAnswers([
      { question_index: 0, answer_value: "0" }, // en respondent chose Yes
      { question_index: 0, answer_value: "0" }, // de respondent chose Ja (same option id)
      { question_index: 0, answer_value: "0" },
      { question_index: 0, answer_value: "1" },
    ]), "de");
  assert.equal(res[0].options[0].count, 3);        // "Yes"/"Ja" aggregated as one
  assert.equal(res[0].options[0].label, "Ja");     // display language de
  assert.equal(res[0].text, "Gehst du hin?");
});

// ── Filters reduce to a permitted slug subset (tests 11–14) ──────────────────

const CAMPAIGNS: FilterableCampaign[] = [
  { campaign_id: "studio_s_p1_gb_en", publisher_org_id: "pub-1", market: "United Kingdom", country_code: "GB", survey_language: "en" },
  { campaign_id: "studio_s_p1_de_de", publisher_org_id: "pub-1", market: "Germany", country_code: "DE", survey_language: "de" },
  { campaign_id: "studio_s_p2_gb_en", publisher_org_id: "pub-2", market: "United Kingdom", country_code: "GB", survey_language: "en" },
];

test("11. publisher filter", () => {
  assert.deepEqual(filterCampaignSlugs(CAMPAIGNS, { publisher: "pub-1" }), ["studio_s_p1_gb_en", "studio_s_p1_de_de"]);
});
test("12. market filter (by name or country code)", () => {
  assert.deepEqual(filterCampaignSlugs(CAMPAIGNS, { market: "United Kingdom" }), ["studio_s_p1_gb_en", "studio_s_p2_gb_en"]);
  assert.deepEqual(filterCampaignSlugs(CAMPAIGNS, { market: "GB" }), ["studio_s_p1_gb_en", "studio_s_p2_gb_en"]);
});
test("13. campaign filter", () => {
  assert.deepEqual(filterCampaignSlugs(CAMPAIGNS, { campaign: "studio_s_p1_de_de" }), ["studio_s_p1_de_de"]);
});
test("14. language filter", () => {
  assert.deepEqual(filterCampaignSlugs(CAMPAIGNS, { language: "de" }), ["studio_s_p1_de_de"]);
  assert.deepEqual(filterCampaignSlugs(CAMPAIGNS, {}), CAMPAIGNS.map((c) => c.campaign_id)); // All
});

// ── Access: Manage governance, not data entitlement (tests 16, 17) ───────────

test("16 & 17. distribution publisher / cross-org cannot access; owner + admin can", () => {
  const survey = { organisation_id: "org-fanometrix" }; // commissioned, Fanometrix-operated
  assert.equal(canManageSurvey({ role: "publisher", organisationId: "org-livescore" }, survey), false); // distributor
  assert.equal(canManageSurvey({ role: "publisher", organisationId: "org-guess" }, survey), false); // cross-org guess
  assert.equal(canManageSurvey({ role: "admin", organisationId: null }, survey), true); // operator
  const own = { organisation_id: "org-pub" };
  assert.equal(canManageSurvey({ role: "publisher", organisationId: "org-pub" }, own), true); // self-service owner
});

// ── Completed vs answered are distinct (tests 4, 5) — never summed ───────────

test("4 & 5. answered (response_answers) is independent of completed (separate source)", () => {
  // buildQuestionResults derives `answered` ONLY from response_answers rows; it has
  // no access to and never adds a completed-response count. A partial (answered Q1,
  // never completed) contributes to `answered` but not to any completion metric here.
  const res = buildQuestionResults([YESNO("q1")], [5], aggregateAnswers([{ question_index: 0, answer_value: "0" }]), "en");
  assert.equal(res[0].answered, 1);
  // No field on a QuestionResult conflates a completed-survey count into answered.
  assert.equal("completedResponses" in res[0], false);
});

// ── Historical (legacy completed q1/q2/q3) compatibility ─────────────────────

const FEDEX = (id: string): LocalisedQuestion => ({
  id, text: { en: "FedEx as a Champions League sponsor?" },
  options: [
    { id: 1, text: { en: "Strong natural fit" } },
    { id: 2, text: { en: "Relevant but unclear" } },
    { id: 3, text: { en: "Mostly brand visibility" } },
    { id: 4, text: { en: "Never noticed them" } },
  ],
});

test("legacy: q1/q2/q3 -> AnswerRows; only up to 3; nulls skipped; Q4/Q5 never fabricated", () => {
  const rows = [{ q1: "1", q2: "2", q3: "4" }, { q1: "3", q2: null, q3: "1" }];
  const ar = legacyAnswerRows(rows, 3);
  assert.equal(ar.length, 5);
  assert.deepEqual(ar.filter((a) => a.question_index === 0).map((a) => a.answer_value), ["1", "3"]);
  assert.equal(legacyAnswerRows(rows, 5).some((a) => a.question_index > 2), false);
  assert.deepEqual(legacyAnswerRows([{ q1: 2 }], 1), [{ question_index: 0, answer_value: "2" }]);
});

test("6,7,8,10,13. legacy distribution maps canonical option ids; correct n/counts", () => {
  const rows = [{ q1: "1", q2: "2", q3: "4" }, { q1: "1", q2: "2", q3: "4" }, { q1: "3", q2: "1", q3: "1" }];
  const res = buildQuestionResults([FEDEX("q1"), FEDEX("q2"), FEDEX("q3")], [null, null, null], aggregateAnswers(legacyAnswerRows(rows, 3)), "en");
  assert.equal(res[0].base, 3);
  assert.equal(res[0].options[0].count, 2);
  assert.equal(res[0].options[2].count, 1);
  assert.equal(res[1].options[1].count, 2);
  assert.equal(res[2].options[3].count, 2);
});

test("14,15. historical shown/completion are null (unavailable), not zero", () => {
  const res = buildQuestionResults([FEDEX("q1")], [null], aggregateAnswers(legacyAnswerRows([{ q1: "1" }, { q1: "2" }], 1)), "en");
  assert.equal(res[0].shown, null);
  assert.equal(res[0].completionRate, null);
  assert.equal(res[0].answered, 2);
});

test("16. Studio-native shown/completion remain numeric (unchanged)", () => {
  const res = buildQuestionResults([FEDEX("q1")], [10], aggregateAnswers([{ question_index: 0, answer_value: "1" }]), "en");
  assert.equal(res[0].shown, 10);
  assert.equal(res[0].completionRate, 0.1);
});

test("12. a legacy value matching no canonical option is excluded, never mis-mapped", () => {
  const res = buildQuestionResults([FEDEX("q1")], [null], aggregateAnswers(legacyAnswerRows([{ q1: "1" }, { q1: "99" }], 1)), "en");
  assert.equal(res[0].options[0].count, 1);
  assert.equal(res[0].base, 1);
});
