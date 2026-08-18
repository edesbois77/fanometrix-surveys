import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleLanding } from "./dashboard-landing";
import type { DashboardSurveyOption, ScopeCampaign } from "./dashboard-scope";

const survey = (id: string, name: string, studyId: string | null): DashboardSurveyOption =>
  ({ id, name, questionCount: 3, status: "live", campaignCount: 0, studyId });
const camp = (id: string, survey_id: string, pub: string, market: string): ScopeCampaign =>
  ({ id, campaign_id: `slug_${id}`, survey_id, publisher_org_id: pub, market, country_code: market, survey_language: "en" });

test("landing groups surveys by study and separates standalone surveys", () => {
  const surveys = [survey("A", "Survey", "ST"), survey("B", "Survey v2", "ST"), survey("C", "Standalone", null)];
  const campaigns = [camp("cA", "A", "pub1", "GB"), camp("cB", "B", "pub2", "DE"), camp("cC", "C", "pub1", "GB")];
  const resp = new Map([["slug_cA", 100], ["slug_cB", 56], ["slug_cC", 40]]);
  const studyName = new Map([["ST", "FedEx UCL Study"]]);

  const { studies, surveys: landing } = assembleLanding(surveys, campaigns, resp, studyName);

  assert.equal(studies.length, 1);
  assert.equal(studies[0].studyName, "FedEx UCL Study");
  assert.equal(studies[0].surveyCount, 2);              // A + B grouped in the study
  assert.equal(studies[0].completions, 156);            // 100 + 56, summed
  assert.equal(studies[0].publisherCount, 2);           // pub1 + pub2 across the study
  assert.equal(studies[0].marketCount, 2);              // GB + DE

  // New IA: EVERY authorised survey appears in the Surveys list — including the
  // study members A and B (belonging to a study never removes the survey card).
  assert.deepEqual(landing.map((s) => s.id).sort(), ["A", "B", "C"]);
  assert.equal(landing.find((s) => s.id === "C")!.completions, 40);
});

test("no studies → only standalone surveys; studies ranked by completions", () => {
  const surveys = [survey("A", "Big", "S1"), survey("B", "Small", "S2")];
  const campaigns = [camp("cA", "A", "p", "GB"), camp("cB", "B", "p", "GB")];
  const resp = new Map([["slug_cA", 500], ["slug_cB", 20]]);
  const { studies, surveys: landing } = assembleLanding(surveys, campaigns, resp, new Map());
  assert.deepEqual(studies.map((s) => s.studyId), ["S1", "S2"]); // 500 before 20
  assert.deepEqual(landing.map((s) => s.id).sort(), ["A", "B"]); // both still listed as surveys
});

// ── User-created studies on the landing (assembleUserStudies) ────────────────
import { assembleUserStudies } from "./dashboard-landing";

test("user study counts come ONLY from the effective authorised universe", () => {
  const surveys = [survey("A", "WWC UK", null), survey("B", "WWC FR", null)]; // authorised universe = A, B
  const campaigns = [camp("cA", "A", "f365", "GB"), camp("cB", "B", "f365", "FR")];
  const resp = new Map([["slug_cA", 200], ["slug_cB", 120]]);
  // Saved membership includes 'Z' which the caller can no longer see → excluded.
  const out = assembleUserStudies([{ id: "us1", name: "My Group", memberSurveyIds: ["A", "B", "Z"] }], surveys, campaigns, resp);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "user");
  assert.equal(out[0].canManage, true);
  assert.equal(out[0].surveyCount, 2);          // Z is not counted (inaccessible)
  assert.equal(out[0].completions, 320);        // only A + B
  assert.equal(out[0].marketCount, 2);          // GB + FR
});

test("a user study with no accessible members is dropped from the landing entirely", () => {
  const surveys = [survey("A", "Visible", null)];
  const out = assembleUserStudies([{ id: "us1", name: "Hidden", memberSurveyIds: ["Z", "Y"] }], surveys, [], new Map());
  assert.deepEqual(out, []);
});

test("canonical landing studies are tagged kind='canonical' and not manageable", () => {
  const surveys = [survey("A", "S", "ST"), survey("B", "S2", "ST")];
  const campaigns = [camp("cA", "A", "p", "GB"), camp("cB", "B", "p", "GB")];
  const { studies } = assembleLanding(surveys, campaigns, new Map(), new Map([["ST", "Canonical"]]));
  assert.equal(studies[0].kind, "canonical");
  assert.equal(studies[0].canManage, false);
});

// ── "Questions answered" Survey-card metric (reconciles to the Study total) ───
import { answeredFromProgression } from "./dashboard-metrics";

test("assembleLanding surfaces answersCollected from the governed map, independent of completions", () => {
  const surveys = [survey("A", "FedEx v1", "ST"), survey("B", "FedEx v2", "ST")];
  const campaigns = [camp("cA", "A", "p", "GB"), camp("cB", "B", "p", "GB")];
  const resp = new Map([["slug_cA", 196], ["slug_cB", 78]]);       // full completions
  const answers = new Map([["A", 992], ["B", 250]]);               // questions answered (partial-aware)
  const { surveys: cards } = assembleLanding(surveys, campaigns, resp, new Map(), answers);
  const a = cards.find((s) => s.id === "A")!, b = cards.find((s) => s.id === "B")!;
  assert.equal(a.answersCollected, 992);
  assert.equal(b.answersCollected, 250);
  // The metric is NOT the completion count, and NOT questions×completions (3×196=588).
  assert.notEqual(a.answersCollected, a.completions);
  assert.notEqual(a.answersCollected, 3 * a.completions);
  assert.equal(a.completions, 196); // completions still available, just not the headline
});

test("FedEx v1 (992) + v2 (250) reconcile to the Study Dashboard total of 1,242", () => {
  // Both the Survey cards and the Study Dashboard derive answers from the SAME
  // primitive (answeredFromProgression via perQuestionAnswerCounts). Here we prove
  // the counts and their reconciliation from the known FedEx progression events.
  const v1 = answeredFromProgression(new Map([["QUESTION_2_REACHED", 560], ["QUESTION_3_REACHED", 236], ["SURVEY_COMPLETED", 196]]), 3).reduce((a, b) => a + b, 0);
  const v2 = answeredFromProgression(new Map([["QUESTION_2_REACHED", 91], ["QUESTION_3_REACHED", 81], ["SURVEY_COMPLETED", 78]]), 3).reduce((a, b) => a + b, 0);
  assert.equal(v1, 992);
  assert.equal(v2, 250);
  assert.equal(v1 + v2, 1242); // the Study Dashboard total
});

test("answersCollected defaults to 0 when no governed count is supplied (never a completion proxy)", () => {
  const surveys = [survey("A", "S", null)];
  const { surveys: cards } = assembleLanding(surveys, [camp("cA", "A", "p", "GB")], new Map([["slug_cA", 50]]), new Map());
  assert.equal(cards[0].answersCollected, 0);      // absent → 0, NOT the 50 completions
  assert.equal(cards[0].completions, 50);
});

test("Study card 'questions answered' = sum of its AUTHORISED members' answers (intersection respected)", () => {
  const surveys = [survey("A", "FedEx v1", null), survey("B", "FedEx v2", null)]; // authorised = A, B
  const campaigns = [camp("cA", "A", "p", "GB"), camp("cB", "B", "p", "GB")];
  const answers = new Map([["A", 992], ["B", 250], ["Z", 9999]]); // Z is not authorised
  const out = assembleUserStudies(
    [{ id: "us1", name: "FedEx UCL Study", memberSurveyIds: ["A", "B", "Z"] }],
    surveys, campaigns, new Map([["slug_cA", 196], ["slug_cB", 78]]), answers,
  );
  assert.equal(out[0].answersCollected, 1242);  // 992 + 250; Z excluded (unauthorised)
  assert.notEqual(out[0].answersCollected, out[0].completions); // not a completion proxy (274)
});
