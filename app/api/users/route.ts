import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";

const USER_SELECT = "id,username,role,organisation_name,organisation_type,allowed_campaign_ids,allowed_publisher_ids,is_active,created_at";

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

  const { username, password, role, organisation_name, organisation_type,
          allowed_campaign_ids, allowed_publisher_ids, is_active } = body as {
    username: string;
    password: string;
    role: string;
    organisation_name?: string;
    organisation_type?: string;
    allowed_campaign_ids?: string[];
    allowed_publisher_ids?: string[];
    is_active?: boolean;
  };

  if (!username || !password || !role) {
    return NextResponse.json({ error: "username, password and role are required" }, { status: 400 });
  }

  const hashed_password = await bcrypt.hash(password, 10);

  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      username: username.toLowerCase().trim(),
      hashed_password,
      role,
      organisation_name: organisation_name ?? "",
      organisation_type: organisation_type ?? "",
      allowed_campaign_ids: allowed_campaign_ids ?? [],
      allowed_publisher_ids: allowed_publisher_ids ?? [],
      is_active: is_active ?? true,
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
