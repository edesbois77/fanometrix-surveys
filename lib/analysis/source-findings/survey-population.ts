// The response population for a survey — the SAME population the report engine
// counts (lib/reports/data.ts fetchResponses), which is where the validated
// per-question counts (e.g. 652 / 317 / 274) come from.
//
// A survey's responses are every row under its campaigns, where its campaigns are
// `campaigns.survey_id = surveyId` (soft-deleted included, exactly as the report
// does). The rows are NOT filtered by `responses.survey_id` (historical campaign
// rows never got it backfilled) and NOT filtered by `is_demo` — mirroring the
// report engine precisely, so the Findings denominator matches what the report
// shows. Directly-attributed rows are unioned in as a safety net for preview /
// non-campaign embeds. Deduped by response id, paginated to clear the row cap.
//
// The per-question denominator itself is computed downstream in
// survey-observations.ts and is already correct; this only decides WHICH rows it
// counts over.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SurveyResponseRow } from "@/lib/analysis/survey-observations";

const PAGE = 1000;
const RESPONSE_COLS = "id, q1, q2, q3, country, fan_segment";

/** The campaign slugs that deploy this survey — campaigns.survey_id = surveyId,
 *  the same mapping the survey→campaigns view uses. No deleted_at filter: a
 *  soft-deleted campaign still holds real responses and the report still counts
 *  them. */
export async function campaignsForSurvey(surveyId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("campaigns").select("campaign_id").eq("survey_id", surveyId);
  return [...new Set((data ?? []).map(c => c.campaign_id as string).filter(Boolean))];
}

/** Every response to this survey, deduped by id. */
export async function surveyResponseRows(surveyId: string): Promise<SurveyResponseRow[]> {
  const slugs = await campaignsForSurvey(surveyId);

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

  // Every response under the survey's campaigns — the report population. Paged,
  // like the report engine, so a survey larger than the row cap is not truncated.
  if (slugs.length > 0) {
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabaseAdmin
        .from("responses").select(RESPONSE_COLS)
        .in("campaign_id", slugs)
        .order("id")
        .range(from, from + PAGE - 1);
      const rows = (data ?? []) as Record<string, unknown>[];
      take(rows);
      if (rows.length < PAGE) break;
    }
  }

  // Safety net: rows attributed straight to the survey with no campaign (preview
  // / direct embeds). Overlap with the above is deduped by id.
  const { data: direct } = await supabaseAdmin
    .from("responses").select(RESPONSE_COLS).eq("survey_id", surveyId).limit(50000);
  take(direct as Record<string, unknown>[] | null);

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

export async function surveyPopulation(surveyId: string): Promise<SurveyPopulation | null> {
  const { data: survey } = await supabaseAdmin
    .from("surveys").select("name").eq("id", surveyId).maybeSingle();
  if (!survey) return null;
  const slugs = await campaignsForSurvey(surveyId);
  const rows = await surveyResponseRows(surveyId);

  const { count: bySurveyId } = await supabaseAdmin
    .from("responses").select("id", { count: "exact", head: true }).eq("survey_id", surveyId);

  return {
    surveyId,
    name: (survey.name as string | null) ?? "Survey",
    responses: rows.length,
    campaigns: slugs.length,
    bySurveyId: bySurveyId ?? 0,
  };
}
