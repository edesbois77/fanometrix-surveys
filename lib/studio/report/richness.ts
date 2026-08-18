// ── Survey Studio — Reports V1 (Slice A) — Report Richness Assessment (pure) ──
// Deterministic, read-only assessment of how much *useful editorial material* a Study offers
// a Report. Richness decides HOW MUCH REPORT (a page-budget ceiling), never WHETHER a Study
// "looks big". It is NOT a quality score and is NOT shown to the user — it is internal
// planning data that the (future) packer uses to bound output. Slice A only consumes `level`
// + `recommendedPageBudget` + `availableVisuals`; the richer signals are recorded for later.
//
// Deliberately NOT driven by any single proxy (question count / sample / markets / findings
// alone). The dominant driver is the number of *showable governed questions* (a question a
// Finding cites AND for which a governed full distribution exists), modified by audience depth.

import { buildHeroStat } from "@/lib/studio/report/report-domain";
import type { ReportComposerInput, ReportGovernance } from "@/lib/studio/report/report-domain";

export type RichnessLevel = "insufficient" | "concise" | "standard" | "rich";
export type AvailableVisual = "full-distribution" | "ranked-distribution" | "hero-stat" | "key-numbers" | "segment-comparison";

export type RichnessSignals = {
  approvedFindings: number;
  distinctQuestions: number;        // distinct questions any finding cites
  showableDistributions: number;    // distinct cited questions that HAVE a governed full distribution
  heroStatCandidates: number;       // findings carrying ≥1 governed base statistic
  derivedFacts: number;
  segmentComparisons: number;
  audienceDimensions: number;       // distinct segment dimensions (country/age/…)
  surveys: number;
  responses: number;
  markets: number;
};

export type RichnessAssessment = {
  level: RichnessLevel;
  recommendedPageBudget: number;    // ceiling only; the packer decides the ACTUAL count
  availableVisuals: AvailableVisual[];
  reasons: string[];
  signals: RichnessSignals;
};

/** Distinct non-null question keys cited across a finding's evidence. */
function citedQuestionKeys(input: ReportComposerInput): Set<string> {
  const s = new Set<string>();
  for (const f of input.findings) for (const e of f.evidence) if (e.canonicalQuestionKey) s.add(e.canonicalQuestionKey);
  return s;
}

export function computeSignals(input: ReportComposerInput, gov: ReportGovernance): RichnessSignals {
  const cited = citedQuestionKeys(input);
  const showable = [...cited].filter((qk) => gov.distributions.has(qk));
  const dims = new Set<string>();
  let derived = 0;
  for (const f of input.findings) for (const e of f.evidence) {
    if (e.class === "derived") derived++;
    if (e.class === "segment" && e.dimension) dims.add(e.dimension);
  }
  return {
    approvedFindings: input.findings.length,
    distinctQuestions: cited.size,
    showableDistributions: showable.length,
    heroStatCandidates: input.findings.filter((f) => buildHeroStat(f).length > 0).length,
    derivedFacts: derived,
    segmentComparisons: gov.segmentComparisons.size,
    audienceDimensions: dims.size,
    surveys: input.methodology.surveys.length,
    responses: input.methodology.totalResponses,
    markets: input.methodology.markets.length,
  };
}

function availableVisuals(s: RichnessSignals): AvailableVisual[] {
  const v: AvailableVisual[] = [];
  if (s.showableDistributions > 0) { v.push("full-distribution", "ranked-distribution"); }
  if (s.heroStatCandidates > 0) { v.push("hero-stat", "key-numbers"); }
  if (s.segmentComparisons > 0) v.push("segment-comparison");
  return v;
}

/**
 * Classify available material. A report needs at least one finding backed by SHOWABLE or
 * derived/segment evidence (something to prove a claim with) and a Study objective — below
 * that it is `insufficient` and no report is recommended. Otherwise the level is driven mainly
 * by the count of showable governed questions, with audience depth able to lift it one band.
 */
export function assessRichness(input: ReportComposerInput, gov: ReportGovernance): RichnessAssessment {
  const signals = computeSignals(input, gov);
  const reasons: string[] = [];
  const visuals = availableVisuals(signals);

  const hasObjective = !!input.study.objective?.trim();
  const hasProvableFinding = signals.showableDistributions > 0 || signals.heroStatCandidates > 0 || signals.derivedFacts > 0 || signals.segmentComparisons > 0;

  if (!hasObjective || signals.approvedFindings === 0 || !hasProvableFinding) {
    if (!hasObjective) reasons.push("no Study objective");
    if (signals.approvedFindings === 0) reasons.push("no approved findings");
    else if (!hasProvableFinding) reasons.push("no finding is backed by showable governed evidence");
    return { level: "insufficient", recommendedPageBudget: 0, availableVisuals: visuals, reasons, signals };
  }

  const q = signals.showableDistributions;
  const audienceDepth = signals.audienceDimensions >= 2 || signals.segmentComparisons >= 3;

  let level: RichnessLevel;
  if (q >= 5 || (q >= 3 && audienceDepth)) level = "rich";
  else if (q >= 2 || signals.approvedFindings >= 3 || signals.segmentComparisons >= 1) level = "standard";
  else level = "concise";

  const budget = level === "rich" ? 6 : level === "standard" ? 3 : 1;
  reasons.push(`${signals.approvedFindings} approved findings`, `${q} showable distribution${q === 1 ? "" : "s"}`);
  if (signals.segmentComparisons > 0) reasons.push(`${signals.segmentComparisons} audience comparison${signals.segmentComparisons === 1 ? "" : "s"}`);
  if (signals.markets > 0) reasons.push(`${signals.markets} market${signals.markets === 1 ? "" : "s"}`);

  return { level, recommendedPageBudget: budget, availableVisuals: visuals, reasons, signals };
}
