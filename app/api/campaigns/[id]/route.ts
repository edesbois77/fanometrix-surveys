import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import { computeEffectiveStatus, type CampaignForStatus } from "@/lib/campaign-status";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const [{ data, error }, { data: statsData }] = await Promise.all([
    supabase.from("campaigns").select("*, surveys(name)").eq("id", id).single(),
    supabase.from("vw_campaign_stats").select("response_count").eq("campaign_db_id", id).single(),
  ]);

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  if (session.role === "brand" || session.role === "agency") {
    if (!session.allowedCampaignIds.includes(data.campaign_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const responseCount = Number(statsData?.response_count ?? 0);
  const effective = computeEffectiveStatus(data as CampaignForStatus, responseCount);

  return NextResponse.json({ data: { ...data, effective_status: effective, response_count: responseCount } });
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
    ...safeBody
  } = body;

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
    session = await requireSession(req, ["admin"]);
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
    .update({ deleted_at: now, deleted_by: session.username, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
