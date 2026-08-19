// ── Fanometrix Analytical Core — assessment contracts (Stage 3, shadow) ───────
// Confidence, Materiality and Ranking as a SHADOW layer: determines how strongly
// evidence supports a Finding, how much it matters, and how prominently it should
// appear — WITHOUT altering anything users see. Categorical only (no numeric
// scores); every assessment carries structured, human-readable reasons.
//
// The analytical hierarchy is preserved and never collapsed:
//   GOVERNANCE (allowed at all?) → ELIGIBILITY (may it compete?) →
//   CONFIDENCE (how strongly supported?) → MATERIALITY (how much does it matter?)
//   → RANKING (how prominently surfaced?).

import type { Finding } from "../findings/types";
import type { GovernanceContext } from "../governance/types";

// Standard v1.1 categorical vocabularies (no pseudo-precise numbers).
export type Confidence = "high" | "moderate" | "low" | "unsupported" | "unable_to_assess";
export type Materiality = "critical" | "high" | "moderate" | "low" | "unable_to_assess";
export type Relevance = "high" | "moderate" | "low" | "unable_to_assess";
export type Priority = "primary" | "secondary" | "contextual" | "suppressed";
export type Eligibility = "eligible" | "eligible_with_caveat" | "ineligible" | "unable_to_assess";

/** Who/what produced an assessment. Deterministic/heuristic run in CI; the
 *  model/human assessors are for the manual boundary (never a live CI dep). */
export type Assessor = "deterministic" | "deterministic-heuristic" | "model-assisted" | "human";

export type EligibilityAssessment = {
  level: Eligibility;
  reasons: string[];              // why this level
  caveats: string[];              // limitations that constrain interpretation
  governanceIssueIds: string[];   // blocking rule ids that made it ineligible
  assessor: Assessor;
};

export type ConfidenceAssessment = {
  level: Confidence;
  reasons: string[];              // strengths supporting the level
  constraints: string[];          // weaknesses/limits
  assessor: Assessor;
};

export type MaterialityAssessment = {
  level: Materiality;
  reasons: string[];
  constraints: string[];
  assessor: Assessor;
  /** Dimensions of materiality that need model/human judgement to finalise
   *  (e.g. "does this change interpretation?"). */
  modelAssistedNeeded: string[];
};

export type RelevanceAssessment = {
  level: Relevance;
  reasons: string[];
  assessor: Assessor;
};

export type RedundancyAssessment = {
  /** id of the Finding that subsumes this one, if any. */
  subsumedBy: string | null;
  kind: "deterministic" | "heuristic" | "none";
  reason: string | null;
  /** Semantic redundancy that only a model/human can confirm. */
  semanticReviewNeeded: boolean;
};

/** The full shadow assessment of one Finding. */
export type FindingAssessment = {
  findingId: string;
  concept: string;                // the Finding statement (for the human report)
  eligibility: EligibilityAssessment;
  confidence: ConfidenceAssessment;
  materiality: MaterialityAssessment;
  relevance: RelevanceAssessment;
  redundancy: RedundancyAssessment;
  priority: Priority;
  priorityReasons: string[];
  /** Dimensions across the whole assessment that are model-assisted/human. */
  modelAssisted: string[];
};

/** Optional research context for relevance/ranking. Product-agnostic; never
 *  fabricated when absent. */
export type AnalysisContext = {
  objective?: string;
  purpose?: string;
  researchQuestions?: string[];
  audience?: string;
  /** Governance context (structured evidence states) forwarded to eligibility. */
  governance?: GovernanceContext;
};

export type AssessableFinding = Finding;
