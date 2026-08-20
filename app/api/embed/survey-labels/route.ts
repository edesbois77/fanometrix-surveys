// Public endpoint — returns question text and option ID→label maps for a campaign.
// Used by the dashboard to display real question text and resolve stored option IDs.
//
// P0 exposure remediation. The `?survey_id=` branch used to return any survey's
// questions and options to any caller. It now requires the same deployed-campaign
// binding as /api/embed/survey; the `?campaign_id=` branch was already bound to a
// non-deleted campaign and is unchanged. Unauthorised reads return the existing
// empty-questions shape, so no caller can distinguish "denied" from "no labels".
import { NextRequest, NextResponse } from "next/server";
import { isSurveyPubliclyServeable } from "@/lib/embed-survey-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveText, type LangCode, type LocalisedQuestion } from "@/lib/survey-locale";

export type SurveyLabels = {
  questions: {
    index:  number;
    text:   string;
    // option ID (as stored in responses) → display label
    options: Record<string, string>;
  }[];
};

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  const surveyId   = req.nextUrl.searchParams.get("survey_id");
  const lang       = (req.nextUrl.searchParams.get("lang") ?? "en") as LangCode;

  if (!campaignId && !surveyId) {
    return NextResponse.json({ error: "campaign_id or survey_id is required" }, { status: 400 });
  }

  // When survey_id is provided directly, fetch survey only (no language override)
  if (surveyId && !campaignId) {
    // Gate: a directly-addressed survey must be bound to a deployed campaign.
    if (!(await isSurveyPubliclyServeable(surveyId))) {
      return NextResponse.json({ questions: [] });
    }
    const { data: survey, error } = await supabaseAdmin
      .from("surveys")
      .select("questions")
      .eq("id", surveyId)
      .single();

    if (error || !survey) return NextResponse.json({ questions: [] });

    const questions = (survey.questions as LocalisedQuestion[]) ?? [];
    const labels = questions.map((q, i) => ({
      index: i,
      text:  resolveText(q.text, lang) || resolveText(q.text, "en"),
      options: Object.fromEntries(
        q.options.map(o => [String(o.id), resolveText(o.text, lang) || resolveText(o.text, "en")])
      ),
    }));
    return NextResponse.json({ questions: labels });
  }

  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    .select("survey_language, survey_id, research_project_id")
    .eq("campaign_id", campaignId!)
    .is("deleted_at", null)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ questions: [] });
  }

  // Resolve the survey the same way embed/campaign does: a campaign that leaves
  // its survey blank inherits it from the linked Research Project. Reading only
  // campaigns.survey_id here (as the old surveys(questions) FK join did) returns
  // nothing for inherited campaigns, so the dashboard fell back to generic
  // hardcoded question labels and raw option IDs. research_projects is
  // service-role-only (RLS denies anon), so the project lookup uses supabaseAdmin.
  let effectiveSurveyId = campaign.survey_id as string | null;
  if (!effectiveSurveyId && campaign.research_project_id) {
    const { data: project } = await supabaseAdmin
      .from("research_projects")
      .select("survey_id")
      .eq("id", campaign.research_project_id)
      .single();
    effectiveSurveyId = project?.survey_id ?? null;
  }

  if (!effectiveSurveyId) {
    return NextResponse.json({ questions: [] });
  }

  const { data: surveyRow } = await supabaseAdmin
    .from("surveys")
    .select("questions")
    .eq("id", effectiveSurveyId)
    .single();

  const resolvedLang = (lang !== "en" ? lang : (campaign.survey_language as LangCode | null) ?? "en") as LangCode;
  const questions    = ((surveyRow as { questions?: LocalisedQuestion[] } | null)?.questions ?? []);

  const labels: SurveyLabels["questions"] = questions.map((q, i) => ({
    index: i,
    text:  resolveText(q.text, resolvedLang) || resolveText(q.text, "en"),
    options: Object.fromEntries(
      q.options.map(o => [String(o.id), resolveText(o.text, resolvedLang) || resolveText(o.text, "en")])
    ),
  }));

  return NextResponse.json({ questions: labels });
}
