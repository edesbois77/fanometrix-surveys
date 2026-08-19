// ── Benchmark 003 — EVAL-ONLY governed semantic overlay (FROZEN, Core-blind) ───
// Authored from the SOURCE instrument semantics BEFORE running the Core. Describes
// what each option measures (construct, order, polarity) — NOT expected findings.
// No valid/invalid flags, no hierarchy, no Gold ids. Frozen/hashed before Core run.
//
// Forensic justification (from the question/option WORDING; specifiable by the
// research designer before any response exists):
//  q_reliability — a 5-point ordinal RELIABILITY-RATING scale: one construct at
//    positions 5..1; 'Very/…reliable' are the positive region, 'Very/…unreliable'
//    the negative region, 'Mixed / it depends' the neutral midpoint.
//  q_reason — five DISTINCT usage reasons, each its own construct (nominal).
//  q_recommend — a 4-point ordinal RECOMMENDATION-LIKELIHOOD scale with NO neutral
//    midpoint: 'Definitely/Likely' positive, 'Unlikely/Definitely not' negative.

import type { QuestionSemantics } from "@/lib/core/semantic/metadata";
import type { DiscoveryInput } from "@/lib/core/candidates/types";

export const TRANSIT003_OVERLAY: Record<string, QuestionSemantics> = {
  q_reliability: {
    questionKey: "q_reliability", scaleType: "ordinal", provenance: "source_declared",
    options: [
      { optionId: "very_reliable", constructId: "reliability_rating", ordinalPosition: 5, polarity: "positive" },
      { optionId: "reliable", constructId: "reliability_rating", ordinalPosition: 4, polarity: "positive" },
      { optionId: "mixed", constructId: "reliability_rating", ordinalPosition: 3, polarity: "neutral" },
      { optionId: "unreliable", constructId: "reliability_rating", ordinalPosition: 2, polarity: "negative" },
      { optionId: "very_unreliable", constructId: "reliability_rating", ordinalPosition: 1, polarity: "negative" },
    ],
  },
  q_reason: {
    questionKey: "q_reason", scaleType: "nominal", provenance: "source_declared",
    options: [
      { optionId: "cost", constructId: "reason_cost" },
      { optionId: "no_car", constructId: "reason_nocar" },
      { optionId: "speed", constructId: "reason_speed" },
      { optionId: "environmental", constructId: "reason_environmental" },
      { optionId: "convenience", constructId: "reason_convenience" },
    ],
  },
  q_recommend: {
    questionKey: "q_recommend", scaleType: "ordinal", provenance: "source_declared",
    options: [
      { optionId: "definitely", constructId: "recommend_likelihood", ordinalPosition: 4, polarity: "positive" },
      { optionId: "likely", constructId: "recommend_likelihood", ordinalPosition: 3, polarity: "positive" },
      { optionId: "unlikely", constructId: "recommend_likelihood", ordinalPosition: 2, polarity: "negative" },
      { optionId: "definitely_not", constructId: "recommend_likelihood", ordinalPosition: 1, polarity: "negative" },
    ],
  },
};

export function bench003OverlayCanonical(): string {
  return JSON.stringify(Object.entries(TRANSIT003_OVERLAY).map(([k, q]) => [k, q.scaleType, q.provenance, q.options.map((o) => [o.optionId, o.constructId, o.ordinalPosition ?? null, o.polarity ?? null])]));
}

export function applyTransit003Overlay(di: DiscoveryInput): DiscoveryInput {
  return { ...di, questions: di.questions.map((q) => ({ ...q, semantics: TRANSIT003_OVERLAY[q.questionKey] })) };
}
