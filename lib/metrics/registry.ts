// The canonical metric registry for Fanometrix.
//
// Add every metric surfaced anywhere in the product here, keyed by a stable id,
// and render its label/tooltip via this registry (see components/metrics/
// MetricInfo). This guarantees one definition per metric across dashboards,
// reports, Conversation Intelligence, the Research Library and future products.
//
// Definitions for the survey timing metrics MUST stay in sync with the event
// model in docs/metrics-timing.md (SURVEY_VISIBLE / SURVEY_START / SURVEY_COMPLETED).

import type { MetricDefinition } from "./types";

// ROADMAP — candidate Collection Health metrics, in agreed priority order. Not
// yet implemented; add here (with event model / formula) when built:
//   1. Drop-off Point            — which question respondents abandon on (from QUESTION_2/3_REACHED).
//   2. Median Completion Time    — median of SURVEY_START→SURVEY_COMPLETED (robust to outliers vs the mean).
//   3. Visible-but-No-Start Rate — SURVEY_VISIBLE without a SURVEY_START (creative attention quality).
//   4. Projected Time to Confidence — at the current completion rate, when does n reach the ±5% MoE threshold.
//   5. Sample Representativeness  — skew of the sample across country / publisher / audience segment
//                                   (flags an unbalanced sample even when statistical confidence is high).

// Current review stamp for the survey / Collection Health metrics.
const VERIFIED = "2026-07-22";

const DEFINITIONS: MetricDefinition[] = [
  // ── Exposure ────────────────────────────────────────────────────────────
  {
    id: "impressions_loads",
    name: "Impressions (Loads)",
    definition: "The number of times the survey creative loaded — one per ad load, whether or not it was scrolled into view. Comparable to an ad-server impression and consistent across every creative format.",
    formula: "Count of SURVEY_RENDER events",
    whyItMatters: "The total number of times the survey was served — the top of the funnel and the exposure baseline.",
    format: "integer",
    domain: "surveys",
    dataSource: "survey_events (SURVEY_RENDER)",
    lastVerified: VERIFIED,
  },
  {
    id: "impressions_viewable",
    name: "Impressions (Viewable)",
    definition: "The number of loaded impressions that actually entered the user's viewport (at least 10% visible).",
    formula: "Count of SURVEY_VISIBLE events",
    whyItMatters: "The genuine opportunities to engage — impressions a respondent could actually see. Measured from this release onwards.",
    format: "integer",
    domain: "surveys",
    dataSource: "survey_events (SURVEY_VISIBLE). From this release onwards.",
    lastVerified: VERIFIED,
  },
  {
    id: "viewability_rate",
    name: "Viewability",
    definition: "The share of loaded impressions that became viewable in the user's viewport.",
    formula: "Impressions (Viewable) ÷ Impressions (Loads)",
    whyItMatters: "Shows how much of the delivered volume was actually seen — a quality check on placement and delivery. Available from this release onwards.",
    format: "percent",
    domain: "surveys",
    dataSource: "Derived (SURVEY_VISIBLE ÷ SURVEY_RENDER).",
    lastVerified: VERIFIED,
  },
  {
    id: "publishers_live",
    name: "Publishers Live",
    definition: "The number of distinct publishers that produced a response in the last 24 hours.",
    whyItMatters: "Shows how many media partners are actively carrying the survey right now.",
    format: "integer",
    domain: "surveys",
    dataSource: "responses (last 24h)",
    lastVerified: VERIFIED,
  },
  {
    id: "countries_collecting",
    name: "Countries Collecting",
    definition: "The number of distinct countries that produced a response in the last 24 hours.",
    whyItMatters: "Shows the current geographic breadth of live collection.",
    format: "integer",
    domain: "surveys",
    dataSource: "responses (last 24h)",
    lastVerified: VERIFIED,
  },
  {
    id: "responses_today",
    name: "Responses Today",
    definition: "Completed responses received in the last 24 hours.",
    whyItMatters: "Shows how much data is arriving right now — the pulse of live collection.",
    format: "integer",
    domain: "surveys",
    dataSource: "responses (last 24h)",
    lastVerified: VERIFIED,
  },
  {
    id: "responses_this_week",
    name: "Responses This Week",
    definition: "Completed responses received in the last 7 days.",
    whyItMatters: "Shows the recent collection trend and weekly volume.",
    format: "integer",
    domain: "surveys",
    dataSource: "responses (last 7d)",
    lastVerified: VERIFIED,
  },

  // ── Engagement ──────────────────────────────────────────────────────────
  {
    id: "q1_answered",
    name: "Q1 Answered",
    definition: "The number of respondents who selected an answer to the first question.",
    formula: "Count of SURVEY_START events",
    whyItMatters: "Measures how many people actively started the survey.",
    format: "integer",
    domain: "surveys",
    dataSource: "survey_events (SURVEY_START)",
    lastVerified: VERIFIED,
  },
  {
    id: "q1_answer_rate",
    name: "Q1 Answer Rate",
    definition: "The share of loaded impressions that resulted in a first answer.",
    formula: "Q1 Answered ÷ Impressions (Loads)",
    whyItMatters: "Indicates how effectively the creative encourages respondents to begin the survey.",
    format: "percent",
    domain: "surveys",
    dataSource: "survey_events (SURVEY_START ÷ SURVEY_RENDER)",
    lastVerified: VERIFIED,
  },
  {
    id: "avg_time_to_first_interaction",
    name: "Avg Time to First Interaction",
    definition: "The average time between the survey becoming visible and the respondent selecting their first answer, across everyone who engaged.",
    formula: "avg( SURVEY_START − SURVEY_VISIBLE )",
    whyItMatters: "Measures how quickly the creative captures attention and encourages engagement.",
    format: "duration_seconds",
    domain: "surveys",
    dataSource: "survey_events (SURVEY_VISIBLE → SURVEY_START). Measured from this release onwards, not backfilled.",
    lastVerified: VERIFIED,
  },

  // ── Completion ──────────────────────────────────────────────────────────
  {
    id: "completed_responses",
    name: "Completed Responses",
    definition: "The number of respondents who successfully answered every survey question.",
    formula: "Count of SURVEY_COMPLETED events",
    whyItMatters: "Represents the total usable sample for research and analysis.",
    format: "integer",
    domain: "surveys",
    dataSource: "responses / survey_events (SURVEY_COMPLETED)",
    lastVerified: VERIFIED,
  },
  {
    id: "completion_rate",
    name: "Completion Rate",
    definition: "The share of respondents who, having answered Q1, went on to complete every question.",
    formula: "Completed Responses ÷ Q1 Answered",
    whyItMatters: "Measures how effectively respondents progress through the survey after they have started.",
    format: "percent",
    domain: "surveys",
    dataSource: "survey_events (SURVEY_COMPLETED ÷ SURVEY_START)",
    lastVerified: VERIFIED,
  },
  {
    id: "overall_conversion_rate",
    name: "Overall Conversion Rate",
    definition: "The share of loaded impressions that resulted in a completed response — the end-to-end conversion through the whole survey funnel.",
    formula: "Completed Responses ÷ Impressions (Loads)",
    whyItMatters: "The single bottom-line efficiency of the funnel: how well survey exposure converts all the way to a completed response.",
    format: "percent",
    domain: "surveys",
    dataSource: "survey_events (SURVEY_COMPLETED ÷ SURVEY_RENDER)",
    lastVerified: VERIFIED,
  },
  {
    id: "avg_completion_time",
    name: "Avg Completion Time",
    definition: "The average time taken to complete the survey after selecting the first answer, across completed surveys.",
    formula: "avg( SURVEY_COMPLETED − SURVEY_START )",
    whyItMatters: "Measures how easy and efficient the survey experience is once someone has started.",
    format: "duration_seconds",
    domain: "surveys",
    dataSource: "survey_events (SURVEY_START → SURVEY_COMPLETED)",
    lastVerified: VERIFIED,
  },

  // ── Research Confidence ─────────────────────────────────────────────────
  {
    id: "confidence_level",
    name: "Confidence Level",
    definition: "The statistical confidence level at which the margin of error is calculated. Fixed at the industry-standard 95%.",
    whyItMatters: "The threshold at which survey results are treated as statistically reliable — the standard used across market research.",
    format: "text",
    domain: "surveys",
    lastVerified: VERIFIED,
  },
  {
    id: "margin_of_error",
    name: "Margin of Error",
    definition: "The maximum expected difference between the sample's results and the true value across the whole audience, at 95% confidence.",
    formula: "±1.96 × √(0.25 ÷ n), where n = Completed Responses (worst-case proportion p = 0.5)",
    whyItMatters: "Tells you how precise each figure is — smaller is better. ±5% or below meets the standard survey-research benchmark.",
    format: "plusminus_percent",
    domain: "surveys",
    dataSource: "Derived from Completed Responses",
    lastVerified: VERIFIED,
  },
  {
    id: "sample_quality",
    name: "Sample Quality",
    definition: "A plain-English band summarising how far the current sample can be trusted, derived directly from the margin of error.",
    formula: "High Confidence ≤ ±5% · Reliable ≤ ±10% · Directional ≤ ±15% · Early > ±15%",
    whyItMatters: "Turns the statistics into an at-a-glance verdict on whether the data is ready to act on.",
    format: "text",
    domain: "surveys",
    dataSource: "Derived from Margin of Error",
    lastVerified: VERIFIED,
  },
];

/** id → definition. Frozen so no surface can mutate the canonical copy. */
export const METRIC_REGISTRY: Readonly<Record<string, MetricDefinition>> = Object.freeze(
  Object.fromEntries(DEFINITIONS.map((d) => [d.id, d])),
);

/** Canonical id lookup. Returns undefined for unknown ids (caller decides how to
 *  degrade — MetricInfo simply renders nothing). */
export function getMetric(id: string): MetricDefinition | undefined {
  return METRIC_REGISTRY[id];
}

/** All metrics in a product area, in registry order. */
export function getMetricsByDomain(domain: MetricDefinition["domain"]): MetricDefinition[] {
  return DEFINITIONS.filter((d) => d.domain === domain);
}
