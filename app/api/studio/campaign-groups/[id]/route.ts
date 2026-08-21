// ── One Studio Campaign Group: its configuration history and its settings ────

import { NextRequest, NextResponse } from "next/server";
import { campaignGroupsStudioEnabled, DISABLED_RESPONSE } from "@/lib/campaign-groups/flag";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { OWNER_MODEL, FAIL_MODE, type StudioGroup } from "@/lib/campaign-groups/model";
import { loadStudioGroupById, loadRevisions, loadCampaignFacts } from "@/lib/campaign-groups/store";
import { effectiveRevision, nextPendingRevision } from "@/lib/campaign-groups/revision";
import { evaluateMembers, assessServeReadiness, EXCLUSION_COPY } from "@/lib/campaign-groups/eligibility";
import { assessGoLive, nextStateChangeAt } from "@/lib/campaign-groups/go-live";

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
  // Rollout gate — before auth, so a disabled route is indistinguishable from
  // one that does not exist rather than revealing itself through a 401/403.
  if (!campaignGroupsStudioEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE, { status: 404 });
  }

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
        // EVERY applicable reason, for the UI. The single `reason` above stays
        // for the serve-shaped view; this is the diagnosis.
        readiness_reasons: assessServeReadiness(
          d.member, f, { country: null, market: null, publisher: null }, now,
        ).copy,
      };
    });
  }

  // C2: whether the group may be set live is decided HERE, never inferred by
  // the client from campaign statuses. A valid effective revision alone is not
  // sufficient — a group of undeployed drafts would go live and return empty
  // inventory indefinitely.
  const factsForVerdict = current
    ? await loadCampaignFacts(current.members.map(m => m.campaignId))
    : new Map();
  const goLive = assessGoLive(current, factsForVerdict, now);

  // N3: when this verdict stops being true. The client is not permitted to
  // reason about eligibility, which necessarily includes reasoning about when
  // eligibility lapses — so it is told when to ask again.
  const nextChange = nextStateChangeAt(revisions, current, factsForVerdict, now);

  // Deletability is a server fact and must never be inferred from a countdown.
  const canDelete = revisions.every(r => r.cancelledAt !== null || r.effectiveAt > now);

  return NextResponse.json({
    group: {
      id: group.id, slug: group.slug, name: group.name,
      status: group.status, fail_mode: group.failMode,
      start_date: group.startDate, end_date: group.endDate,
    },
    go_live: goLive,
    can_delete: canDelete,
    pending_count: revisions.filter(r => r.cancelledAt === null && r.effectiveAt > now).length,
    next_state_change_at: nextChange,
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
  // Rollout gate — before auth, so a disabled route is indistinguishable from
  // one that does not exist rather than revealing itself through a 401/403.
  if (!campaignGroupsStudioEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE, { status: 404 });
  }

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

  // C2. A VALID EFFECTIVE CONFIGURATION IS NOT SUFFICIENT.
  //
  // Gating only on "has an effective revision" would let a group whose members
  // are all undeployed drafts go live and return empty inventory indefinitely —
  // which reads to a publisher as a broken tag rather than a deliberate state.
  //
  // The verdict is computed HERE. The client is not permitted to infer it from
  // campaign statuses, so this is the only place it can be decided.
  if (patch.status === "live") {
    const nowLive = new Date();
    const revisions = await loadRevisions(group.id);
    const inForce = effectiveRevision(revisions, nowLive);
    const factsLive = inForce
      ? await loadCampaignFacts(inForce.members.map(m => m.campaignId))
      : new Map();
    const verdict = assessGoLive(inForce, factsLive, nowLive);

    if (!verdict.allowed) {
      return NextResponse.json(
        {
          error: inForce
            ? "No campaign in this configuration can serve, and none is scheduled to. Deploy or correct the campaigns first."
            : "This group has no effective configuration yet, so it cannot go live. Add campaigns first.",
          go_live: verdict,
        },
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

/**
 * Delete a group that has never governed delivery.
 *
 * Two conditions, and they are not independent: evidence can only carry a
 * revision id if that revision was effective, so the second cannot fail while
 * the first passes. It stays as cheap insurance rather than as a second gate.
 *
 * A group whose configuration HAS taken effect can never be deleted — migration
 * 211's freeze refuses to cascade through a frozen revision. That is deliberate:
 * configuration that governed serves must survive. Pausing does not restore
 * deletability, and the UI must not suggest it does.
 *
 * Re-checked HERE at submit time, because the countdown a browser renders is a
 * courtesy and not authority: a revision can become effective between the page
 * rendering a Delete button and the operator pressing it.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!campaignGroupsStudioEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE, { status: 404 });
  }

  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  const { id } = await params;

  const group = await loadAuthorised(session, id);
  if (group instanceof NextResponse) return group;

  const revisions = await loadRevisions(group.id);
  const now = new Date();

  const effective = revisions.filter(r => r.cancelledAt === null && r.effectiveAt <= now);
  if (effective.length > 0) {
    return NextResponse.json(
      { error: "This group has published configuration history and can no longer be deleted." },
      { status: 409 },
    );
  }

  if (revisions.length > 0) {
    const ids = revisions.map(r => r.id);
    // survey_events is DELIBERATELY not queried here.
    //
    // Its partial index requires event_type = 'SURVEY_RENDER', so a filter on
    // configuration_revision_id alone cannot use it and seq-scans 1.14M rows —
    // measured at 6.6 seconds, on a user-facing delete. Constraining to
    // SURVEY_RENDER instead would make the check UNDERCOUNT, which is worse
    // than not checking: a safety guard that misses evidence is not a guard.
    //
    // It is also unnecessary. Evidence can only carry a revision id if that
    // revision was effective, and the check above has already refused if any
    // was. These two small, indexed tables (idx_response_answers_revision,
    // idx_responses_revision, both partial on IS NOT NULL) stay as cheap
    // insurance against a state that should be unreachable.
    const [{ count: ans }, { count: res }] = await Promise.all([
      supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).in("configuration_revision_id", ids),
      supabaseAdmin.from("responses").select("id", { count: "exact", head: true }).in("configuration_revision_id", ids),
    ]);
    if ((ans ?? 0) + (res ?? 0) > 0) {
      return NextResponse.json(
        { error: "This group has collected research evidence and can no longer be deleted." },
        { status: 409 },
      );
    }
  }

  // Pinned on owner_model so this can never remove a legacy group. Revisions and
  // their frozen member snapshots cascade.
  const { data: deleted, error } = await supabaseAdmin
    .from("campaign_groups")
    .delete()
    .eq("id", group.id)
    .eq("owner_model", OWNER_MODEL.studio)
    .select("id");

  if (error) {
    console.error("[studio/campaign-groups] delete failed:", error);
    return NextResponse.json({ error: "Could not delete the group." }, { status: 500 });
  }
  // A filtered delete that matched nothing returns success with zero rows; that
  // must not read as "deleted".
  if (!deleted?.length) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true, pending_revisions_removed: revisions.length });
}
