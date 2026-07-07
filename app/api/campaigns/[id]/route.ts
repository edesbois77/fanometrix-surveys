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

  // Resolve archive_after_days and creative_design from the linked research
  // project if inherited (NULL) — mirrors the same resolution the list route
  // (/api/campaigns) already does, so a single-campaign fetch is consistent.
  let effectiveArchiveAfterDays = data.archive_after_days ?? null;
  let effectiveCreativeDesign = data.creative_design ?? null;
  if (data.research_project_id && (effectiveArchiveAfterDays == null || effectiveCreativeDesign == null)) {
    const { data: project } = await supabaseAdmin
      .from("research_projects")
      .select("archive_after_days, creative_design")
      .eq("id", data.research_project_id)
      .single();
    effectiveArchiveAfterDays ??= project?.archive_after_days ?? null;
    effectiveCreativeDesign ??= project?.creative_design ?? null;
  }

  const effective = computeEffectiveStatus(
    { ...(data as CampaignForStatus), archive_after_days: effectiveArchiveAfterDays },
    responseCount
  );

  const orgIds = [data.brand_org_id, data.publisher_org_id].filter((oid): oid is string => !!oid);
  const { data: orgs } = orgIds.length > 0
    ? await supabaseAdmin.from("organisations").select("id, name").in("id", orgIds)
    : { data: [] as { id: string; name: string }[] };
  const orgNameById = new Map((orgs ?? []).map(o => [o.id, o.name]));

  return NextResponse.json({
    data: {
      ...data,
      brand_name: data.brand_org_id ? orgNameById.get(data.brand_org_id) ?? "" : "",
      publisher: data.publisher_org_id ? orgNameById.get(data.publisher_org_id) ?? null : null,
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
  // same rule the list/detail GET routes use.
  if (session.role !== "admin" && !(await canAccess(session, "campaign", id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    surveys: _s,
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

  const { data, error } = await supabase
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
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const permanent = searchParams.get("permanent") === "true";
  const now = new Date().toISOString();

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
