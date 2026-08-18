import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleStudy, type StudySurveyMetrics } from "./dashboard-study";

const sm = (over: Partial<StudySurveyMetrics>): StudySurveyMetrics => ({
  surveyId: "s", name: "S", questionCount: 3, mode: "studio_native", publishers: [], markets: [],
  loads: 0, viewable: 0, starts: 0, completions: 0, answersCollected: 0, answersByPosition: [], ...over,
});

test("top-line aggregates additively; rates recomputed from aggregate numerators/denominators (never averaged)", () => {
  const d = assembleStudy({
    studyId: "st1", studyName: "FedEx UCL Study",
    surveys: [
      sm({ surveyId: "a", name: "Survey", questionCount: 3, starts: 800, completions: 200, answersCollected: 1800, loads: 10000, viewable: 8000 }),
      sm({ surveyId: "b", name: "Survey v2", questionCount: 5, starts: 200, completions: 100, answersCollected: 700, loads: 5000, viewable: 3000 }),
    ],
    publishers: [], points: [], insights: [],
  });
  assert.equal(d.topline.starts, 1000);
  assert.equal(d.topline.completions, 300);
  assert.equal(d.topline.answersCollected, 2500);
  // completion rate = 300/1000 = 0.3 — NOT the average of (200/800=0.25) and (100/200=0.5)=0.375.
  assert.equal(d.topline.completionRate, 0.3);
  assert.equal(d.topline.avgAnswersPerStart, 2.5);
  assert.equal(d.topline.viewability, 11000 / 15000);
});

test("different question counts are compared fairly via avg answers/start", () => {
  const d = assembleStudy({
    studyId: "st", studyName: null,
    surveys: [
      sm({ surveyId: "long", name: "5Q", questionCount: 5, starts: 100, answersCollected: 450 }),  // 4.5/start
      sm({ surveyId: "short", name: "1Q", questionCount: 1, starts: 100, answersCollected: 95 }),   // 0.95/start
    ],
    publishers: [], points: [], insights: [],
  });
  const long = d.surveys.find((s) => s.surveyId === "long")!;
  const short = d.surveys.find((s) => s.surveyId === "short")!;
  assert.equal(long.avgAnswersPerStart, 4.5);
  assert.equal(short.avgAnswersPerStart, 0.95);
  // Ranked by answers, but the row carries question count + avg/start so raw totals aren't misleading.
  assert.equal(d.surveys[0].surveyId, "long");
});

test("mixedMode flag is set when studio-native and historical surveys coexist", () => {
  const mixed = assembleStudy({ studyId: "x", studyName: null, surveys: [sm({ mode: "studio_native", starts: 10 }), sm({ mode: "historical", starts: 10 })], publishers: [], points: [], insights: [] });
  assert.equal(mixed.mixedMode, true);
  const uniform = assembleStudy({ studyId: "x", studyName: null, surveys: [sm({ mode: "historical" }), sm({ mode: "historical" })], publishers: [], points: [], insights: [] });
  assert.equal(uniform.mixedMode, false);
});

test("empty-start study: rates are null, never NaN", () => {
  const d = assembleStudy({ studyId: "x", studyName: null, surveys: [sm({ starts: 0, completions: 0, answersCollected: 0 })], publishers: [], points: [], insights: [] });
  assert.equal(d.topline.completionRate, null);
  assert.equal(d.topline.avgAnswersPerStart, null);
});

test("position-based Q1–Q5 yield aggregates across surveys with DIFFERENT question counts", () => {
  const d = assembleStudy({
    studyId: "x", studyName: null,
    surveys: [
      sm({ surveyId: "a", questionCount: 3, starts: 500, answersByPosition: [500, 450, 400], answersCollected: 1350 }),
      sm({ surveyId: "b", questionCount: 5, starts: 300, answersByPosition: [300, 250, 200, 180, 150], answersCollected: 1080 }),
    ],
    publishers: [], points: [], insights: [],
  });
  // Q1/Q2/Q3 sum both surveys; Q4/Q5 come ONLY from the 5-question survey.
  assert.deepEqual(d.engagement.perPosition, [
    { position: 1, answers: 800 }, { position: 2, answers: 700 }, { position: 3, answers: 600 },
    { position: 4, answers: 180 }, { position: 5, answers: 150 },
  ]);
  // A yield metric — its total is the study answers, independent of full completions.
  assert.equal(d.engagement.perPosition.reduce((a, p) => a + p.answers, 0), d.topline.answersCollected);
});

test("engagement progression is Started → Q1…QN → Completed, in order, from aggregates", () => {
  const d = assembleStudy({
    studyId: "x", studyName: null,
    surveys: [
      sm({ surveyId: "a", questionCount: 3, starts: 500, completions: 300, answersByPosition: [500, 450, 400], answersCollected: 1350 }),
      sm({ surveyId: "b", questionCount: 5, starts: 300, completions: 150, answersByPosition: [300, 250, 200, 180, 150], answersCollected: 1080 }),
    ],
    publishers: [], points: [], insights: [],
  });
  assert.deepEqual(d.engagement.progression, [
    { key: "started", label: "Started", count: 800 },
    { key: "q1", label: "Q1", count: 800 }, { key: "q2", label: "Q2", count: 700 }, { key: "q3", label: "Q3", count: 600 },
    { key: "q4", label: "Q4", count: 180 }, { key: "q5", label: "Q5", count: 150 },
    { key: "completed", label: "Completed", count: 450 },
  ]);
  // Progression is bookended by starts and completions (funnel endpoints).
  assert.equal(d.engagement.progression[0].count, d.topline.starts);
  assert.equal(d.engagement.progression.at(-1)!.count, d.topline.completions);
});

test("engagement rates recomputed from aggregates; viewability/startRate correct", () => {
  const d = assembleStudy({ studyId: "x", studyName: null, surveys: [sm({ loads: 10000, viewable: 8000, starts: 400, completions: 100, answersByPosition: [400] })], publishers: [], points: [], insights: [] });
  assert.equal(d.engagement.viewability, 0.8);
  assert.equal(d.engagement.startRate, 400 / 10000);
  assert.equal(d.engagement.completionRate, 100 / 400);
});

test("confidence uses the completed-response base; sample quality is never fabricated", () => {
  const d = assembleStudy({ studyId: "x", studyName: null, surveys: [sm({ completions: 274, starts: 652, answersByPosition: [274] })], publishers: [], points: [], insights: [] });
  assert.equal(d.confidence.level, 95);
  assert.equal(d.confidence.base, 274);
  assert.ok(d.confidence.marginOfError && d.confidence.marginOfError > 5 && d.confidence.marginOfError < 7); // ≈ ±5.9%
  assert.equal(d.sampleQuality.assessed, false);
  assert.equal(d.sampleQuality.label, "Not yet assessed");
});
