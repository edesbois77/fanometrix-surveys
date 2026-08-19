// ── Fanometrix Analytical Core — assessment public surface (Stage 3, shadow) ──
// Additive, shadow-only. Nothing here is imported by any production path.
export type {
  Confidence, Materiality, Relevance, Priority, Eligibility, Assessor,
  EligibilityAssessment, ConfidenceAssessment, MaterialityAssessment, RelevanceAssessment,
  RedundancyAssessment, FindingAssessment, AnalysisContext,
} from "./types";
export { assessEligibility } from "./eligibility";
export { assessConfidence } from "./confidence";
export { assessMateriality } from "./materiality";
export { assessRelevance } from "./relevance";
export { detectRedundancy } from "./redundancy";
export { assignPriority, applySynthesisConstraint, temporalComparabilityUnresolved, withinClassOrder, PRIORITY_ORDER, type RankingInput } from "./ranking";
export { assessFindings, groupByPriority } from "./assess";
