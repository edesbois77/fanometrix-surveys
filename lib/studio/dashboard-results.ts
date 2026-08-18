// ── Survey Studio → Dashboards → Results — governed per-question results ──────
// Phase 4 (Results). "What did respondents actually tell us?" — REUSES the settled
// pure survey-results model (aggregateAnswers / buildQuestionResults / mapShownCounts
// / legacyAnswerRows) but scopes by the DATA-ENTITLEMENT effective campaign slugs
// (Discover authority) rather than the ownership path (loadManagedSurvey / studio_
// prefix). Partial answers are included; full completion is never required.
// Question COUNTS/distributions belong here; grouping/entitlement stays governed.
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  mapShownCounts, aggregateAnswers, buildQuestionResults, legacyAnswerRows,
  type AnswerRow, type QuestionResult,
} from "@/lib/studio/survey-results";
import type { LocalisedQuestion } from "@/lib/survey-locale";

const RPC_NULLS = { p_from: null, p_to: null, p_publisher: null, p_placement: null, p_country: null, p_device: null, p_browser: null };

/** studio_native = per-question from response_answers (partial-aware). historical_
 *  completed_only = legacy responses.q1/q2/q3 — completed rows only, no partials,
 *  shown UNAVAILABLE. The two are never summed. */
export type ResultsMode = "studio_native" | "historical_completed_only";

export type QuestionResultView = QuestionResult & {
  /** Approx 95% margin of error at the question's answered base n (±pp); null when
   *  n=0. Honest per-question base — NOT one survey-level completion n. */
  marginOfError: number | null;
};
export type DiscoverResults = { questions: QuestionResultView[]; mode: ResultsMode; displayLanguage: string };

/** 95% MoE for a proportion, worst case p=0.5: 1.96·√(0.25/n) = 0.98/√n (pp, 1dp).
 *  Same canonical formula as the original dashboard, applied at the QUESTION base. */
export function marginOfError(n: number): number | null {
  return n > 0 ? Math.round((0.98 / Math.sqrt(n)) * 1000) / 10 : null;
}
const withMoe = (q: QuestionResult): QuestionResultView => ({ ...q, marginOfError: marginOfError(q.base) });

/**
 * Resolve per-question results for a survey over an already-authorised, filter-
 * narrowed set of campaign slugs. `effectiveSlugs` MUST come from the governed
 * Discover scope (dataVisibleCampaignIds → validated filters). Server-only.
 */
export async function resolveDiscoverResults(
  survey: { questions: LocalisedQuestion[]; enabledLanguages: string[] },
  effectiveSlugs: string[],
  displayLangParam?: string | null,
): Promise<DiscoverResults> {
  const displayLanguage = displayLangParam || survey.enabledLanguages[0] || "en";

  if (effectiveSlugs.length === 0) {
    const questions = buildQuestionResults(survey.questions, survey.questions.map(() => 0), aggregateAnswers([]), displayLanguage).map(withMoe);
    return { questions, mode: "studio_native", displayLanguage };
  }

  // Studio-native iff any response_answers exist in scope (mirrors resolveSurveyResults).
  const { count: raCount } = await supabaseAdmin
    .from("response_answers").select("id", { count: "exact", head: true }).in("campaign_id", effectiveSlugs).eq("is_demo", false);

  if ((raCount ?? 0) > 0) {
    const [shownRows, answerRows] = await Promise.all([
      supabaseAdmin.rpc("dashboard_event_counts", { p_campaign_ids: effectiveSlugs, ...RPC_NULLS }).then((r) => (r.data ?? []) as { event_type: string; event_count: number }[]),
      supabaseAdmin.from("response_answers").select("question_index, answer_value").in("campaign_id", effectiveSlugs).eq("is_demo", false).then((r) => (r.data ?? []) as AnswerRow[]),
    ]);
    const questions = buildQuestionResults(survey.questions, mapShownCounts(shownRows, survey.questions.length), aggregateAnswers(answerRows), displayLanguage).map(withMoe);
    return { questions, mode: "studio_native", displayLanguage };
  }

  // Historical: only completed responses.q1/q2/q3 exist — shown UNAVAILABLE (null),
  // never a fabricated 0; Q4/Q5 never invented; per-question base = actual non-null answers.
  const cols = ["q1", "q2", "q3"].slice(0, Math.min(3, survey.questions.length));
  const { data: rows } = cols.length
    ? await supabaseAdmin.from("responses").select(cols.join(",")).in("campaign_id", effectiveSlugs).eq("is_demo", false)
    : { data: [] as Record<string, unknown>[] };
  const questions = buildQuestionResults(
    survey.questions,
    survey.questions.map(() => null),
    aggregateAnswers(legacyAnswerRows((rows ?? []) as unknown as Record<string, unknown>[], survey.questions.length)),
    displayLanguage,
  ).map(withMoe);
  return { questions, mode: "historical_completed_only", displayLanguage };
}
