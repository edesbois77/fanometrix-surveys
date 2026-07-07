import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { validateSurvey } from "@/lib/survey-validation";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { data, error } = await supabaseAdmin.from("surveys").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  if (session.role !== "admin" && data.organisation_id !== session.organisationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  if (session.role !== "admin") {
    const { data: existing } = await supabaseAdmin.from("surveys").select("organisation_id").eq("id", id).single();
    if (!existing || existing.organisation_id !== session.organisationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json();
  const now = new Date().toISOString();

  // Pull out the action and strip all computed/lifecycle/identity fields
  const {
    _action,
    id: _id, created_at: _ca, updated_at: _ua,
    archived_at: _aa, deleted_at: _da, deleted_by: _db,
    delete_reason: _dr, created_by: _cb, organisation_id: _oid,
    campaign_count: _cc, live_campaign_count: _lcc, response_count: _rc,
    ...rest
  } = body;

  let patch: Record<string, unknown>;

  switch (_action) {
    case "archive":
      patch = { status: "archived", archived_at: now, updated_at: now };
      break;
    case "restore":
      // Restore to draft regardless of whether it was archived or deleted
      patch = {
        status: "draft",
        archived_at: null,
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
        updated_at: now,
      };
      break;
    default: {
      // Regular content edit — status may only be set to draft or ready this way.
      // Lifecycle transitions (archive, restore, delete) require an explicit _action.
      const { status, ...contentRest } = rest as Record<string, unknown>;
      let safeStatus = status === "draft" || status === "ready" ? status : undefined;

      // Server-side MPU validation guard: if the payload requests "ready" status,
      // validate the full survey. If it fails, silently downgrade to draft so
      // invalid surveys can never be marked Ready, even via direct API calls.
      if (safeStatus === "ready") {
        const { data: existing } = await supabaseAdmin
          .from("surveys")
          .select("name, questions, thank_you_title, thank_you_body")
          .eq("id", id)
          .single();
        const merged = { ...(existing ?? {}), ...contentRest };
        const errors = validateSurvey(merged as Parameters<typeof validateSurvey>[0]);
        if (errors.length > 0) {
          safeStatus = "draft"; // auto-downgrade — client should have caught this first
        }
      }

      patch = { ...contentRest, ...(safeStatus ? { status: safeStatus } : {}), updated_at: now };
    }
  }

  const { data, error } = await supabaseAdmin
    .from("surveys")
    .update(patch)
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

  if (session.role !== "admin") {
    const { data: existing } = await supabaseAdmin.from("surveys").select("organisation_id").eq("id", id).single();
    if (!existing || existing.organisation_id !== session.organisationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (permanent) {
    // Hard delete — only allowed if the survey is already soft-deleted
    const { data: survey, error: fetchErr } = await supabaseAdmin
      .from("surveys")
      .select("status")
      .eq("id", id)
      .single();

    if (fetchErr || !survey) return NextResponse.json({ error: "Survey not found." }, { status: 404 });

    if (survey.status !== "deleted") {
      return NextResponse.json(
        { error: "Survey must be soft-deleted before it can be permanently removed." },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from("surveys").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Soft delete — only block if the survey is still linked to active campaigns
  const { data: statsRows } = await supabaseAdmin
    .from("vw_survey_stats")
    .select("campaign_count")
    .eq("id", id);

  const campaignCount = ((statsRows?.[0]?.campaign_count) as number) ?? 0;

  if (campaignCount > 0) {
    return NextResponse.json(
      { error: "This survey is still linked to active campaigns. Remove it from all campaigns first." },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("surveys")
    .update({ status: "deleted", deleted_at: now, deleted_by: session.workEmail, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
