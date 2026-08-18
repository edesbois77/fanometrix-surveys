// ── Study Results — server-side resolver (orchestrates the trusted engine) ───
// Resolves a Study's constituent Surveys through the ONE authoritative Survey
// Results resolver (resolveSurveyResults), then groups by canonical identity and
// computes proven-comparable combined distributions. No new maths, no LLM, no raw
// respondent data. Server-only (uses supabaseAdmin).
//
// PERFORMANCE: constituent Surveys are loaded in ONE query. Each Survey is then
// resolved by the trusted engine (a small, constant number of BOUNDED queries per
// Survey — never per-question/per-option/per-campaign). That is inherent per-Survey
// work, not an N+1 over questions/options, and stays bounded for 5–10 Survey Studies.
// Study Results V1 exposes NO global filters, so no extra per-source filter work.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { canCurateStudies } from "@/lib/studio/study";
import { canonicalQuestionKey } from "@/lib/studio/question-identity";
import { resolveSurveyResults, normaliseQuestions, type ManagedSurvey } from "@/lib/studio/survey-results-resolve";
import { groupStudyResults, type StudyResultGroup, type SurveyResultsForStudy } from "@/lib/studio/study-results";
import type { LocalisedQuestion } from "@/lib/survey-locale";

export type StudyResults = {
  study: { id: string; name: string; objective: string | null; status: string; surveyCount: number; completedResponses: number };
  resultGroups: StudyResultGroup[];
  /** Surveys that belong to the Study but contributed no results (e.g. draft, no responses). */
  surveys: { surveyId: string; surveyName: string; resultMode: string; completedResponses: number; questionCount: number }[];
};

export type StudyAccess = "ok" | "not_found" | "forbidden";

/**
 * Resolve Study Results. Access is Study-MANAGE (admin/operator) — the SAME authority
 * that governs Study curation (canCurateStudies). Data entitlement is NOT consulted:
 * it governs Discover, never Study Manage.
 */
export async function resolveStudyResults(
  session: AuthedUser,
  studyId: string,
): Promise<{ access: StudyAccess; results: StudyResults | null }> {
  if (!canCurateStudies(session)) return { access: "forbidden", results: null };

  const { data: study } = await supabaseAdmin
    .from("studies").select("id, name, objective, status").eq("id", studyId).single();
  if (!study) return { access: "not_found", results: null };

  // Constituent Surveys in ONE bounded query.
  const { data: surveyRows } = await supabaseAdmin
    .from("surveys").select("id, name, organisation_id, questions, enabled_languages")
    .eq("study_id", studyId).is("deleted_at", null)
    .order("created_at", { ascending: true });
  const rows = surveyRows ?? [];

  // Resolve each Survey through the trusted engine (bounded per Survey; no filters).
  const resolved = await Promise.all(rows.map(async (r) => {
    const questions = normaliseQuestions(r.questions);
    const managed: ManagedSurvey = {
      id: r.id as string,
      name: (r.name as string) ?? "",
      organisation_id: (r.organisation_id as string | null) ?? null,
      questions,
      enabledLanguages: Array.isArray(r.enabled_languages) ? (r.enabled_languages as string[]) : [],
    };
    const res = await resolveSurveyResults(managed, {}, null);
    return { managed, questions, res };
  }));

  const forGrouping: SurveyResultsForStudy[] = resolved.map(({ managed, questions, res }) => ({
    surveyId: managed.id,
    surveyName: managed.name,
    resultMode: res.resultMode,
    completedResponses: res.completedResponses,
    displayLanguage: res.displayLanguage,
    // Index-aligned canonical keys (canonical_question_key ?? id) — the grouping anchor.
    canonicalKeys: questions.map((q: LocalisedQuestion) => canonicalQuestionKey(q)),
    questions: res.questions,
  }));

  const resultGroups = groupStudyResults(forGrouping);
  const completedResponses = forGrouping.reduce((n, s) => n + s.completedResponses, 0);

  return {
    access: "ok",
    results: {
      study: {
        id: study.id as string,
        name: study.name as string,
        objective: (study.objective as string | null) ?? null,
        status: study.status as string,
        surveyCount: rows.length,
        completedResponses,
      },
      resultGroups,
      surveys: forGrouping.map((s) => ({
        surveyId: s.surveyId, surveyName: s.surveyName, resultMode: s.resultMode,
        completedResponses: s.completedResponses, questionCount: s.questions.length,
      })),
    },
  };
}
