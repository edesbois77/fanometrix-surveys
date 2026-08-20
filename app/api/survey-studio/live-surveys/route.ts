// ── Home — Live Studio surveys (cross-research operational, read-only) ────────
// A lightweight cross-research operational summary for Home: the organisation's
// currently-live Studio surveys with completed responses, planned progress and
// last-response recency. OPERATIONAL OWNERSHIP scoped (surveys.organisation_id,
// admin bypass) — NOT data entitlement. Bounded, batched queries (surveys +
// vw_survey_stats + one campaigns query + one vw_campaign_stats query); NO events,
// NO per-survey RPC, NO N+1. Detailed funnel diagnostics live in Manage, not here.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CAMPAIGN_ORIGIN } from "@/lib/campaign-groups/model";
import { STUDIO_SLUG_PREFIX } from "@/lib/studio/campaign-generation";
import { plannedProgress, isRealSurvey } from "@/lib/studio/collection-health";

export async function GET(req: NextRequest) {
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }

  // Owner-scoped survey set (admins operate across all; non-admins see their org).
  let surveyQuery = supabaseAdmin.from("surveys").select("id, name, status, organisation_id, is_simulated").is("deleted_at", null);
  if (session.role !== "admin") {
    if (!session.organisationId) return NextResponse.json({ headline: null, surveys: [] });
    surveyQuery = surveyQuery.eq("organisation_id", session.organisationId);
  }
  const { data: surveyRows } = await surveyQuery;
  const surveys = (surveyRows ?? []).filter(isRealSurvey);
  if (!surveys.length) return NextResponse.json({ headline: null, surveys: [] });

  const surveyIds = surveys.map((s) => s.id as string);
  const nameById = new Map(surveys.map((s) => [s.id as string, (s.name as string) || "Untitled survey"]));

  // Per-survey rollup + the live-campaign count in one view read.
  const { data: surveyStats } = await supabaseAdmin
    .from("vw_survey_stats")
    .select("id, response_count, live_campaign_count, last_response_at")
    .in("id", surveyIds);
  const statById = new Map((surveyStats ?? []).map((s) => [s.id as string, s]));
  const liveSurveyIds = surveyIds.filter((id) => Number(statById.get(id)?.live_campaign_count ?? 0) > 0);
  if (!liveSurveyIds.length) return NextResponse.json({ headline: null, surveys: [] });

  // Planned progress needs campaign targets + per-campaign responses — two batched
  // queries over ALL live surveys' campaigns (no per-survey loop).
  const { data: campaignRows } = await supabaseAdmin
    .from("campaigns")
    .select("survey_id, campaign_id, target_responses")
    .in("survey_id", liveSurveyIds)
    .eq("origin", CAMPAIGN_ORIGIN.studio)
    .is("deleted_at", null);
  const campaigns = campaignRows ?? [];
  const slugs = campaigns.map((c) => c.campaign_id as string);
  const { data: campStats } = slugs.length
    ? await supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count").in("campaign_id", slugs)
    : { data: [] as { campaign_id: string; response_count: number }[] };
  const respBySlug = new Map((campStats ?? []).map((s) => [s.campaign_id as string, Number(s.response_count ?? 0) || 0]));

  const campaignsBySurvey = new Map<string, { target_responses: number | null; response_count: number }[]>();
  for (const c of campaigns) {
    const list = campaignsBySurvey.get(c.survey_id as string) ?? [];
    list.push({ target_responses: c.target_responses == null ? null : Number(c.target_responses), response_count: respBySlug.get(c.campaign_id as string) ?? 0 });
    campaignsBySurvey.set(c.survey_id as string, list);
  }

  const out = liveSurveyIds.map((id) => {
    const stat = statById.get(id);
    const prog = plannedProgress(campaignsBySurvey.get(id) ?? []);
    return {
      id,
      name: nameById.get(id) ?? "Untitled survey",
      responses: Number(stat?.response_count ?? 0) || 0,
      liveCampaigns: Number(stat?.live_campaign_count ?? 0) || 0,
      hasTarget: prog.hasTarget,
      progressRatio: prog.progressRatio,
      targetTotal: prog.targetTotal,
      completedTowardTarget: prog.completedTowardTarget,
      lastResponseAt: (stat?.last_response_at as string | null) ?? null,
      href: `/survey-studio/manage/surveys/${id}`,
    };
  }).sort((a, b) => String(b.lastResponseAt ?? "").localeCompare(String(a.lastResponseAt ?? "")));

  const headline = {
    liveSurveys: out.length,
    totalResponses: out.reduce((n, s) => n + s.responses, 0),
    liveCampaigns: out.reduce((n, s) => n + s.liveCampaigns, 0),
  };
  return NextResponse.json({ headline, surveys: out });
}
