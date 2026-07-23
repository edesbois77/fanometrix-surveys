// The statistics behind the Audience Intelligence Report.
//
// These functions decide WHAT the report is allowed to say. They never appear
// in the output: the client-facing report shows a plain-English confidence
// label, never a p-value, a z-score or the name of a test. Keeping the
// vocabulary here and the labels in the UI is what lets the report stay
// readable without becoming unfalsifiable.
//
// Everything is a proportion comparison (rates out of counts), so a
// two-proportion z-test is the right instrument throughout.

import type { Confidence } from "./types";

/** The minimum sample below which a segment's answers are shown but never
 *  described as a difference. Chosen to match the normal-approximation
 *  guidance the z-test relies on. */
export const MIN_REPORTABLE_SAMPLE = 30;

/** Abramowitz & Stegun 7.1.26 — max error 1.5e-7, far below anything that
 *  could move a result across the 0.05 boundary in practice. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function twoSidedP(z: number): number {
  return 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)));
}

export type ProportionTest = {
  p1: number;
  p2: number;
  /** Relative change of p2 against p1, as a fraction. null when p1 is zero. */
  change: number | null;
  pValue: number;
  confidence: Confidence;
  /** True when the difference does not clear the 95% bar, or either arm is too
   *  small to test. The report must then say "no difference we can stand
   *  behind" rather than reporting the observed gap as a result. */
  inconclusive: boolean;
};

/** Compare two proportions. `x` are the successes, `n` the trials.
 *
 *  Confidence maps to the strength of the evidence, not to the size of the
 *  effect: `high` at p < 0.01, `moderate` at p < 0.05, `early` otherwise. An
 *  `early` result is always also `inconclusive` — the report shows the numbers
 *  and declines to call them a difference. */
export function compareProportions(
  x1: number,
  n1: number,
  x2: number,
  n2: number,
): ProportionTest {
  const p1 = n1 > 0 ? x1 / n1 : 0;
  const p2 = n2 > 0 ? x2 / n2 : 0;
  const change = p1 > 0 ? p2 / p1 - 1 : null;

  // A z-test on a handful of events is arithmetic, not evidence. Below five
  // successes in either arm the normal approximation is not trustworthy, so we
  // decline rather than produce a confident-looking number.
  const testable = n1 > 0 && n2 > 0 && x1 + x2 >= 5;
  if (!testable) {
    return { p1, p2, change, pValue: 1, confidence: "early", inconclusive: true };
  }

  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) {
    return { p1, p2, change, pValue: 1, confidence: "early", inconclusive: true };
  }

  const z = (p2 - p1) / se;
  const pValue = twoSidedP(z);
  const confidence: Confidence = pValue < 0.01 ? "high" : pValue < 0.05 ? "moderate" : "early";

  return { p1, p2, change, pValue, confidence, inconclusive: pValue >= 0.05 };
}

/** Margin of error at 95% for a sample of n, worst case (p = 0.5), as a
 *  percentage. Matches the `margin_of_error` metric in lib/metrics/registry. */
export function marginOfError(n: number): number {
  if (n <= 0) return 100;
  return 196 * Math.sqrt(0.25 / n);
}

/** The plain-English band for a margin of error — the `sample_quality` metric. */
export function sampleQuality(moe: number): string {
  if (moe <= 5) return "High Confidence";
  if (moe <= 10) return "Reliable";
  if (moe <= 15) return "Directional";
  return "Early Signal";
}

/** How a confidence level is described to a client. The report uses these
 *  strings and nothing more technical. */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High Confidence",
  moderate: "Moderate Confidence",
  early: "Early Observation",
};

export const CONFIDENCE_MEANING: Record<Confidence, string> = {
  high: "A clear difference. Large enough, and consistent enough, to plan against.",
  moderate: "A real difference on the evidence so far. Worth acting on, worth re-testing.",
  early: "An observation, not yet a finding. The sample cannot separate this from normal variation.",
};

/** Index a value against a base, expressed on the familiar 100 scale. */
export function index100(value: number, base: number): number {
  if (base === 0) return 0;
  return Math.round((value / base) * 100);
}
