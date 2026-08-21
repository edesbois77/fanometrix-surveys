// -- Candidates for a Campaign Group, from THIS survey ------------------------
//
// Scoped to one survey on purpose. Groups are built in Create -> [Survey] ->
// Campaigns, from the campaigns the user has just configured, so a cross-survey
// browser would be answering a question nobody is asking at that moment. The
// BACKEND is not narrowed: fx_campaign_group_edit still accepts members from any
// survey, and a wider picker can be added later without a migration.
//
// TWO VERDICTS, deliberately separate:
//
//   can_add_to_group  STRUCTURAL. May this campaign be put in a configuration?
//                     A DRAFT CAN. Grouping happens before Deploy, so requiring
//                     live campaigns would invert the intended journey.
//
//   can_serve_now     OPERATIONAL. Would it receive delivery right now? A draft
//                     cannot, and the UI must say so — but that never blocks
//                     grouping.
//
// Both come from the shared modules (groupable.ts, predicates.ts), never from a
// rule restated here, so the picker cannot offer something the publish call then
// refuses.

import { NextRequest, NextResponse } from "next/server";
import { campaignGroupsStudioEnabled, DISABLED_RESPONSE } from "@/lib/campaign-groups/flag";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CAMPAIGN_ORIGIN } from "@/lib/campaign-groups/model";
import { assessGroupable } from "@/lib/campaign-groups/groupable";
import { assessServeReadiness } from "@/lib/campaign-groups/eligibility";
import { loadCampaignFacts } from "@/lib/campaign-groups/store";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!campaignGroupsStudioEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE, { status: 404 });
  }

  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  const { id: surveyId } = await params;

  // Authority to group follows authority to OPERATE this survey's campaigns —
  // the same authority that governs deploying them in the very same stage.
  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select("id, name, organisation_id")
    .eq("id", surveyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  if (session.role !== "admin" && survey.organisation_id !== session.organisationId) {
    // Existence-preserving, matching every other Studio survey route.
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  const { data: campaigns, error } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, campaign_name, origin, status, deleted_at, country_code, market, survey_language, target_responses, publisher_org_id")
    .eq("survey_id", surveyId)
    .eq("origin", CAMPAIGN_ORIGIN.studio)
    .is("deleted_at", null)
    .order("campaign_id");

  if (error) {
    console.error("[group-candidates] campaigns read failed:", error);
    return NextResponse.json({ error: "Could not load campaigns." }, { status: 500 });
  }

  type Row = {
    id: string; campaign_id: string; campaign_name: string; origin: string;
    status: string; deleted_at: string | null; country_code: string | null;
    market: string | null; survey_language: string | null;
    target_responses: number | null; publisher_org_id: string | null;
  };
  const rows = (campaigns ?? []) as Row[];

  // Operational facts (dates in market time, response counts, publisher names,
  // survey validity) come from the same loader the serve path uses.
  const facts = await loadCampaignFacts(rows.map(r => r.id));

  // Which are already in the group's current configuration, if a group is named.
  const groupId = req.nextUrl.searchParams.get("group_id");
  const alreadyMembers = new Set<string>();
  if (groupId) {
    const { data: current } = await supabaseAdmin
      .from("campaign_group_revisions")
      .select("id, effective_at, cancelled_at, campaign_group_revision_members(campaign_id)")
      .eq("group_id", groupId)
      .is("cancelled_at", null)
      .lte("effective_at", new Date().toISOString())
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    type M = { campaign_id: string };
    for (const m of ((current?.campaign_group_revision_members ?? []) as M[])) {
      alreadyMembers.add(m.campaign_id);
    }
  }

  const now = new Date();
  const candidates = rows.map(r => {
    const groupable = assessGroupable(
      { id: r.id, slug: r.campaign_id, origin: r.origin, deletedAt: r.deleted_at,
        surveyOrganisationId: survey.organisation_id ?? null },
      { role: session.role, organisationId: session.organisationId },
    );

    const f = facts.get(r.id);
    // A candidate is not yet a member, so it is assessed as an ACTIVE one — the
    // question is whether the CAMPAIGN can serve, not whether some membership
    // state has paused it.
    const readiness = assessServeReadiness(
      { campaignId: r.id, campaignSlug: r.campaign_id, weight: 1, membershipState: "active" },
      f,
      { country: null, market: null, publisher: null },
      now,
    );

    return {
      campaign_id: r.id,
      slug: r.campaign_id,
      name: r.campaign_name,
      publisher: f?.publisherName ?? null,
      market: r.market,
      country_code: r.country_code,
      language: r.survey_language,
      status: r.status,
      target_responses: r.target_responses,
      response_count: f?.responseCount ?? 0,

      can_add_to_group: groupable.canAdd,
      cannot_add_reason: groupable.reason,
      can_serve_now: readiness.canServeNow,
      serve_readiness_reasons: readiness.copy,
      already_member: alreadyMembers.has(r.id),
    };
  });

  const groupable = candidates.filter(c => c.can_add_to_group).length;

  return NextResponse.json({
    survey: { id: survey.id, name: survey.name },
    candidates,
    // Creation needs two GROUPABLE campaigns, not two live ones.
    groupable_count: groupable,
    can_create_group: groupable >= 2,
  });
}
