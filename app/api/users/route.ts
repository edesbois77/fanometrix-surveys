import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";

const USER_SELECT = "id,username,role,organisation_name,allowed_campaign_ids,allowed_publisher_ids,is_active,force_password_change,created_at,updated_at";

export async function GET(req: NextRequest) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(USER_SELECT)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    username, password, role,
    organisation_name,
    allowed_campaign_ids, allowed_publisher_ids,
    is_active, force_password_change,
  } = body as {
    username: string;
    password: string;
    role: string;
    organisation_name?: string;

    allowed_campaign_ids?: string[];
    allowed_publisher_ids?: string[];
    is_active?: boolean;
    force_password_change?: boolean;
  };

  if (!username || !password || !role) {
    return NextResponse.json(
      { error: "Username, password and role are required" },
      { status: 400 }
    );
  }

  // Validate username format
  const cleanUsername = username.toLowerCase().trim();
  if (!/^[a-z0-9_-]+$/.test(cleanUsername)) {
    return NextResponse.json(
      { error: "Username may only contain lowercase letters, numbers, underscores and hyphens" },
      { status: 400 }
    );
  }

  const hashed_password = await bcrypt.hash(password, 10);

  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      username:             cleanUsername,
      hashed_password,
      role,
      organisation_name:    organisation_name    ?? "",
      allowed_campaign_ids: allowed_campaign_ids  ?? [],
      allowed_publisher_ids: allowed_publisher_ids ?? [],
      is_active:            is_active            ?? true,
      force_password_change: force_password_change ?? true,
    })
    .select(USER_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Username already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
