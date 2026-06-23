// Public — no auth required.
// Primary embed fetch path when campaign= is in the URL.
// Takes priority over survey= — uses the campaign slug to find the correct survey.
// Does NOT run MPU char-count validation (that's an admin authoring concern, not a live-serve concern).
// DOES enforce: campaign must be live, survey must be status=ready (not deleted/archived/draft).
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveQuestion, type LangCode, type LocalisedQuestion } from "@/lib/survey-locale";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma":        "no-cache",
  "Expires":       "0",
} as const;

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  const urlLang    = req.nextUrl.searchParams.get("lang");
  const preview    = req.nextUrl.searchParams.get("preview") === "1";

  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id is required" }, { status: 400, headers: NO_CACHE });
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("campaign_id, status, survey_language, creative_theme, surveys(id, status, questions, thank_you_title, thank_you_body)")
    .eq("campaign_id", campaignId)
    .is("deleted_at", null)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404, headers: NO_CACHE });
  }

  if (campaign.status !== "live" && !preview) {
    return NextResponse.json({ error: "Campaign is not live" }, { status: 404, headers: NO_CACHE });
  }

  const survey = (Array.isArray(campaign.surveys) ? campaign.surveys[0] : campaign.surveys) as {
    id: string;
    status: string;
    questions: LocalisedQuestion[];
    thank_you_title: string;
    thank_you_body: string;
  } | null;

  if (!survey) {
    return NextResponse.json({ error: "No survey attached to this campaign" }, { status: 404, headers: NO_CACHE });
  }

  // Never serve deleted, archived or draft surveys (preview bypasses draft only)
  const blockedStatuses = preview ? ["deleted", "archived"] : ["deleted", "archived", "draft"];
  if (blockedStatuses.includes(survey.status)) {
    return NextResponse.json({ error: "Survey is not available" }, { status: 404, headers: NO_CACHE });
  }

  // Language priority: explicit URL param > campaign survey_language > en
  const lang = ((urlLang ?? campaign.survey_language ?? "en") as LangCode);
  const questions = (survey.questions ?? []).map(q => resolveQuestion(q, lang));

  return NextResponse.json({
    campaign_id:     campaign.campaign_id,
    survey_language: lang,
    creative_theme:  campaign.creative_theme ?? null,
    questions,
    thank_you_title: survey.thank_you_title ?? "Thank you!",
    thank_you_body:  survey.thank_you_body  ?? "Your anonymous feedback helps improve the football experience for fans everywhere.",
  }, { headers: NO_CACHE });
}
