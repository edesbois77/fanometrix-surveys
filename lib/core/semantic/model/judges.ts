// ── Fanometrix Analytical Core — REAL bounded semantic model adapters ─────────
// MANUAL / EVAL ONLY. Imports the existing OpenAI wrapper (completeJSON). NOT a
// *.test.ts and NOT imported by any CI test — a developer without credentials
// runs the normal suite unaffected. The model produces VALIDATED verdicts that
// the deterministic pipeline consumes only as a NON-AUTHORITATIVE proposal (via
// verdictToProposal + FixtureGroupingProposer); the model never gains authority.

import { completeJSON } from "@/lib/intelligence/openai";
import type { Candidate } from "../../candidates/types";
import type { GroupingVerdict } from "../grouping";
import type { SynthesisProposal, SynthesisVerdict } from "../synthesis";
import type { DisconfirmationJudgeInput } from "../../disconfirmation/types";
import { buildGroupingPrompt, buildSynthesisPrompt, buildDisconfirmationPrompt, RUBRIC_VERSIONS } from "../prompts";
import { validateGroupingResponse, validateSynthesisResponse, validateDisconfirmationResponse } from "../validate-model-output";
import type { ModelProvenance } from "../../run/types";

export type CompleteFn = typeof completeJSON;
const MODEL = "gpt-4o";
const HELD_GROUPING: GroupingVerdict = { constructCoherent: "unclear", labelFaithful: "unclear", informationGain: "unclear", competingRisk: "high", humanReviewRequired: true, reasons: ["model unavailable/invalid → held (deterministic default)"] };
const HELD_SYNTH: SynthesisVerdict = { coherent: "unclear", centralStory: false, humanReviewRequired: true, reasons: ["model unavailable/invalid → held"] };

/** Resolve grouping verdicts for every grouping candidate — returns a verdict map
 *  (adapt via verdictToProposal) + provenance. Degrades to HELD on any failure. */
export async function resolveGroupingVerdicts(candidates: Candidate[], objective: string | undefined, complete: CompleteFn = completeJSON): Promise<{ verdicts: Record<string, GroupingVerdict>; provenance: ModelProvenance[] }> {
  const verdicts: Record<string, GroupingVerdict> = {};
  const provenance: ModelProvenance[] = [];
  for (const c of candidates.filter((x) => x.kind === "semantic_grouping" && x.state === "held_for_semantic_review")) {
    const gr = c.results?.find((r) => r.grouping)?.grouping;
    const input = { candidateId: c.id, questionText: c.evidence[0]?.question?.text ?? c.sourceQuestionKeys[0] ?? "", componentLabels: gr?.componentLabels ?? [], proposedConstruct: gr?.parentConstruct ?? null, proposedLabel: gr?.parentConstruct ?? null, objective };
    try {
      const raw = await complete({ prompt: buildGroupingPrompt(input), model: MODEL, temperature: 0.1, maxTokens: 400 });
      const v = validateGroupingResponse(raw);
      verdicts[c.id] = v.ok ? v.value! : HELD_GROUPING;
      provenance.push({ operation: "grouping", provider: "openai", model: MODEL, rubricVersion: RUBRIC_VERSIONS.grouping, inputRefs: c.derivation?.componentIds ?? [], outcome: v.ok ? "used" : "held", validationPassed: v.ok, reason: v.reasons.join("; ") || undefined });
    } catch (e) {
      verdicts[c.id] = HELD_GROUPING;
      provenance.push({ operation: "grouping", provider: "openai", model: MODEL, rubricVersion: RUBRIC_VERSIONS.grouping, inputRefs: c.derivation?.componentIds ?? [], outcome: "held", validationPassed: false, reason: String(e).slice(0, 140) });
    }
  }
  return { verdicts, provenance };
}

export async function resolveSynthesisVerdicts(proposals: SynthesisProposal[], resultLabels: (p: SynthesisProposal) => { label: string }[], complete: CompleteFn = completeJSON): Promise<{ verdicts: Record<string, SynthesisVerdict>; provenance: ModelProvenance[] }> {
  const verdicts: Record<string, SynthesisVerdict> = {};
  const provenance: ModelProvenance[] = [];
  for (const p of proposals) {
    try {
      const raw = await complete({ prompt: buildSynthesisPrompt(p, resultLabels(p)), model: MODEL, temperature: 0.1, maxTokens: 400 });
      const v = validateSynthesisResponse(raw);
      verdicts[p.id] = v.ok ? v.value! : HELD_SYNTH;
      provenance.push({ operation: "synthesis", provider: "openai", model: MODEL, rubricVersion: RUBRIC_VERSIONS.synthesis, inputRefs: p.componentCandidateIds, outcome: v.ok ? "used" : "held", validationPassed: v.ok, reason: v.reasons.join("; ") || undefined });
    } catch (e) { verdicts[p.id] = HELD_SYNTH; provenance.push({ operation: "synthesis", provider: "openai", model: MODEL, rubricVersion: RUBRIC_VERSIONS.synthesis, inputRefs: p.componentCandidateIds, outcome: "held", validationPassed: false, reason: String(e).slice(0, 140) }); }
  }
  return { verdicts, provenance };
}

export async function resolveSemanticDisconfirmation(input: DisconfirmationJudgeInput, allowedEvidenceIds: string[], complete: CompleteFn = completeJSON) {
  try {
    const raw = await complete({ prompt: buildDisconfirmationPrompt(input), model: MODEL, temperature: 0.1, maxTokens: 400 });
    const v = validateDisconfirmationResponse(raw, allowedEvidenceIds);
    return { ok: v.ok, value: v.value, reasons: v.reasons, provenance: { operation: "disconfirmation" as const, provider: "openai", model: MODEL, rubricVersion: RUBRIC_VERSIONS.disconfirmation, inputRefs: input.supportingEvidence.map((e) => e.id), outcome: (v.ok ? "used" : "rejected") as "used" | "rejected", validationPassed: v.ok, reason: v.reasons.join("; ") || undefined } };
  } catch (e) {
    return { ok: false, reasons: [String(e).slice(0, 140)], provenance: { operation: "disconfirmation" as const, provider: "openai", model: MODEL, rubricVersion: RUBRIC_VERSIONS.disconfirmation, inputRefs: [], outcome: "rejected" as const, validationPassed: false, reason: "model error" } };
  }
}
