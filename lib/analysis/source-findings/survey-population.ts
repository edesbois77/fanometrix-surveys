// The response population for a project's survey findings, derived DIRECTLY from
// raw campaign response rows — never from a report or presentation layer.
//
// A project's survey deployments are its campaigns (`campaigns.research_project_id
// = projectId`), INCLUDING soft-deleted ones — they keep the link and all their
// responses. This is the exact enumeration the dashboard's /api/responses uses,
// and the only one that reaches the partial responses (answered Q1, not Q2/Q3)
// whose `responses.survey_id` is null. The population is NOT filtered by
// survey_id, is_demo, or completion status.
//
// Evidence is then counted PER QUESTION downstream (survey-observations.ts):
// Q1 findings count every row with a valid Q1 answer, Q2 every valid Q2, Q3 every
// valid Q3 — so a partial-completion funnel (e.g. 652 / 317 / 274) is reflected
// exactly. There is deliberately no single survey denominator.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SurveyResponseRow } from "@/lib/analysis/survey-observations";

const PAGE = 1000;
const COLS = "id, q1, q2, q3, country, fan_segment";

/** The project's survey-deployment campaign slugs. `research_project_id` is the
 *  link every project deployment carries (generate-deployments sets it); no
 *  `deleted_at` filter, because a soft-deleted deployment keeps its link and its
 *  response rows, and its partials live nowhere else. */
export async function projectDeploymentCampaigns(projectId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("campaigns").select("campaign_id").eq("research_project_id", projectId);
  return [...new Set((data ?? []).map(c => c.campaign_id as string).filter(Boolean))];
}

/** One row per respondent reconstructed from the per-answer store — EVERY answer
 *  given, partials included, from the moment it was selected (migration 147).
 *  This is the going-forward Findings population: a respondent who answered Q1
 *  and stopped is one row with q1 set and q2/q3 null. */
async function answerStoreRows(campaignSlugs: string[]): Promise<SurveyResponseRow[]> {
  const bySession = new Map<string, SurveyResponseRow>();
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabaseAdmin
      .from("response_answers").select("session_id, question_index, answer_value, country, fan_segment")
      .in("campaign_id", campaignSlugs).order("session_id").range(from, from + PAGE - 1);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const r of rows) {
      const sid = r.session_id as string;
      const row = bySession.get(sid) ?? { q1: null, q2: null, q3: null, country: null, fan_segment: null };
      const value = (r.answer_value as string | null) ?? null;
      const qi = r.question_index as number;
      if (qi === 0) row.q1 = value; else if (qi === 1) row.q2 = value; else if (qi === 2) row.q3 = value;
      if (!row.country && r.country) row.country = r.country as string;
      if (!row.fan_segment && r.fan_segment) row.fan_segment = r.fan_segment as string;
      bySession.set(sid, row);
    }
    if (rows.length < PAGE) break;
  }
  return [...bySession.values()];
}

/** Completed responses under the deployment campaigns — the historical fallback
 *  for surveys collected before the per-answer store existed. Deduped by id. */
async function completedResponseRows(campaignSlugs: string[]): Promise<SurveyResponseRow[]> {
  const seen = new Set<string>();
  const out: SurveyResponseRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabaseAdmin
      .from("responses").select(COLS).in("campaign_id", campaignSlugs).order("id").range(from, from + PAGE - 1);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const r of rows) {
      const id = r.id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        q1: (r.q1 as string | null) ?? null, q2: (r.q2 as string | null) ?? null, q3: (r.q3 as string | null) ?? null,
        country: (r.country as string | null) ?? null, fan_segment: (r.fan_segment as string | null) ?? null,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** The Findings population for a project's surveys. Prefers the per-answer store
 *  (every answer given, partials included) where it has data; falls back to
 *  completed responses for historical surveys with no per-answer data. Each
 *  question is then counted independently downstream, so a partial-completion
 *  funnel is reflected exactly. */
export async function projectSurveyResponseRows(projectId: string): Promise<SurveyResponseRow[]> {
  const slugs = await projectDeploymentCampaigns(projectId);
  if (slugs.length === 0) return [];
  const fromAnswers = await answerStoreRows(slugs);
  if (fromAnswers.length > 0) return fromAnswers;
  return completedResponseRows(slugs);
}

const validAnswer = (v: string | null) => v != null && v !== "";

/** How many distinct respondents ANSWERED each question — the funnel, from the
 *  event stream (survey_events), scoped to the project's deployment campaigns.
 *  This includes people who answered a question and then abandoned, so it is the
 *  honest "question reach", larger than the completed-response count.
 *
 *  Q1 = SURVEY_START (fires on the first answer), Q2 = QUESTION_3_REACHED (fires
 *  when Q2 is answered and Q3 is reached), Q3 = SURVEY_COMPLETED (equals the
 *  completed responses, the cross-check). Option-level choices for partials are
 *  NOT recorded yet, so this is a reach COUNT, not a distribution — findings are
 *  still computed from completed responses until the answer-persistence change. */
async function questionReach(campaignSlugs: string[]): Promise<{ q1: number; q2: number; q3: number }> {
  if (campaignSlugs.length === 0) return { q1: 0, q2: 0, q3: 0 };
  const count = async (eventType: string) => {
    const { count } = await supabaseAdmin
      .from("survey_events").select("id", { count: "exact", head: true })
      .in("campaign_id", campaignSlugs).eq("event_type", eventType);
    return count ?? 0;
  };
  const [q1, q2, q3] = await Promise.all([
    count("SURVEY_START"), count("QUESTION_3_REACHED"), count("SURVEY_COMPLETED"),
  ]);
  return { q1, q2, q3 };
}

/** For the Findings panel. */
export type SurveyPopulationStats = {
  campaigns: number;
  /** True once the per-answer store has data — findings then use every answer
   *  given; false for historical surveys, where findings use completed responses. */
  usingAnswerStore: boolean;
  /** The per-question denominators findings ACTUALLY use (from the source above). */
  findings: { total: number; q1: number; q2: number; q3: number };
  /** How many answered each question, partials included (survey_events funnel). */
  reach: { q1: number; q2: number; q3: number };
  /** Completed responses (the completion metric — unchanged, from `responses`). */
  completedTotal: number;
  surveys: { surveyId: string; name: string; completed: number }[];
};

export async function surveyPopulationStats(projectId: string): Promise<SurveyPopulationStats> {
  const campaigns = await projectDeploymentCampaigns(projectId);
  const rows = await projectSurveyResponseRows(projectId);
  const findings = {
    total: rows.length,
    q1: rows.filter(r => validAnswer(r.q1)).length,
    q2: rows.filter(r => validAnswer(r.q2)).length,
    q3: rows.filter(r => validAnswer(r.q3)).length,
  };
  const reach = await questionReach(campaigns);

  const [{ count: answerCount }, { count: completedCount }] = await Promise.all([
    supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).in("campaign_id", campaigns.length ? campaigns : ["__none__"]),
    supabaseAdmin.from("responses").select("id", { count: "exact", head: true }).in("campaign_id", campaigns.length ? campaigns : ["__none__"]),
  ]);
  const usingAnswerStore = (answerCount ?? 0) > 0;

  const { data: links } = await supabaseAdmin
    .from("research_project_evidence").select("evidence_id").eq("research_project_id", projectId).eq("evidence_type", "survey");
  const surveyIds = (links ?? []).map(l => l.evidence_id as string);
  const { data: surveys } = surveyIds.length
    ? await supabaseAdmin.from("surveys").select("id, name").in("id", surveyIds)
    : { data: [] as { id: string; name: string }[] };

  const perSurvey = await Promise.all((surveys ?? []).map(async s => {
    const { count } = await supabaseAdmin
      .from("responses").select("id", { count: "exact", head: true }).eq("survey_id", s.id);
    return { surveyId: s.id, name: (s.name as string | null) ?? "Survey", completed: count ?? 0 };
  }));

  return { campaigns: campaigns.length, usingAnswerStore, findings, reach, completedTotal: completedCount ?? 0, surveys: perSurvey };
}
