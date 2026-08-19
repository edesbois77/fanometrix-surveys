// ── Fanometrix Analytical Core — analytical pipeline (Stage 4, shadow) ────────
// Ties discovery → semantic governance → disconfirmation → (project) → the
// existing Stage 2/3 governance + assessment + ranking. REUSES those layers; it
// does not re-implement them. Shadow-only, no production wiring.

import type { Candidate, CandidateState, DiscoveryInput } from "../candidates/types";
import { generateCandidates } from "../candidates/generate";
import {
  validateGroupingStructure, type SemanticGroupingProposer,
} from "../semantic/grouping";
import { buildProvisionalInterpretation } from "../semantic/interpretation";
import { assessEntailment, buildDerivedInterpretation, buildRejectedInterpretation } from "../semantic/entailment";
import {
  validateSynthesis, validateSynthesisClaim, buildSynthesisCandidate,
  type SynthesisProposal, type SemanticSynthesisProposer,
} from "../semantic/synthesis";
import { assessDisconfirmation, disconfirmationEffect } from "../disconfirmation/assess";
import type { DisconfirmationAssessment } from "../disconfirmation/types";
import type { Finding } from "../findings/types";
import { assessFindings, groupByPriority } from "../assessment/assess";
import type { AnalysisContext, FindingAssessment, Priority } from "../assessment/types";

export type PipelineOptions = {
  context?: AnalysisContext;
  /** The non-authoritative semantic model (Stage 5R.5): it may PROPOSE a construct
   *  or ABSTAIN, yielding at most a PROVISIONAL interpretation — never authority. */
  groupingProposer?: SemanticGroupingProposer;
  synthesisProposals?: SynthesisProposal[];
  /** The non-authoritative synthesis model (Stage 5R.6): it may propose a story or
   *  ABSTAIN. A model-proposed synthesis is never Primary and never self-elevates. */
  synthesisProposer?: SemanticSynthesisProposer;
  /** Externally/model-proposed candidates (treated as untrusted input; still
   *  fully governed). Used to test that invalid proposals never survive. */
  externalCandidates?: Candidate[];
};

export type CandidateOutcome = {
  candidate: Candidate;
  disconfirmation?: DisconfirmationAssessment;
  assessment?: FindingAssessment;
  finalState: CandidateState;
  priority?: Priority;
  decisionReason: string;
};

export type AnalysisResult = { outcomes: CandidateOutcome[]; hierarchy: Record<Priority, FindingAssessment[]> };

const PRIO_ORDER: Record<Priority, number> = { primary: 0, secondary: 1, contextual: 2, suppressed: 3 };

function projectToFinding(c: Candidate): Finding {
  const assertionType = c.kind === "wave_difference" ? "comparative" : "descriptive";
  return {
    id: c.id, statement: c.claim, assertionType,
    evidence: c.evidence, results: c.results,
    questions: c.sourceQuestionKeys,
    change: c.change,
    derivedFrom: c.derivedFromCandidates,
    synthesisElevation: c.synthesisElevation,
    // Authority is derived from the Result's interpretation (single source of
    // truth, Stage 5R.2) — reference it, do NOT duplicate the authority value here.
    constructInterpretationId: (c.results ?? []).map((r) => r.interpretation).find(Boolean)?.id,
    version: { standardVersion: "1.1", coreVersion: "0.1.0", runProvenance: "core-discovery" },
    status: "candidate",
  };
}

export function runAnalysis(input: DiscoveryInput, opts: PipelineOptions = {}): AnalysisResult {
  const ctx: AnalysisContext = { objective: input.objective, ...opts.context };
  let candidates: Candidate[] = [...generateCandidates(input), ...(opts.externalCandidates ?? [])];

  // ── Semantic grouping governance (structural → deterministic entailment → model) ─
  const semanticsFor = (qk: string) => input.questions.find((q) => q.questionKey === qk)?.semantics;
  candidates = candidates.map((c) => {
    if (c.kind !== "semantic_grouping") return c;
    // Precedence (Standard v1.2 §36, Stage 5R.4 §12/§23): structural validity →
    // governed-metadata entailment → optional model. Each gate is deterministic and
    // no model verdict can override an earlier deterministic outcome.
    const structural = validateGroupingStructure(c);
    // 1) Structural/arithmetic gate FIRST — invalid structure (e.g. a cross-question
    //    sum) is rejected and reaches neither the entailment engine nor the model.
    if (!structural.ok) return { ...c, state: "rejected", stateReason: "structural: " + structural.reasons.join("; ") };
    const gr = c.results?.find((r) => r.grouping)?.grouping;

    // 2) Deterministic semantic entailment from GOVERNED metadata (Stage 5R.4).
    const comps = c.evidence.map((e) => ({ questionKey: e.question?.canonicalKey ?? "", optionId: e.option?.id ?? e.id }));
    const entail = assessEntailment(comps, semanticsFor);
    if (entail.decision === "entailed") {
      // DERIVED authority — established by governed metadata, NOT a model verdict.
      // The interpretation is the engine-authored neutral construct-membership union.
      const interpretation = buildDerivedInterpretation(c.id, entail);
      const results = (c.results ?? []).map((r) => (r.grouping ? { ...r, grouping: { ...r.grouping, parentConstruct: entail.constructId! }, interpretation } : r));
      const claim = c.claim.replace(/construct unverified/i, entail.constructId!);
      return { ...c, state: "generated", construct: entail.constructId, results, claim, reviewRequirements: [] };
    }
    if (entail.decision === "not_entailed") {
      // Deterministic semantic rejection (e.g. cross-construct substitution). The
      // arithmetic Result stays valid; a rejected interpretation is kept for audit.
      const interpretation = buildRejectedInterpretation(c.id, entail);
      const results = (c.results ?? []).map((r) => (r.grouping ? { ...r, interpretation } : r));
      return { ...c, state: "rejected", stateReason: "semantic (deterministic): " + entail.reasons.join("; "), results };
    }

    // 3) unable_to_establish → the model may PROPOSE (Stage 5R.5, non-authoritative).
    //    A proposal yields at most a PROVISIONAL interpretation (Contextual-capped);
    //    ABSTENTION invents no construct → the grouping is held, not surfaced. The
    //    model cannot reject, approve, or grant authority.
    const proposal = opts.groupingProposer?.propose({
      candidateId: c.id, questionText: c.evidence[0]?.question?.text ?? c.sourceQuestionKeys[0] ?? "",
      componentLabels: gr?.componentLabels ?? [], objective: input.objective,
    }) ?? null;
    if (!proposal || proposal.proposedConstruct == null) {
      return { ...c, state: "held_for_semantic_review", stateReason: proposal ? "semantic model abstained (no construct proposed)" : "no semantic proposal available" };
    }
    const construct = proposal.proposedConstruct;
    const reviewNotes = [
      ...proposal.rationale,
      ...(proposal.ambiguity === "high" ? ["model flagged ambiguity"] : []),
      ...(proposal.competingInterpretations ? ["model flagged competing interpretations"] : []),
    ];
    const interpretation = buildProvisionalInterpretation(c.id, construct, reviewNotes);
    const results = (c.results ?? []).map((r) => (r.grouping ? { ...r, grouping: { ...r.grouping, parentConstruct: construct }, interpretation } : r));
    const claim = c.claim.replace(/construct unverified/i, construct);
    return { ...c, state: "generated", construct, results, claim };
  });

  // ── Synthesis proposals (Stage 5R.6: non-authoritative model + claim-aware) ──
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const heldSynth = (p: SynthesisProposal, reason: string, state: "rejected" | "held_for_semantic_review") =>
    ({ id: p.id, kind: "cross_question_synthesis" as const, claim: p.claim, construct: p.construct, sourceQuestionKeys: p.questionKeys, evidence: [], provenance: { generator: "synthesis-proposal", deterministic: false, modelProposed: true }, reviewRequirements: ["semantic_synthesis"], state, stateReason: reason });
  for (const p of opts.synthesisProposals ?? []) {
    const structural = validateSynthesis(p, byId);
    if (!structural.ok) { candidates.push(heldSynth(p, "structural: " + structural.reasons.join("; "), "rejected")); continue; }
    const components = p.componentCandidateIds.map((id) => byId.get(id)).filter((x): x is Candidate => !!x);
    // Claim-aware support: a synthesis cannot create causal/temporal/statistical
    // authority its components lack (held, not surfaced, if the claim is unsupported).
    const claim = validateSynthesisClaim(p, components);
    if (!claim.ok) { candidates.push(heldSynth(p, `unsupported ${claim.unsupported} claim: ${claim.reasons.join("; ")}`, "held_for_semantic_review")); continue; }
    // The model PROPOSES a story or ABSTAINS — it grants no authority/elevation.
    const signal = opts.synthesisProposer?.propose(p) ?? null;
    if (!signal || !signal.formsStory) { candidates.push(heldSynth(p, signal ? "semantic model abstained (no coherent story)" : "no synthesis proposal available", "held_for_semantic_review")); continue; }
    candidates.push(buildSynthesisCandidate(p, components));
  }

  // ── Disconfirmation (active candidates only) ────────────────────────────────
  const active = candidates.filter((c) => c.state !== "rejected" && c.state !== "held_for_semantic_review");
  const disconfirmById = new Map(active.map((c) => [c.id, assessDisconfirmation(c)]));

  // ── Project → Stage 2/3 assessment (reused) ─────────────────────────────────
  const findings = active.map(projectToFinding);
  const assessments = assessFindings(findings, ctx);
  const assessById = new Map(assessments.map((a) => [a.findingId, a]));

  // ── Combine + disconfirmation gating → final state ──────────────────────────
  const surviving: FindingAssessment[] = [];
  const outcomes: CandidateOutcome[] = candidates.map((c) => {
    if (c.state === "rejected") return { candidate: c, finalState: "rejected", decisionReason: c.stateReason ?? "rejected" };
    if (c.state === "held_for_semantic_review") return { candidate: c, finalState: "held_for_semantic_review", decisionReason: c.stateReason ?? "held for semantic review" };
    const a = assessById.get(c.id)!;
    const dis = disconfirmById.get(c.id);
    let priority = a.priority;
    let reason = a.priorityReasons.join("; ");
    // Claim-level disconfirmation (Stage 5R.6): only a challenge to the Finding's
    // CORE observation may suppress/demote. Interpretation- or causal-only
    // challenges (construct_mismatch, alternative_explanation) are caveats — they
    // never weaken an independently-grounded descriptive Result.
    const eff = dis ? disconfirmationEffect(dis) : null;
    if (eff?.suppress) { priority = "suppressed"; reason = `disconfirmation: contradicted core claim (${dis!.reasons.join("; ")})`; }
    else if (eff?.demoteTo && PRIO_ORDER[priority] < PRIO_ORDER[eff.demoteTo]) { priority = eff.demoteTo; reason = `disconfirmation: core claim materially weakened (${dis!.reasons.join("; ")})`; }
    const finalState: CandidateState = priority === "suppressed" ? "suppressed" : "promoted";
    const finalAssessment: FindingAssessment = { ...a, priority };
    surviving.push(finalAssessment);
    return { candidate: c, disconfirmation: dis, assessment: finalAssessment, finalState, priority, decisionReason: reason };
  });

  return { outcomes, hierarchy: groupByPriority(findings, surviving) };
}
