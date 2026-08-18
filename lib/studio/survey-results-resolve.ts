// ── Manage → Survey → Results: server-side resolver (single source of the maths) ─
// The one trusted place that turns (survey, filters, display language) into resolved
// question results, reusing the pure lib/studio/survey-results model. Both the
// Results API and the Findings create/publish path call this — a Finding's numbers
// are therefore ALWAYS server-recomputed, never trusted from the browser.
// Server-only (uses supabaseAdmin).

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthedUser } from "@/lib/auth-server";
import { STUDIO_SLUG_PREFIX } from "@/lib/studio/campaign-generation";
import { canManageSurvey } from "@/lib/studio/collection-health";
import {
  mapShownCounts, aggregateAnswers, buildQuestionResults, filterCampaignSlugs, buildFilterOptions, legacyAnswerRows,
  type AnswerRow, type FilterableCampaign, type ResultsFilters, type QuestionResult, type FilterOptions,
} from "@/lib/studio/survey-results";
import type { LocalisedQuestion, LocalisedText } from "@/lib/survey-locale";

/** Studio-native = question-level from response_answers; historical = legacy completed
 *  q1/q2/q3 from responses. Deterministic precedence; the two are NEVER summed. */
export type ResultMode = "studio_native" | "historical";

const EMPTY_FILTERS: FilterOptions = { publishers: [], markets: [], campaigns: [], languages: [] };

/**
 * The single authoritative completed-response count for a Survey: real completed
 * `responses` by survey identity (exactly what vw_survey_stats — and therefore the
 * Manage list — uses). Works for modern AND historical Surveys and never depends on
 * modern Studio Campaign rows, so list / Overview / Results / Findings all agree.
 */
export async function completedResponsesForSurvey(surveyId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("responses").select("id", { count: "exact", head: true })
    .eq("survey_id", surveyId).eq("is_demo", false);
  return count ?? 0;
}

export type ManagedSurvey = {
  id: string; name: string; organisation_id: string | null;
  questions: LocalisedQuestion[]; enabledLanguages: string[];
};

/** Coerce stored questions (localised OR legacy-flat) into the localised shape the
 *  pure model expects — preserving canonical option ids used as answer_value. */
export function normaliseQuestions(raw: unknown): LocalisedQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((q, qi) => {
    const qq = q as { id?: unknown; text?: unknown; options?: unknown };
    const text: LocalisedText = typeof qq.text === "string" ? { en: qq.text } : ((qq.text as LocalisedText) ?? {});
    const options = Array.isArray(qq.options)
      ? qq.options.map((o, oi) => {
          if (typeof o === "string") return { id: oi, text: { en: o } as LocalisedText };
          const oo = o as { id?: unknown; text?: unknown };
          return { id: typeof oo.id === "number" ? oo.id : oi, text: typeof oo.text === "string" ? { en: oo.text } : ((oo.text as LocalisedText) ?? {}) };
        })
      : [];
    // Preserve the identity anchor (never rewritten): used by Study Results to group
    // questions across Surveys. Absent → canonicalQuestionKey() falls back to the id.
    const cqk = (q as { canonical_question_key?: unknown }).canonical_question_key;
    return { id: String(qq.id ?? qi), text, options, ...(typeof cqk === "string" && cqk ? { canonical_question_key: cqk } : {}) };
  });
}

/** Load a survey and authorise the caller under MANAGE governance (owner or admin).
 *  Returns null when not found OR outside the caller's organisation (existence-preserving). */
export async function loadManagedSurvey(session: AuthedUser, surveyId: string): Promise<ManagedSurvey | null> {
  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select("id, name, organisation_id, questions, enabled_languages")
    .eq("id", surveyId).is("deleted_at", null).single();
  if (!survey || !canManageSurvey(session, survey)) return null;
  return {
    id: survey.id as string,
    name: (survey.name as string) ?? "",
    organisation_id: (survey.organisation_id as string | null) ?? null,
    questions: normaliseQuestions(survey.questions),
    enabledLanguages: Array.isArray(survey.enabled_languages) ? (survey.enabled_languages as string[]) : [],
  };
}

export type ResolvedResults = {
  questions: QuestionResult[];
  completedResponses: number;
  totalValidAnswers: number;
  filterOptions: FilterOptions;
  displayLanguage: string;
  resultMode: ResultMode;
};

/**
 * Resolve the survey's question results for the given filters + display language.
 *
 * SOURCE PRECEDENCE (deterministic, never summed):
 *   • response_answers exist for this survey  → STUDIO_NATIVE (question-level from
 *     response_answers; shown from dashboard_event_counts).
 *   • else real completed responses exist     → HISTORICAL (legacy completed q1/q2/q3
 *     from `responses`; shown/completion UNAVAILABLE — null, never a fabricated 0;
 *     no Studio Campaign filters, which historical rows can't be mapped to safely).
 *   • else                                    → empty.
 *
 * Completed responses is ALWAYS the survey-level count (completedResponsesForSurvey),
 * so it matches the Manage list. Bounded queries; aggregation is the pure model.
 */
export async function resolveSurveyResults(
  survey: ManagedSurvey,
  filters: ResultsFilters,
  displayLanguageParam?: string | null,
): Promise<ResolvedResults> {
  const { data: campaignRows } = await supabaseAdmin
    .from("campaigns")
    .select("campaign_id, publisher_org_id, market, country_code, survey_language")
    .eq("survey_id", survey.id).like("campaign_id", `${STUDIO_SLUG_PREFIX}%`).is("deleted_at", null);
  const campaigns = (campaignRows ?? []) as FilterableCampaign[];
  const { data: orgRows } = await supabaseAdmin.from("organisations").select("id, name").in("id", [...new Set(campaigns.map((c) => c.publisher_org_id).filter(Boolean))] as string[]);
  const orgName = new Map((orgRows ?? []).map((o) => [o.id as string, o.name as string]));
  const studioFilterOptions = buildFilterOptions(campaigns, (pid) => orgName.get(pid) ?? "Publisher");

  const displayLanguage = displayLanguageParam || filters.language || survey.enabledLanguages[0] || "en";
  const completedResponses = await completedResponsesForSurvey(survey.id);

  // Does this survey have any Studio-native (response_answers) answers at all?
  const { count: raCount } = await supabaseAdmin
    .from("response_answers").select("id", { count: "exact", head: true })
    .eq("survey_id", survey.id).eq("is_demo", false);

  // ── STUDIO-NATIVE ──────────────────────────────────────────────────────────
  if ((raCount ?? 0) > 0) {
    const slugs = filterCampaignSlugs(campaigns, filters);
    const [shownRows, answerRows] = await Promise.all([
      slugs.length
        ? supabaseAdmin.rpc("dashboard_event_counts", { p_campaign_ids: slugs }).then((r) => (r.data ?? []) as { event_type: string; event_count: number }[])
        : Promise.resolve([] as { event_type: string; event_count: number }[]),
      slugs.length
        ? supabaseAdmin.from("response_answers").select("question_index, answer_value").in("campaign_id", slugs).eq("is_demo", false).then((r) => (r.data ?? []) as AnswerRow[])
        : Promise.resolve([] as AnswerRow[]),
    ]);
    const questions = buildQuestionResults(survey.questions, mapShownCounts(shownRows, survey.questions.length), aggregateAnswers(answerRows), displayLanguage);
    return { questions, completedResponses, totalValidAnswers: questions.reduce((n, r) => n + r.answered, 0), filterOptions: studioFilterOptions, displayLanguage, resultMode: "studio_native" };
  }

  // ── HISTORICAL (legacy completed q1/q2/q3) ─────────────────────────────────
  if (completedResponses > 0) {
    const cols = ["q1", "q2", "q3"].slice(0, Math.min(3, survey.questions.length));
    const { data: rows } = await supabaseAdmin
      .from("responses").select(cols.join(","))
      .eq("survey_id", survey.id).eq("is_demo", false);
    const questions = buildQuestionResults(
      survey.questions,
      survey.questions.map(() => null),                          // shown UNAVAILABLE (never fabricated)
      aggregateAnswers(legacyAnswerRows((rows ?? []) as unknown as Record<string, unknown>[], survey.questions.length)),
      displayLanguage,
    );
    // No governed Studio filters for historical rows (they can't be mapped safely).
    return { questions, completedResponses, totalValidAnswers: questions.reduce((n, r) => n + r.answered, 0), filterOptions: EMPTY_FILTERS, displayLanguage, resultMode: "historical" };
  }

  // ── EMPTY ──────────────────────────────────────────────────────────────────
  const questions = buildQuestionResults(survey.questions, survey.questions.map(() => 0), aggregateAnswers([]), displayLanguage);
  return { questions, completedResponses: 0, totalValidAnswers: 0, filterOptions: studioFilterOptions, displayLanguage, resultMode: "studio_native" };
}
