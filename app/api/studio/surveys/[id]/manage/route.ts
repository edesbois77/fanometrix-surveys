// ── Manage → Survey → management view (read-only) ────────────────────────────
// The single endpoint behind the Survey management page. OPERATIONAL OWNERSHIP
// scoped (surveys.organisation_id, admin bypass via canManageSurvey) — NOT data
// entitlement (that governs Discover only). It resolves the TRUTHFUL campaign
// universe (Studio-native AND legacy, via resolveSurveyManageData) so the count
// here reconciles with the Manage list, derives the effective lifecycle + research
// lock + available actions, and reports the corrected deletion decision. It reads
// only; it mutates nothing and never touches Research Projects, Studies or ORE.

import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canManageSurvey, surveyLifecycleState, plannedProgress } from "@/lib/studio/collection-health";
import { resolveSurveyManageData } from "@/lib/studio/survey-manage-data";
import { decideSurveyDeletion } from "@/lib/studio/survey-deletion";
import {
  effectiveLifecycle, EFFECTIVE_LABEL, EFFECTIVE_TONE, surveyActions,
} from "@/lib/studio/survey-lifecycle";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  // Include lifecycle columns; do NOT filter deleted_at here (a soft-deleted survey
  // is still openable by its owner/admin as a management record).
  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select("id, name, status, description, topic, about, questions, enabled_languages, created_at, created_by, organisation_id, study_id, archived_at, deleted_at")
    .eq("id", id)
    .single();
  // Existence-preserving: another organisation's survey reads as not-found.
  if (!survey || !canManageSurvey(session, survey)) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  let study: { id: string; name: string } | null = null;
  if (survey.study_id) {
    const { data: st } = await supabaseAdmin.from("studies").select("id, name").eq("id", survey.study_id).single();
    if (st) study = { id: st.id as string, name: st.name as string };
  }

  const manage = await resolveSurveyManageData(id);

  // Operational lifecycle (campaign-derived) → composite effective lifecycle.
  const progress = plannedProgress(manage.campaigns.map((c) => ({ target_responses: c.targetResponses, response_count: c.responses })));
  const operational =
    manage.campaigns.length === 0 && manage.responseCount > 0
      ? ("closed" as const)
      : surveyLifecycleState({ effectiveStatuses: manage.campaigns.map((c) => c.status), totalResponses: manage.responseCount, targetReached: progress.targetReached });
  const effective = effectiveLifecycle({
    persistedStatus: survey.status as string,
    operationalLifecycle: operational,
    hasLiveCampaign: manage.hasLiveCampaign,
    hasEvidence: manage.hasEvidence,
  });

  // Deletion decision — the SAME pure rule the DELETE guard enforces.
  const decision = decideSurveyDeletion({
    campaigns: manage.deletionCampaigns,
    evidenceByCampaignId: manage.evidenceByCampaignId,
    surveyResponseCount: manage.surveyResponseCount,
  });

  const actions = surveyActions({
    effective,
    hasLiveCampaign: manage.hasLiveCampaign,
    hasEvidence: manage.hasEvidence,
    canManage: true, // reaching here means canManageSurvey passed
    isAdmin: session.role === "admin",
    deletable: decision.deletable,
  });

  // Publisher display names for the campaign list.
  const pubIds = [...new Set(manage.campaigns.map((c) => c.publisherOrgId).filter((x): x is string => !!x))];
  const { data: orgRows } = pubIds.length
    ? await supabaseAdmin.from("organisations").select("id, name").in("id", pubIds)
    : { data: [] as { id: string; name: string }[] };
  const orgName = new Map((orgRows ?? []).map((o) => [o.id as string, o.name as string]));

  return NextResponse.json({
    survey: {
      id: survey.id,
      name: survey.name,
      persistedStatus: survey.status,
      description: survey.description ?? null,
      topic: survey.topic ?? null,
      about: survey.about ?? null,
      questions: survey.questions ?? [],
      enabledLanguages: survey.enabled_languages ?? [],
      createdAt: survey.created_at ?? null,
      createdBy: survey.created_by ?? null,
      organisationId: survey.organisation_id ?? null,
      study,
    },
    lifecycle: { effective, label: EFFECTIVE_LABEL[effective], tone: EFFECTIVE_TONE[effective] },
    flags: {
      hasLiveCampaign: manage.hasLiveCampaign,
      hasEvidence: manage.hasEvidence,
      researchLocked: actions.researchLocked,
      lockReason: actions.lockReason,
    },
    counts: {
      responses: manage.responseCount,
      totalCampaigns: manage.campaigns.length,
      studioCampaigns: manage.campaigns.filter((c) => c.isStudio).length,
      legacyCampaigns: manage.campaigns.filter((c) => !c.isStudio).length,
      publishers: manage.publisherCount,
      markets: manage.marketCount,
      questions: Array.isArray(survey.questions) ? survey.questions.length : 0,
      lastResponseAt: manage.lastResponseAt,
    },
    campaigns: manage.campaigns.map((c) => ({
      name: c.name,
      slug: c.slug,
      status: c.status,
      publisher: c.publisherOrgId ? (orgName.get(c.publisherOrgId) ?? "Publisher") : "—",
      market: c.market || "—",
      language: c.language || "",
      isStudio: c.isStudio,
      hasData: c.hasData,
      responses: c.responses,
    })),
    actions,
    deletion: {
      deletable: decision.deletable,
      reason: decision.deletable ? null : decision.reason,
      campaignsToSoftDelete: decision.deletable ? decision.campaignIdsToSoftDelete.length : 0,
    },
  });
}
