// ── Survey Studio → Dashboards → Study — pure aggregation ────────────────────
// A Study Dashboard aggregates STRUCTURALLY COMPARABLE metrics across the surveys
// in a study that the caller is ALREADY authorised to see (intersect-only). It
// never compares unlike question distributions. Rates are ALWAYS recomputed from
// aggregate numerators/denominators — never averaged from survey-level percentages.
// Fairness across different question counts: total answers is shown alongside
// starts, question count and average answers per start.
import type { TimePoint } from "@/lib/studio/dashboard-performance";
import type { Insight } from "@/lib/studio/dashboard-insights";
import { marginOfError, type QuestionResultView, type ResultsMode } from "@/lib/studio/dashboard-results";
import type { DashboardManifest, ValidatedFilters } from "@/lib/studio/dashboard-manifest";

/** Actual questions + distributions for ONE survey (never merged across surveys). */
export type StudyResultsGroup = { surveyId: string; surveyName: string; mode: ResultsMode; questions: QuestionResultView[] };

/** A genuinely comparable question shared across surveys (proven canonical identity
 *  + compatible answer scale). Options are pooled ONLY within such a group. */
export type ComparableGroup = {
  canonicalKey: string;
  text: string;
  surveys: { surveyId: string; surveyName: string; base: number; options: { label: string; count: number; percentage: number | null }[] }[];
};

/** Study filter state (all values validated against the authorised universe). */
export type StudyFilters = ValidatedFilters & { survey?: string };

export type StudyMode = "studio_native" | "historical";

/** Per-survey comparable metrics (computed by the route over each survey's slugs). */
export type StudySurveyMetrics = {
  surveyId: string;
  name: string;
  questionCount: number;
  mode: StudyMode;
  publishers: string[];
  markets: string[];
  loads: number;
  viewable: number;
  starts: number;
  completions: number;
  answersCollected: number;
  /** Answers by question POSITION (index 0-based) for THIS survey. */
  answersByPosition: number[];
};

/** Events-based timing over the Study union (avg only; median deferred). */
export type StudyTiming = { avgCompletionSeconds: number | null; avgTtfiSeconds: number | null; completionSample: number; ttfiSample: number };

export type StudyEngagement = {
  loads: number;
  viewable: number;
  viewability: number | null;
  starts: number;
  startRate: number | null;              // starts ÷ loads
  fullCompletions: number;
  completionRate: number | null;         // completions ÷ starts
  /** POSITION-based yield: total answers at question position k across in-scope
   *  surveys. NOT a merged research question — position ≠ identity. Dynamic length.
   *  Historical counts come from PROGRESSION EVENTS (partial-aware), not completions. */
  perPosition: { position: number; answers: number }[];
  /** Engagement progression funnel: Started → Q1 … QN answered → Completed.
   *  Event-based counts (each Qk = answered position k). Position ≠ question identity. */
  progression: { key: string; label: string; count: number }[];
  timing: StudyTiming;
};

/** Study-level confidence at the completed-response base. Per-question confidence
 *  (Results) remains authoritative; this is a study-wide indicator only. */
export type StudyConfidence = { level: number; base: number; marginOfError: number | null; note: string };

/** Sample quality is NOT fabricated — until governed quality signals exist it is
 *  explicitly "Not yet assessed" (see the Stage-6 audit). */
export type StudySampleQuality = { assessed: false; label: string; reason: string };

export type StudySurveyRow = StudySurveyMetrics & {
  avgAnswersPerStart: number | null;
  viewability: number | null;
  completionRate: number | null;
};

export type StudyPublisherRow = { label: string; starts: number; completions: number; answers: number; completionRate: number | null };
/** Same comparable shape, keyed by market (where Market is an authorised dimension). */
export type StudyMarketRow = StudyPublisherRow;

export type StudyTopline = {
  surveyCount: number;
  loads: number;
  viewable: number;
  viewability: number | null;
  starts: number;
  completions: number;
  completionRate: number | null;
  answersCollected: number;
  avgAnswersPerStart: number | null;
};

/** A deterministic, answer-derived Research Finding (what respondents told us),
 *  computed only from COMPLETED answer VALUES over directlyComparable questions.
 *  Never AI narrative; always explainable from `evidence`. */
export type StudyFinding = {
  id: string;
  kind: "leading" | "consistent" | "change";
  /** Short label chip (kind-derived, never a fabricated editorial category). */
  eyebrow: string;
  /** The question the finding is about (context, not a merged identity). */
  question: string;
  text: string;
  /** n of completed answer VALUES behind the finding (NOT partial answer counts). */
  base: number;
  emphasis: "primary" | "supporting";
  tone: "neutral" | "positive" | "negative";
  /** Percentage-point movement for change findings (self-consistent with the text). */
  delta?: { pp: number };
  /** Everything needed to re-derive/verify the finding. */
  evidence: {
    surveys: string[];
    option: string;
    pct: number;
    runnerUp?: { option: string; pct: number };
    perSurvey?: { name: string; pct: number }[];
  };
};

export type StudyData = {
  authorised: true;
  studyId: string;
  studyName: string | null;
  topline: StudyTopline;
  engagement: StudyEngagement;
  confidence: StudyConfidence;
  sampleQuality: StudySampleQuality;
  surveys: StudySurveyRow[];
  publishers: StudyPublisherRow[];
  markets: StudyMarketRow[];
  timeseries: { granularity: "day"; points: TimePoint[] };
  insights: Insight[];
  /** true when the study mixes studio-native and historical surveys — comparison
   *  must stay honest about differing measurement fidelity. */
  mixedMode: boolean;
  degraded: boolean;
  // ── route-set (optional; absent in the pure fixture path) ──
  /** Actual questions/answers grouped by Survey → Question (never merged). */
  results?: StudyResultsGroup[];
  /** Cross-survey comparisons ONLY where canonical identity + scale are proven. */
  comparableGroups?: ComparableGroup[];
  /** Multi-metric collection series (route-set), keyed by ISO instant `t` at the
   *  resolution given by `collectionGranularity`. Impressions/Starts/Completions are
   *  exact hourly (event_series); Answers are hourly for historical surveys
   *  (progression events) and daily for studio-native (response_answers). */
  collectionSeries?: { t: string; answers: number; impressions: number; starts: number; completions: number }[];
  /** Resolution of `t` — "hour" when every source supports it, else "day". */
  collectionGranularity?: "hour" | "day";
  /** True when Answers are safe at hourly resolution (no studio-native answer source). */
  answersHourly?: boolean;
  /** Whether any Answers exist in scope (else the chart defaults off the Answers metric). */
  hasAnswers?: boolean;
  /** Deterministic answer-derived Research Findings for the CURRENT filtered scope
   *  (route-set). Empty when the scope can't support any (fail closed). */
  researchFindings?: StudyFinding[];
  /** Provenance: canonical research Study vs organisation-created analysis grouping. */
  kind?: "canonical" | "user";
  /** For a user study the caller's organisation owns: may rename/edit/delete it. */
  canManage?: boolean;
  /** For a user study: fewer than 2 currently-authorised member surveys. */
  belowMinimum?: boolean;
  /** For a user study a managing operator views across orgs: the owning org's name
   *  (null for own-org viewers / canonical — never leaked). */
  ownerOrganisationName?: string | null;
  /** Management-only shell: the caller may manage this study but has NO data authority
   *  to its surveys, so NO analytics are present. */
  manageOnly?: boolean;
  /** Governed filter manifest for the Study universe (+ a Survey dimension). */
  filterManifest?: DashboardManifest;
  appliedFilters?: StudyFilters;
  /** The authorised surveys in this study, for the Survey filter control. */
  surveysInScope?: { id: string; name: string }[];
};
export type StudyResponse = StudyData | { authorised: false };

const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);
const viewability = (viewable: number, loads: number): number | null => (loads > 0 && viewable > 0 ? viewable / loads : null);

export function assembleStudy(input: {
  studyId: string;
  studyName: string | null;
  surveys: StudySurveyMetrics[];
  publishers: StudyPublisherRow[];
  markets?: StudyMarketRow[];
  points: TimePoint[];
  insights: Insight[];
  timing?: StudyTiming;
  degraded?: boolean;
}): StudyData {
  const sum = (f: (s: StudySurveyMetrics) => number) => input.surveys.reduce((a, s) => a + f(s), 0);
  const loads = sum((s) => s.loads), viewable = sum((s) => s.viewable), starts = sum((s) => s.starts);
  const completions = sum((s) => s.completions), answersCollected = sum((s) => s.answersCollected);

  const topline: StudyTopline = {
    surveyCount: input.surveys.length,
    loads, viewable, viewability: viewability(viewable, loads),
    starts, completions, completionRate: ratio(completions, starts),
    answersCollected, avgAnswersPerStart: ratio(answersCollected, starts),
  };

  // POSITION-based yield: Σ answers at position k across surveys that HAVE a Qk.
  const maxPos = Math.max(0, ...input.surveys.map((s) => s.questionCount));
  const perPosition = Array.from({ length: Math.min(5, maxPos) }, (_, k) => ({
    position: k + 1,
    answers: input.surveys.reduce((a, s) => a + (s.answersByPosition[k] ?? 0), 0),
  }));

  const timing: StudyTiming = input.timing ?? { avgCompletionSeconds: null, avgTtfiSeconds: null, completionSample: 0, ttfiSample: 0 };
  const progression = [
    { key: "started", label: "Started", count: starts },
    ...perPosition.map((p) => ({ key: `q${p.position}`, label: `Q${p.position}`, count: p.answers })),
    { key: "completed", label: "Completed", count: completions },
  ];
  const engagement: StudyEngagement = {
    loads, viewable, viewability: viewability(viewable, loads),
    starts, startRate: ratio(starts, loads),
    fullCompletions: completions, completionRate: ratio(completions, starts),
    perPosition, progression, timing,
  };

  // Study-wide confidence at the completed-response base (per-question is authoritative).
  const confidence: StudyConfidence = {
    level: 95, base: completions, marginOfError: marginOfError(completions),
    note: "Study-wide indicator at the completed-response base; per-question confidence (with each question's own n) is shown in Results.",
  };
  const sampleQuality: StudySampleQuality = {
    assessed: false, label: "Not yet assessed",
    reason: "Response-quality signals (duplicate sessions, implausibly fast completion, automation markers) are not yet governed metrics.",
  };

  const surveys: StudySurveyRow[] = input.surveys
    .map((s) => ({ ...s, avgAnswersPerStart: ratio(s.answersCollected, s.starts), viewability: viewability(s.viewable, s.loads), completionRate: ratio(s.completions, s.starts) }))
    .sort((a, b) => b.answersCollected - a.answersCollected);

  return {
    authorised: true,
    studyId: input.studyId,
    studyName: input.studyName,
    topline,
    engagement,
    confidence,
    sampleQuality,
    surveys,
    publishers: input.publishers,
    markets: input.markets ?? [],
    timeseries: { granularity: "day", points: input.points },
    insights: input.insights,
    mixedMode: new Set(input.surveys.map((s) => s.mode)).size > 1,
    degraded: !!input.degraded,
  };
}
