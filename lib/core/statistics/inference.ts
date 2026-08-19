// ── Fanometrix Analytical Core — inferential statistics (pure) ────────────────
// Two-proportion z-test returning the Standard v1.1 STRUCTURED statistical
// assessment (never a boolean, never an importance/materiality implication).
//
// The z-math (erf / two-sided p / pooled SE) is COPIED VERBATIM from
// lib/reports/stats.ts::compareProportions rather than imported, so the Core
// does not depend on that module's own `Confidence` type. An equivalence test
// asserts identical p-values. Stage 1 implements ONLY this test — no chi-square,
// Fisher, weighting-aware inference, repeated measures or multiple-comparison
// correction (later stages).

import type { StatStatus } from "../vocabulary";
import { POLICY_V1, type StatisticsPolicy } from "./policy";

/** The structured statistical assessment (Decision 2). */
export type StatisticalAssessment = {
  status: StatStatus;                  // supported | not_supported | not_assessed
  method: "two_proportion_z";
  confidenceLevel: number;             // e.g. 95
  pValue: number | null;               // null when not_assessed
  /** (p2 - p1) expressed in PERCENTAGE POINTS (0–100 scale), 1dp; null when not
   *  computable. Named `Pp` so its scale is unambiguous. */
  observedDifferencePp: number | null;
  assumptions: string[];
  caveats: string[];
};

// Abramowitz & Stegun 7.1.26 — copied from lib/reports/stats.ts (max error 1.5e-7).
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

/** Compare two proportions. `x` are successes, `n` are trials. Returns the
 *  Standard structured assessment:
 *    • not_assessed  when n1<=0 || n2<=0 || (x1+x2) < 5 || pooled SE == 0
 *    • supported     when pValue < alpha
 *    • not_supported when pValue >= alpha
 *  Statistical support is SEPARATE from materiality/importance (Decision 2). */
export function twoProportion(
  x1: number, n1: number, x2: number, n2: number,
  policy: StatisticsPolicy = POLICY_V1,
): StatisticalAssessment {
  const { alpha, confidenceLevel } = policy.inferential;
  const p1 = n1 > 0 ? x1 / n1 : 0;
  const p2 = n2 > 0 ? x2 / n2 : 0;
  const observedDifferencePp = n1 > 0 && n2 > 0 ? Math.round((p2 - p1) * 1000) / 10 : null;

  // A z-test on a handful of events is arithmetic, not evidence: below five
  // successes across the two arms the normal approximation is untrustworthy.
  const testable = n1 > 0 && n2 > 0 && x1 + x2 >= 5;
  if (!testable) {
    return {
      status: "not_assessed", method: "two_proportion_z", confidenceLevel,
      pValue: null, observedDifferencePp,
      assumptions: [],
      caveats: ["Base too small for a reliable normal-approximation test (needs non-empty arms and at least 5 successes across them)."],
    };
  }

  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) {
    return {
      status: "not_assessed", method: "two_proportion_z", confidenceLevel,
      pValue: null, observedDifferencePp,
      assumptions: [],
      caveats: ["Zero pooled standard error; the difference is not testable."],
    };
  }

  const z = (p2 - p1) / se;
  const pValue = twoSidedP(z);
  return {
    status: pValue < alpha ? "supported" : "not_supported",
    method: "two_proportion_z", confidenceLevel, pValue, observedDifferencePp,
    assumptions: ["Independent samples", "Normal approximation to the binomial", "Simple random sampling (unweighted)"],
    caveats: [],
  };
}
