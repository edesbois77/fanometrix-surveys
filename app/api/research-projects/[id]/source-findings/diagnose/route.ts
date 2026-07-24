// Attribution diagnostic, response-centric. The project has NO campaigns linked
// by research_project_id, yet responses exist — so we find each survey's campaigns
// THROUGH its own responses' campaign_id, then look at everything else sitting
// under those same campaigns. This reveals whether the missing responses are (a)
// under the same campaigns but carrying survey_id = null, or (b) is_demo = true
// rows the real-mode filter drops. Read-only.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Row = { campaign_id: string | null; survey_id: string | null; is_demo: boolean };

async function surveyDiag(surveyId: string, name: string) {
  // Every response DIRECTLY attributed to this survey (both is_demo values).
  const { data: attr } = await supabaseAdmin
    .from("responses").select("campaign_id, survey_id, is_demo").eq("survey_id", surveyId).limit(50000);
  const attributed = (attr ?? []) as Row[];
  const attributedReal = attributed.filter(r => !r.is_demo).length;
  const attributedDemo = attributed.filter(r => r.is_demo).length;

  const campaignIds = [...new Set(attributed.map(r => r.campaign_id).filter((c): c is string => !!c))];

  // Everything under those same campaigns, whatever its survey_id / is_demo.
  let under = { total: 0, real: 0, demo: 0, nullSurveyId: 0, otherSurveyId: 0 };
  if (campaignIds.length) {
    const { data: crows } = await supabaseAdmin
      .from("responses").select("campaign_id, survey_id, is_demo").in("campaign_id", campaignIds).limit(100000);
    const rows = (crows ?? []) as Row[];
    under = {
      total: rows.length,
      real: rows.filter(r => !r.is_demo).length,
      demo: rows.filter(r => r.is_demo).length,
      nullSurveyId: rows.filter(r => r.survey_id == null).length,
      otherSurveyId: rows.filter(r => r.survey_id != null && r.survey_id !== surveyId).length,
    };
  }

  return { surveyId, name, attributedReal, attributedDemo, campaigns: campaignIds.length, campaignIds: campaignIds.slice(0, 10), under };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id: projectId } = await params;

  const { data: proj } = await supabaseAdmin
    .from("research_projects").select("survey_id, research_mode").eq("id", projectId).maybeSingle();

  const { data: links } = await supabaseAdmin
    .from("research_project_evidence").select("evidence_id").eq("research_project_id", projectId).eq("evidence_type", "survey");
  const surveyIds = (links ?? []).map(l => l.evidence_id as string);
  const { data: surveys } = surveyIds.length
    ? await supabaseAdmin.from("surveys").select("id, name").in("id", surveyIds)
    : { data: [] as { id: string; name: string }[] };

  const perSurvey = await Promise.all((surveys ?? []).map(s => surveyDiag(s.id, s.name)));

  return NextResponse.json({
    data: {
      projectSurveyId: (proj?.survey_id as string | null) ?? null,
      researchMode: proj?.research_mode ?? null,
      surveys: perSurvey,
    },
  });
}
