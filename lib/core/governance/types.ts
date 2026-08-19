// ── Fanometrix Analytical Core — governance rule model (pure types) ───────────
// The shared contract for a single governance rule that can express itself as a
// deterministic validator, a prompt fragment, and metadata — so a rule is
// authored ONCE, not re-written per product (Standard v1.1 §27). Stage 2 is
// ADDITIVE and SHADOWED: nothing here is wired into any production path.

import type { Finding } from "../findings/types";
import type { Result, StatisticalAssessment } from "../evidence/types";
import type { ChangeState } from "../vocabulary";

/** Whether a violation blocks a governed Finding or merely flags it for review. */
export type Severity = "blocking" | "advisory";

/** How a check is decided. `deterministic` = decidable from structured Core
 *  contracts (evidence/results/refs). `heuristic` = a high-precision lexical
 *  pattern that FLAGS likely violations; a clean heuristic pass is NEVER proof
 *  that a semantic violation is absent (Standard: keep the tiers honest). */
export type Enforcement = "deterministic" | "heuristic";

export type RuleCategory =
  | "grounding"
  | "arithmetic"
  | "causality"
  | "temporal"
  | "respondent_inference"
  | "statistical_language"
  | "claim_strength"
  | "recommendation_outcome"
  | "references"
  | "comparison"
  | "evidence_sufficiency"
  | "semantic_grouping"
  | "sample_composition"
  | "editorial";

/** Evidence structures a rule needs — product-agnostic, so a future social /
 *  document / campaign Finding is governed by the same rule without naming a
 *  product. `any` = universal (applies regardless of evidence type). */
export type EvidenceType =
  | "any"
  | "quantitative_survey"
  | "respondent_level"
  | "qualitative"
  | "document"
  | "conversation"
  | "campaign";

/** What surface a rule validates. */
export type RuleScope = "finding" | "result" | "prose";

export type Applicability = { evidenceTypes: EvidenceType[]; scope: RuleScope[] };

/** How the new registry rule relates to the existing production implementations. */
export type EquivalenceStatus =
  | "equivalent"          // matches current behaviour across products
  | "studio_only"         // enforced in Survey Studio only today
  | "rp_only"             // enforced in Research Projects only today
  | "stricter_in_studio"  // legacy Studio stricter than canonical
  | "stricter_in_rp"      // legacy RP stricter than canonical
  | "legacy_weaker"       // legacy implementations weaker than canonical (canonical broadens)
  | "conflict"            // products enforce it differently — preserved, not resolved
  | "canonical_supersedes"// Stage 2.1 canonical policy replaces divergent legacy behaviour
  | "new";                // universalised here; no single legacy owner

export type LegacySource = {
  system: "studio" | "research_projects" | "reports" | "prompt";
  location: string;     // file:symbol
  note?: string;
};

/** One governance rule. Authored once; projected to a validator, a prompt
 *  fragment, and metadata. */
export type GovernanceRule = {
  id: string;                  // stable slug, e.g. "unsupported_causation"
  title: string;
  category: RuleCategory;
  description: string;
  standardRef: string[];       // Standard v1.1 sections, e.g. ["§15","§16"]
  severity: Severity;
  /** The PRIMARY enforcement available for this rule today. */
  enforcement: Enforcement;
  applicability: Applicability;
  hasValidator: boolean;
  hasPromptFragment: boolean;
  legacy: LegacySource[];
  equivalence: EquivalenceStatus;
  /** When a rule is a default prohibition that can be lifted only once a future
   *  evidence class exists (e.g. respondent-level relationship evidence), note it. */
  futureEvidence?: string;
};

/** One detected issue. Internal analytical governance — NOT user-facing prose. */
export type ValidationIssue = {
  ruleId: string;
  severity: Severity;
  blocking: boolean;           // severity === "blocking"
  enforcement: Enforcement;    // how THIS issue was detected (deterministic vs heuristic)
  message: string;             // terse internal explanation
  refs?: string[];             // evidence/reference ids involved, where relevant
  span?: string;               // the offending passage, for heuristic hits
  legacyEquivalent?: string;   // pointer to the legacy check this mirrors
};

export type ValidationResult = { issues: ValidationIssue[] };

/** Everything a validator may consult. All optional: a validator only uses what
 *  a caller can supply, and never fabricates context. */
export type GovernanceContext = {
  /** Valid evidence/reference ids for grounding + reference checks. */
  governedRefs?: string[];
  /** Governed displayed numbers (any scale) for number-grounding checks. */
  governedNumbers?: number[];
  /** Whether governed RESPONDENT-LEVEL relationship evidence exists (lifts the
   *  aggregate→respondent prohibition — Decision 10). Absent/false = prohibited. */
  hasRespondentEvidence?: boolean;
  /** The statistical assessment backing a statistical claim, when one was run.
   *  Significance language is permitted only when status === "supported". */
  statisticalAssessment?: StatisticalAssessment;
  /** Governed change state for the claim (Decision 6). Change/trend language is
   *  permitted only for "comparable_change" (any change word) or "trend" (trend
   *  word). Absent = no governed comparability → change language is a violation. */
  changeState?: ChangeState;
  /** Whether the underlying study design + evidence are governed as capable of
   *  supporting CAUSAL inference. Absent/false = causal language is a violation
   *  (the safe state is unsupported, never assumed valid — §21). */
  causalSupportEstablished?: boolean;
  /** Whether governed evidence establishes the ACTION→OUTCOME relationship a
   *  recommendation/preference claim asserts. Absent/false = the outcome claim is
   *  unsupported (§16/§35). */
  outcomeEvidenceEstablished?: boolean;
  /** Option percentages available per question, for cross-question-sum detection. */
  sourceOptions?: { question: string; option: string; pct: number }[];
};

/** A per-rule detector. Rules that are validatable implement one of these
 *  shapes; the dispatcher (validators.ts) routes by scope. */
export type FindingDetector = (finding: Finding, ctx: GovernanceContext) => ValidationIssue[];
export type ResultDetector = (result: Result, ctx: GovernanceContext) => ValidationIssue[];
export type ProseDetector = (text: string, ctx: GovernanceContext) => ValidationIssue[];
