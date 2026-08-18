import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildJourneyStages, mergeDaySeries, assemblePerformance, questionReachEvent, type AssembleInput,
} from "./dashboard-performance";
import { validateDashboardFilters, effectiveSlugsForFilters, type DashboardManifest } from "./dashboard-manifest";
import type { ScopeCampaign } from "./dashboard-scope";

const counts = (o: Record<string, number>) => new Map(Object.entries(o));
const EMPTY_MANIFEST: DashboardManifest = { dimensions: [] };

// ── Question journey (dynamic 1–5, question-level) ───────────────────────────
test("questionReachEvent: Q1=SURVEY_START, Qk=QUESTION_k_REACHED", () => {
  assert.equal(questionReachEvent(0), "SURVEY_START");
  assert.equal(questionReachEvent(4), "QUESTION_5_REACHED");
});

test("journey is question-level (Q1..Qn, Completed) — Opened/exposure not in the funnel", () => {
  const s = buildJourneyStages(counts({ SURVEY_VISIBLE: 63000, SURVEY_START: 91, QUESTION_2_REACHED: 91, QUESTION_3_REACHED: 81, SURVEY_COMPLETED: 78 }), 3);
  assert.deepEqual(s.map((x) => x.label), ["Q1", "Q2", "Q3", "Completed"]);
  assert.equal(s[0].count, 91);            // Q1 = started (base), not the 63k viewable
  assert.equal(s[0].ofStarted, 1);
});

test("journey 1 through 5 questions; final stage is Completed", () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const s = buildJourneyStages(counts({ SURVEY_START: 100 }), n);
    assert.equal(s.length, n + 1);
    assert.equal(s[s.length - 1].label, "Completed");
    assert.equal(s.filter((x) => x.key.startsWith("q")).length, n);
  }
});

test("journey drop-off + share of started", () => {
  const s = buildJourneyStages(counts({ SURVEY_START: 1000, QUESTION_2_REACHED: 800, QUESTION_3_REACHED: 600, SURVEY_COMPLETED: 500 }), 3);
  assert.equal(s.find((x) => x.label === "Q2")!.ofStarted, 0.8);
  assert.equal(s.find((x) => x.label === "Q2")!.dropFromPrev, 0.2);
  assert.equal(s.find((x) => x.label === "Q2")!.droppedCount, 200);
  assert.equal(s[s.length - 1].ofStarted, 0.5);
});

test("zero-response journey: all zero, ofStarted null", () => {
  const s = buildJourneyStages(counts({}), 4);
  assert.ok(s.every((x) => x.count === 0 && x.ofStarted === null));
});

// ── Time series (3 series) ───────────────────────────────────────────────────
test("mergeDaySeries: union of days sorted, three series zero-filled", () => {
  const pts = mergeDaySeries({ "2026-08-02": 5 }, { "2026-08-01": 100 }, { "2026-08-01": 3, "2026-08-02": 4 });
  assert.deepEqual(pts, [
    { date: "2026-08-01", starts: 0, viewable: 100, completions: 3 },
    { date: "2026-08-02", starts: 5, viewable: 0, completions: 4 },
  ]);
});

// ── assemblePerformance ──────────────────────────────────────────────────────
function baseInput(over: Partial<AssembleInput> = {}): AssembleInput {
  return {
    survey: { id: "s1", name: "Brand Recall", status: "live", questionCount: 5 },
    eventCounts: [
      { event_type: "SURVEY_RENDER", event_count: 200000 },
      { event_type: "SURVEY_VISIBLE", event_count: 150000 },
      { event_type: "SURVEY_START", event_count: 4000 },
      { event_type: "QUESTION_2_REACHED", event_count: 3600 },
      { event_type: "QUESTION_3_REACHED", event_count: 3200 },
      { event_type: "QUESTION_4_REACHED", event_count: 2800 },
      { event_type: "QUESTION_5_REACHED", event_count: 2500 },
      { event_type: "SURVEY_COMPLETED", event_count: 2400 },
    ],
    perQuestionAnswers: [4000, 3600, 3200, 2800, 2500],
    answerMode: "studio_native",
    startsByDay: {}, viewableByDay: {}, completedByDay: {},
    progressRows: [{ target_responses: 3000, response_count: 2400 }],
    appliedFilters: {}, filterManifest: EMPTY_MANIFEST, scope: { campaignCount: 4, publisherCount: 1 },
    ...over,
  };
}

test("ANSWERS COLLECTED = sum of per-question answered (partial-aware)", () => {
  const d = assemblePerformance(baseInput());
  assert.deepEqual(d.yield.perQuestion.map((q) => q.answered), [4000, 3600, 3200, 2800, 2500]);
  assert.equal(d.yield.answersCollected, 16100);
  assert.equal(d.yield.mode, "studio_native");
});

test("per-question answers are dynamic 1–5 (question count clamps)", () => {
  const d3 = assemblePerformance(baseInput({ survey: { id: "s", name: "s", status: null, questionCount: 3 }, perQuestionAnswers: [800, 740, 680, 999, 999] }));
  assert.deepEqual(d3.yield.perQuestion.map((q) => q.label), ["Q1", "Q2", "Q3"]);
  assert.equal(d3.yield.answersCollected, 800 + 740 + 680); // Q4/Q5 ignored for a 3Q survey
});

test("partial respondents contribute evidence even with ZERO completions", () => {
  // 900 started, answered Q1/Q2, nobody completed → still 1600 answers of research value.
  const d = assemblePerformance(baseInput({
    survey: { id: "s", name: "s", status: null, questionCount: 2 },
    eventCounts: [{ event_type: "SURVEY_START", event_count: 900 }, { event_type: "SURVEY_COMPLETED", event_count: 0 }],
    perQuestionAnswers: [900, 700],
    progressRows: [{ target_responses: null, response_count: 0 }],
  }));
  assert.equal(d.yield.answersCollected, 1600);
  assert.equal(d.completion.fullCompletions, 0);
  assert.ok(d.yield.answersCollected > 0 && d.completion.fullCompletions === 0, "answers are independent of full completion");
});

test("answersCollected 0 → mode reported as empty", () => {
  const d = assemblePerformance(baseInput({ perQuestionAnswers: [0, 0, 0, 0, 0] }));
  assert.equal(d.yield.answersCollected, 0);
  assert.equal(d.yield.mode, "empty");
});

test("EXPOSURE: loads/viewable reconcile; viewability = viewable ÷ loads", () => {
  const d = assemblePerformance(baseInput());
  assert.equal(d.exposure.loads, 200000);
  assert.equal(d.exposure.viewable, 150000);
  assert.equal(d.exposure.viewability, 150000 / 200000);
});

test("viewability is null (→ '—') when either side is 0 — never a false 0%", () => {
  const d = assemblePerformance(baseInput({ eventCounts: [{ event_type: "SURVEY_RENDER", event_count: 1000 }, { event_type: "SURVEY_VISIBLE", event_count: 0 }] }));
  assert.equal(d.exposure.viewability, null);
});

test("ENGAGEMENT: starts reconcile; start rate = starts ÷ loads", () => {
  const d = assemblePerformance(baseInput());
  assert.equal(d.engagement.starts, 4000);
  assert.equal(d.engagement.q1AnswerRate, 4000 / 200000);
});

test("COMPLETION: full completions = SURVEY_COMPLETED; rate = completed ÷ starts; does not drive yield", () => {
  const d = assemblePerformance(baseInput());
  assert.equal(d.completion.fullCompletions, 2400);
  assert.equal(d.completion.completionRate, 2400 / 4000);
  // Yield is not derived from completions.
  assert.notEqual(d.yield.answersCollected, d.completion.fullCompletions);
});

test("TARGET retained: in-progress, exceeded (not clamped), and none", () => {
  assert.equal(assemblePerformance(baseInput({ progressRows: [{ target_responses: 1000, response_count: 740 }] })).target.progressRatio, 0.74);
  assert.equal(assemblePerformance(baseInput({ progressRows: [{ target_responses: 100, response_count: 150 }] })).target.progressRatio, 1.5);
  assert.equal(assemblePerformance(baseInput({ progressRows: [{ target_responses: null, response_count: 88 }] })).target.hasTarget, false);
});

test("historical survey: mode historical, answers reflect completed-only", () => {
  const d = assemblePerformance(baseInput({ survey: { id: "s", name: "s", status: null, questionCount: 3 }, perQuestionAnswers: [78, 78, 78], answerMode: "historical" }));
  assert.equal(d.yield.mode, "historical");
  assert.equal(d.yield.answersCollected, 234);
});

test("fail-closed: rejected filter → empty scope → zeros", () => {
  const manifest: DashboardManifest = { dimensions: [{ key: "publisher", label: "Publisher", values: [{ id: "org-a", label: "A" }, { id: "org-b", label: "B" }] }] };
  assert.equal(validateDashboardFilters(manifest, { publisher: "org-x" }).ok, false);
  const d = assemblePerformance(baseInput({ eventCounts: [], perQuestionAnswers: [], progressRows: [], filterRejected: true, scope: { campaignCount: 0, publisherCount: 0 } }));
  assert.equal(d.filterRejected, true);
  assert.equal(d.yield.answersCollected, 0);
  assert.equal(d.exposure.loads, 0);
  assert.equal(d.completion.fullCompletions, 0);
});

test("Publisher narrowing stays within the authorised universe (subset, never broadens)", () => {
  const campaigns: ScopeCampaign[] = [
    { id: "1", campaign_id: "s_a", survey_id: "s1", publisher_org_id: "org-a", market: "GB", country_code: "GB", survey_language: "en" },
    { id: "2", campaign_id: "s_b", survey_id: "s1", publisher_org_id: "org-b", market: "GB", country_code: "GB", survey_language: "en" },
  ];
  const narrowed = effectiveSlugsForFilters(campaigns, { publisher: "org-a" });
  assert.deepEqual(narrowed, ["s_a"]);
  assert.ok(narrowed.every((s) => effectiveSlugsForFilters(campaigns, {}).includes(s)));
});

// ── DECISION 2: canonical study anchor removed from the Survey Dashboard ──────
import { performancePreview } from "@/app/components/studio/discover/performance-fixtures";
import { PREVIEW_STATES } from "@/app/components/studio/discover/performance-fixtures";

test("the Survey Dashboard no longer surfaces a canonical study anchor in Discover", () => {
  for (const state of PREVIEW_STATES) {
    const data = performancePreview(state) as Record<string, unknown>;
    assert.ok(!("study" in data), `PerformanceData(${state}) must not carry a canonical study anchor`);
  }
});

// ── Survey Dashboard redesign — engagement stages + reconciliation ───────────
import { surveyProgressionStages } from "./dashboard-performance";
import { resultsPreview } from "@/app/components/studio/discover/performance-fixtures";

test("surveyProgressionStages: Started → Q1…Qn (answered) → Completed, in order, with real position counts", () => {
  const perQ = [{ index: 0, label: "Q1", answered: 560 }, { index: 1, label: "Q2", answered: 236 }, { index: 2, label: "Q3", answered: 196 }];
  const stages = surveyProgressionStages(561, perQ, 196);
  assert.deepEqual(stages.map((s) => s.key), ["started", "q1", "q2", "q3", "completed"]);
  assert.deepEqual(stages.map((s) => s.count), [561, 560, 236, 196, 196]);
  // Σ(Q1…Qn) reconciles to answers collected (992) — the same partial-aware primitive.
  const answers = stages.filter((s) => s.key.startsWith("q")).reduce((a, s) => a + s.count, 0);
  assert.equal(answers, 992);
});

test("supports 1-question through 5-question surveys", () => {
  assert.equal(surveyProgressionStages(10, [{ index: 0, label: "Q1", answered: 8 }], 6).length, 3); // Started + Q1 + Completed
  const five = surveyProgressionStages(100, [0, 1, 2, 3, 4].map((i) => ({ index: i, label: `Q${i + 1}`, answered: 100 - i * 10 })), 50);
  assert.equal(five.length, 7); // Started + Q1..Q5 + Completed
});

test("FedEx Survey Dashboard: Answers Collected = 992 and markets reconcile to it", () => {
  const d = performancePreview("exposure-heavy");
  assert.equal(d.yield.answersCollected, 992);           // partial-aware, not completions (196) or 3×196
  assert.notEqual(d.yield.answersCollected, d.completion.fullCompletions);
  assert.equal((d.markets ?? []).reduce((a, m) => a + m.answers, 0), 992); // donut total reconciles
  assert.equal(d.yield.perQuestion.reduce((a, q) => a + q.answered, 0), 992); // per-question reconcile
});

test("ALL questions are available to Performance (no 2-question cap)", () => {
  const r = resultsPreview("exposure-heavy");
  assert.equal(r.questions.filter((q) => q.base > 0).length, 3); // Q1, Q2 AND Q3 all present
});

test("healthy 5-question preview: five results questions whose bases reconcile to Answers Collected", () => {
  const perf = performancePreview("healthy");
  const res = resultsPreview("healthy");
  assert.equal(res.questions.length, 5);                                   // full Q1–Q5 layout
  assert.equal(res.questions.filter((q) => q.base > 0).length, 5);
  const basesSum = res.questions.reduce((a, q) => a + q.base, 0);
  assert.equal(basesSum, perf.yield.answersCollected);                     // 16,900 both sides
  assert.equal(basesSum, 16900);
  // Each question's option counts sum to its own base (internally consistent).
  for (const q of res.questions) assert.equal(q.options.reduce((a, o) => a + o.count, 0), q.base);
});
