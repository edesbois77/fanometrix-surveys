// ── Fanometrix Analytical Core — base & candidate classification (pure) ───────
// Classifies a base size (Decision 1) and a candidate percentage-point
// difference (Decision 3) against StatisticsPolicy@v1. These are the ONLY
// consumers of the policy in Stage 1, and they are not wired into any product.

import type { BaseState, CandidateStrength } from "../vocabulary";
import { POLICY_V1, type StatisticsPolicy } from "./policy";

/** Classify a descriptive base size into a BaseState. Non-finite/negative n is
 *  treated as 0 (→ suppressed). */
export function classifyBase(n: number, policy: StatisticsPolicy = POLICY_V1): BaseState {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  for (const band of policy.descriptiveBaseBands) {
    const below = band.maxExclusive == null || v < band.maxExclusive;
    if (v >= band.minInclusive && below) return band.state;
  }
  // Bands are exhaustive from 0; the last band is open-ended, so this is unreachable.
  return policy.descriptiveBaseBands[policy.descriptiveBaseBands.length - 1]!.state;
}

/** Classify a candidate percentage-point difference into a CandidateStrength.
 *  Uses the magnitude, compared on tenths of a pp to avoid float ambiguity at
 *  the 5.0 / 10.0 / 15.0 boundaries. */
export function classifyCandidateDifference(pp: number, policy: StatisticsPolicy = POLICY_V1): CandidateStrength {
  const tenths = Number.isFinite(pp) ? Math.round(Math.abs(pp) * 10) : 0;
  for (const band of policy.candidateDifferenceBands) {
    const below = band.maxTenthsExclusive == null || tenths < band.maxTenthsExclusive;
    if (tenths >= band.minTenthsInclusive && below) return band.strength;
  }
  return policy.candidateDifferenceBands[policy.candidateDifferenceBands.length - 1]!.strength;
}
