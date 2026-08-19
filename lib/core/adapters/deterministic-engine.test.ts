import { test } from "node:test";
import assert from "node:assert/strict";
import { fromDeterministicEngine, type SurveyFindingInput } from "./deterministic-engine";

const f: SurveyFindingInput = {
  id: "det-1", type: "leading", surveyId: "s1", questionId: "q_help", canonicalQuestionKey: "q_help",
  questionIndex: 2, title: "Access to experiences leads.", detail: "32.8% chose it.",
  optionId: "experiences_access", optionLabel: "Access to experiences",
  answerCount: 90, baseN: 274, percentage: 90 / 274,
};

test("fromDeterministicEngine yields an EPHEMERAL Finding (status computed)", () => {
  const out = fromDeterministicEngine(f);
  assert.equal(out.status, "computed");
  assert.equal(out.statement, "Access to experiences leads.");
  assert.deepEqual(out.source, { surveyId: "s1" });
  assert.deepEqual(out.questions, ["q_help"]);
  assert.equal(out.analysisRunId, null);
  assert.deepEqual(out.version, { standardVersion: null, coreVersion: null, runProvenance: null });
});

test("evidence carries the governed base numbers verbatim; detail is provenance", () => {
  const out = fromDeterministicEngine(f);
  const e = out.evidence[0];
  assert.equal(e.kind, "base");
  assert.equal(e.sourceType, "survey");
  assert.equal(e.numerator, 90);
  assert.equal(e.denominator, 274);
  assert.equal(e.quantity?.unit, "proportion");
  assert.equal(e.quantity?.value, 90 / 274);
  assert.equal((out.sourceMeta as Record<string, unknown>).detail, "32.8% chose it.");
});

test("no interpretation is synthesised", () => {
  const out = fromDeterministicEngine(f);
  assert.equal(out.insight, undefined);
  assert.equal(out.confidence, undefined);
  assert.equal(out.materiality, undefined);
  assert.equal(out.recommendations, undefined);
});
