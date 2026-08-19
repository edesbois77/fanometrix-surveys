// ── Fanometrix Analytical Core — Survey Studio → Core adapter (Stage 5C) ──────
// READ-ONLY. Maps a Studio governed result set into a Core DiscoveryInput,
// preserving ids/wording/counts/bases and using COUNTS (Core computes proportion
// itself — no silent scale conversion, Stage 1.1). Decoupled via local structural
// input types (Studio is actively edited elsewhere). Missing metadata stays absent.

import type { DiscoveryInput, QuestionDistribution } from "../candidates/types";
import type { QuestionSemantics } from "../semantic/metadata";

export type StudioOptionInput = { optionId: string; label?: string; count: number };
export type StudioWaveInput = { waveId: string; base: number; options: StudioOptionInput[] };
export type StudioQuestionInput = {
  questionId?: string;
  canonicalQuestionKey?: string;
  questionIndex?: number;
  text?: string;
  base: number;
  options: StudioOptionInput[];
  waves?: StudioWaveInput[];
  /** Governed semantic metadata for this question (Stage 5D), when the Studio
   *  instrument declared a governed scale. Absent = no governed semantics. */
  semantics?: QuestionSemantics;
};
export type StudioGovernedInput = {
  source: { kind: string; id: string; metadata?: Record<string, unknown> };
  questions: StudioQuestionInput[];
  objective?: string;
};

export function studioToDiscoveryInput(input: StudioGovernedInput): DiscoveryInput {
  const questions: QuestionDistribution[] = input.questions.map((q, i) => ({
    questionKey: q.canonicalQuestionKey ?? q.questionId ?? `q${q.questionIndex ?? i}`,
    questionText: q.text,
    base: q.base,
    sourceType: "survey",
    contribution: "elicited_perception",
    options: q.options.map((o) => ({ id: o.optionId, label: o.label, count: o.count })),
    waves: q.waves?.map((w) => ({ waveId: w.waveId, base: w.base, options: w.options.map((o) => ({ id: o.optionId, label: o.label, count: o.count })) })),
    // Governed semantics pass through UNCHANGED (never inferred here); the pipeline's
    // deterministic entailment decides authority. Missing stays missing.
    ...(q.semantics ? { semantics: q.semantics } : {}),
  }));
  return { questions, objective: input.objective };
}
