import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const [{ data: group, error }, { data: members }] = await Promise.all([
    supabaseAdmin.from("campaign_groups").select("*").eq("id", id).single(),
    supabaseAdmin.from("campaign_group_members").select("campaign_id, weight, priority").eq("group_id", id).order("priority"),
  ]);

  if (error || !group) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  if (session.role !== "admin" && !(await canAccess(session, "campaign_group", group.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    data: {
      ...group,
      campaign_ids: (members ?? []).map(m => m.campaign_id),
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

  if (session.role !== "admin" && !(await canAccess(session, "campaign_group", id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { campaign_ids, member_count: _mc, total_responses: _tr, created_by_admin: _cba, ...groupFields } = body as {
    campaign_ids?: string[];
    member_count?: number;
    total_responses?: number;
    created_by_admin?: boolean;
    [k: string]: unknown;
  };

  // A publisher can never move a group to a different publisher, even
  // their own edit requests get this pinned server-side.
  if (session.role === "publisher") {
    groupFields.publisher_org_id = session.organisationId;
  }

  const { data: group, error } = await supabaseAdmin
    .from("campaign_groups")
    .update({ ...groupFields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync members: delete all, re-insert
  if (campaign_ids !== undefined) {
    await supabaseAdmin.from("campaign_group_members").delete().eq("group_id", id);

    if (campaign_ids.length) {
      const rows = campaign_ids.map((cid, i) => ({
        group_id:    id,
        campaign_id: cid,
        priority:    i,
      }));
      await supabaseAdmin.from("campaign_group_members").insert(rows);
    }
  }

  return NextResponse.json({ data: group });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  // Members cascade-delete via FK
  const { error } = await supabaseAdmin.from("campaign_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
