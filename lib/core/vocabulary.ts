// ── Fanometrix Analytical Core — canonical vocabulary (Standard v1.1) ─────────
// The single source of the Standard's analytical enums, as string-literal unions
// (repo convention). Pure types — no runtime, no dependencies. Nothing here is
// wired into any product; these are the shared vocabulary the Core contracts use.
//
// Each union is traceable to a resolved methodology Decision in Standard v1.1.

/** Base adequacy state for STANDARD DESCRIPTIVE analysis (Decision 1).
 *  Operation-specific: this is the descriptive set; cross-tab/weighting stages
 *  may impose stricter states later. */
export type BaseState =
  | "suppressed"            // n < 20  — no autonomous Findings/comparisons
  | "directional"           // 20–29   — cautious; rarely headline
  | "analytically_usable"   // 30–49   — normal descriptive; comparative cautious
  | "standard"              // 50–99   — normal descriptive + candidate comparisons
  | "stronger";             // >= 100  — contributes positively to confidence

/** Structured statistical-assessment status (Decision 2). NEVER a boolean. */
export type StatStatus = "supported" | "not_supported" | "not_assessed";

/** Candidate-difference band (Decision 3) — GENERATION GUIDANCE ONLY. Semantic
 *  names, not thresholds embedded in labels. Does not establish significance,
 *  materiality, confidence, Finding validity or reporting language. */
export type CandidateStrength = "negligible" | "weak" | "clear" | "strong";

/** Materiality (Decision 4) — categorical, never a numeric score. */
export type Materiality = "low" | "moderate" | "high" | "critical" | "unable_to_assess";

/** Confidence (Decision 5) — categorical, claim-specific, never numeric.
 *  NOTE: intentionally distinct from lib/reports/types.ts `Confidence`
 *  (high|moderate|early); the Core must NOT import that type. */
export type Confidence = "high" | "moderate" | "low" | "unsupported" | "unable_to_assess";

/** Change vs trend (Decision 6). */
export type ChangeState = "dataset_difference" | "comparable_change" | "trend";
export type QuestionComparability = "exact" | "equivalent" | "partial" | "not_comparable";

/** Grouping (Decision 7). Full set, used at the Finding level. */
export type GroupingKind = "explicit" | "governed_semantic" | "thematic_synthesis";
/** Result-level grouping EXCLUDES thematic_synthesis by construction, so a
 *  thematic synthesis can never be represented as a numeric derived Result. */
export type ResultGroupingKind = "explicit" | "governed_semantic";

/** Recommendation tier (Decision 8). */
export type RecommendationTier =
  | "evidence_supported_direction"
  | "strategic_implication"
  | "hypothesis_to_test"
  | "none";

/** Finding priority (Decision 9). */
export type Priority = "primary" | "secondary" | "contextual" | "suppressed";

/** Denominator semantics (Decision 11). "selections" is DEFINED for future
 *  multi-select but no multi-select behaviour is implemented in Stage 1. */
export type DenominatorType = "respondents" | "selections";

/** Evidence + measurement descriptors. "respondent" is DEFINED for the future
 *  cross-tab capability (Decision 10) but never produced in Stage 1. */
export type EvidenceKind = "base" | "derived" | "segment" | "respondent";

// ── Evidence semantics: source vs kind vs contribution vs stance ─────────────
// Three orthogonal descriptors, deliberately distinct:
//   • sourceType  — WHERE the evidence came from (survey / conversation / document).
//   • kind        — its STRUCTURAL class in the Core (base / derived / segment / respondent).
//   • contribution— WHAT KIND OF KNOWLEDGE it supplies to a claim (below).
//   • stance      — WHAT THIS citation DOES for the specific claim it is cited on.
//
// `ContributionKind` generalises Research Projects' product-agnostic taxonomy
// (lib/analysis/types.ts) so a survey answer, a social post, a document and a
// benchmark are told apart by what they can establish, not by their connector.
// `derived_result` is added for Core-computed derived evidence.
export type ContributionKind =
  | "elicited_perception"    // what people say when asked (survey answers). Not what they did.
  | "unprompted_discourse"   // what people say unbidden (conversation/social). Not population magnitude.
  | "documented_activity"    // what verifiably happened (behaviour/campaign). Not what anyone thought of it.
  | "interested_claim"       // what a party says about itself (a document's own assertion). Not that it is true.
  | "expert_judgement"       // a named professional's assessment. Not consensus.
  | "established_knowledge"  // prior research / benchmarks. Not that it holds here.
  | "derived_result";        // a value computed by the Core from other governed evidence.

/** What a cited item DOES for the claim it is attached to (a property of the
 *  relationship, not of the evidence). Adopted from RP CitationStance. */
export type CitationStance = "establishes" | "illustrates" | "qualifies" | "contests";
/** Scale-explicit unit for a Quantity (Stage 1.1). There is deliberately NO
 *  ambiguous "percent": a share is either a `proportion` (0–1, e.g. 0.336) or
 *  `percentage_points` (0–100, e.g. 33.6). A Core consumer can always read the
 *  scale from the unit alone, without knowing the originating product. */
export type Unit = "proportion" | "percentage_points" | "count" | "index";
export type SourceType = "survey" | "conversation" | "document";
export type ResultOperation = "share" | "count" | "index" | "margin_of_error" | "grouping" | "comparison";

/** Finding lifecycle — a SUPERSET so read adapters can map every existing
 *  source faithfully: Research Projects, Survey Studio curated, and the
 *  deterministic engine (ephemeral). */
export type FindingStatus =
  | "candidate" | "in_review" | "approved" | "rejected" | "superseded" | "set_aside" // RP
  | "draft" | "published"                                                            // Studio curated
  | "computed";                                                                       // deterministic (ephemeral)
