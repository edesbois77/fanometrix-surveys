// ── One Studio Campaign Group: its configuration history and its settings ────

import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { OWNER_MODEL, FAIL_MODE, type StudioGroup } from "@/lib/campaign-groups/model";
import { loadStudioGroupById, loadRevisions, loadCampaignFacts } from "@/lib/campaign-groups/store";
import { effectiveRevision, nextPendingRevision } from "@/lib/campaign-groups/revision";
import { evaluateMembers, EXCLUSION_COPY } from "@/lib/campaign-groups/eligibility";

/**
 * Load a Studio group and authorise the caller against it.
 *
 * A group outside the caller's organisation returns the same 404 as one that
 * does not exist, so this route cannot be used to probe which group slugs are
 * taken in another organisation.
 */
async function loadAuthorised(session: AuthedUser, id: string): Promise<StudioGroup | NextResponse> {
  const group = await loadStudioGroupById(id);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (session.role !== "admin" && group.organisationId !== session.organisationId) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return group;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  const { id } = await params;

  const group = await loadAuthorised(session, id);
  if (group instanceof NextResponse) return group;

  const now = new Date();
  const revisions = await loadRevisions(group.id);
  const current = effectiveRevision(revisions, now);
  const next = nextPendingRevision(revisions, now);

  // For the CURRENT configuration only, evaluate live eligibility so Manage can
  // explain why a live group is serving nothing rather than leaving an operator
  // to guess. Routing context is empty here: this answers "could this member
  // serve at all", not "would it serve to a particular publisher".
  let memberDetail: Array<Record<string, unknown>> = [];
  if (current) {
    const facts = await loadCampaignFacts(current.members.map(m => m.campaignId));
    memberDetail = evaluateMembers(
      current.members, facts,
      { country: null, market: null, publisher: null },
      now,
    ).map(d => {
      const f = facts.get(d.member.campaignId);
      return {
        campaign_id: d.member.campaignId,
        campaign_slug: d.member.campaignSlug,
        campaign_name: f?.slug ?? d.member.campaignSlug,
        weight: d.member.weight,
        membership_state: d.member.membershipState,
        market: f?.market ?? null,
        country_code: f?.countryCode ?? null,
        publisher: f?.publisherName ?? null,
        response_count: f?.responseCount ?? 0,
        target_responses: f?.targetResponses ?? null,
        eligible: d.eligible,
        // The operator-facing reason, not the enum, so the UI never has to own
        // this vocabulary and the two cannot drift.
        reason: d.reason ? EXCLUSION_COPY[d.reason] : null,
      };
    });
  }

  return NextResponse.json({
    group: {
      id: group.id, slug: group.slug, name: group.name,
      status: group.status, fail_mode: group.failMode,
      start_date: group.startDate, end_date: group.endDate,
    },
    current_revision: current && {
      id: current.id,
      effective_at: current.effectiveAt.toISOString(),
      created_at: current.createdAt.toISOString(),
      rotation: current.rotation,
      change_kind: current.changeKind,
      reason: current.reason,
      members: memberDetail,
    },
    next_revision: next && {
      id: next.id,
      effective_at: next.effectiveAt.toISOString(),
      change_kind: next.changeKind,
      reason: next.reason,
      rotation: next.rotation,
      members: next.members.map(m => ({
        campaign_id: m.campaignId, campaign_slug: m.campaignSlug,
        weight: m.weight, membership_state: m.membershipState,
      })),
    },
    // Full history, cancelled revisions included. A cancelled revision is part
    // of the record of what an operator decided, even though it never served.
    history: revisions.map(r => ({
      id: r.id,
      effective_at: r.effectiveAt.toISOString(),
      created_at: r.createdAt.toISOString(),
      cancelled_at: r.cancelledAt?.toISOString() ?? null,
      rotation: r.rotation,
      change_kind: r.changeKind,
      reason: r.reason,
      member_count: r.members.length,
      state: r.cancelledAt ? "cancelled"
           : r.effectiveAt > now ? "pending"
           : current && r.id === current.id ? "effective"
           : "superseded",
    })),
  });
}

/**
 * Group-level settings only: name, fail_mode, status and the group's own date
 * window. MEMBERSHIP IS NOT EDITABLE HERE — it belongs to a configuration
 * revision and goes through POST .../revisions, which holds the row lock and
 * records why the change was made. Accepting members here would let a change
 * bypass the entire governance path.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  const { id } = await params;

  const group = await loadAuthorised(session, id);
  if (group instanceof NextResponse) return group;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  if ("campaign_ids" in body || "members" in body) {
    return NextResponse.json(
      { error: "Membership is changed through a configuration revision, not through group settings." },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.fail_mode === FAIL_MODE.open || body.fail_mode === FAIL_MODE.closed) patch.fail_mode = body.fail_mode;
  if (body.status === "live" || body.status === "paused") patch.status = body.status;
  if (body.start_date === null || typeof body.start_date === "string") patch.start_date = body.start_date;
  if (body.end_date === null || typeof body.end_date === "string") patch.end_date = body.end_date;

  // Going live with no configuration would 404 every impression the group is
  // handed, which reads to a publisher as a broken tag rather than as a
  // deliberate state. Refuse it and say what is missing.
  if (patch.status === "live") {
    const revisions = await loadRevisions(group.id);
    if (!effectiveRevision(revisions, new Date())) {
      return NextResponse.json(
        { error: "This group has no effective configuration yet, so it cannot go live. Add campaigns first." },
        { status: 409 },
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("campaign_groups")
    .update(patch)
    .eq("id", group.id)
    // Pinned on the UPDATE itself, not only on the read above.
    .eq("owner_model", OWNER_MODEL.studio)
    .select("id, group_id, name, status, fail_mode, start_date, end_date")
    .single();

  if (error) {
    console.error("[studio/campaign-groups] update failed:", error);
    return NextResponse.json({ error: "Could not update the group." }, { status: 500 });
  }
  return NextResponse.json({ group: data });
}
