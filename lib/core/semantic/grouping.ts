// ── Fanometrix Analytical Core — governed semantic grouping (Stage 4) ─────────
// Arithmetic validity is necessary but NOT sufficient — semantic coherence must
// also be governed. Structural validity is deterministic; construct coherence +
// label fidelity are MODEL-ASSISTED (a bounded rubric judge), never decided by
// deterministic code and never hard-coded to any value/label. No live model in
// CI — a fixture judge stands in.

import type { Candidate } from "../candidates/types";

// ── Deterministic structural validation ──────────────────────────────────────
export type StructuralResult = { ok: boolean; reasons: string[] };

export function validateGroupingStructure(c: Candidate): StructuralResult {
  const reasons: string[] = [];
  const r = c.results?.find((x) => x.grouping);
  if (!r) return { ok: false, reasons: ["no grouping result on the candidate"] };
  const comps = c.evidence;
  if (comps.length < 2) reasons.push("a grouping needs >= 2 components");
  // Same compatible measurement (one question).
  const questions = new Set(comps.map((e) => e.question?.canonicalKey ?? ""));
  if (questions.size !== 1) reasons.push("components must come from ONE compatible question (cross-question grouping is prohibited)");
  // No double counting.
  const optionIds = comps.map((e) => e.option?.id ?? e.id);
  if (new Set(optionIds).size !== optionIds.length) reasons.push("components double-count an option");
  // Compatible denominator.
  const bases = new Set(comps.map((e) => e.denominator));
  if (bases.size !== 1) reasons.push("components have incompatible denominators");
  // Valid arithmetic (sum of numerators / base == grouping value).
  const base = comps[0]?.denominator ?? 0;
  const sum = comps.reduce((a, e) => a + (e.numerator ?? 0), 0);
  const expected = base > 0 ? sum / base : NaN;
  const value = r.quantity.unit === "proportion" ? r.quantity.value : r.quantity.value / 100;
  if (!(Math.abs(expected - value) < 0.005)) reasons.push(`arithmetic mismatch (expected ${expected}, got ${value})`);
  if (value < 0 || value > 1) reasons.push("grouping share out of range");
  return { ok: reasons.length === 0, reasons };
}

export type YNU = "yes" | "no" | "unclear";

// ── Non-authoritative model proposer/reviewer (Stage 5R.5) ────────────────────
// The semantic model may PROPOSE a construct/label, flag AMBIGUITY, and note
// COMPETING interpretations — advisory review signals. NONE of these fields maps
// to ConstructAuthority: authority is granted only by deterministic entailment
// (DERIVED) or governed declaration/attestation (later batches). A model proposal,
// at most, yields a PROVISIONAL interpretation (capped at Contextual). There is no
// self-certification: no `constructCoherent`/`humanReviewRequired` approval field.

export type Ambiguity = "low" | "high";

export type GroupingProposalInput = {
  candidateId: string;
  questionText: string;
  componentLabels: string[];
  objective?: string;
};

/** What the model OFFERS about a proposed grouping. `proposedConstruct: null` is a
 *  first-class ABSTENTION (the model offers no construct — the pipeline then invents
 *  none). `ambiguity`/`competingInterpretations` are review signals only. */
export type GroupingProposal = {
  proposedConstruct: string | null;
  proposedLabel?: string | null;
  ambiguity: Ambiguity;
  competingInterpretations: boolean;
  rationale: string[];
};

/** The model proposes or abstains; it never approves, rejects, or grants authority. */
export interface SemanticGroupingProposer {
  propose(input: GroupingProposalInput): GroupingProposal;
}

/** CI/eval fixture proposer — proposals from a supplied map. An unknown candidate
 *  ABSTAINS (no construct), so nothing is invented on the model's behalf. */
export class FixtureGroupingProposer implements SemanticGroupingProposer {
  constructor(private proposals: Record<string, GroupingProposal>) {}
  propose(input: GroupingProposalInput): GroupingProposal {
    return this.proposals[input.candidateId] ?? { proposedConstruct: null, ambiguity: "high", competingInterpretations: false, rationale: ["no proposal supplied — abstained"] };
  }
}

// ── Legacy verdict contract — EVAL ONLY, never authoritative (deprecated) ──────
// Retained solely for the manual real-model adapter (lib/core/semantic/model) and
// its prompt/validator. It is NOT consumed by the pipeline. `verdictToProposal`
// adapts it to the non-authoritative proposal contract, DROPPING the self-certifying
// fields (`constructCoherent`/`humanReviewRequired`) from any authority role.
export type GroupingJudgeInput = {
  candidateId: string;
  questionText: string;
  componentLabels: string[];
  proposedConstruct: string | null;
  proposedLabel: string | null;
  objective?: string;
};
export type GroupingVerdict = {
  constructCoherent: YNU;
  labelFaithful: YNU;
  informationGain: YNU;
  competingRisk: "low" | "high";
  humanReviewRequired: boolean;
  construct?: string;
  reasons: string[];
};

/** Adapt a legacy verdict to a proposal. A `no` coherence/fidelity → ABSTENTION
 *  (no construct offered); otherwise the affirmed construct becomes a proposal.
 *  `humanReviewRequired` is intentionally ignored — it can no longer approve. */
export function verdictToProposal(v: GroupingVerdict): GroupingProposal {
  const offers = v.constructCoherent !== "no" && v.labelFaithful !== "no" && !!v.construct;
  return {
    proposedConstruct: offers ? (v.construct ?? null) : null,
    proposedLabel: offers ? (v.construct ?? null) : null,
    ambiguity: v.competingRisk === "high" ? "high" : "low",
    competingInterpretations: v.competingRisk === "high",
    rationale: v.reasons,
  };
}
