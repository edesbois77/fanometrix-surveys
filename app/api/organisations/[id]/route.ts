import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";

const ORG_TYPES = ["publisher", "agency", "brand", "internal"] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json();
  const now = new Date().toISOString();

  const update: Record<string, unknown> = { updated_at: now };
  if (body.name !== undefined) {
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Organisation name is required." }, { status: 400 });
    update.name = name;
  }
  if (body.type !== undefined) {
    if (!ORG_TYPES.includes(body.type)) {
      return NextResponse.json({ error: "A valid organisation type is required." }, { status: 400 });
    }
    update.type = body.type;
  }
  if (body.status !== undefined) {
    if (!["active", "disabled"].includes(body.status)) {
      return NextResponse.json({ error: "Status must be active or disabled." }, { status: 400 });
    }
    update.status = body.status;
  }

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An organisation with this name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// Quick status toggle — mirrors the users PATCH endpoint's enable/disable pattern.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json();

  if (!["active", "disabled"].includes(body.status)) {
    return NextResponse.json({ error: "Status must be active or disabled." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("organisations")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  const now = new Date().toISOString();

  const { count } = await supabaseAdmin
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", id)
    .eq("status", "active");

  if ((count ?? 0) > 0 && !force) {
    return NextResponse.json(
      { error: `This organisation still has ${count} active user account(s). Confirm to delete anyway.` },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("organisations")
    .update({ deleted_at: now, deleted_by: session.workEmail, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
