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

/** Every response under the project's survey-deployment campaigns — partials
 *  included, unfiltered by survey_id / is_demo / completion. Paginated so a large
 *  survey is never truncated. Deduped by response id. */
export async function projectSurveyResponseRows(projectId: string): Promise<SurveyResponseRow[]> {
  const slugs = await projectDeploymentCampaigns(projectId);
  if (slugs.length === 0) return [];

  const seen = new Set<string>();
  const out: SurveyResponseRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabaseAdmin
      .from("responses").select(COLS).in("campaign_id", slugs).order("id").range(from, from + PAGE - 1);
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

const validAnswer = (v: string | null) => v != null && v !== "";

/** Question-level population counts for the Findings panel: the project totals
 *  (the denominators findings actually use) plus each attached survey's completed
 *  count for context. */
export type SurveyPopulationStats = {
  campaigns: number;
  project: { total: number; q1: number; q2: number; q3: number };
  surveys: { surveyId: string; name: string; completed: number }[];
};

export async function surveyPopulationStats(projectId: string): Promise<SurveyPopulationStats> {
  const campaigns = await projectDeploymentCampaigns(projectId);
  const rows = await projectSurveyResponseRows(projectId);
  const project = {
    total: rows.length,
    q1: rows.filter(r => validAnswer(r.q1)).length,
    q2: rows.filter(r => validAnswer(r.q2)).length,
    q3: rows.filter(r => validAnswer(r.q3)).length,
  };

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

  return { campaigns: campaigns.length, project, surveys: perSurvey };
}
