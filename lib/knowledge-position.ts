// The Knowledge Position — the Overview's closing synthesis (docs/overview-page.md
// §B.4–§B.6). One grounded pass over the Understanding + the gathered Existing
// Intelligence produces three beats together:
//   • Confidence in our current understanding (measured from what we can evidence)
//   • What we still need to learn (the frontier — method-neutral)
//   • Fanometrix's Recommendation (the best next step for the CLIENT'S decision)
//
// The recommendation optimises for the client's business outcome, NOT for
// generating research. Research is a means to an end; it is recommended only when
// it would materially improve the eventual business recommendation.
//
// Client- and server-safe: pure types + helpers, no I/O.

export type ConfidenceLevel = "high" | "moderate" | "low";

// The four outcomes — a readiness spectrum. Three point forward, one points back.
export type RecommendationOutcome =
  | "ready_to_decide"        // evidence already supports a confident recommendation
  | "focused_research"       // a few specific unknowns materially matter
  | "full_research"          // significant unknowns; broader programme warranted
  | "refine_understanding";  // the problem itself is too unclear to judge

export type ConfidenceDimension = { dimension: string; level: ConfidenceLevel; basis: string };
export type KnowledgeGapItem = { question: string };

export type CommissioningRecommendation = {
  outcome: RecommendationOutcome;
  headline: string;   // the consultant's one-line verdict
  rationale: string;  // grounded in the confidence + gaps; no new claims
};

export type KnowledgePosition = {
  confidence: { overall: ConfidenceLevel; summary: string; dimensions: ConfidenceDimension[] };
  frontier: KnowledgeGapItem[];
  recommendation: CommissioningRecommendation;
  generated_at: string | null;
  model: string | null;
};

// ── Presentation ──────────────────────────────────────────────────────────────
export const OUTCOME_LABEL: Record<RecommendationOutcome, string> = {
  ready_to_decide:      "Ready to Decide",
  focused_research:     "Focused Research",
  full_research:        "Full Research",
  refine_understanding: "Refine Understanding",
};

// StatusBadge / hero tones.
export const OUTCOME_TONE: Record<RecommendationOutcome, "success" | "accent" | "info" | "warning"> = {
  ready_to_decide: "success", focused_research: "accent", full_research: "info", refine_understanding: "warning",
};

export const CONFIDENCE_TONE: Record<ConfidenceLevel, "success" | "info" | "neutral"> = {
  high: "success", moderate: "info", low: "neutral",
};
export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  high: "High", moderate: "Moderate", low: "Low",
};

// The closing action IS the recommendation. Each outcome routes to the right next
// stage — not always research.
export type OutcomeAction = { label: string; kind: "decide" | "design" | "refine" };
export function outcomeAction(o: RecommendationOutcome): OutcomeAction {
  switch (o) {
    case "ready_to_decide":      return { label: "Proceed to recommendations", kind: "decide" };
    case "focused_research":     return { label: "Design the research", kind: "design" };
    case "full_research":        return { label: "Design the research", kind: "design" };
    case "refine_understanding": return { label: "Refine the understanding", kind: "refine" };
  }
}
