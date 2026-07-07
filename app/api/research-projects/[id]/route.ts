import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "brand", "agency", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("research_projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  if (session.role !== "admin" && !(await canAccess(session, "research_project", data.id))) {
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

  if (session.role !== "admin" && !(await canAccess(session, "research_project", id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const now = new Date().toISOString();

  if (body._action === "undelete") {
    const { data, error } = await supabaseAdmin
      .from("research_projects")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null, updated_at: now })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  const {
    _action: _a,
    deleted_at: _da, deleted_by: _db, delete_reason: _dr,
    deployment_count: _dc, publisher_count: _pc, country_count: _cc,
    total_responses: _tr, completion_pct: _cp, created_by_admin: _cba,
    ...safeBody
  } = body;

  // A publisher can never retarget a project to a different publisher,
  // even their own edit requests get this pinned server-side.
  if (session.role === "publisher") {
    safeBody.publisher_org_ids = session.organisationId ? [session.organisationId] : [];
  }

  const { data, error } = await supabaseAdmin
    .from("research_projects")
    .update({ ...safeBody, updated_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A research project with this Project ID already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

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

  // A publisher can only ever delete projects they can see — admin-created
  // ones are already fully hidden from them (lib/access.ts), so this is
  // effectively "their own projects only".
  if (session.role !== "admin" && !(await canAccess(session, "research_project", id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  const now = new Date().toISOString();

  const { count } = await supabaseAdmin
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("research_project_id", id)
    .is("deleted_at", null);

  if ((count ?? 0) > 0 && !force) {
    return NextResponse.json(
      { error: `This project has ${count} active deployment(s). Confirm to delete anyway.` },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("research_projects")
    .update({ deleted_at: now, deleted_by: session.workEmail, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
