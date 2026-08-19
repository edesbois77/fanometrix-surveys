// ── Fanometrix Analytical Core — versioned semantic rubrics (Stage 5A) ────────
// Bounded prompts for the model's SEMANTIC role only. They contain NO benchmark
// or study-specific expected answers, and never ask "is this a good insight?".
// The model must NOT compute or restate percentages — the Core owns arithmetic.
// Versioned independently of code so a run records which rubric ran.

import type { GroupingJudgeInput } from "./grouping";
import type { SynthesisProposal } from "./synthesis";
import type { DisconfirmationJudgeInput } from "../disconfirmation/types";

export const RUBRIC_VERSIONS = {
  grouping: "grouping_semantic_v1",
  synthesis: "synthesis_semantic_v1",
  disconfirmation: "disconfirmation_semantic_v1",
} as const;

const JSON_ONLY = "Return ONLY valid JSON. Do not include any percentage, count or computed number in your answer — those are supplied and owned by the system.";

export function buildGroupingPrompt(i: GroupingJudgeInput): string {
  return [
    "You are a research-methodology reviewer. A proposed grouping combines answer options from ONE survey question into a broader construct.",
    "Decide ONLY the semantic questions below. Do not compute, restate or judge percentages.",
    `Question: "${i.questionText}"`,
    `Component options: ${i.componentLabels.map((l) => `"${l}"`).join(", ")}`,
    `Proposed construct: ${i.proposedConstruct ?? "(none)"}`,
    i.objective ? `Research objective: ${i.objective}` : "",
    "Answer these bounded questions:",
    "- constructCoherent: do ALL components genuinely belong to the proposed construct? (yes|no|unclear)",
    "- labelFaithful: does the construct label accurately cover every component without exaggeration? (yes|no|unclear)",
    "- informationGain: does the grouping reveal more than restating the components? (yes|no|unclear)",
    "- competingRisk: could equally plausible arbitrary groupings be made from this question? (low|high)",
    "- humanReviewRequired: boolean",
    "- construct: a short, faithful construct phrase (or null)",
    "- reasons: array of short justifications",
    JSON_ONLY,
  ].filter(Boolean).join("\n");
}

export function buildSynthesisPrompt(p: SynthesisProposal, results: { label: string }[]): string {
  return [
    "You are a research-methodology reviewer. A synthesis connects results from DIFFERENT questions under one construct. It creates NO new percentage.",
    `Proposed construct: ${p.construct}`,
    `Component results: ${results.map((r) => `"${r.label}"`).join(", ")}`,
    "Answer:",
    "- coherent: do these results genuinely support one construct/tension? (yes|no|unclear)",
    "- centralStory: is this synthesis the central story of the research, or a supporting theme? (boolean; be conservative)",
    "- humanReviewRequired: boolean",
    "- reasons: array of short justifications",
    JSON_ONLY,
  ].join("\n");
}

export function buildDisconfirmationPrompt(i: DisconfirmationJudgeInput): string {
  return [
    "You are a research-methodology reviewer looking for evidence that WEAKENS a candidate claim — not evidence that supports it.",
    `Candidate claim: "${i.claim}"`,
    `Supporting evidence: ${i.supportingEvidence.map((e) => `"${e.label ?? e.id}"`).join(", ")}`,
    i.relatedResults?.length ? `Other governed results: ${i.relatedResults.map((r) => `"${r.label}"`).join(", ")}` : "",
    i.objective ? `Research objective: ${i.objective}` : "",
    "Answer:",
    "- status: none_found | qualified | materially_weakened | contradicted",
    "- kinds: array from [direct_contradiction, qualification, counter_pattern, weak_magnitude, base_limitation, construct_mismatch, alternative_explanation]",
    "- reasons: array of short justifications (cite the evidence you relied on by its wording)",
    JSON_ONLY,
  ].filter(Boolean).join("\n");
}
