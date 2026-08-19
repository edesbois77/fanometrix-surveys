// ── Fanometrix Analytical Core — candidate discovery contracts (Stage 4) ──────
// A CANDIDATE is a proposition discovered from governed Results/Evidence that may
// be worth testing. It is NOT yet a Finding — it must survive disconfirmation,
// governance, eligibility, assessment and ranking. Shadow-only; no production
// dependency, and (critically) NO dependency on any benchmark.

import type { Evidence, Result } from "../evidence/types";
import type { SourceType, ContributionKind } from "../vocabulary";
import type { ConstructAuthority } from "../semantic/authority";
import type { QuestionSemantics } from "../semantic/metadata";

/** Deliberately small taxonomy — only kinds justified by Standard v1.1. */
export type CandidateKind =
  | "leading_option"          // one option leads by a clear/strong margin
  | "distribution_shape"      // no dominant option / structured spread
  | "notable_minority"        // a substantial non-leading response worth noting
  | "wave_difference"         // a cross-wave/time difference (comparability governed)
  | "semantic_grouping"       // options combined into a governed broader construct
  | "cross_question_synthesis"// a construct connecting results across questions (no new %)
  | "contextual_observation"; // valid but low-value; kept as context

export type CandidateState =
  | "generated" | "under_review" | "held_for_semantic_review"
  | "rejected" | "promoted" | "suppressed";

export type CandidateDerivation = {
  operation?: "share" | "grouping" | "comparison" | "synthesis";
  componentIds: string[];     // evidence/result ids combined
  arithmetic?: string;        // an explicit, auditable description (e.g. "92 + 85 of 274")
};

export type CandidateSignals = {
  leadPp?: number; magnitudePp?: number; band?: string; topSharePct?: number; baseMin?: number;
};

export type Candidate = {
  id: string;
  kind: CandidateKind;
  claim: string;
  construct?: string;                  // the broader construct, for groupings/syntheses
  sourceQuestionKeys: string[];
  evidence: Evidence[];                // governed evidence it rests on
  results?: Result[];                  // derived results (grouping/comparison)
  derivation?: CandidateDerivation;
  signals?: CandidateSignals;
  change?: { state: "dataset_difference" | "comparable_change" | "trend"; comparability: "exact" | "equivalent" | "partial" | "not_comparable" };
  provenance: { generator: string; deterministic: boolean; modelProposed: boolean };
  reviewRequirements: string[];        // e.g. "semantic_construct", "semantic_synthesis"
  /** WHY we may treat this candidate's NOVEL construct as real (Standard v1.2 §44).
   *  Absent = the candidate introduces no novel construct (normal ranking). A
   *  model-approved grouping is set to "provisional" (Stage 5R.1) and capped at
   *  Contextual until an independent-validation route establishes higher authority. */
  constructAuthority?: ConstructAuthority;
  derivedFromCandidates?: string[];    // component candidate ids (synthesis)
  /** GOVERNED synthesis elevation (Stage 5R.6) — never set by a model signal. */
  synthesisElevation?: { route: "governed_review" | "human_attested" };
  state: CandidateState;
  stateReason?: string;
};

// ── Discovery input (generic; NOT survey-only; NO benchmark types) ────────────
export type OptionCount = { id: string; label?: string; count: number };
export type WaveCount = { waveId: string; base: number; options: OptionCount[] };

export type QuestionDistribution = {
  questionKey: string;
  questionText?: string;
  base: number;
  options: OptionCount[];
  sourceType?: SourceType;
  contribution?: ContributionKind;
  waves?: WaveCount[];                  // per-wave counts, when a wave comparison is possible
  /** Governed semantic FACTS about this question (Stage 5R.3). Optional and
   *  backward-compatible: existing inputs without it work unchanged, and its
   *  presence grants NO authority — it is recorded for a future DERIVED-authority
   *  decision (Stage 5R.4), never consumed by generation/ranking here. */
  semantics?: QuestionSemantics;
};

export type DiscoveryInput = {
  questions: QuestionDistribution[];
  objective?: string;
};
