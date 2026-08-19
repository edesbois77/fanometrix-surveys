// ── Fanometrix Analytical Core — StatisticsPolicy@v1 (pure) ───────────────────
// The versioned analytical policy value implementing the settled decisions.
// Consumed ONLY by the new (unwired) classify* helpers — it does NOT re-drive
// any product's current thresholds, so no production gate changes.
//
// Deliberately excluded from @v1 (belong to later stages): cross-tab tests,
// cell-adequacy rules, multiple-comparison correction, weighting / effective
// sample size, the specific change test, and comparison-base rules beyond
// descriptive. Those arrive as @v2+ when their stages land.

import type { BaseState, CandidateStrength } from "../vocabulary";

export type BaseBand = { minInclusive: number; maxExclusive: number | null; state: BaseState };

/** Candidate bands operate on TENTHS of a percentage point to avoid float
 *  ambiguity around the 5.0 / 10.0 / 15.0 boundaries. */
export type CandidateBand = { minTenthsInclusive: number; maxTenthsExclusive: number | null; strength: CandidateStrength };

export type StatisticsPolicy = {
  version: string;
  /** Decision 1 — descriptive base states. */
  descriptiveBaseBands: BaseBand[];
  /** Decision 3 — candidate-difference GENERATION guidance (pp), never a Finding rule. */
  candidateDifferenceBands: CandidateBand[];
  /** Decision 2 — inferential default. */
  inferential: { confidenceLevel: number; alpha: number };
};

export const POLICY_V1: StatisticsPolicy = {
  version: "1",
  descriptiveBaseBands: [
    { minInclusive: 0,   maxExclusive: 20,   state: "suppressed" },
    { minInclusive: 20,  maxExclusive: 30,   state: "directional" },
    { minInclusive: 30,  maxExclusive: 50,   state: "analytically_usable" },
    { minInclusive: 50,  maxExclusive: 100,  state: "standard" },
    { minInclusive: 100, maxExclusive: null, state: "stronger" },
  ],
  candidateDifferenceBands: [
    { minTenthsInclusive: 0,   maxTenthsExclusive: 50,   strength: "negligible" }, // < 5.0pp
    { minTenthsInclusive: 50,  maxTenthsExclusive: 100,  strength: "weak" },       // 5.0–9.9pp
    { minTenthsInclusive: 100, maxTenthsExclusive: 150,  strength: "clear" },      // 10.0–14.9pp
    { minTenthsInclusive: 150, maxTenthsExclusive: null, strength: "strong" },     // >= 15.0pp
  ],
  inferential: { confidenceLevel: 95, alpha: 0.05 },
};
