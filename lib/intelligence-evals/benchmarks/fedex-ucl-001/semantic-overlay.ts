// ── FedEx UCL — EVAL-ONLY governed semantic overlay (Stage 5R.8) ──────────────
// STRICTLY EVALUATION-ONLY. This overlay supplies the governed semantic FACTS that
// would, in a future production source, be declared upstream at instrument-creation
// time (Standard v1.2 §K/§L). It exists solely to exercise the Stage 5R.4
// deterministic entailment / DERIVED path against real FedEx wording.
//
// IT MUST NOT be imported by any production `lib/core` module (a leakage test
// enforces this), and it MUST NOT be added to Benchmark 001's Gold definitions.
//
// IT CONTAINS ONLY source semantics (what construct each option measures) — NEVER
// expected conclusions: no Gold hierarchy, no MUST-FIND/MUST-NOT-SAY ids, no
// "64.6 is valid" / "55.8 is invalid" flags, no model instructions. The engine —
// not this file — decides what those facts permit.
//
// ── Forensic justification (each field grounded in the question/option WORDING,
//    not in the Gold answer) ─────────────────────────────────────────────────────
//  q_fit "FedEx as a Champions League sponsor?":
//    • "Strong natural fit"    → sponsorship_relevance (a relevance judgement, strong)
//    • "Relevant but unclear"  → sponsorship_relevance (a relevance judgement, unclear)
//        └ same construct as strong_fit: BOTH are explicit relevance judgements that
//          differ only in strength/clarity → ordinal within one construct.
//    • "Mostly brand visibility" → brand_visibility (sees FedEx via brand presence,
//          a DIFFERENT construct from relevance).
//    • "Never noticed them"    → sponsorship_awareness (NON-recognition/awareness, a
//          DIFFERENT construct from relevance — one cannot judge relevance of a
//          sponsor one never noticed).
//    (If one considered "Relevant but unclear" NOT a relevance judgement, the honest
//     move is to leave it absent — which would leave the recode provisional. We make
//     the defensible source-grounded call that it IS a relevance judgement.)
//  q_offer "What should sponsors offer fans?" — four DISTINCT offer categories, each
//    its own construct (rewards ≠ experiences ≠ access ≠ grassroots); combining any
//    two is a cross-construct union.
//  q_help "How could FedEx help fans most?" — four DISTINCT help categories, each its
//    own construct.

import type { QuestionSemantics } from "@/lib/core/semantic/metadata";
import type { DiscoveryInput } from "@/lib/core/candidates/types";

export const FEDEX_SEMANTIC_OVERLAY: Record<string, QuestionSemantics> = {
  q_fit: {
    questionKey: "q_fit", scaleType: "nominal", provenance: "source_declared",
    options: [
      { optionId: "strong_fit", constructId: "sponsorship_relevance", ordinalPosition: 2 },
      { optionId: "relevant_unclear", constructId: "sponsorship_relevance", ordinalPosition: 1 },
      { optionId: "brand_visibility", constructId: "brand_visibility" },
      { optionId: "never_noticed", constructId: "sponsorship_awareness" },
    ],
  },
  q_offer: {
    questionKey: "q_offer", scaleType: "nominal", provenance: "source_declared",
    options: [
      { optionId: "rewards", constructId: "offer_rewards" },
      { optionId: "experiences", constructId: "offer_experiences" },
      { optionId: "access", constructId: "offer_access" },
      { optionId: "grassroots", constructId: "offer_grassroots" },
    ],
  },
  q_help: {
    questionKey: "q_help", scaleType: "nominal", provenance: "source_declared",
    options: [
      { optionId: "experiences_access", constructId: "help_experiences" },
      { optionId: "connecting", constructId: "help_connecting" },
      { optionId: "communities", constructId: "help_communities" },
      { optionId: "content", constructId: "help_content" },
    ],
  },
};

/** Attach the governed semantic overlay to a FedEx discovery input (eval only). */
export function applyFedexSemanticOverlay(di: DiscoveryInput): DiscoveryInput {
  return { ...di, questions: di.questions.map((q) => ({ ...q, semantics: FEDEX_SEMANTIC_OVERLAY[q.questionKey] })) };
}
