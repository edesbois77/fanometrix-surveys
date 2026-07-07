// Returns campaign groups relevant to the calling user.
// Admin: all groups. Everyone else: only groups their organisation owns
// (or that they've been individually granted access to).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req);
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

  if (session.role !== "admin") {
    const groupIds = await visibleResourceIds(session, "campaign_group");
    if (groupIds !== null) {
      const visible = new Set(groupIds);
      return NextResponse.json({ data: enriched.filter(g => visible.has(g.id)) });
    }
  }

  return NextResponse.json({ data: enriched });
}
