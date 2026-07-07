import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";
import {
  ACTION_TRANSITIONS,
  ACTION_NOTIFICATIONS,
  type CampaignAction,
} from "@/lib/campaign-status";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  // A publisher can only ever act on campaigns they can see, and never on
  // one an admin set up — that's read-only for them (labelled "Set up by
  // Fanometrix" in the UI), same restriction as content edits and delete.
  // See app/api/campaigns/[id]/route.ts.
  if (session.role !== "admin" && !(await canAccess(session, "campaign", id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const { data: campaign, error: fetchError } = await supabase
    .from("campaigns")
    .select("id, brand_org_id, campaign_name, status, created_by_admin")
    .eq("id", id)
    .single();

  if (fetchError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  if (session.role !== "admin" && campaign.created_by_admin) {
    return NextResponse.json({ error: "This campaign was set up by the Fanometrix team and can't be changed." }, { status: 403 });
  }

  let brandName = "";
  if (campaign.brand_org_id) {
    const { data: brandOrg } = await supabaseAdmin.from("organisations").select("name").eq("id", campaign.brand_org_id).single();
    brandName = brandOrg?.name ?? "";
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("campaigns")
    .update({
      status:                 transition.status,
      manual_status_override: transition.manual_status_override,
      status_updated_at:      now,
      updated_at:             now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const campaignName = `${brandName} – ${campaign.campaign_name}`;

  // Log to audit history
  await supabaseAdmin.from("campaign_status_history").insert({
    campaign_id: id,
    old_status:  campaign.status,
    new_status:  transition.status,
    reason:      `Manual action: ${action}`,
    changed_by:  session.workEmail,
  });

  // Create notification for meaningful actions
  const notifConfig = ACTION_NOTIFICATIONS[action];
  if (notifConfig) {
    await supabaseAdmin.from("campaign_notifications").insert({
      campaign_id:   id,
      campaign_name: campaignName,
      type:          notifConfig.type,
      message:       notifConfig.message(campaignName),
    });
  }

  return NextResponse.json({ data });
}
