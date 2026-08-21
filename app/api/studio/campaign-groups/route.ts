// ── Survey Studio → Campaign Groups: list and create ─────────────────────────
// Authenticated and organisation-scoped, like every other /api/studio route:
// the Active Organisation comes from requireUser, never from the request body.
//
// A group created here is a STUDIO group (owner_model 'survey_studio'). It has
// no members until an edit creates its first configuration revision — a group
// and its configuration are separate things, which is what lets a configuration
// be scheduled, cancelled and superseded without touching the group itself.

import { NextRequest, NextResponse } from "next/server";
import { campaignGroupsStudioEnabled, DISABLED_RESPONSE } from "@/lib/campaign-groups/flag";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { OWNER_MODEL, FAIL_MODE } from "@/lib/campaign-groups/model";
import { listStudioGroups, loadRevisions } from "@/lib/campaign-groups/store";
import { effectiveRevision, nextPendingRevision } from "@/lib/campaign-groups/revision";

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{2,63}$/;

export async function GET(req: NextRequest) {
  // Rollout gate — before auth, so a disabled route is indistinguishable from
  // one that does not exist rather than revealing itself through a 401/403.
  if (!campaignGroupsStudioEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE, { status: 404 });
  }

  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }

  if (!session.organisationId) {
    return NextResponse.json({ error: "No Active Organisation" }, { status: 403 });
  }

  const groups = await listStudioGroups(session.organisationId);
  const now = new Date();

  // Scope to one survey when asked. A group belongs to a survey by virtue of the
  // campaigns in its CURRENT configuration, which is why this is a filter over
  // resolved membership rather than a column: membership is revisioned, and a
  // group can legitimately move between surveys across revisions.
  const surveyFilter = req.nextUrl.searchParams.get("survey_id");
  let allowedCampaignIds: Set<string> | null = null;
  if (surveyFilter) {
    const { data: surveyCampaigns } = await supabaseAdmin
      .from("campaigns").select("id").eq("survey_id", surveyFilter);
    allowedCampaignIds = new Set((surveyCampaigns ?? []).map(c => c.id as string));
  }

  // Each group is summarised by its CURRENT configuration and whatever is
  // scheduled next, because those are the two things an operator needs to know
  // before editing: what is serving, and what is already queued to replace it.
  const summaries = await Promise.all(groups.map(async g => {
    const revisions = await loadRevisions(g.id);
    const current = effectiveRevision(revisions, now);
    const next = nextPendingRevision(revisions, now);
    return {
      // Internal only — stripped before the response. Used to scope by survey.
      __campaignIds: (current ?? next)?.members.map(m => m.campaignId) ?? [],
      id: g.id,
      slug: g.slug,
      name: g.name,
      status: g.status,
      fail_mode: g.failMode,
      start_date: g.startDate,
      end_date: g.endDate,
      revision_count: revisions.length,
      current_revision: current && {
        id: current.id,
        effective_at: current.effectiveAt.toISOString(),
        rotation: current.rotation,
        member_count: current.members.length,
        active_member_count: current.members.filter(m => m.membershipState === "active").length,
      },
      next_revision: next && {
        id: next.id,
        effective_at: next.effectiveAt.toISOString(),
        change_kind: next.changeKind,
      },
    };
  }));

  const visible = allowedCampaignIds
    ? summaries.filter(s => s.__campaignIds.some(id => allowedCampaignIds!.has(id)))
    : summaries;

  return NextResponse.json({
    groups: visible.map(({ __campaignIds, ...rest }) => rest),
  });
}

export async function POST(req: NextRequest) {
  // Rollout gate — before auth, so a disabled route is indistinguishable from
  // one that does not exist rather than revealing itself through a 401/403.
  if (!campaignGroupsStudioEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE, { status: 404 });
  }

  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }

  if (!session.organisationId) {
    return NextResponse.json({ error: "No Active Organisation" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const failMode = body.fail_mode === FAIL_MODE.closed ? FAIL_MODE.closed : FAIL_MODE.open;

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "Group ID must be 3–64 characters: lowercase letters, numbers, hyphens or underscores, starting with a letter or number." },
      { status: 400 },
    );
  }
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("campaign_groups")
    .insert([{
      group_id: slug,
      name,
      // Ownership is taken from the SESSION, never from the body. A caller that
      // could name the organisation could create a group inside someone else's.
      organisation_id: session.organisationId,
      owner_model: OWNER_MODEL.studio,
      fail_mode: failMode,
      // A new group starts paused. It cannot serve until an operator has given
      // it a configuration and deliberately set it live — a group that went live
      // empty would 404 every impression it was handed.
      status: "paused",
      rotation: "equal",
      study_type: "custom",
      created_by_admin: session.role === "admin",
      updated_at: new Date().toISOString(),
    }])
    .select("id, group_id, name, fail_mode, status")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That Group ID is already in use." }, { status: 409 });
    }
    console.error("[studio/campaign-groups] create failed:", error);
    return NextResponse.json({ error: "Could not create the group." }, { status: 500 });
  }

  return NextResponse.json({ group: data }, { status: 201 });
}
