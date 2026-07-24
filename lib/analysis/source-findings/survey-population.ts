// The true response population for a survey — counted the way the PLATFORM's own
// project total counts it (by campaign membership), not by the fragile
// `responses.survey_id`.
//
// Campaign-embed responses were historically stored with `survey_id = NULL` (the
// embed identifies the survey by campaign slug), so a `survey_id = evidence_id`
// query sees only the fully-attributed subset and undercounts — which is why
// every question read the same 196 instead of the true, declining per-question
// counts. This resolves the campaigns that deploy the survey and reads every
// response under them, unioned with rows directly attributed to the survey,
// deduped by response id.
//
// Campaigns are matched THREE ways, because the project→campaign→survey links are
// not all reliably populated in historical data:
//   1. campaigns whose own `survey_id` IS this survey (whatever their project link);
//   2. campaigns under this project that inherit it (survey_id NULL) WHEN this
//      survey is the project's default survey;
//   3. rows whose `responses.survey_id` already equals this survey.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SurveyResponseRow } from "@/lib/analysis/survey-observations";

/** The campaign slugs that deploy this survey. Exported so a diagnostic can show
 *  how the population was resolved. */
export async function campaignsForSurvey(surveyId: string, projectId: string): Promise<string[]> {
  const { data: project } = await supabaseAdmin
    .from("research_projects").select("survey_id").eq("id", projectId).maybeSingle();
  const projectSurveyId = (project?.survey_id as string | null) ?? null;

  const slugs = new Set<string>();

  // 1. Campaigns explicitly for this survey, regardless of their project link.
  const { data: explicit } = await supabaseAdmin
    .from("campaigns").select("campaign_id").eq("survey_id", surveyId).is("deleted_at", null);
  for (const c of explicit ?? []) { const s = c.campaign_id as string | null; if (s) slugs.add(s); }

  // 2. Campaigns under this project that inherit the survey (survey_id NULL), but
  //    only when THIS survey is the one they'd inherit (the project default).
  if (projectSurveyId && projectSurveyId === surveyId) {
    const { data: inherited } = await supabaseAdmin
      .from("campaigns").select("campaign_id").eq("research_project_id", projectId).is("survey_id", null).is("deleted_at", null);
    for (const c of inherited ?? []) { const s = c.campaign_id as string | null; if (s) slugs.add(s); }
  }

  return [...slugs];
}

/** Every response to this survey, deduped by id. */
export async function surveyResponseRows(surveyId: string, projectId: string, isSimulated: boolean): Promise<SurveyResponseRow[]> {
  const slugs = await campaignsForSurvey(surveyId, projectId);

  const seen = new Set<string>();
  const out: SurveyResponseRow[] = [];
  const take = (rows: Record<string, unknown>[] | null) => {
    for (const r of rows ?? []) {
      const id = r.id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        q1: (r.q1 as string | null) ?? null, q2: (r.q2 as string | null) ?? null, q3: (r.q3 as string | null) ?? null,
        country: (r.country as string | null) ?? null, fan_segment: (r.fan_segment as string | null) ?? null,
      });
    }
  };

  const cols = "id, q1, q2, q3, country, fan_segment";
  const { data: bySurvey } = await supabaseAdmin
    .from("responses").select(cols).eq("survey_id", surveyId).eq("is_demo", isSimulated).limit(50000);
  take(bySurvey as Record<string, unknown>[] | null);
  if (slugs.length > 0) {
    const { data: byCampaign } = await supabaseAdmin
      .from("responses").select(cols).in("campaign_id", slugs).eq("is_demo", isSimulated).limit(50000);
    take(byCampaign as Record<string, unknown>[] | null);
  }
  return out;
}

/** How the population resolved, for the Findings diagnostic. */
export type SurveyPopulation = {
  surveyId: string;
  name: string;
  responses: number;
  campaigns: number;
  bySurveyId: number;
};

export async function surveyPopulation(surveyId: string, projectId: string): Promise<SurveyPopulation | null> {
  const { data: survey } = await supabaseAdmin
    .from("surveys").select("name, is_simulated").eq("id", surveyId).maybeSingle();
  if (!survey) return null;
  const slugs = await campaignsForSurvey(surveyId, projectId);
  const rows = await surveyResponseRows(surveyId, projectId, survey.is_simulated as boolean);

  const { count: bySurveyId } = await supabaseAdmin
    .from("responses").select("id", { count: "exact", head: true })
    .eq("survey_id", surveyId).eq("is_demo", survey.is_simulated);

  return {
    surveyId,
    name: (survey.name as string | null) ?? "Survey",
    responses: rows.length,
    campaigns: slugs.length,
    bySurveyId: bySurveyId ?? 0,
  };
}
