// ── Fanometrix Analytical Core — cross-question synthesis (Stage 5R.6) ─────────
// A synthesis CONNECTS results across questions under a common construct — it
// creates NO new percentage (that would be cross-question arithmetic). It is
// governed DIFFERENTLY from a quantitative grouping (Standard v1.2 §46.4): the
// model is a NON-AUTHORITATIVE proposer (mirrors 5R.5), a synthesis inherits its
// claim's evidence dependencies (it cannot create causal/temporal/statistical
// authority its components lack), and it may be elevated above its components
// ONLY through a governed route — never a model signal.

import type { Candidate } from "../candidates/types";
import type { YNU, Ambiguity } from "./grouping";

export type SynthesisClaimType = "descriptive" | "comparative" | "causal" | "temporal" | "predictive";

export type SynthesisProposal = {
  id: string;
  claim: string;
  construct: string;
  questionKeys: string[];
  componentCandidateIds: string[];
  /** What KIND of claim the synthesis asserts (default descriptive). Governs which
   *  evidence dependencies must hold (see validateSynthesisClaim). */
  claimType?: SynthesisClaimType;
  /** Whether the claim depends on statistical significance (needs a supported test). */
  assertsSignificance?: boolean;
};

export type StructuralResult = { ok: boolean; reasons: string[] };

export function validateSynthesis(p: SynthesisProposal, candidatesById: Map<string, Candidate>): StructuralResult {
  const reasons: string[] = [];
  if (new Set(p.questionKeys).size < 2) reasons.push("a synthesis must span >= 2 questions");
  const missing = p.componentCandidateIds.filter((id) => !candidatesById.has(id));
  if (missing.length) reasons.push(`unknown component candidate(s): ${missing.join(", ")}`);
  if (/\b\d+(?:\.\d+)?\s*%/.test(p.claim)) reasons.push("a synthesis must not assert a new combined percentage");
  return { ok: reasons.length === 0, reasons };
}

// ── Non-authoritative synthesis proposer (Stage 5R.6, mirrors grouping 5R.5) ──
/** What the model OFFERS about a possible synthesis. `formsStory: false` is a
 *  first-class ABSTENTION. `tension`/`competingStories` are review signals only —
 *  none grants authority or elevation. */
export type SynthesisSignal = {
  formsStory: boolean;
  tension?: boolean;
  competingStories?: boolean;
  ambiguity: Ambiguity;
  rationale: string[];
};
export interface SemanticSynthesisProposer { propose(p: SynthesisProposal): SynthesisSignal; }

/** CI/eval fixture proposer — an unknown proposal ABSTAINS (forms no story). */
export class FixtureSynthesisProposer implements SemanticSynthesisProposer {
  constructor(private signals: Record<string, SynthesisSignal>) {}
  propose(p: SynthesisProposal): SynthesisSignal {
    return this.signals[p.id] ?? { formsStory: false, ambiguity: "high", rationale: ["no signal supplied — abstained"] };
  }
}

// ── Claim-aware support (Stage 5R.6 §6): a synthesis cannot create authority its
// components lack. Deterministic checks over component evidence — no NLP. ────────
export type SynthesisClaimSupport = { ok: boolean; unsupported?: "causal" | "temporal" | "statistical"; reasons: string[] };
export function validateSynthesisClaim(p: SynthesisProposal, components: Candidate[]): SynthesisClaimSupport {
  const claimType = p.claimType ?? "descriptive";
  if (claimType === "causal" || claimType === "predictive") {
    const hasCausal = components.some((c) => c.evidence.some((e) => e.contribution === "documented_activity"));
    if (!hasCausal) return { ok: false, unsupported: "causal", reasons: [`a ${claimType} synthesis needs governed causal/behavioural evidence its components do not provide`] };
  }
  if (claimType === "temporal") {
    const hasTemporal = components.some((c) => c.change?.state === "comparable_change" || c.change?.state === "trend");
    if (!hasTemporal) return { ok: false, unsupported: "temporal", reasons: ["a temporal synthesis needs a governed comparable change/trend among its components"] };
  }
  if (p.assertsSignificance) {
    const supported = components.some((c) => (c.results ?? []).some((r) => r.statisticalAssessment?.status === "supported"));
    if (!supported) return { ok: false, unsupported: "statistical", reasons: ["a significance claim needs a supported statistical assessment"] };
  }
  return { ok: true, reasons: [] };
}

/** Build a synthesis candidate from a proposal + its component candidates. Creates
 *  NO new percentage; carries component evidence + the derivedFrom relationship (so
 *  ranking's synthesis constraint applies). NEVER elevated by the model — a governed
 *  route sets `synthesisElevation` later. */
export function buildSynthesisCandidate(p: SynthesisProposal, components: Candidate[]): Candidate {
  const claimType = p.claimType ?? "descriptive";
  return {
    id: p.id, kind: "cross_question_synthesis", claim: p.claim, construct: p.construct,
    sourceQuestionKeys: [...new Set(p.questionKeys)],
    evidence: components.flatMap((c) => c.evidence),
    derivation: { operation: "synthesis", componentIds: p.componentCandidateIds },
    derivedFromCandidates: p.componentCandidateIds,
    provenance: { generator: "synthesis-proposal", deterministic: false, modelProposed: true },
    reviewRequirements: ["semantic_synthesis"],
    state: "generated",
    // A temporal synthesis carries its component's governed change state so the
    // temporal-comparability cap applies; other claim types carry no change.
    change: claimType === "temporal" ? components.find((c) => c.change)?.change : undefined,
  };
}

// ── Legacy verdict — EVAL ONLY (real-model adapter + its prompt/validator) ──────
export type SynthesisVerdict = { coherent: YNU; centralStory: boolean; humanReviewRequired: boolean; reasons: string[] };
/** Adapt a legacy verdict to a non-authoritative signal. `centralStory`/
 *  `humanReviewRequired` are dropped — they can no longer elevate or approve. */
export function synthesisVerdictToSignal(v: SynthesisVerdict): SynthesisSignal {
  return { formsStory: v.coherent !== "no", ambiguity: v.coherent === "unclear" ? "high" : "low", competingStories: false, rationale: v.reasons };
}
