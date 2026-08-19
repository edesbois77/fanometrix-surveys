// ── Survey Studio — product usefulness policy (STEP 2/3) ─────────────────────
// A small, deterministic layer that ranks ALREADY-PERMITTED findings by how much
// they deserve scarce headline space. This is NOT a truth/authority layer — the Core
// still decides what may be said. It answers: "of the things we're allowed to say,
// which would a smart researcher actually point out?".
//
// The ordering the policy encodes (highest first):
//   1. Governed DERIVED findings — a governed conclusion the charts don't state.
//   2. Material SEGMENT differences — reversals / concentrations / spreads that the
//      all-data topline HIDES (a user would likely miss these by reading charts).
//   3. Topline leaders — the largest bar; readable straight off the chart, so only
//      worth headline space with a genuinely large margin (and capped below segments).
//   4. Routine descriptive facts (minorities, near-even distributions).
//
// A finding must clear HEADLINE_MIN to earn "What stands out" space; otherwise it is
// supporting context. This is a PRESENTATION cutoff, not a statistical-significance
// test — no significance/causality/sentiment is asserted anywhere.
import type { CoreFinding } from "@/lib/core/studio/projection";

/** Minimum usefulness to earn headline ("What stands out") space. Governed (100) and
 *  material segment findings (≈55–85) clear it; bare topline leaders (≈30–40) do not. */
export const HEADLINE_MIN = 50;

const withMagnitude = (base: number, magnitude: number): number => base + Math.min(30, Math.max(0, magnitude));

/** A topline leader ("X is the most-selected"): low base because it is visible in the
 *  Results chart; a large margin lifts it, but it stays below a material segment. */
export function leaderUsefulness(leadPp: number): number {
  return withMagnitude(30, Number.isFinite(leadPp) ? leadPp : 0);
}

/** A segment finding: reversals of the topline pattern are the most telling, then a
 *  segment that concentrates on one answer, then a wide spread across segments. The
 *  magnitude (spread pp / concentration delta) lifts it further. */
export function segmentUsefulness(kind: string, value: number): number {
  // Pointed facts (a segment leads differently / concentrates on one answer) beat a
  // mere range across segments, even before magnitude — they're what a user would miss.
  const base = kind === "seg_reversal" ? 72 : kind === "seg_concentration" ? 66 : kind === "seg_spread" ? 48 : 20;
  return withMagnitude(base, Math.abs(Number.isFinite(value) ? value : 0));
}

/** Fallback usefulness for a finding whose raw signals aren't attached (Core-produced
 *  findings): governed leads everything; a model-origin reading is subordinate;
 *  everything else is routine observed context (below any material segment). */
export function defaultUsefulness(f: Pick<CoreFinding, "basis">): number {
  if (f.basis === "governed") return 100;   // a governed DERIVED conclusion always leads
  if (f.basis === "exploratory") return 5;   // model-origin — never a headline
  return 22;                                  // routine observed (minority / near-even distribution)
}

/** Effective usefulness for ranking: the attached score if present, else the default. */
export function effectiveUsefulness(f: CoreFinding): number {
  return f.usefulness ?? defaultUsefulness(f);
}
