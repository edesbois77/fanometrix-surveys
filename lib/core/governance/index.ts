// ── Fanometrix Analytical Core — governance public surface (Stage 2) ──────────
// Additive, shadowed. Nothing here is wired into any production governance path.
export type {
  GovernanceRule, ValidationIssue, ValidationResult, GovernanceContext,
  RuleCategory, Severity, Enforcement, Applicability, EvidenceType, RuleScope,
  EquivalenceStatus, LegacySource,
} from "./types";
export { GOVERNANCE_RULES, getRule, type RuleId } from "./rules";
export { validateFinding, validateResult, validateProse, blockingIssues } from "./validators";
export { PROMPT_FRAGMENTS, promptFragment, assembleFragments } from "./prompt-fragments";
export { LEGACY_DIVERGENCES, getDivergence, type LegacyDivergence } from "./legacy-map";
