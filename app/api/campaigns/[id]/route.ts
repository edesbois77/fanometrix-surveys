import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
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
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
