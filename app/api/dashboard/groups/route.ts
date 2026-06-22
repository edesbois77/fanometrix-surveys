// Returns campaign groups relevant to the calling user.
// Admin: all groups. Publisher: only groups that contain at least one of their campaigns.
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession(req);
  } catch (err) {
    return err as Response;
  }

  // Fetch all groups with their member campaign IDs
  const { data: groups, error } = await supabaseAdmin
    .from("campaign_groups")
    .select("id, group_id, name, campaign_group_members(campaign_id)")
    .order("name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = (groups ?? []).map(g => ({
    id:           g.id,
    group_id:     g.group_id,
    name:         g.name,
    campaign_ids: (g.campaign_group_members as { campaign_id: string }[]).map(m => m.campaign_id),
  }));

  // Publishers only see groups that contain at least one of their campaigns
  if (session.role === "publisher" && session.allowedPublisherIds.length > 0) {
    const publisherIds = session.allowedPublisherIds;

    // Get the campaign UUIDs accessible to this publisher
    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id")
      .in("publisher", publisherIds)
      .is("deleted_at", null);

    const publisherCampaignIds = new Set((campaigns ?? []).map(c => c.id));

    const filtered = enriched.filter(g =>
      g.campaign_ids.some(id => publisherCampaignIds.has(id))
    );

    return NextResponse.json({ data: filtered });
  }

  return NextResponse.json({ data: enriched });
}
