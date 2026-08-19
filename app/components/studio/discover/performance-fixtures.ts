// ── Performance preview fixtures (review harness, V2) ────────────────────────
// Representative PerformanceData for visual/product review WITHOUT real data or
// auth. Built through the REAL assembler so a fixture can never drift from the
// shipped shape. States exercise the revised research-yield philosophy — partial
// answers as evidence, exposure/engagement scale separation, historical vs
// studio-native. Fixtures only; never used by the live dashboard.

import { assemblePerformance, type PerformanceData } from "@/lib/studio/dashboard-performance";
import type { DashboardManifest } from "@/lib/studio/dashboard-manifest";
import { marginOfError, type DiscoverResults, type QuestionResultView } from "@/lib/studio/dashboard-results";
import { assembleStudy, type StudyData, type StudySurveyMetrics, type StudyPublisherRow, type ComparableGroup } from "@/lib/studio/dashboard-study";
import { buildStudyFindings } from "@/lib/studio/study-findings";
import { buildSurveyFindings, findingsContext, type SurveyQuestionEvidence, type SurveySegmentEvidence } from "@/lib/studio/survey-findings-engine";
import type { SegmentQuestion, SegmentGroupDist } from "@/lib/studio/study-segments";
import type { OptionResult } from "@/lib/studio/survey-results";
import type { FindingsResponse } from "@/app/api/survey-studio/discover/dashboards/[surveyId]/findings/route";
import type { SurveyAnalysisView } from "@/lib/studio/survey-analysis-service";

export const PREVIEW_STATES = ["healthy", "heavy-partial", "exposure-heavy", "dropoff", "no-target", "low", "empty", "multi"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

export const STUDY_PREVIEW_STATES = ["two-surveys", "mixed-fidelity", "multi-publisher", "one-underperformer", "large-study", "cross-org-managed", "manage-only"] as const;
export type StudyPreviewState = (typeof STUDY_PREVIEW_STATES)[number];

const DAYS = ["2026-08-08", "2026-08-09", "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];
const dayMap = (vals: number[]): Record<string, number> => {
  const o: Record<string, number> = {};
  DAYS.forEach((d, i) => { if (vals[i] != null) o[d] = vals[i]; });
  return o;
};
const ev = (o: Record<string, number>) => Object.entries(o).map(([event_type, event_count]) => ({ event_type, event_count }));
const scale = (total: number) => dayMap([0.18, 0.16, 0.15, 0.14, 0.13, 0.12, 0.12].map((f) => Math.round(total * f)));

// Deterministic integer spread of a total across n cells (largest-remainder → the
// buckets always sum EXACTLY to the total, so fixture answer totals stay authentic).
function spread(total: number, n: number): number[] {
  const weights = Array.from({ length: n }, (_, i) => 1 + Math.sin((i / Math.max(1, n - 1)) * Math.PI));
  const sw = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sw);
  const out = raw.map(Math.floor);
  const rem = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < rem; k++) out[order[k % n][1]]++;
  return out;
}
const HOURS = [10, 11, 12, 13, 14, 15];
/** Hour-grained multi-metric collection series whose per-metric totals are conserved
 *  EXACTLY. `t` is an ISO-hour instant, matching the route's contract. */
function collectionHours(answers: number, impressions: number, starts: number, completions: number): { t: string; answers: number; impressions: number; starts: number; completions: number }[] {
  const cells: string[] = [];
  for (const d of DAYS) for (const h of HOURS) cells.push(`${d}T${String(h).padStart(2, "0")}:00:00.000Z`);
  const A = spread(answers, cells.length), I = spread(impressions, cells.length), S = spread(starts, cells.length), C = spread(completions, cells.length);
  return cells.map((t, i) => ({ t, answers: A[i], impressions: I[i], starts: S[i], completions: C[i] }));
}

const NO_MANIFEST: DashboardManifest = { dimensions: [] };
const MULTI_MANIFEST: DashboardManifest = {
  dimensions: [
    { key: "publisher", label: "Publisher", values: [{ id: "pf", label: "Planet Football" }, { id: "f365", label: "Football365" }, { id: "tt", label: "TEAMtalk" }] },
    { key: "market", label: "Market", values: [{ id: "GB", label: "GB" }, { id: "DE", label: "DE" }] },
  ],
};

type Q = { survey: string; status: string; questionCount: number; labels: string[]; loads: number; viewable: number; starts: number; q2?: number; q3?: number; q4?: number; q5?: number; completed: number; answers: number[]; mode: "studio_native" | "historical"; target?: number | null; targetResp?: number; manifest?: DashboardManifest; pubCount?: number; campCount?: number; markets?: { label: string; answers: number; starts: number }[]; collectionGranularity?: "hour" | "day" };

function make(q: Q): PerformanceData {
  const counts: Record<string, number> = { SURVEY_RENDER: q.loads, SURVEY_VISIBLE: q.viewable, SURVEY_START: q.starts, SURVEY_COMPLETED: q.completed };
  if (q.q2 != null) counts.QUESTION_2_REACHED = q.q2;
  if (q.q3 != null) counts.QUESTION_3_REACHED = q.q3;
  if (q.q4 != null) counts.QUESTION_4_REACHED = q.q4;
  if (q.q5 != null) counts.QUESTION_5_REACHED = q.q5;
  const base = assemblePerformance({
    survey: { id: "preview", name: q.survey, status: q.status, questionCount: q.questionCount, questionLabels: q.labels },
    eventCounts: ev(counts),
    perQuestionAnswers: q.answers,
    answerMode: q.mode,
    startsByDay: scale(q.starts), viewableByDay: scale(q.viewable), completedByDay: scale(q.completed),
    progressRows: q.target == null ? [{ target_responses: null, response_count: q.targetResp ?? q.completed }] : [{ target_responses: q.target, response_count: q.targetResp ?? q.completed }],
    appliedFilters: {}, filterManifest: q.manifest ?? NO_MANIFEST, scope: { campaignCount: q.campCount ?? 4, publisherCount: q.pubCount ?? 1 },
  });
  const answersTotal = q.answers.reduce((a, b) => a + b, 0);
  return {
    ...base,
    collectionSeries: answersTotal > 0 || q.starts > 0 ? collectionHours(answersTotal, q.loads, q.starts, q.completed) : [],
    collectionGranularity: q.collectionGranularity ?? (q.mode === "historical" ? "hour" : "day"),
    answersHourly: q.mode === "historical",
    hasAnswers: answersTotal > 0,
    markets: q.markets ?? [],
  };
}

const L5 = ["Attend a match?", "Rate the experience", "Streaming habits", "Merch spend", "Recommend?"];
const L3 = ["Aware of sponsor?", "Association strength", "Purchase intent"];

export function performancePreview(state: PreviewState): PerformanceData {
  switch (state) {
    case "healthy":
      return make({ survey: "Matchday Experience 26/27", status: "live", questionCount: 5, labels: L5, loads: 210000, viewable: 168000, starts: 4200, q2: 3800, q3: 3400, q4: 3000, q5: 2600, completed: 2500, answers: [4200, 3800, 3400, 3000, 2500], mode: "studio_native", target: 3000, targetResp: 2500 });
    case "heavy-partial":
      return make({ survey: "Deep-Dive Fan Sentiment (5Q)", status: "live", questionCount: 5, labels: L5, loads: 96000, viewable: 74000, starts: 5000, q2: 4200, q3: 3100, q4: 1900, q5: 900, completed: 760, answers: [5000, 4200, 3100, 1900, 900], mode: "studio_native", target: null, targetResp: 760 });
    case "exposure-heavy":
      // Real FedEx v1: enormous exposure, partial-aware historical answers = 992, multi-market.
      return make({ survey: "FedEx UCL Sponsorship 26/27 - Survey", status: "ready", questionCount: 3, labels: ["FedEx as a Champions League sponsor?", "What should sponsors offer fans?", "How could FedEx help fans most?"], loads: 785862, viewable: 630000, starts: 561, q2: 560, q3: 236, completed: 196, answers: [560, 236, 196], mode: "historical", target: 500, targetResp: 196,
        markets: [{ label: "France", answers: 300, starts: 170 }, { label: "Germany", answers: 250, starts: 141 }, { label: "United Kingdom", answers: 220, starts: 124 }, { label: "Spain", answers: 130, starts: 74 }, { label: "Italy", answers: 92, starts: 52 }] });
    case "dropoff":
      return make({ survey: "Long Survey — steep drop-off", status: "live", questionCount: 5, labels: L5, loads: 120000, viewable: 90000, starts: 3000, q2: 2100, q3: 1200, q4: 620, q5: 300, completed: 240, answers: [3000, 2100, 1200, 620, 300], mode: "studio_native", target: 2000, targetResp: 240 });
    case "no-target":
      return make({ survey: "Always-on Brand Tracker", status: "live", questionCount: 3, labels: L3, loads: 88000, viewable: 66000, starts: 2400, q2: 2000, q3: 1700, completed: 1600, answers: [2400, 2000, 1700], mode: "studio_native", target: null, targetResp: 1600 });
    case "low":
      return make({ survey: "New Kit Launch Pulse", status: "live", questionCount: 2, labels: ["Seen the kit?", "Buying intent"], loads: 4200, viewable: 3100, starts: 60, q2: 44, completed: 38, answers: [60, 44], mode: "studio_native", target: 500, targetResp: 38, campCount: 1 });
    case "empty":
      return make({ survey: "Cup Final Study (just launched)", status: "scheduled", questionCount: 3, labels: L3, loads: 0, viewable: 0, starts: 0, completed: 0, answers: [0, 0, 0], mode: "studio_native", target: 500, targetResp: 0, campCount: 2 });
    case "multi":
      return make({ survey: "Cross-Publisher League Study", status: "live", questionCount: 4, labels: ["Which league?", "Platform", "Weekly hours", "Recommend"], loads: 520000, viewable: 410000, starts: 9000, q2: 8100, q3: 7200, q4: 6400, completed: 6000, answers: [9000, 8100, 7200, 6400], mode: "studio_native", target: 1800, targetResp: 2400, manifest: MULTI_MANIFEST, pubCount: 3, campCount: 6 });
  }
}

// ── Results preview ──────────────────────────────────────────────────────────
function qr(index: number, text: string, opts: [string, number][], shown: number | null): QuestionResultView {
  const answered = opts.reduce((a, [, c]) => a + c, 0);
  const options = opts.map(([label, count], i) => ({ optionId: String(i), label, count, percentage: answered > 0 ? count / answered : null }));
  return { questionIndex: index, questionId: `q${index}`, text, shown, answered, base: answered, completionRate: shown != null && shown > 0 ? answered / shown : null, options, marginOfError: marginOfError(answered) };
}

export function resultsPreview(state: PreviewState): DiscoverResults {
  if (state === "healthy") {
    // 5-question studio survey — per-question bases track the answered counts
    // [4200, 3800, 3400, 3000, 2500] so Σ bases = 16,900 = Answers Collected.
    return {
      mode: "studio_native", displayLanguage: "en",
      questions: [
        qr(0, "Do you attend Champions League matches in person?", [["Yes, regularly", 2400], ["Occasionally", 1200], ["Never", 600]], 4400),
        qr(1, "How would you rate the matchday experience?", [["Excellent", 1500], ["Good", 1400], ["Average", 620], ["Poor", 280]], 4000),
        qr(2, "How do you usually follow matches?", [["Live TV", 1450], ["Streaming", 1350], ["Highlights only", 600]], 3600),
        qr(3, "How much do you spend on club merchandise a year?", [["£0", 900], ["£1–£50", 1300], ["£50+", 800]], 3200),
        qr(4, "Would you recommend attending a match to a friend?", [["Definitely", 1400], ["Maybe", 800], ["Unlikely", 300]], 2600),
      ],
    };
  }
  if (state === "exposure-heavy") {
    // Historical (completed-only): shown UNAVAILABLE (null), base = completed answers.
    return {
      mode: "historical_completed_only", displayLanguage: "en",
      questions: [
        qr(0, "Are you aware FedEx sponsors the UEFA Champions League?", [["Yes", 142], ["No", 68]], null),
        qr(1, "How strongly do you associate FedEx with the UCL?", [["Very strongly", 61], ["Somewhat", 96], ["Not at all", 53]], null),
        qr(2, "Has this changed your view of FedEx?", [["More positive", 88], ["No change", 108], ["Less positive", 14]], null),
      ],
    };
  }
  return {
    mode: "studio_native", displayLanguage: "en",
    questions: [
      qr(0, "Which brand do you most associate with the UEFA Champions League?", [["Sponsor A", 520], ["Sponsor B", 190], ["Sponsor C", 120], ["None", 90]], 940),
      qr(1, "How would you rate the matchday experience?", [["Excellent", 410], ["Good", 300], ["Average", 110], ["Poor", 40]], 900),
      qr(2, "Would you recommend attending a match?", [["Definitely", 480], ["Maybe", 240], ["No", 60]], 820),
    ],
  };
}

// ── Findings preview (deterministic engine over the SAME fixture distributions) ─
function segGroup(label: string, pairs: [string, number][]): SegmentGroupDist {
  const base = pairs.reduce((a, [, c]) => a + c, 0);
  const options: OptionResult[] = pairs.map(([l, c], i) => ({ optionId: String(i), label: l, count: c, percentage: base > 0 ? c / base : null }));
  return { key: label, label, base, options };
}
function segQuestion(text: string, groups: SegmentGroupDist[]): SegmentQuestion {
  const n = Math.max(...groups.map((g) => g.options.length));
  const pooled = Array.from({ length: n }, (_, i) => groups.reduce((a, g) => a + (g.options[i]?.count ?? 0), 0));
  const base = pooled.reduce((a, b) => a + b, 0);
  const overall: OptionResult[] = groups[0].options.map((o, i) => ({ optionId: o.optionId, label: o.label, count: pooled[i], percentage: base > 0 ? pooled[i] / base : null }));
  return { canonicalQuestionKey: `seg-${text}`, question: text, dimension: "market", overall, overallBase: base, groups };
}
function findingsSegments(state: PreviewState): SurveySegmentEvidence[] {
  // A genuine market difference for review (UK recognises the sponsor, Germany doesn't).
  if (state === "exposure-heavy") {
    return [{ dimension: "market", questions: [
      segQuestion("Are you aware FedEx sponsors the UEFA Champions League?", [
        segGroup("United Kingdom", [["Yes", 110], ["No", 40]]),
        segGroup("Germany", [["Yes", 32], ["No", 66]]),
      ]),
    ] }];
  }
  return [];
}
// A completed research synthesis (STATE 2) for visual review — the shape the real
// AI pipeline persists, built here as a fixture (no model call).
const SYNTHESIS_FIXTURE: SurveyAnalysisView = {
  narrative: {
    headline: "A credible sponsorship fit that is not yet fully landed",
    summary: "Respondents lean towards seeing FedEx as a natural Champions League partner, but that read is tempered: a large share find the association unclear and a notable minority have not registered it at all. When asked what sponsors should offer, fans favour tangible value — rewards and experiences — over passive visibility. The overall picture is of permission to play that the sponsorship has not yet converted into a clearly understood role.",
    evidenceRefs: ["e1", "e4"],
  },
  themes: [
    { id: "t1", title: "Recognition is established but uneven", interpretation: "The leading view is a natural fit, yet uncertainty and non-recognition together outweigh it — the connection exists but is not clearly understood.", importance: "primary", relationToObjective: "Directly addresses how the sponsorship is perceived.", proposalIds: ["p1", "p2"], evidenceRefs: ["e1", "e2"] },
    { id: "t2", title: "Fans value substance over visibility", interpretation: "Asked what sponsors should offer, respondents prioritise rewards and experiences ahead of mere presence.", importance: "primary", relationToObjective: "Points to where the sponsorship could add value.", proposalIds: ["p3"], evidenceRefs: ["e4"] },
  ],
  findings: [
    { id: "p1", displayType: "observation", priority: "key", headline: "A natural fit leads, but only as a plurality", explanation: "The most-selected view is a strong natural fit, ahead of the alternatives — a credible base to build on.", supportingQuestions: ["How do you rate FedEx as a Champions League sponsor?"], base: 210 },
    { id: "p2", displayType: "tension", priority: "key", headline: "Uncertainty and non-recognition together outweigh the positive read", explanation: "A large share find the association unclear and a notable minority have never noticed it — the fit is not yet clearly understood.", supportingQuestions: ["How do you rate FedEx as a Champions League sponsor?"], base: 210 },
    { id: "p3", displayType: "observation", priority: "supporting", headline: "Fans want tangible value from sponsors", explanation: "Rewards and better experiences lead what respondents think sponsors should offer, ahead of passive brand presence.", supportingQuestions: ["What should sponsors offer fans?"], base: 140 },
  ],
  generatedAt: "2026-08-18T09:00:00Z",
  noStrongConclusions: false,
};

export function findingsPreview(state: PreviewState): Extract<FindingsResponse, { authorised: true }> {
  const results = resultsPreview(state);
  const questions: SurveyQuestionEvidence[] = results.questions.map((q) => ({
    index: q.questionIndex, questionId: q.questionId, text: q.text, base: q.base, shown: q.shown, options: q.options,
  }));
  const findings = buildSurveyFindings({ surveyName: "Preview survey", mode: results.mode, questions, segments: findingsSegments(state) });
  const answers = questions.reduce((a, q) => a + q.base, 0);
  // Emerging while collecting; Final once closed (historical/exposure-heavy).
  const live = state === "healthy" || state === "heavy-partial" || state === "dropoff" || state === "multi";
  const context = findingsContext({ hasLiveCampaign: live, totalAnswered: answers });
  // "exposure-heavy" previews STATE 2 (a completed synthesis); others preview STATE 1.
  const analysis = state === "exposure-heavy" ? SYNTHESIS_FIXTURE : null;
  const analysisEligible = answers >= 30;
  return {
    authorised: true, filterRejected: false,
    survey: { id: "preview", name: "Preview survey", questionCount: questions.length },
    context, counts: { answers, questions: questions.length }, mode: results.mode, findings, analysis,
    coreIntelligence: null,
    analysisEligible,
    // In preview, treat the viewer as authorised so the restrained CTA is reviewable
    // wherever the survey is eligible and has no completed analysis.
    canGenerate: analysisEligible && analysis == null,
  };
}

// ── Study preview ────────────────────────────────────────────────────────────
const sm = (over: Partial<StudySurveyMetrics>): StudySurveyMetrics => ({
  surveyId: "s", name: "S", questionCount: 3, mode: "studio_native", publishers: [], markets: [], loads: 0, viewable: 0, starts: 0, completions: 0, answersCollected: 0,
  answersByPosition: over.answersByPosition ?? Array.from({ length: over.questionCount ?? 3 }, (_, k) => Math.round(((over.answersCollected ?? 0) / (over.questionCount ?? 3)) * (1 - k * 0.06))),
  ...over,
});
const pub = (label: string, starts: number, completions: number, answers: number): StudyPublisherRow => ({ label, starts, completions, answers, completionRate: starts > 0 ? completions / starts : null });

// Real audited FedEx v1/v2 completed-answer distributions (used to build genuine
// comparable groups + Research Findings in the preview, mirroring production).
const FEDEX_Q = [
  { key: "q1784274521335", text: "FedEx as a Champions League sponsor?", opts: ["Strong natural fit", "Relevant but unclear", "Mostly brand visibility", "Never noticed them"], v1: [62, 58, 23, 53], v2: [30, 27, 6, 15] },
  { key: "q1784274609994", text: "What should sponsors offer fans?", opts: ["Exclusive access", "Rewards and benefits", "Better fan experiences", "Investment in grassroots"], v1: [41, 66, 41, 48], v2: [18, 34, 19, 7] },
  { key: "q1784274682306", text: "How could FedEx help fans most?", opts: ["Access to experiences", "Connecting football fans", "Exclusive football content", "Supporting local communities"], v1: [61, 49, 47, 39], v2: [29, 18, 11, 20] },
];
const fedexGroup = (q: (typeof FEDEX_Q)[number]): ComparableGroup => {
  const mk = (id: string, name: string, counts: number[]) => { const base = counts.reduce((a, b) => a + b, 0); return { surveyId: id, surveyName: name, base, options: q.opts.map((label, i) => ({ label, count: counts[i], percentage: base > 0 ? (counts[i] / base) * 100 : null })) }; };
  return { canonicalKey: q.key, text: q.text, surveys: [mk("a", "Survey", q.v1), mk("b", "Survey v2", q.v2)] };
};
export const FEDEX_COMPARABLE_GROUPS: ComparableGroup[] = FEDEX_Q.map(fedexGroup);

export function studyPreview(state: StudyPreviewState): StudyData {
  const points = scale(4000) && DAYS.map((date, i) => ({ date, starts: [600, 560, 540, 520, 500, 480, 460][i], viewable: [12000, 11000, 10500, 10000, 9500, 9200, 9000][i], completions: [300, 280, 270, 260, 250, 240, 230][i] }));
  const base = { studyId: "study-preview", studyName: "FedEx UCL Sponsorship 26/27", points, insights: [{ id: "geo", text: "United Kingdom generated 46% of survey starts." }, { id: "device", text: "Mobile accounted for 81% of survey starts." }] };
  switch (state) {
    case "two-surveys": {
      // Mirrors the REAL FedEx UCL two-survey study (partial-aware historical counts).
      const study = assembleStudy({ ...base,
        surveys: [
          sm({ surveyId: "a", name: "FedEx UCL Sponsorship 26/27 - Survey", questionCount: 3, mode: "historical", starts: 561, completions: 196, answersCollected: 992, answersByPosition: [560, 236, 196], loads: 700000, viewable: 560000, publishers: ["Football365"], markets: ["GB"] }),
          sm({ surveyId: "b", name: "FedEx UCL Sponsorship 26/27 - Survey v2", questionCount: 3, mode: "historical", starts: 91, completions: 78, answersCollected: 250, answersByPosition: [91, 81, 78], loads: 85862, viewable: 68000, publishers: ["Football365"], markets: ["GB"] }),
        ],
        publishers: [pub("Football365", 652, 274, 1242)],
        markets: [pub("France", 173, 72, 300), pub("Germany", 152, 63, 285), pub("United Kingdom", 146, 61, 272), pub("Spain", 118, 49, 220), pub("Italy", 63, 29, 165)],
        timing: { avgCompletionSeconds: 48, avgTtfiSeconds: 6, completionSample: 274, ttfiSample: 561 },
      });
      const qA = qr(0, "Aware FedEx sponsors the Champions League?", [["Yes", 340], ["No", 220]], 560);
      const qB = qr(0, "Aware FedEx sponsors the Champions League?", [["Yes", 54], ["No", 37]], 91);
      return {
        ...study,
        results: [
          { surveyId: "a", surveyName: "FedEx UCL Sponsorship 26/27 - Survey", mode: "historical_completed_only", questions: [qA, qr(1, "How strongly do you associate FedEx with the UCL?", [["Strongly", 90], ["Somewhat", 74], ["Not at all", 32]], 196)] },
          { surveyId: "b", surveyName: "FedEx UCL Sponsorship 26/27 - Survey v2", mode: "historical_completed_only", questions: [qB, qr(1, "What should sponsors offer fans?", [["Ticket access", 36], ["Content", 26], ["Discounts", 16]], 78)] },
        ],
        comparableGroups: FEDEX_COMPARABLE_GROUPS,
        researchFindings: buildStudyFindings({ comparableGroups: FEDEX_COMPARABLE_GROUPS }),
        filterManifest: { dimensions: [{ key: "survey", label: "Survey", values: [{ id: "a", label: "Survey" }, { id: "b", label: "Survey v2" }] }, { key: "market", label: "Market", values: [{ id: "United Kingdom", label: "United Kingdom" }, { id: "Germany", label: "Germany" }, { id: "France", label: "France" }, { id: "Spain", label: "Spain" }, { id: "Italy", label: "Italy" }] }] as never },
        surveysInScope: [{ id: "a", name: "Survey" }, { id: "b", name: "Survey v2" }],
        collectionSeries: collectionHours(1242, 785862, 652, 274),
        collectionGranularity: "hour", answersHourly: true, hasAnswers: true,
      };
    }
    case "mixed-fidelity": {
      const study = assembleStudy({ ...base, surveys: [sm({ surveyId: "a", name: "Wave 1 (historical)", questionCount: 3, mode: "historical", starts: 91, completions: 78, answersCollected: 234, answersByPosition: [91, 65, 78], loads: 74831, viewable: 63349, publishers: ["LiveScore"], markets: ["GB"] }), sm({ surveyId: "b", name: "Wave 2 (studio)", questionCount: 5, mode: "studio_native", starts: 3200, completions: 1400, answersCollected: 11800, loads: 180000, viewable: 140000, publishers: ["LiveScore"], markets: ["GB"] })], publishers: [pub("LiveScore", 3291, 1478, 12034)] });
      // Studio survey present → Answers are day-resolution (answersHourly false).
      return { ...study, collectionSeries: collectionHours(12034, 254831, 3291, 1478), collectionGranularity: "day", answersHourly: false, hasAnswers: true };
    }
    case "multi-publisher": {
      const study = assembleStudy({ ...base, studyName: "Women's World Cup Study", surveys: [sm({ surveyId: "a", name: "Fan Study — UK", questionCount: 4, starts: 5000, completions: 2400, answersCollected: 16000, loads: 260000, viewable: 205000, publishers: ["Planet Football"], markets: ["GB"] }), sm({ surveyId: "b", name: "Fan Study — DE", questionCount: 4, starts: 3800, completions: 1900, answersCollected: 12200, loads: 190000, viewable: 150000, publishers: ["Football365"], markets: ["DE"] }), sm({ surveyId: "c", name: "Fan Study — FR", questionCount: 4, starts: 2600, completions: 1100, answersCollected: 8100, loads: 140000, viewable: 108000, publishers: ["TEAMtalk"], markets: ["FR"] })], publishers: [pub("Planet Football", 5000, 2400, 16000), pub("Football365", 3800, 1900, 12200), pub("TEAMtalk", 2600, 1100, 8100)], markets: [pub("United Kingdom", 5000, 2400, 16000), pub("Germany", 3800, 1900, 12200), pub("France", 2600, 1100, 8100)] });
      return { ...study, collectionSeries: collectionHours(36300, 590000, 11400, 5400), collectionGranularity: "day", answersHourly: false, hasAnswers: true,
        filterManifest: { dimensions: [{ key: "market", label: "Market", values: [{ id: "United Kingdom", label: "United Kingdom" }, { id: "Germany", label: "Germany" }, { id: "France", label: "France" }] }, { key: "publisher", label: "Publisher", values: [{ id: "pf", label: "Planet Football" }, { id: "f365", label: "Football365" }, { id: "tt", label: "TEAMtalk" }] }] as never } };
    }
    case "one-underperformer": {
      const study = assembleStudy({ ...base, surveys: [sm({ surveyId: "a", name: "Strong yield, low completion", questionCount: 5, starts: 4000, completions: 500, answersCollected: 13800, loads: 200000, viewable: 160000, publishers: ["FotMob"], markets: ["GB"] }), sm({ surveyId: "b", name: "Balanced performer", questionCount: 3, starts: 2800, completions: 1900, answersCollected: 7600, loads: 140000, viewable: 112000, publishers: ["FotMob"], markets: ["GB"] })], publishers: [pub("FotMob", 6800, 2400, 21400)] });
      return { ...study, collectionSeries: collectionHours(21400, 340000, 6800, 2400), collectionGranularity: "day", answersHourly: false, hasAnswers: true };
    }
    case "large-study": {
      const names = ["UK core", "Germany", "France", "Spain", "Italy", "Netherlands", "Portugal", "Nordics", "Poland", "Rest of EU"];
      const surveys = names.map((n, i) => sm({ surveyId: `s${i}`, name: `WWC Fan Study — ${n}`, questionCount: 4, starts: 5200 - i * 380, completions: 2100 - i * 150, answersCollected: 17600 - i * 1300, loads: 240000 - i * 16000, viewable: 190000 - i * 13000, publishers: [["FotMob", "LiveScore", "Football365"][i % 3]], markets: [n] }));
      const study = assembleStudy({ ...base, studyName: "Women's World Cup 2027 — Pan-European Study", surveys, publishers: [pub("FotMob", 12000, 5200, 41000), pub("LiveScore", 9800, 4100, 33000), pub("Football365", 7600, 3200, 26000)], markets: names.map((n, i) => pub(n, 5200 - i * 380, 2100 - i * 150, 17600 - i * 1300)) });
      return { ...study, collectionSeries: collectionHours(120000, 1800000, 34000, 14000), collectionGranularity: "day", answersHourly: false, hasAnswers: true };
    }
    case "cross-org-managed": {
      // A user study a Fanometrix operator manages for a client org — owner context shown.
      const base2 = studyPreview("two-surveys");
      return { ...base2, studyName: "FedEx UCL Study", kind: "user", canManage: true, ownerOrganisationName: "Football365" };
    }
    case "manage-only": {
      // A study-operator (or owner) without data authority — management-only shell.
      const base2 = studyPreview("two-surveys");
      return { ...base2, studyName: "FedEx UCL Study", kind: "user", canManage: true, manageOnly: true, ownerOrganisationName: "Football365" };
    }
  }
}

// ── Landing preview ──────────────────────────────────────────────────────────
import type { DashboardContext, LandingStudy, LandingSurvey } from "@/app/api/survey-studio/discover/dashboards/context/route";

export const LANDING_PREVIEW_STATES = ["multi-study", "studies-and-standalone", "only-standalone", "one-survey", "empty"] as const;
export type LandingPreviewState = (typeof LANDING_PREVIEW_STATES)[number];

const lstudy = (studyName: string, surveyCount: number, publisherCount: number, marketCount: number, completions: number, kind: "canonical" | "user" = "canonical", answersCollected?: number): LandingStudy => ({ studyId: studyName.replace(/\s+/g, "-").toLowerCase(), studyName, surveyCount, publisherCount, marketCount, completions, answersCollected: answersCollected ?? completions, kind, canManage: kind === "user" });
const lsurvey = (name: string, questionCount: number, campaignCount: number, completions: number, studyId: string | null = null, status = "live", answersCollected?: number): LandingSurvey => ({ id: name.replace(/\s+/g, "-").toLowerCase(), name, status, questionCount, campaignCount, publisherCount: 1, marketCount: 1, completions, answersCollected: answersCollected ?? completions, studyId });
const ctx = { organisationName: "Fanometrix", organisationType: "internal", unrestricted: true };
const noManifest = { dimensions: [] as never[] };

// New IA: every authorised survey appears in `surveys` (incl. study members).
export function landingPreview(state: LandingPreviewState): DashboardContext {
  const base = { context: ctx, filterManifest: noManifest };
  const fedex = "fedex-ucl-study";
  switch (state) {
    case "multi-study":
      // Discover Studies are USER-created groupings only (canonical exercises are not shown here).
      return { ...base, canCreateStudy: true,
        studies: [lstudy("My WWC Group", 3, 3, 3, 5400, "user", 24800), lstudy("FedEx UCL Study", 2, 4, 5, 274, "user", 1242), lstudy("Q3 Brand Tracker", 2, 1, 1, 1600, "user", 4200)],
        surveys: [lsurvey("FedEx UCL Sponsorship 26/27 - Survey", 3, 20, 196, fedex, "live", 992), lsurvey("FedEx UCL Sponsorship 26/27 - Survey v2", 3, 2, 78, fedex, "live", 250), lsurvey("WWC Fan Study - UK", 4, 6, 2400, "wwc"), lsurvey("WWC Fan Study - DE", 4, 5, 1900, "wwc"), lsurvey("WWC Fan Study - FR", 4, 4, 1100, "wwc"), lsurvey("Pre-season Brand Tracker - Survey", 3, 3, 1600, "psbt")],
        scope: { studyCount: 3, surveyCount: 6 } };
    case "studies-and-standalone":
      return { ...base, canCreateStudy: true,
        studies: [lstudy("FedEx UCL Study", 2, 4, 5, 274, "user", 1242)],
        surveys: [lsurvey("FedEx UCL Sponsorship 26/27 - Survey", 3, 20, 196, fedex, "live", 992), lsurvey("FedEx UCL Sponsorship 26/27 - Survey v2", 3, 2, 78, fedex, "live", 250), lsurvey("New Kit Launch Pulse", 2, 1, 38), lsurvey("Matchday NPS", 3, 2, 820, null, "ready")],
        scope: { studyCount: 1, surveyCount: 4 } };
    case "only-standalone":
      return { ...base, canCreateStudy: true, studies: [],
        surveys: [lsurvey("New Kit Launch Pulse", 2, 1, 38), lsurvey("Matchday NPS", 3, 2, 820), lsurvey("Brand Awareness Q3", 3, 4, 2400)],
        scope: { studyCount: 0, surveyCount: 3 } };
    case "one-survey": // too few eligible surveys → no Create-study affordance
      return { ...base, canCreateStudy: false, studies: [],
        surveys: [lsurvey("Matchday NPS", 3, 2, 820)],
        scope: { studyCount: 0, surveyCount: 1 } };
    case "empty":
      return { ...base, canCreateStudy: false, studies: [], surveys: [], scope: { studyCount: 0, surveyCount: 0 } };
  }
}

// ── Create-study workflow preview (the picker with N eligible surveys) ────────
export const CREATE_STUDY_PREVIEW_STATES = ["six-surveys", "many-surveys", "wwc-publisher", "edit-preselected", "edit-crossorg"] as const;
export type CreateStudyPreviewState = (typeof CREATE_STUDY_PREVIEW_STATES)[number];

/** Edit-mode preview: the WWC publisher universe with a named study + two members
 *  preselected. `crossOrg` adds owner context (a Fanometrix operator editing a
 *  client's study — the "for [Org]" treatment). */
export function createStudyEditPreview(crossOrg = false): { context: DashboardContext; editing: { name: string; memberSurveyIds: string[]; ownerOrganisation?: { id: string; name: string } | null } } {
  const context = createStudyPreview("wwc-publisher");
  return { context, editing: { name: "My WWC Group", memberSurveyIds: context.surveys.slice(0, 2).map((s) => s.id), ownerOrganisation: crossOrg ? { id: "f365", name: "Football365" } : null } };
}

export function createStudyPreview(state: CreateStudyPreviewState): DashboardContext {
  const base = { context: ctx, filterManifest: noManifest };
  if (state === "six-surveys") {
    const surveys = Array.from({ length: 6 }, (_, i) => lsurvey(`Fan Study — ${["UK", "France", "Germany", "Spain", "Italy", "Netherlands"][i]}`, 4, 3 + i, 1200 - i * 90, null));
    return { ...base, canCreateStudy: true, studies: [], surveys, scope: { studyCount: 0, surveyCount: 6 } };
  }
  if (state === "many-surveys") {
    const surveys = Array.from({ length: 24 }, (_, i) => lsurvey(`Market Pulse #${i + 1}`, 3 + (i % 3), 2 + (i % 5), 400 + i * 37, null));
    return { ...base, canCreateStudy: true, studies: [], surveys, scope: { studyCount: 0, surveyCount: 24 } };
  }
  // Football365 authorised for only its 3 of the 10-survey WWC research universe.
  const surveys = [lsurvey("WWC — UK (Football365)", 5, 6, 2400), lsurvey("WWC — France (Football365)", 5, 5, 1900), lsurvey("WWC — Germany (Football365)", 5, 4, 1100)];
  return { ...base, canCreateStudy: true, studies: [], surveys, scope: { studyCount: 0, surveyCount: 3 } };
}
