// Public endpoint — returns question text and option ID→label maps for a campaign.
// Used by the dashboard to display real question text and resolve stored option IDs.
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
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
    const { data: survey, error } = await supabase
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

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("survey_language, surveys(questions)")
    .eq("campaign_id", campaignId!)
    .is("deleted_at", null)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ questions: [] });
  }

  const resolvedLang = (lang !== "en" ? lang : (campaign.survey_language as LangCode | null) ?? "en") as LangCode;
  const rawSurvey    = Array.isArray(campaign.surveys) ? campaign.surveys[0] : campaign.surveys;
  const questions    = ((rawSurvey as { questions?: LocalisedQuestion[] } | null)?.questions ?? []);

  const labels: SurveyLabels["questions"] = questions.map((q, i) => ({
    index: i,
    text:  resolveText(q.text, resolvedLang) || resolveText(q.text, "en"),
    options: Object.fromEntries(
      q.options.map(o => [String(o.id), resolveText(o.text, resolvedLang) || resolveText(o.text, "en")])
    ),
  }));

  return NextResponse.json({ questions: labels });
}
