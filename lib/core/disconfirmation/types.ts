// ── Fanometrix Analytical Core — disconfirmation contracts (Stage 4) ──────────
// Before a Candidate is promoted, actively search for governed evidence that
// would weaken, qualify or contradict it. `none_found` means "no disconfirming
// evidence was found by the available method" — NOT "none exists".

export type DisconfirmationStatus =
  | "none_found"
  | "qualified"
  | "materially_weakened"
  | "contradicted"
  | "unable_to_assess";

export type DisconfirmationKind =
  | "direct_contradiction" | "qualification" | "counter_pattern" | "weak_magnitude"
  | "base_limitation" | "statistical_non_support" | "construct_mismatch" | "alternative_explanation";

export type DisconfirmationAssessment = {
  status: DisconfirmationStatus;
  kinds: DisconfirmationKind[];
  evidenceIds: string[];
  reasons: string[];
  /** True when semantic disconfirmation (which deterministic code cannot fully
   *  establish) still needs a model/human pass — including every `none_found`. */
  reviewRequired: boolean;
  assessor: "deterministic" | "model-assisted";
};

// Bounded model-assisted contract (no live model in CI).
export type DisconfirmationJudgeInput = {
  claim: string;
  supportingEvidence: { id: string; label?: string; value?: number }[];
  relatedResults?: { label: string; value?: number }[];
  objective?: string;
};
export interface SemanticDisconfirmationJudge {
  judge(input: DisconfirmationJudgeInput): { status: DisconfirmationStatus; kinds: DisconfirmationKind[]; reasons: string[] };
}
