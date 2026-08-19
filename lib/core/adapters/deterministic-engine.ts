// ── Core adapter — Survey Studio deterministic finding → canonical Finding ─────
// Pure, read-only. Maps a computed-on-read deterministic SurveyFinding into an
// EPHEMERAL Core Finding (status "computed") for evaluation/consumption — NOT a
// governed, persisted record. Synthesises no interpretation.
//
// Decoupled from the actively-edited engine via a LOCAL STRUCTURAL input type.

import type { Finding } from "../findings/types";
import type { Evidence } from "../evidence/types";
import { proportion } from "../evidence/scale";

/** Structural mirror of a deterministic SurveyFinding (fields this adapter reads).
 *  The engine is transient and its exact shape may evolve; only these fields are
 *  consumed, all optionally. */
export type SurveyFindingInput = {
  id?: string;
  type?: string;
  surveyId?: string;
  questionId?: string;
  canonicalQuestionKey?: string;
  questionIndex?: number;
  title?: string;
  detail?: string;
  optionId?: string;
  optionLabel?: string;
  answerCount?: number;
  baseN?: number;
  /** A PROPORTION in [0,1] (the deterministic engine consumes Studio fractions).
   *  The caller is responsible for passing the engine's value on this scale. */
  percentage?: number;
  filters?: Record<string, unknown>;
  segment?: { dimension: string; value: string };
};

export function fromDeterministicEngine(f: SurveyFindingInput): Finding {
  const canonicalKey = f.canonicalQuestionKey ?? f.questionId;
  const evidence: Evidence[] = [{
    id: `${f.id ?? f.questionId ?? "finding"}:base`,
    kind: "base",
    contribution: "elicited_perception", // survey answers, by definition
    sourceType: "survey",
    sourceId: f.surveyId,
    question: canonicalKey ? { canonicalKey, index: f.questionIndex } : undefined,
    option: f.optionId || f.optionLabel ? { id: f.optionId ?? "", label: f.optionLabel } : undefined,
    numerator: f.answerCount,
    denominator: f.baseN,
    denominatorType: "respondents",
    quantity: f.percentage != null ? proportion(f.percentage) : undefined, // verbatim proportion
  }];
  return {
    id: f.id ?? `${f.surveyId ?? "survey"}:${f.questionId ?? "q"}:${f.type ?? "finding"}`,
    statement: f.title ?? "",
    evidence,
    source: f.surveyId ? { surveyId: f.surveyId } : undefined,
    questions: canonicalKey ? [canonicalKey] : undefined,
    segments: f.segment ? [f.segment] : undefined,
    version: { standardVersion: null, coreVersion: null, runProvenance: null },
    analysisRunId: null,
    status: "computed",            // ephemeral — never a governed record
    sourceMeta: { type: f.type, detail: f.detail ?? null, filters: f.filters ?? null },
    // No confidence / materiality / insight / implications / recommendations.
  };
}
