// ── Stage 5D — governed semantics preserved into the immutable evidence snapshot ─
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSurveyAnalysisEvidence, type SurveyAnalysisScope } from "./survey-analysis-evidence";
import { resolveInstrumentSemantics, governQuestionSemantics } from "./scale-templates";
import type { QuestionResultView } from "./dashboard-results";

const scope: SurveyAnalysisScope = { surveyId: "S1", surveyName: "Survey", objective: "obj", completedResponses: 200, mode: "studio_native" };

const view = (): QuestionResultView => ({
  questionIndex: 0, questionId: "q1", text: "How satisfied?", shown: 200, answered: 200, base: 200,
  completion: null, marginOfError: 6.9,
  options: [
    { optionId: "1", label: "Very satisfied", count: 80, percentage: 40 },
    { optionId: "2", label: "Satisfied", count: 70, percentage: 35 },
    { optionId: "3", label: "Dissatisfied", count: 30, percentage: 15 },
    { optionId: "4", label: "Very dissatisfied", count: 20, percentage: 10 },
  ],
} as unknown as QuestionResultView);

// The stored instrument (governed via the satisfaction_4 template).
const governedQuestion = governQuestionSemantics({
  id: "q1", text: { en: "How satisfied?" },
  options: [{ id: 1, text: {} }, { id: 2, text: {} }, { id: 3, text: {} }, { id: 4, text: {} }],
  scale_template: "satisfaction_4",
});

test("§9 governed semantics are written onto the evidence items", () => {
  const semantics = resolveInstrumentSemantics([governedQuestion]);
  const payload = buildSurveyAnalysisEvidence(scope, [view()], [], semantics);
  const item1 = payload.evidence.find((e) => e.optionId === "1")!;
  assert.equal(item1.scaleType, "ordinal");
  assert.equal(item1.constructKey, "satisfaction");
  assert.equal(item1.ordinalPosition, 4);
  assert.equal(item1.polarity, "positive");
  const item3 = payload.evidence.find((e) => e.optionId === "3")!;
  assert.equal(item3.polarity, "negative");
  assert.equal(item3.ordinalPosition, 2);
});

test("§8/§11 with NO instrument semantics, evidence items carry none (unchanged behaviour)", () => {
  const payload = buildSurveyAnalysisEvidence(scope, [view()], [], {});
  for (const e of payload.evidence) {
    assert.equal(e.scaleType, undefined);
    assert.equal(e.constructKey, undefined);
    assert.equal(e.ordinalPosition, undefined);
    assert.equal(e.polarity, undefined);
  }
});
