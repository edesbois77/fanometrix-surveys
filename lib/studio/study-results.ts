// ── Survey Studio — Study Results (pure grouping + combined maths) ───────────
// Turns per-Survey resolved results (from the ONE trusted Survey Results engine)
// into Study Result Groups, WITHOUT ever assuming Surveys in a Study are poolable.
// Comparability is PROVEN from canonical identity + option-id sets — never wording.
//
// This module is pure: no DB, no LLM, no wording/similarity heuristics. It consumes
// already-resolved QuestionResults and computes deterministic groups + combined
// distributions from POOLED COUNTS (never averaged percentages).

import type { OptionResult, QuestionResult } from "@/lib/studio/survey-results";
import type { ResultMode } from "@/lib/studio/survey-results-resolve";

// Three presentation modes. A group is NEVER silently promoted from a weaker to a
// stronger mode: combination requires proof.
//   • combined     — same canonical identity AND identical option-id sets across all
//                    contributing Surveys → counts may be pooled.
//   • side_by_side — same canonical identity but option-id sets diverge → comparable
//                    concept, kept separated by Survey (never pooled).
//   • separate     — the canonical identity appears in only one Survey → not a
//                    cross-Survey comparison at all; it is that Survey's own result.
export type Comparability = "combined" | "side_by_side" | "separate";

/** One Survey's contribution to a group — full provenance is retained, always. */
export type StudyResultSource = {
  surveyId: string;
  surveyName: string;
  questionIndex: number;
  questionId: string;
  canonicalQuestionKey: string;
  label: string;                   // this Survey's question text (display language)
  resultMode: ResultMode;          // historical | studio_native (never merged into one number silently)
  completedResponses: number;      // Survey-level completed (operational), NOT the question base
  base: number;                    // answered for THIS question in THIS Survey (the distribution base)
  shown: number | null;            // null = unavailable (historical), never fabricated 0
  displayLanguage: string;
  options: OptionResult[];         // { optionId, label, count, percentage }
};

export type CombinedDistribution = {
  base: number;                    // Σ contributing source bases — NOT the Study operational total
  options: OptionResult[];         // pooled counts; percentage recalculated from pooled base
  sourceCount: number;             // how many Surveys contributed
};

export type StudyResultGroup = {
  canonicalQuestionKey: string;
  label: string;                   // display text of the question (from the first source)
  comparability: Comparability;
  combined: CombinedDistribution | null;   // present ONLY when comparability === "combined"
  sources: StudyResultSource[];
};

/** A Survey's resolved results, tagged with its identity, ready to group. */
export type SurveyResultsForStudy = {
  surveyId: string;
  surveyName: string;
  resultMode: ResultMode;
  completedResponses: number;
  displayLanguage: string;
  /** Index-aligned canonical keys for the survey's questions (canonical_question_key ?? id). */
  canonicalKeys: string[];
  questions: QuestionResult[];
};

const optionIdSet = (opts: { optionId: string }[]): string[] => opts.map((o) => String(o.optionId)).sort();
const sameOptionIds = (a: { optionId: string }[], b: { optionId: string }[]): boolean => {
  const sa = optionIdSet(a), sb = optionIdSet(b);
  return sa.length > 0 && sa.length === sb.length && sa.every((id, i) => id === sb[i]);
};

/**
 * Build the combined distribution by POOLING COUNTS across sources (all sharing an
 * identical option-id set — the caller guarantees this). The base is the sum of the
 * source bases actually contributing to THIS question — never the Study operational
 * total. Percentage is recomputed from the pooled base (never an average of percentages).
 */
export function combineSources(sources: StudyResultSource[]): CombinedDistribution {
  // Canonical option order + labels taken from the first source; ids are shared.
  const order = sources[0].options.map((o) => String(o.optionId));
  const label = new Map(sources[0].options.map((o) => [String(o.optionId), o.label]));
  const pooled = new Map<string, number>(order.map((id) => [id, 0]));
  for (const s of sources) {
    for (const o of s.options) {
      const id = String(o.optionId);
      if (pooled.has(id)) pooled.set(id, (pooled.get(id) ?? 0) + (o.count || 0));
    }
  }
  const base = sources.reduce((n, s) => n + (s.base || 0), 0);
  const options: OptionResult[] = order.map((id) => {
    const count = pooled.get(id) ?? 0;
    return { optionId: id, label: label.get(id) ?? "", count, percentage: base > 0 ? count / base : null };
  });
  return { base, options, sourceCount: sources.length };
}

/**
 * Group per-Survey question results into Study Result Groups by canonical identity,
 * then classify comparability and (only where proven) compute the combined pooled
 * distribution. Deterministic: groups appear in first-seen order across Surveys;
 * within a group, sources keep their Survey/question order.
 */
export function groupStudyResults(surveys: SurveyResultsForStudy[]): StudyResultGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, StudyResultSource[]>();

  for (const sv of surveys) {
    sv.questions.forEach((q, qi) => {
      const key = sv.canonicalKeys[qi] ?? q.questionId;
      const source: StudyResultSource = {
        surveyId: sv.surveyId,
        surveyName: sv.surveyName,
        questionIndex: q.questionIndex,
        questionId: q.questionId,
        canonicalQuestionKey: key,
        label: q.text,
        resultMode: sv.resultMode,
        completedResponses: sv.completedResponses,
        base: q.base,
        shown: q.shown,
        displayLanguage: sv.displayLanguage,
        options: q.options,
      };
      if (!byKey.has(key)) { byKey.set(key, []); order.push(key); }
      byKey.get(key)!.push(source);
    });
  }

  return order.map((key) => {
    const sources = byKey.get(key)!;
    let comparability: Comparability;
    if (sources.length < 2) {
      comparability = "separate";
    } else {
      // Combinable ⇔ EVERY source shares the first source's option-id set. Same
      // canonical key with a divergent scale is comparable-but-not-poolable.
      const allSameScale = sources.every((s) => sameOptionIds(s.options, sources[0].options));
      comparability = allSameScale ? "combined" : "side_by_side";
    }
    return {
      canonicalQuestionKey: key,
      label: sources[0].label,
      comparability,
      combined: comparability === "combined" ? combineSources(sources) : null,
      sources,
    };
  });
}
