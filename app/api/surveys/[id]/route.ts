import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { data, error } = await supabaseAdmin.from("surveys").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json();
  const now = new Date().toISOString();

  // Pull out the action and strip all computed/lifecycle/identity fields
  const {
    _action,
    id: _id, created_at: _ca, updated_at: _ua,
    archived_at: _aa, deleted_at: _da, deleted_by: _db,
    delete_reason: _dr, created_by: _cb,
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
    default:
      // Regular content edit — only draft/ready status editable this way
      patch = { ...rest, updated_at: now };
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
    session = await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const permanent = searchParams.get("permanent") === "true";
  const now = new Date().toISOString();

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

  // Soft delete — refuse if the survey has campaigns or real responses
  const { data: statsRows } = await supabaseAdmin
    .from("vw_survey_stats")
    .select("campaign_count, response_count")
    .eq("id", id);

  const stats = statsRows?.[0];
  const campaignCount = (stats?.campaign_count as number) ?? 0;
  const responseCount = (stats?.response_count as number) ?? 0;

  if (campaignCount > 0 || responseCount > 0) {
    return NextResponse.json(
      {
        error: "This survey has responses or is linked to campaign history. Archive instead.",
        campaign_count: campaignCount,
        response_count: responseCount,
      },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("surveys")
    .update({ status: "deleted", deleted_at: now, deleted_by: session.username, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
