// ── Manage → Survey → Overview: single-survey operational health (read-only) ──
// OPERATIONAL OWNERSHIP scoped (surveys.organisation_id, admin bypass) — NOT data
// entitlement (that governs Discover only). One survey-scoped dashboard_event_counts
// RPC for the funnel; per-campaign operational rows come from vw_campaign_stats
// (batched) — there is NO per-campaign event RPC (no N+1). Every number has one
// authoritative source (see the metric/source map in the deliverable).
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { STUDIO_SLUG_PREFIX } from "@/lib/studio/campaign-generation";
import { computeStatusWithReason, type CampaignForStatus } from "@/lib/campaign-status";
import {
  plannedProgress, surveyLifecycleState, mapFunnelCounts, funnelStages,
  canManageSurvey, type FunnelCounts,
} from "@/lib/studio/collection-health";

const ZERO_FUNNEL: FunnelCounts = { loads: 0, viewable: 0, started: 0, completed: 0 };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select("id, name, status, organisation_id, study_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  // Existence-preserving: a survey outside the caller's organisation reads as not-found.
  if (!survey || !canManageSurvey(session, survey)) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  // Lightweight Study context (if this survey belongs to one) — for back-navigation.
  let study: { id: string; name: string } | null = null;
  if (survey.study_id) {
    const { data: st } = await supabaseAdmin.from("studies").select("id, name").eq("id", survey.study_id).single();
    if (st) study = { id: st.id as string, name: st.name as string };
  }

  // The survey's Studio campaigns (the operational unit).
  const { data: campaignRows } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, campaign_name, publisher_org_id, market, country_code, survey_language, status, manual_status_override, start_date, end_date, target_responses, target_mode, archive_after_days, status_updated_at")
    .eq("survey_id", id)
    .like("campaign_id", `${STUDIO_SLUG_PREFIX}%`)
    .is("deleted_at", null);
  const campaigns = campaignRows ?? [];
  const slugs = campaigns.map((c) => c.campaign_id as string);

  // Survey-level completed + last response — the SAME source the Manage list uses
  // (responses by survey identity), so list and Overview always agree, including for
  // historical surveys with no modern Studio Campaign rows.
  const { data: surveyStat } = await supabaseAdmin
    .from("vw_survey_stats").select("response_count, last_response_at").eq("id", id).single();
  const surveyCompleted = Number(surveyStat?.response_count ?? 0) || 0;

  // Batched per-campaign stats (real responses; the view excludes is_demo) + org names.
  const [{ data: statRows }, { data: orgRows }, funnelRows] = await Promise.all([
    slugs.length
      ? supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count, last_response_at").in("campaign_id", slugs)
      : Promise.resolve({ data: [] as { campaign_id: string; response_count: number; last_response_at: string | null }[] }),
    supabaseAdmin.from("organisations").select("id, name").in("id", [...new Set(campaigns.map((c) => c.publisher_org_id as string).filter(Boolean))]),
    // The ONE funnel call — survey-scoped over its campaign slugs (never NULL = all orgs).
    slugs.length
      ? supabaseAdmin.rpc("dashboard_event_counts", { p_campaign_ids: slugs }).then((r) => (r.data ?? []) as { event_type: string; event_count: number }[])
      : Promise.resolve([] as { event_type: string; event_count: number }[]),
  ]);

  const statBySlug = new Map((statRows ?? []).map((s) => [s.campaign_id, s]));
  const orgName = new Map((orgRows ?? []).map((o) => [o.id as string, o.name as string]));
  const now = new Date();

  // Per-campaign operational rows.
  const perCampaign = campaigns.map((c) => {
    const stat = statBySlug.get(c.campaign_id as string);
    const responses = Number(stat?.response_count ?? 0) || 0;
    const effective = computeStatusWithReason(c as unknown as CampaignForStatus, responses, now).effective;
    const target = c.target_responses == null ? null : Number(c.target_responses);
    return {
      campaignId: c.campaign_id as string,
      name: c.campaign_name as string,
      publisher: orgName.get(c.publisher_org_id as string) ?? "Publisher",
      market: (c.market as string) ?? (c.country_code as string) ?? "",
      language: (c.survey_language as string) ?? "",
      status: effective,
      responses,
      target,
      targetMode: (c.target_mode as string) ?? "continue",
      progress: target && target > 0 ? responses / target : null,
      lastResponseAt: (stat?.last_response_at as string | null) ?? null,
    };
  });

  // Aggregate progress (campaign-based targets — modern Studio surveys).
  const progress = plannedProgress(campaigns.map((c) => ({ target_responses: c.target_responses == null ? null : Number(c.target_responses), response_count: Number(statBySlug.get(c.campaign_id as string)?.response_count ?? 0) || 0 })));

  // Historical = has completed responses but NO modern Studio campaigns (its delivery
  // funnel/targets pre-date Studio instrumentation). Completed comes from the survey-
  // level source so it never reads 0 for a real historical survey.
  const historical = campaigns.length === 0 && surveyCompleted > 0;
  const lifecycle = historical
    ? "closed" as const
    : surveyLifecycleState({ effectiveStatuses: perCampaign.map((c) => c.status), totalResponses: surveyCompleted, targetReached: progress.targetReached });
  const lastResponseAt = perCampaign
    .map((c) => c.lastResponseAt)
    .filter((x): x is string => !!x)
    .sort((a, b) => b.localeCompare(a))[0] ?? (surveyStat?.last_response_at as string | null) ?? null;

  const funnel = slugs.length ? mapFunnelCounts(funnelRows) : ZERO_FUNNEL;

  return NextResponse.json({
    survey: { id: survey.id, name: survey.name, status: survey.status, lifecycle, study },
    aggregate: {
      completedResponses: surveyCompleted,               // survey-level (matches Manage list)
      historical,                                        // delivery funnel unavailable when true
      hasTarget: progress.hasTarget,
      targetTotal: progress.targetTotal,
      completedTowardTarget: progress.completedTowardTarget,
      untargetedResponses: progress.untargetedResponses,
      progressRatio: progress.progressRatio,
      targetReached: progress.targetReached,
      lastResponseAt,
      liveCampaigns: perCampaign.filter((c) => c.status === "live").length,
      totalCampaigns: perCampaign.length,
    },
    funnel: { ...funnel, stages: funnelStages(funnel) },
    campaigns: perCampaign,
  });
}
