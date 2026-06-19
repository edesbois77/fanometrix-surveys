import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import {
  ACTION_TRANSITIONS,
  ACTION_NOTIFICATIONS,
  type CampaignAction,
} from "@/lib/campaign-status";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  let body: { action: CampaignAction };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { action } = body;
  const transition = ACTION_TRANSITIONS[action];
  if (!transition) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  // Fetch current campaign
  const { data: campaign, error: fetchError } = await supabase
    .from("campaigns")
    .select("id, brand_name, campaign_name, status")
    .eq("id", id)
    .single();

  if (fetchError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .update({
      status:                 transition.status,
      manual_status_override: transition.manual_status_override,
      status_updated_at:      new Date().toISOString(),
      updated_at:             new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create notification for meaningful actions
  const notifConfig = ACTION_NOTIFICATIONS[action];
  if (notifConfig) {
    const campaignName = `${campaign.brand_name} – ${campaign.campaign_name}`;
    await supabaseAdmin.from("campaign_notifications").insert({
      campaign_id:   id,
      campaign_name: campaignName,
      type:          notifConfig.type,
      message:       notifConfig.message(campaignName),
    });
  }

  return NextResponse.json({ data });
}
