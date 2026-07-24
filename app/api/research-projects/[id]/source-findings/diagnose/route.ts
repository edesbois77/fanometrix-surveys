// Attribution diagnostic: shows EXACTLY where a project's survey responses live,
// so we can attribute them to the right survey instead of guessing. It answers:
// how many responses sit under each of the project's campaigns, what survey_id
// (if any) those campaigns carry, and how the response rows split by survey_id.
// Read-only.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function countResponses(filter: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>): Promise<number> {
  const { count } = await filter(baseQuery());
  return count ?? 0;
}
function baseQuery() {
  return supabaseAdmin.from("responses").select("id", { count: "exact", head: true });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id: projectId } = await params;

  const { data: proj } = await supabaseAdmin
    .from("research_projects").select("survey_id, research_mode").eq("id", projectId).maybeSingle();
  const projectSurveyId = (proj?.survey_id as string | null) ?? null;

  const { data: links } = await supabaseAdmin
    .from("research_project_evidence").select("evidence_id").eq("research_project_id", projectId).eq("evidence_type", "survey");
  const surveyIds = (links ?? []).map(l => l.evidence_id as string);
  const { data: surveys } = surveyIds.length
    ? await supabaseAdmin.from("surveys").select("id, name, is_simulated").in("id", surveyIds)
    : { data: [] as { id: string; name: string; is_simulated: boolean }[] };

  const { data: campaignRows } = await supabaseAdmin
    .from("campaigns").select("campaign_id, survey_id, name").eq("research_project_id", projectId).is("deleted_at", null);
  const campaigns = (campaignRows ?? []) as { campaign_id: string; survey_id: string | null; name: string | null }[];
  const campaignSlugs = campaigns.map(c => c.campaign_id).filter(Boolean);

  // Per-campaign response counts (both is_demo values, to reveal everything).
  const campaignDetail = await Promise.all(campaigns.map(async c => ({
    campaign_id: c.campaign_id,
    name: c.name,
    survey_id: c.survey_id,
    responses: await countResponses(q => q.eq("campaign_id", c.campaign_id)),
  })));

  // Split of responses under the project's campaigns by survey_id value.
  const bySurveyId: Record<string, number> = {};
  if (campaignSlugs.length) {
    for (const s of (surveys ?? [])) {
      bySurveyId[s.name] = await countResponses(q => q.in("campaign_id", campaignSlugs).eq("survey_id", s.id));
    }
    bySurveyId["(survey_id is null)"] = await countResponses(q => q.in("campaign_id", campaignSlugs).is("survey_id", null));
  }

  const totalUnderCampaigns = campaignSlugs.length ? await countResponses(q => q.in("campaign_id", campaignSlugs)) : 0;

  return NextResponse.json({
    data: {
      projectSurveyId,
      researchMode: proj?.research_mode ?? null,
      surveys: (surveys ?? []).map(s => ({ id: s.id, name: s.name, is_simulated: s.is_simulated })),
      campaigns: campaignDetail,
      responsesUnderCampaignsBySurveyId: bySurveyId,
      totalResponsesUnderCampaigns: totalUnderCampaigns,
    },
  });
}
