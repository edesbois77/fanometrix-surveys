import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession(req, ["admin", "brand", "agency"]);
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

  if (session.role === "brand" || session.role === "agency") {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("associated_brand, associated_projects")
      .eq("id", session.sub)
      .single();

    const assocProjects = ((user?.associated_projects ?? []) as string[]).map(p => p.toLowerCase());
    const assocBrand = ((user?.associated_brand ?? "") as string).toLowerCase();
    const idMatch = assocProjects.includes(data.project_id.toLowerCase());
    const brandMatch =
      session.role === "brand" && !!assocBrand && !!data.brand_name && data.brand_name.toLowerCase() === assocBrand;

    if (!idMatch && !brandMatch) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
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
    total_responses: _tr, completion_pct: _cp,
    ...safeBody
  } = body;

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
    session = await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
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
    .update({ deleted_at: now, deleted_by: session.username, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
