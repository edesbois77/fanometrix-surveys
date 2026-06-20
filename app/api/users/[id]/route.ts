import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";

const USER_SELECT = "id,username,role,organisation_name,organisation_type,allowed_campaign_ids,allowed_publisher_ids,is_active,force_password_change,created_at,updated_at";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  // Username — editable, must be unique and valid format
  if (body.username && typeof body.username === "string") {
    const cleanUsername = body.username.toLowerCase().trim();
    if (!/^[a-z0-9_-]+$/.test(cleanUsername)) {
      return NextResponse.json(
        { error: "Username may only contain lowercase letters, numbers, underscores and hyphens" },
        { status: 400 }
      );
    }
    update.username = cleanUsername;
  }

  if (body.role)                            update.role              = body.role;
  if (body.organisation_name  !== undefined) update.organisation_name  = body.organisation_name;
  if (body.organisation_type  !== undefined) update.organisation_type  = body.organisation_type;
  if (body.allowed_campaign_ids)             update.allowed_campaign_ids  = body.allowed_campaign_ids;
  if (body.allowed_publisher_ids)            update.allowed_publisher_ids = body.allowed_publisher_ids;
  if (body.is_active          !== undefined) update.is_active          = body.is_active;
  if (body.force_password_change !== undefined) update.force_password_change = body.force_password_change;

  if (body.password && typeof body.password === "string" && body.password.length > 0) {
    update.hashed_password = await bcrypt.hash(body.password as string, 10);
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .update(update)
    .eq("id", id)
    .select(USER_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  let body: { is_active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ is_active: body.is_active })
    .eq("id", id)
    .select(USER_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("users")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
