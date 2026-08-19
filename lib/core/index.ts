// ── Fanometrix Analytical Core — public surface (Stage 1) ─────────────────────
// Additive, unwired foundation. Nothing here is imported by any product path.
export * from "./vocabulary";
export { STANDARD_VERSION, CORE_VERSION, type VersionTriple } from "./version";
export * from "./statistics";
export type { Evidence, Result, EvidenceRef, ResultRef, Quantity, StatisticalAssessment } from "./evidence/types";
export { toProportion, toPercentagePoints, proportion, percentagePoints } from "./evidence/scale";
export type { Finding, Insight, Implication, Recommendation } from "./findings/types";
export { fromRpFinding } from "./adapters/rp-finding";
export { fromStudyFinding, type StudyFindingRowInput, type FrozenEvidenceInput } from "./adapters/study-finding";
export { fromDeterministicEngine, type SurveyFindingInput } from "./adapters/deterministic-engine";
