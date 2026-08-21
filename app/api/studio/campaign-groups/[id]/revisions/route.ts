// ── Changing a Studio Campaign Group's configuration ─────────────────────────
//
// Every membership, weight and rotation change goes through here, and through
// fx_campaign_group_edit (migration 212) underneath. That function takes a row
// lock on the group as its first statement, so two operators editing the same
// group at the same moment serialise rather than racing to create two revisions
// with the same effective_at.
//
// Nothing is edited in place. An edit CREATES a revision holding the complete
// membership as it will stand — not a delta — so reading what was configured at
// any past moment never means replaying a change log. Once a revision takes
// effect it is frozen by trigger (migration 211) and can only be superseded.

import { NextRequest, NextResponse } from "next/server";
import { campaignGroupsStudioEnabled, DISABLED_RESPONSE } from "@/lib/campaign-groups/flag";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { type StudioGroup } from "@/lib/campaign-groups/model";
import { assessGroupable, groupableRefusalSummary } from "@/lib/campaign-groups/groupable";
import { loadStudioGroupById, loadRevisions, editGroup, type EditMemberInput } from "@/lib/campaign-groups/store";
import { effectiveRevision } from "@/lib/campaign-groups/revision";
import { deriveChange } from "@/lib/campaign-groups/change-kind";

const ROTATIONS = new Set(["equal", "weighted", "priority"]);

async function loadAuthorised(session: AuthedUser, id: string): Promise<StudioGroup | NextResponse> {
  const group = await loadStudioGroupById(id);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (session.role !== "admin" && group.organisationId !== session.organisationId) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  return group;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  // ── effective_at ───────────────────────────────────────────────────────────
  // Absent means "now". A past instant is refused: back-dating a configuration
  // would claim it governed serves it never governed, which is precisely the
  // property the whole revision model exists to guarantee.
  const now = new Date();
  let effectiveAt = now;
  if (body.effective_at != null) {
    const parsed = new Date(String(body.effective_at));
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "effective_at is not a valid date." }, { status: 400 });
    }
    // One minute of tolerance for clock skew between the operator's browser and
    // the server; anything earlier is a genuine attempt to back-date.
    if (parsed.getTime() < now.getTime() - 60_000) {
      return NextResponse.json(
        { error: "A configuration cannot take effect in the past." },
        { status: 400 },
      );
    }
    effectiveAt = parsed;
  }

  const rotation = typeof body.rotation === "string" && ROTATIONS.has(body.rotation)
    ? body.rotation as "equal" | "weighted" | "priority"
    : null;
  if (!rotation) return NextResponse.json({ error: "rotation must be equal, weighted or priority." }, { status: 400 });

  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  // change_kind is DERIVED below, once the member set is parsed. It is not taken
  // from the request: the kind decides which governance rules fire, so a client
  // that chose its own kind would be choosing its own rules — sending
  // "weights_changed" while removing a campaign makes both the mandatory reason
  // and the comparability acknowledgement quietly disappear.
  //
  // A client may still SEND change_kind; it is ignored. Rejecting it would break
  // nothing but would give the impression it mattered.

  // ── members ────────────────────────────────────────────────────────────────
  const rawMembers = Array.isArray(body.members) ? body.members : null;
  if (!rawMembers) return NextResponse.json({ error: "members must be an array." }, { status: 400 });

  const members: EditMemberInput[] = [];
  for (const raw of rawMembers) {
    const m = (raw ?? {}) as Record<string, unknown>;
    const campaignId = typeof m.campaign_id === "string" ? m.campaign_id : "";
    if (!campaignId) return NextResponse.json({ error: "Every member needs a campaign_id." }, { status: 400 });

    const weight = Number(m.weight ?? 1);
    // The schema constrains weight > 0 (migration 210). Zero is not a way to
    // stop a campaign serving — pausing is — so it is refused here with an
    // explanation rather than surfaced as a constraint violation.
    if (!Number.isFinite(weight) || !Number.isInteger(weight) || weight < 1) {
      return NextResponse.json(
        { error: "Weight must be a whole number of 1 or more. To stop a campaign serving, pause it instead." },
        { status: 400 },
      );
    }
    const state = m.membership_state === "paused" ? "paused" : "active";
    members.push({ campaign_id: campaignId, weight, membership_state: state });
  }

  const duplicates = members.map(m => m.campaign_id)
    .filter((v, i, a) => a.indexOf(v) !== i);
  if (duplicates.length) {
    return NextResponse.json(
      { error: `A campaign can only appear once in a configuration: ${[...new Set(duplicates)].join(", ")}.` },
      { status: 400 },
    );
  }

  // ── membership eligibility, resolved server-side ───────────────────────────
  // The body names campaigns by uuid. Every one is re-read here and checked
  // against the caller's organisation and Studio origin, so a caller cannot put
  // another organisation's campaign into their own group by supplying its id.
  if (members.length) {
    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id, campaign_id, origin, survey_id, deleted_at, surveys!inner(organisation_id)")
      .in("id", members.map(m => m.campaign_id));

    type Row = { id: string; campaign_id: string; origin: string; deleted_at: string | null;
                 surveys: { organisation_id: string | null } | { organisation_id: string | null }[] | null };
    const rows = (campaigns ?? []) as unknown as Row[];
    const byId = new Map(rows.map(r => [r.id, r]));

    // ONE definition of groupable, shared with the candidate endpoint. Copying
    // this rule instead would let the picker offer a campaign this call then
    // refuses — the drift that is hardest to notice, because both sides look
    // individually correct. See lib/campaign-groups/groupable.ts.
    const problems: Array<{ slug: string; reason: string }> = [];
    for (const m of members) {
      const r = byId.get(m.campaign_id);
      const owner = r ? (Array.isArray(r.surveys) ? r.surveys[0] : r.surveys) : null;
      const decision = assessGroupable(
        r ? { id: r.id, slug: r.campaign_id, origin: r.origin, deletedAt: r.deleted_at,
              surveyOrganisationId: owner?.organisation_id ?? null }
          : undefined,
        { role: session.role, organisationId: session.organisationId },
      );
      if (!decision.canAdd) {
        problems.push({ slug: r?.campaign_id ?? m.campaign_id, reason: decision.reason! });
      }
    }
    if (problems.length) {
      return NextResponse.json({ error: groupableRefusalSummary(problems) }, { status: 400 });
    }
  }

  // Derive the kind from the actual diff against the configuration in force.
  const nowForDiff = new Date();
  const existing = await loadRevisions(group.id);
  const inForce = effectiveRevision(existing, nowForDiff);
  const diff = deriveChange({
    previous: inForce
      ? inForce.members.map(m => ({
          campaign_id: m.campaignId, weight: m.weight, membership_state: m.membershipState,
        }))
      : null,
    next: members.map(m => ({
      campaign_id: m.campaign_id, weight: m.weight, membership_state: m.membership_state,
    })),
    previousRotation: inForce?.rotation ?? null,
    nextRotation: rotation,
  });

  if (diff.reasonRequired && !reason) {
    return NextResponse.json(
      { error: "A reason is required when campaigns are admitted or removed." },
      { status: 400 },
    );
  }

  const result = await editGroup({
    groupId: group.id,
    effectiveAt,
    rotation,
    members,
    changeKind: diff.kind,
    reason,
    actor: session.workEmail ?? session.id,
    ...(typeof body.active_campaign_limit === "number" ? { activeCampaignLimit: body.active_campaign_limit } : {}),
    ...(body.comparability_acknowledged === true ? { comparabilityAcknowledged: true } : {}),
  });

  if (!result.ok) {
    // The database's governance messages are written for an operator and say
    // exactly which rule refused the edit, so they are surfaced rather than
    // flattened into a generic failure.
    return NextResponse.json({ error: result.error ?? "Could not save the configuration." }, { status: 409 });
  }

  const revisions = await loadRevisions(group.id);
  const created = revisions.find(r => r.id === result.revisionId) ?? null;
  const current = effectiveRevision(revisions, new Date());

  return NextResponse.json({
    revision: created && {
      id: created.id,
      effective_at: created.effectiveAt.toISOString(),
      change_kind: created.changeKind,
      reason: created.reason,
      member_count: created.members.length,
      // What the server decided changed — the UI renders this rather than
      // computing its own diff.
      diff: {
        added: diff.added, removed: diff.removed, paused: diff.paused,
        resumed: diff.resumed, reweighted: diff.reweighted,
        rotation_changed: diff.rotationChanged,
        membership_changed: diff.membershipChanged,
      },
      // Whether this revision is serving NOW, or is queued for later. The
      // client should not infer this from effective_at and its own clock.
      state: created.effectiveAt > new Date() ? "pending"
           : current && current.id === created.id ? "effective" : "superseded",
    },
  }, { status: 201 });
}
