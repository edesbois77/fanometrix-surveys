// ── Survey Studio — Single-survey analysis evidence adapter (pure) ───────────
// Turns ONE survey's governed per-question distributions (+ base-gated segment
// facts) into the SAME StudyAnalysisEvidence contract the Study Analysis firewall
// already validates — but in the "survey" ref namespace. It reuses the shared
// deterministic arithmetic (buildDerivedEvidence for leader/top-2; segment facts
// come from buildSegmentDerived) so there is ONE evidence/validation machinery, not
// a Survey copy. No AI, no DB. For a single survey the "combined" distribution IS
// the survey's own distribution (there are no other surveys to pool), so cross-
// survey derivations (spread/consistency) never fire — only within-survey facts.

import type { OptionResult } from "./survey-results";
import type { QuestionResultView, ResultsMode } from "./dashboard-results";
import type { StudyResultGroup } from "./study-results";
import { evidenceRef, type EvidenceItem, type StudyAnalysisEvidence } from "./study-analysis";
import { buildDerivedEvidence } from "./study-derived-evidence";
import type { SegmentDerivedItem } from "./study-segments";
import type { ResolvedQuestionSemantics } from "./scale-templates";

// A question below this answered base is excluded from the analysis evidence, so a
// weak-base question can never be promoted into a strong AI finding (segment facts
// carry their own ≥30-per-group gate inside buildSegmentDerived).
export const ANALYSIS_MIN_BASE = 30;

/**
 * The SINGLE authoritative analysis-eligibility rule, shared by the Survey detail
 * page and the Manage list so they can never disagree: a survey is analysable when
 * at least one question has an answered base ≥ ANALYSIS_MIN_BASE. Callers pass the
 * MAX answered base across the survey's questions (which is always Q1's, since
 * answering is sequential). Pure — no DB, no model.
 */
export function surveyAnalysisEligibility(maxAnsweredBase: number): { eligible: boolean; reason: string | null } {
  return maxAnsweredBase >= ANALYSIS_MIN_BASE
    ? { eligible: true, reason: null }
    : { eligible: false, reason: `Not enough research evidence to analyse yet — a question needs at least ${ANALYSIS_MIN_BASE} answers.` };
}

export type SurveyAnalysisScope = {
  surveyId: string;
  surveyName: string;
  objective: string | null;
  /** Operational completed responses (context only — never a question base). */
  completedResponses: number;
  /** studio_native (partial-aware, 1–5 Q) vs historical_completed_only (≤3 Q). */
  mode: ResultsMode;
};

const toResultMode = (m: ResultsMode): "historical" | "studio_native" =>
  m === "historical_completed_only" ? "historical" : "studio_native";

export function buildSurveyAnalysisEvidence(
  scope: SurveyAnalysisScope,
  questions: QuestionResultView[],
  segmentDerived: SegmentDerivedItem[] = [],
  /** Governed instrument semantics keyed by question id (Stage 5D). Only questions
   *  with a governed scale appear; the rest carry no semantics (never inferred). */
  semanticsByQuestionId: Record<string, ResolvedQuestionSemantics> = {},
): StudyAnalysisEvidence {
  const qs = questions.filter((q) => q.base >= ANALYSIS_MIN_BASE && q.options.length > 0);
  const resultMode = toResultMode(scope.mode);

  // One "combined" group per question so buildDerivedEvidence emits the within-survey
  // leader + top-2 facts (single source ⇒ no cross-survey spread/consistency).
  const groups: StudyResultGroup[] = qs.map((q) => ({
    canonicalQuestionKey: q.questionId,
    label: q.text,
    comparability: "combined",
    combined: { base: q.base, options: q.options as OptionResult[], sourceCount: 1 },
    sources: [{
      surveyId: scope.surveyId, surveyName: scope.surveyName, questionIndex: q.questionIndex,
      questionId: q.questionId, canonicalQuestionKey: q.questionId, label: q.text,
      resultMode, completedResponses: scope.completedResponses,
      base: q.base, shown: q.shown, displayLanguage: "en",
      options: q.options as OptionResult[],
    }],
  }));

  // Base evidence — the single honest scope (combined = THIS survey), survey# refs.
  const evidence: EvidenceItem[] = [];
  for (const q of qs) {
    const qSem = semanticsByQuestionId[q.questionId];
    for (const o of q.options) {
      const oSem = qSem?.options[o.optionId];
      evidence.push({
        ref: evidenceRef(scope.surveyId, q.questionId, o.optionId, "combined", null, "survey"),
        canonicalQuestionKey: q.questionId, question: q.text, comparability: "combined",
        scope: "combined", surveyId: null, surveyName: null, questionId: q.questionId, questionIndex: q.questionIndex,
        optionId: o.optionId, optionLabel: o.label, count: o.count, base: q.base, percentage: o.percentage, resultMode,
        // Governed semantics (Stage 5D): question-level scaleType/constructKey +
        // per-option ordinalPosition/polarity, present only for governed-scale questions.
        ...(qSem ? { scaleType: qSem.scaleType, ...(qSem.constructKey ? { constructKey: qSem.constructKey } : {}) } : {}),
        ...(oSem?.ordinalPosition != null ? { ordinalPosition: oSem.ordinalPosition } : {}),
        ...(oSem?.polarity ? { polarity: oSem.polarity } : {}),
      });
    }
  }

  const derived = buildDerivedEvidence(scope.surveyId, groups, "survey");

  return {
    study: {
      id: scope.surveyId, name: scope.surveyName, objective: scope.objective,
      surveyCount: 1, surveyIds: [scope.surveyId],
      completedResponses: scope.completedResponses,
      respondentUniquenessProven: false,
    },
    evidence,
    derived,
    segmentDerived,
  };
}
