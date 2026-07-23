import type { ReportAudience } from "./narrative";
import type { BuilderState } from "@/lib/creative-theme-builder";

// Shapes for the Audience Intelligence Report — the reusable partner reporting
// framework. Every completed Fanometrix research campaign can generate one of
// these; only the organisation, the campaign scope and the underlying data
// change. Nothing here names a specific publisher, brand or campaign.

/** A report as registered in partner_reports. */
export type PartnerReport = {
  id: string;
  orgSlug: string;
  reportSlug: string;
  organisationId: string | null;
  organisationName: string;
  brandName: string;
  reportTitle: string;
  campaignTitle: string;
  researchQuestion: string | null;
  /** Cover standfirst. Editorial copy, because it has to be able to say things
   *  the data does not know. Null falls back to a generated sentence. */
  subtitle: string | null;
  campaignIds: string[];
  dataFrom: string | null;
  status: "draft" | "published" | "archived";
  logoUrl: string | null;
  version: number;
  /** Who the report is written for. Selects a narrative profile; never changes
   *  how anything is calculated. See narrative.ts. */
  audience: ReportAudience;
};

/** How much weight a reader may put on a stated difference.
 *
 *  The underlying test is a two-proportion z-test at 95%, but the client-facing
 *  report never shows a p-value or a test name — it shows one of these labels.
 *  The statistics decide what is shown; the label communicates it. */
export type Confidence = "high" | "moderate" | "early";

/** One row of the funnel, for a campaign, a country or a creative. */
export type FunnelCounts = {
  loads: number;
  viewable: number;
  starts: number;
  reachedFinalQuestion: number;
  completed: number;
};

export type FunnelRates = {
  /** viewable ÷ loads. null when viewability was not instrumented for the window. */
  viewabilityRate: number | null;
  /** starts ÷ loads */
  startRate: number;
  /** completed ÷ starts */
  completionRate: number;
  /** completed ÷ loads */
  responseRate: number;
  /** completed ÷ loads × 10,000 — the normalised comparison unit. */
  responsesPer10k: number;
};

/** A named slice of the campaign (a market, a creative) with its funnel. */
export type Segment = {
  key: string;
  label: string;
  counts: FunnelCounts;
  rates: FunnelRates;
  /** Index vs the campaign average, base 100. */
  index: {
    startRate: number;
    completionRate: number;
    responseRate: number;
  };
  /** Sample size for survey answers in this segment. */
  sampleSize: number;
  /** Present when the segment ran a creative that differs from the campaign
   *  norm — the report must disclose it rather than compare silently. */
  note?: string;
};

export type HourPoint = {
  /** 0–23 in the audience's local time. */
  hour: number;
  loads: number;
  starts: number;
  completed: number;
  /** starts ÷ loads for the hour. */
  startRate: number;
};

export type AnswerOption = {
  id: number;
  label: string;
  count: number;
  share: number;
};

export type QuestionDistribution = {
  id: string;
  text: string;
  sampleSize: number;
  options: AnswerOption[];
  /** Per-market share of each option, only for markets meeting the reporting
   *  threshold. Keyed by market label. */
  byMarket: {
    market: string;
    sampleSize: number;
    belowThreshold: boolean;
    options: AnswerOption[];
  }[];
  /** Differences the statistics support surfacing, already phrased for a
   *  client. Empty when nothing clears the bar. */
  notableDifferences: NotableDifference[];
};

export type NotableDifference = {
  market: string;
  optionLabel: string;
  share: number;
  comparisonShare: number;
  sampleSize: number;
  confidence: Confidence;
  statement: string;
};

/** A creative that actually ran, for the gallery. `slug` and `layout` are what
 *  the embed itself resolves, so the gallery renders the same component a fan
 *  saw rather than an artist's impression of it. */
export type CreativeUsed = {
  slug: string;
  name: string;
  layout: string;
  /** Markets it ran in, for the caption. */
  markets: string[];
  loads: number;
  completed: number;
  /** One sentence on what this format is for. */
  purpose: string;
  /** The design's colour inputs, so the gallery renders the same component the
   *  embed does. Null for a design with no builder state, which renders in the
   *  classic layout's own styling. */
  builderState: BuilderState | null;
};

/** A decision the report exists to support.
 *
 *  This is the answer to "what would I do differently tomorrow because I read
 *  this". Every one carries the number that drives it and what acting on it is
 *  worth, because a recommendation without either is a suggestion. */
export type Decision = {
  headline: string;
  action: string;
  evidence: string;
  /** The quantified consequence of acting, where one can be computed honestly.
   *  Null when it cannot, which is more useful than an invented figure. */
  worth: string | null;
  confidence: Confidence;
};

/** A creative measured against another creative, normalised per 10k loads. */
export type CreativeComparison = {
  baseline: Segment;
  variant: Segment;
  measures: {
    label: string;
    metricId: string;
    baseline: number;
    variant: number;
    format: "percent" | "rate_per_10k" | "integer";
    /** Relative change, variant vs baseline. null when a change would be
     *  meaningless (e.g. both zero). */
    change: number | null;
    confidence: Confidence;
    /** Set when the difference does not clear the bar — the report says so
     *  rather than implying a result. */
    inconclusive: boolean;
  }[];
  caveats: string[];
};

/** A statement the report makes, with the evidence class it belongs to.
 *  `confirmed` statements are supported by the data at 95%; `possible`
 *  statements are explanations the data is consistent with but does not
 *  establish. The report never merges the two. */
export type Finding = {
  title: string;
  detail: string;
  confidence: Confidence;
  kind: "confirmed" | "possible";
};

export type Recommendation = {
  title: string;
  detail: string;
  basis: string;
};

export type Highlight = {
  label: string;
  value: string;
  detail: string;
};

/** Everything a rendered report needs. Built server-side from live data on
 *  every request — no figure in here is stored or hardcoded. */
export type AudienceIntelligenceReport = {
  report: PartnerReport;
  window: {
    firstEvent: string;
    lastEvent: string;
    dataThrough: string;
    /** When this copy of the report was computed. Distinct from dataThrough:
     *  one says how current the data is, the other says when someone asked. A
     *  reader needs both to trust a figure they are about to quote. */
    generatedAt: string;
    /** True while any campaign in scope is still collecting. */
    interim: boolean;
    /** "Interim" or "Final" — the badge on the cover. */
    statusLabel: string;
    campaignEndDate: string | null;
  };
  totals: {
    counts: FunnelCounts;
    rates: FunnelRates;
    medianCompletionSeconds: number;
    meanCompletionSeconds: number;
    marginOfError: number;
    sampleQuality: string;
    markets: number;
    devices: { label: string; share: number; count: number }[];
  };
  /** Viewability is forward-only from the day it was instrumented; this is the
   *  window over which it can honestly be quoted. null when never instrumented. */
  viewabilityWindow: { from: string; rate: number } | null;
  highlights: Highlight[];
  decisions: Decision[];
  creatives: CreativeUsed[];
  markets: Segment[];
  hourly: HourPoint[];
  hourlyInsight: {
    peakHour: number;
    peakLoads: number;
    quietHour: number;
    quietLoads: number;
    bestEngagementHour: number;
    observations: string[];
  };
  creative: CreativeComparison | null;
  questions: QuestionDistribution[];
  findings: Finding[];
  recommendations: Recommendation[];
  valueDelivered: {
    headline: string;
    points: { label: string; value: string; detail: string }[];
  };
  /** Methodology and limits, in plain English. Rendered as a closing note so a
   *  reader who forwards the report internally cannot over-read it. */
  methodology: string[];
};
