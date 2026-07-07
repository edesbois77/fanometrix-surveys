import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const [
    { data: groups,    error },
    { data: members },
    { data: campaigns },
    { data: stats },
  ] = await Promise.all([
    supabaseAdmin.from("campaign_groups").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("campaign_group_members").select("group_id, campaign_id"),
    supabaseAdmin.from("campaigns").select("id, campaign_id"),
    supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build lookup maps
  const campaignByUuid: Record<string, { campaign_id: string }> = {};
  for (const c of campaigns ?? []) campaignByUuid[c.id] = c;

  const responsesBySlug: Record<string, number> = {};
  for (const s of stats ?? []) responsesBySlug[s.campaign_id] = Number(s.response_count ?? 0);

  const membersByGroup: Record<string, string[]> = {};
  for (const m of members ?? []) {
    if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
    membersByGroup[m.group_id].push(m.campaign_id);
  }

  const data = (groups ?? []).map(g => {
    const campaignUuids = membersByGroup[g.id] ?? [];
    const totalResponses = campaignUuids.reduce((sum, uuid) => {
      const slug = campaignByUuid[uuid]?.campaign_id;
      return sum + (slug ? (responsesBySlug[slug] ?? 0) : 0);
    }, 0);

    return { ...g, member_count: campaignUuids.length, total_responses: totalResponses, campaign_ids: campaignUuids };
  });

  if (session.role === "admin") return NextResponse.json({ data });

  const visibleIds = await visibleResourceIds(session, "campaign_group");
  const visible = visibleIds === null ? data : data.filter(g => visibleIds.includes(g.id));
  return NextResponse.json({ data: visible });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();
  const { campaign_ids, created_by_admin: _cba, ...groupFields } = body as { campaign_ids?: string[]; created_by_admin?: boolean; [k: string]: unknown };

  // Publisher accounts can only ever create groups for their own
  // organisation — enforced here regardless of what the UI sent.
  if (session.role === "publisher") {
    groupFields.publisher_org_id = session.organisationId;
  }
  groupFields.created_by_admin = session.role === "admin";

  const { data: group, error } = await supabaseAdmin
    .from("campaign_groups")
    .insert([{ ...groupFields, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Group ID already exists." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Insert members
  if (campaign_ids?.length) {
    const rows = campaign_ids.map((cid, i) => ({
      group_id:    group.id,
      campaign_id: cid,
      priority:    i,
    }));
    await supabaseAdmin.from("campaign_group_members").insert(rows);
  }

  return NextResponse.json({ data: group }, { status: 201 });
}
