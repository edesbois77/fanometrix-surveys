// ── Benchmark 002 — EVAL-ONLY governed semantic overlay (FROZEN, Core-blind) ───
// Authored from the SOURCE instrument semantics BEFORE running the Core. Describes
// what each option measures — NOT expected conclusions (no valid/invalid flags, no
// hierarchy, no Gold ids). Frozen/hashed before Core execution.
//
// Forensic justification (from the question/option WORDING):
//  q_satisfaction — a 5-point ordinal SATISFACTION scale: all five options measure
//    ONE dimension (product_satisfaction) at ordered positions 5..1. 'Neither' is a
//    genuine mid-scale position (3), not a pole.
//  q_blocker — four DISTINCT usage blockers, each its own construct (battery ≠
//    comfort ≠ connectivity ≠ app); nominal, no order.
//  q_recommend — a 4-point ordinal RECOMMENDATION-LIKELIHOOD scale: one dimension
//    (recommend_likelihood) at ordered positions 4..1.
//
// NOTE (honest): the overlay records ordinalPosition, but the current Stage 5R.4
// entailment engine keys DERIVED authority on constructId only (it does not yet use
// ordinalPosition/polarity). Whether that is sufficient on an ordinal scale is
// exactly what this blind benchmark tests — the overlay is not tuned to hide it.

import type { QuestionSemantics } from "@/lib/core/semantic/metadata";

export const BENCH002_OVERLAY: Record<string, QuestionSemantics> = {
  q_satisfaction: {
    questionKey: "q_satisfaction", scaleType: "ordinal", provenance: "source_declared",
    options: [
      { optionId: "very_satisfied", constructId: "product_satisfaction", ordinalPosition: 5 },
      { optionId: "satisfied", constructId: "product_satisfaction", ordinalPosition: 4 },
      { optionId: "neutral", constructId: "product_satisfaction", ordinalPosition: 3 },
      { optionId: "dissatisfied", constructId: "product_satisfaction", ordinalPosition: 2 },
      { optionId: "very_dissatisfied", constructId: "product_satisfaction", ordinalPosition: 1 },
    ],
  },
  q_blocker: {
    questionKey: "q_blocker", scaleType: "nominal", provenance: "source_declared",
    options: [
      { optionId: "battery_life", constructId: "blocker_battery" },
      { optionId: "comfort", constructId: "blocker_comfort" },
      { optionId: "connectivity", constructId: "blocker_connectivity" },
      { optionId: "app_issues", constructId: "blocker_app" },
    ],
  },
  q_recommend: {
    questionKey: "q_recommend", scaleType: "ordinal", provenance: "source_declared",
    options: [
      { optionId: "definitely", constructId: "recommend_likelihood", ordinalPosition: 4 },
      { optionId: "probably", constructId: "recommend_likelihood", ordinalPosition: 3 },
      { optionId: "unsure", constructId: "recommend_likelihood", ordinalPosition: 2 },
      { optionId: "unlikely", constructId: "recommend_likelihood", ordinalPosition: 1 },
    ],
  },
};

/** Canonical serialization for hashing. */
export function bench002OverlayCanonical(): string {
  return JSON.stringify(Object.entries(BENCH002_OVERLAY).map(([k, q]) => [k, q.scaleType, q.provenance, q.options.map((o) => [o.optionId, o.constructId, o.ordinalPosition ?? null])]));
}
