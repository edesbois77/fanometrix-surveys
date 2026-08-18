// ── Survey Studio → Dashboards → Performance — pure metric assembly (V2) ──────
// Phase 3B. The trusted maths for the Performance view, kept PURE (no DB/RPC) so
// it is fully unit-tested and the API route is a thin fetch layer.
//
// REVISED PRODUCT PRINCIPLE: performance is primarily about EVIDENCE COLLECTED, not
// just completed surveys. A respondent who answers Q1–Q3 of a 5-question survey
// contributed three valid answers — analytically useful even without completion.
// So the primary metric is ANSWERS COLLECTED (research yield); full completion and
// completion rate are retained as collection-efficiency/diagnostic signals.
//
// Canonical definitions (lib/metrics/registry.ts — never redefined here):
//   Loads=SURVEY_RENDER · Viewable=SURVEY_VISIBLE · Viewability=Viewable÷Loads
//   Starts / Q1 answered=SURVEY_START · Q1 answer rate=SURVEY_START÷SURVEY_RENDER
//   Full completions=SURVEY_COMPLETED · Completion rate=SURVEY_COMPLETED÷SURVEY_START
//   Answers collected = Σ per-question ANSWERED (response_answers by question_index,
//     partial-aware; historical surveys fall back to non-null responses.q1/q2/q3).

import { plannedProgress, type CampaignProgressRow } from "@/lib/studio/collection-health";
import type { DashboardManifest, ValidatedFilters } from "@/lib/studio/dashboard-manifest";
import type { Insight } from "@/lib/studio/dashboard-insights";

/** Events-based timing (avg only; median deferred). Nulls render as "—". */
export type PerformanceTiming = {
  avgTtfiSeconds: number | null;
  avgCompletionSeconds: number | null;
  ttfiSample: number;
  completionSample: number;
};

const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

// ── Question journey (dynamic 1–5) ───────────────────────────────────────────
// Question-level only: Q1 (started) → Q2 … QN → Completed. Exposure (Loads →
// Viewable) is presented separately (collection health), so the question journey
// keeps a READABLE scale — e.g. 63k viewable never dwarfs 78 completions.
export type JourneyStage = {
  key: string;
  label: string;
  count: number;
  /** Share of the started (Q1) base (0..1); null when nobody started. */
  ofStarted: number | null;
  /** Fraction lost from the previous stage (0..1); null for Q1 or a 0 base. */
  dropFromPrev: number | null;
  droppedCount: number | null;
  question?: string | null;
};

/** Canonical "reached/shown" event for a 0-indexed question: Q1=SURVEY_START,
 *  Qk=QUESTION_k_REACHED (mirrors survey-results.ts shownEventFor). */
export function questionReachEvent(questionIndex: number): string {
  return questionIndex === 0 ? "SURVEY_START" : `QUESTION_${questionIndex + 1}_REACHED`;
}

export function buildJourneyStages(
  eventCounts: Map<string, number>,
  questionCount: number,
  questionLabels?: (string | null | undefined)[],
): JourneyStage[] {
  const n = Math.max(0, Math.min(5, Math.floor(questionCount || 0)));
  const started = int(eventCounts.get("SURVEY_START"));

  const raw: { key: string; label: string; count: number; question?: string | null }[] = [];
  for (let qi = 0; qi < n; qi++) {
    raw.push({ key: `q${qi + 1}`, label: `Q${qi + 1}`, count: int(eventCounts.get(questionReachEvent(qi))), question: questionLabels?.[qi] ?? null });
  }
  raw.push({ key: "completed", label: "Completed", count: int(eventCounts.get("SURVEY_COMPLETED")) });

  return raw.map((s, i) => {
    const prev = i > 0 ? raw[i - 1].count : null;
    const dropped = prev != null ? Math.max(0, prev - s.count) : null;
    return {
      ...s,
      ofStarted: started > 0 ? s.count / started : null,
      droppedCount: dropped,
      dropFromPrev: prev != null && prev > 0 ? Math.max(0, (prev - s.count) / prev) : null,
    };
  });
}

// ── Engagement progression (single survey): Started → Q1…Qn answered → Completed ─
// For ONE survey the positions genuinely are this survey's questions. Each Qk is the
// answers given at position k (the same partial-aware count as answersCollected), so
// Σ(Q1…Qn) === answersCollected. Pure → unit-tested; the UI just renders it.
export type ProgressionStage = { key: string; label: string; count: number };
export function surveyProgressionStages(starts: number, perQuestion: PerQuestionAnswer[], completions: number): ProgressionStage[] {
  return [
    { key: "started", label: "Started", count: int(starts) },
    ...perQuestion.map((qq) => ({ key: `q${qq.index + 1}`, label: `Q${qq.index + 1}`, count: int(qq.answered) })),
    { key: "completed", label: "Completed", count: int(completions) },
  ];
}

// ── Time series (event-based; answers/day needs a new RPC — deferred) ────────
export type TimePoint = { date: string; starts: number; viewable: number; completions: number };

export function mergeDaySeries(
  startsByDay: Record<string, number>, viewableByDay: Record<string, number>, completedByDay: Record<string, number>,
): TimePoint[] {
  const days = new Set<string>([...Object.keys(startsByDay), ...Object.keys(viewableByDay), ...Object.keys(completedByDay)]);
  return [...days].sort().map((date) => ({
    date, starts: int(startsByDay[date]), viewable: int(viewableByDay[date]), completions: int(completedByDay[date]),
  }));
}

// ── Metric blocks ────────────────────────────────────────────────────────────
export type PerQuestionAnswer = { index: number; label: string; answered: number };
export type PerformanceYield = {
  /** Total valid question answers across the effective scope (partial-aware). */
  answersCollected: number;
  perQuestion: PerQuestionAnswer[];
  /** Provenance of the answer counts. `historical` surveys have no partials. */
  mode: "studio_native" | "historical" | "empty";
};
export type PerformanceExposure = { loads: number; viewable: number; viewability: number | null };
export type PerformanceEngagement = { starts: number; q1AnswerRate: number | null };
export type PerformanceCompletion = { fullCompletions: number; completionRate: number | null };
export type PerformanceTarget = {
  hasTarget: boolean; targetTotal: number; completedTowardTarget: number; untargetedResponses: number;
  progressRatio: number | null; targetReached: boolean;
};

export type PerformanceData = {
  authorised: true;
  filterRejected: boolean;
  survey: { id: string; name: string; status: string | null; questionCount: number };
  yield: PerformanceYield;
  exposure: PerformanceExposure;
  engagement: PerformanceEngagement;
  completion: PerformanceCompletion;
  target: PerformanceTarget;
  timing: PerformanceTiming;
  journey: JourneyStage[];
  timeseries: { granularity: "day"; points: TimePoint[] };
  scope: { campaignCount: number; publisherCount: number };
  appliedFilters: ValidatedFilters;
  filterManifest: DashboardManifest;
  degraded: boolean;
  /** Deterministic observations (route-set); absent when not computed. */
  insights?: Insight[];
  /** Hour-grained multi-metric collection series (route-set) — same contract as the
   *  Study Dashboard (StudioCollectionChart). Answers are hourly for historical
   *  surveys and daily for studio-native (answersHourly=false). */
  collectionSeries?: { t: string; answers: number; impressions: number; starts: number; completions: number }[];
  collectionGranularity?: "hour" | "day";
  answersHourly?: boolean;
  hasAnswers?: boolean;
  /** Answers-by-market for the donut (route-set) — same governed answer count. */
  markets?: { label: string; answers: number; starts: number }[];
};
export type PerformanceUnavailable = { authorised: false };
export type PerformanceResponse = PerformanceData | PerformanceUnavailable;

export type AssembleInput = {
  survey: { id: string; name: string; status: string | null; questionCount: number; questionLabels?: (string | null)[] };
  eventCounts: { event_type: string; event_count: number }[];
  /** Per-question ANSWERED counts (index-aligned) + provenance, resolved by the route. */
  perQuestionAnswers: number[];
  answerMode: PerformanceYield["mode"];
  startsByDay: Record<string, number>;
  viewableByDay: Record<string, number>;
  completedByDay: Record<string, number>;
  progressRows: CampaignProgressRow[];
  appliedFilters: ValidatedFilters;
  filterManifest: DashboardManifest;
  scope: { campaignCount: number; publisherCount: number };
  timing?: PerformanceTiming;
  filterRejected?: boolean;
  degraded?: boolean;
};

const EMPTY_TIMING: PerformanceTiming = { avgTtfiSeconds: null, avgCompletionSeconds: null, ttfiSample: 0, completionSample: 0 };

export function assemblePerformance(input: AssembleInput): PerformanceData {
  const counts = new Map(input.eventCounts.map((r) => [r.event_type, int(r.event_count)]));
  const loads = int(counts.get("SURVEY_RENDER"));
  const viewable = int(counts.get("SURVEY_VISIBLE"));
  const starts = int(counts.get("SURVEY_START"));
  const completions = int(counts.get("SURVEY_COMPLETED"));

  const n = Math.max(0, Math.min(5, Math.floor(input.survey.questionCount || 0)));
  const perQuestion: PerQuestionAnswer[] = Array.from({ length: n }, (_, i) => ({
    index: i,
    label: `Q${i + 1}`,
    answered: int(input.perQuestionAnswers[i]),
  }));
  const answersCollected = perQuestion.reduce((a, q) => a + q.answered, 0);

  const exposure: PerformanceExposure = {
    loads, viewable,
    // Viewability is forward-only (SURVEY_VISIBLE from a recent release). Null (→ "—")
    // when either side is 0, never a false 0% — matches the registry/KpiCards rule.
    viewability: loads > 0 && viewable > 0 ? viewable / loads : null,
  };
  const engagement: PerformanceEngagement = { starts, q1AnswerRate: loads > 0 ? starts / loads : null };
  const completion: PerformanceCompletion = { fullCompletions: completions, completionRate: starts > 0 ? completions / starts : null };

  const progress = plannedProgress(input.progressRows);
  const target: PerformanceTarget = {
    hasTarget: progress.hasTarget, targetTotal: progress.targetTotal, completedTowardTarget: progress.completedTowardTarget,
    untargetedResponses: progress.untargetedResponses, progressRatio: progress.progressRatio, targetReached: progress.targetReached,
  };

  return {
    authorised: true,
    filterRejected: !!input.filterRejected,
    survey: { id: input.survey.id, name: input.survey.name, status: input.survey.status, questionCount: n },
    yield: { answersCollected, perQuestion, mode: answersCollected === 0 ? "empty" : input.answerMode },
    exposure,
    engagement,
    completion,
    target,
    timing: input.timing ?? EMPTY_TIMING,
    journey: buildJourneyStages(counts, input.survey.questionCount, input.survey.questionLabels),
    timeseries: { granularity: "day", points: mergeDaySeries(input.startsByDay, input.viewableByDay, input.completedByDay) },
    scope: input.scope,
    appliedFilters: input.appliedFilters,
    filterManifest: input.filterManifest,
    degraded: !!input.degraded,
  };
}
