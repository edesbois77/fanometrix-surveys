// ── Rotation: choosing ONE member from an eligible set ───────────────────────
// Pure and injectable-random by construction. The legacy serve path calls
// Math.random() inline (app/api/embed/group/route.ts), which makes its
// distribution untestable; this module takes the random source as an argument
// so the weighted branch can be asserted over 10,000 draws rather than trusted.
//
// This module knows NOTHING about eligibility, dates, targets or revisions. It
// receives an already-filtered candidate list. If that list is empty it returns
// null and the caller decides what that means (see fail_mode in model.ts).

import type { RevisionMember } from "./model";

/** A [0,1) source. Defaults to Math.random in production callers. */
export type RandomSource = () => number;

export type Rotation = "equal" | "weighted" | "priority";

/**
 * Deterministic 32-bit PRNG (mulberry32) used by tests and by any caller that
 * needs a reproducible draw. Not cryptographic — rotation does not need to be
 * unpredictable to an adversary, only unbiased.
 */
export function seededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick one member.
 *
 *   equal     uniform over candidates.
 *   weighted  probability proportional to weight. The schema constrains
 *             weight > 0 (migration 210 cgrm_weight_positive), so there is no
 *             zero-weight case to handle here: a member that should not be
 *             drawn is PAUSED, and paused members never reach this function.
 *   priority  Studio has no priority column on revision members — a Studio
 *             group expresses precedence by weight — so 'priority' falls back
 *             to first-declared order, which is the revision's insert order.
 *
 * Returns null for an empty candidate list rather than throwing: "nothing to
 * serve" is a normal outcome that the caller turns into a 404 or a fail-closed
 * refusal, not an exception.
 */
export function selectMember(
  candidates: RevisionMember[],
  rotation: Rotation,
  random: RandomSource = Math.random,
): RevisionMember | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (rotation === "priority") return candidates[0];

  if (rotation === "weighted") {
    const total = candidates.reduce((s, m) => s + m.weight, 0);
    // Defensive: a non-positive total can only arise from data that bypassed
    // the CHECK constraint. Degrade to uniform rather than divide by zero.
    if (!(total > 0)) return candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
    let r = random() * total;
    for (const m of candidates) {
      r -= m.weight;
      if (r < 0) return m;
    }
    return candidates[candidates.length - 1]; // float drift only
  }

  return candidates[Math.floor(random() * candidates.length)] ?? candidates[0];
}
