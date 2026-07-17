import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";
import { computeEffectiveStatus, type CampaignForStatus } from "@/lib/campaign-status";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const [{ data, error }, { data: statsData }] = await Promise.all([
    supabase.from("campaigns").select("*, surveys(name)").eq("id", id).single(),
    supabase.from("vw_campaign_stats").select("response_count").eq("campaign_db_id", id).single(),
  ]);

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  // Unified check for every non-admin role — previously only brand/agency
  // were checked here at all, leaving publisher users able to fetch any
  // campaign by id regardless of allowed_publisher_ids; canAccess() closes
  // that gap by covering all three the same way.
  if (session.role !== "admin" && !(await canAccess(session, "campaign", data.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const responseCount = Number(statsData?.response_count ?? 0);

  // Resolve archive_after_days from the linked research project (still
  // project-level) and creative_design from the linked survey's own
  // research_project_evidence row (migration 094 — survey-scoped, not
  // project-level) if inherited (NULL) — mirrors the same resolution the
  // list route (/api/campaigns) already does, so a single-campaign fetch
  // is consistent.
  let effectiveArchiveAfterDays = data.archive_after_days ?? null;
  let effectiveCreativeDesign = data.creative_design ?? null;
  if (data.research_project_id) {
    const { data: project } = await supabaseAdmin
      .from("research_projects")
      .select("archive_after_days, survey_id")
      .eq("id", data.research_project_id)
      .single();
    effectiveArchiveAfterDays ??= project?.archive_after_days ?? null;

    const effectiveSurveyId = data.survey_id ?? project?.survey_id ?? null;
    if (effectiveCreativeDesign == null && effectiveSurveyId) {
      const { data: evidenceRow } = await supabaseAdmin
        .from("research_project_evidence")
        .select("creative_design")
        .eq("research_project_id", data.research_project_id)
        .eq("evidence_type", "survey")
        .eq("evidence_id", effectiveSurveyId)
        .maybeSingle();
      effectiveCreativeDesign ??= evidenceRow?.creative_design ?? null;
    }
  }

  const effective = computeEffectiveStatus(
    { ...(data as CampaignForStatus), archive_after_days: effectiveArchiveAfterDays },
    responseCount
  );

  const { data: publisherOrg } = data.publisher_org_id
    ? await supabaseAdmin.from("organisations").select("name").eq("id", data.publisher_org_id).single()
    : { data: null as { name: string } | null };

  return NextResponse.json({
    data: {
      ...data,
      publisher: publisherOrg?.name ?? null,
      effective_status: effective,
      response_count: responseCount,
      effective_creative_design: effectiveCreativeDesign,
      inherited: { creative_design: data.creative_design == null },
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  // Publishers can only ever edit campaigns they can already see — the
  // same rule the list/detail GET routes use. Campaigns an admin set up
  // stay visible to a targeted publisher (read-only) but can never be
  // edited by them, even though canAccess() alone would allow it.
  if (session.role !== "admin") {
    if (!(await canAccess(session, "campaign", id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: existing } = await supabaseAdmin.from("campaigns").select("created_by_admin").eq("id", id).single();
    if (existing?.created_by_admin) {
      return NextResponse.json({ error: "This campaign was set up by the Fanometrix team and can't be edited." }, { status: 403 });
    }
  }

  const body = await req.json();
  const now = new Date().toISOString();

  // Handle the "undelete" lifecycle action — restores a soft-deleted campaign to draft
  if (body._action === "undelete") {
    const { data, error } = await supabaseAdmin
      .from("campaigns")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null, status: "draft", updated_at: now })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // Regular content edit — strip protected / computed fields to prevent accidental overwrites
  const {
    _action: _a,
    deleted_at: _da, deleted_by: _db, delete_reason: _dr,
    effective_status: _es, status_reason: _sr, is_auto_transition: _iat, response_count: _rc,
    surveys: _s, created_by_admin: _cba,
    // Computed display field the GET response adds from publisher_org_id → org
    // name; not a real column, so strip it before the update.
    publisher: _pub,
    // API-only resolved-inheritance fields (added to the GET response for the
    // Research Project override UI) — never real columns on campaigns.
    effective_survey_id: _esi, effective_start_date: _esd, effective_end_date: _eed,
    effective_target_responses: _etr, effective_archive_after_days: _ead,
    effective_tags: _et, effective_creative_design: _ecd, inherited: _inh,
    ...safeBody
  } = body;

  // A publisher can never move a campaign to a different publisher, even
  // their own edit requests get this pinned server-side.
  if (session.role === "publisher") {
    safeBody.publisher_org_id = session.organisationId;
  }

  // supabaseAdmin, not the anon-key client — same reasoning as the POST
  // route in ../route.ts: migration 084's provenance trigger needs to read
  // research_projects (deny_all_anon RLS) and the anon-key client can't see
  // that table at all. See migration 093.
  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .update({ ...safeBody, updated_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const permanent = searchParams.get("permanent") === "true";
  const now = new Date().toISOString();

  // Permanent (hard) delete stays admin-only, matching the same restriction
  // on other resources' destructive-permanent actions.
  if (permanent && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (permanent) {
    // Hard delete safety hatch — only if already soft-deleted
    const { data: c } = await supabaseAdmin.from("campaigns").select("deleted_at").eq("id", id).single();
    if (!c?.deleted_at) {
      return NextResponse.json(
        { error: "Campaign must be soft-deleted before it can be permanently removed." },
        { status: 409 }
      );
    }
    const { error } = await supabaseAdmin.from("campaigns").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // A publisher can only ever delete campaigns they can see, and never one
  // an admin set up for them (read-only) — same rule as edit and status
  // actions.
  if (session.role !== "admin") {
    if (!(await canAccess(session, "campaign", id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: existing } = await supabaseAdmin.from("campaigns").select("created_by_admin").eq("id", id).single();
    if (existing?.created_by_admin) {
      return NextResponse.json({ error: "This campaign was set up by the Fanometrix team and can't be deleted." }, { status: 403 });
    }
  }

  // Soft delete — block only live/paused campaigns (too risky to delete while active)
  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("status, campaign_id")
    .eq("id", id)
    .single();

  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (["live", "paused"].includes(campaign.status)) {
    return NextResponse.json(
      { error: "Live and paused campaigns cannot be deleted. Close or pause it first." },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("campaigns")
    .update({ deleted_at: now, deleted_by: session.workEmail, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
