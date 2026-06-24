import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import { canAccessInsight } from "@/lib/insights-access";
import type { FullUser, Insight } from "@/lib/types";

const INSIGHT_SELECT = "id,title,subtitle,slug,content_type,status,published_at,summary,content_blocks,download_url,featured_image_url,tags,visibility,created_by,created_at,updated_at";

const USER_AUDIENCE_SELECT = "id,username,role,organisation_name,associated_agency,associated_brand,associated_publisher,associated_projects,associated_markets,allowed_campaign_ids,allowed_publisher_ids,is_active,force_password_change,created_at,updated_at,last_seen_at";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  let session;
  try {
    session = await requireSession(req);
  } catch (err) {
    return err as Response;
  }

  const { slug } = await params;

  const { data: insight, error } = await supabaseAdmin
    .from("insights")
    .select(INSIGHT_SELECT)
    .eq("slug", slug)
    .single();

  if (error || !insight) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (session.role === "admin") {
    return NextResponse.json({ data: insight });
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select(USER_AUDIENCE_SELECT)
    .eq("id", session.sub)
    .single();

  if (userError || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!canAccessInsight(insight as Insight, user as FullUser)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: insight });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  const fields = [
    "title", "subtitle", "slug", "content_type", "status",
    "published_at", "summary", "content_blocks", "download_url",
    "featured_image_url", "tags", "visibility",
  ] as const;

  for (const field of fields) {
    if (field in body) update[field] = body[field];
  }

  if (update.slug && typeof update.slug === "string") {
    if (!/^[a-z0-9-]+$/.test(update.slug)) {
      return NextResponse.json(
        { error: "Slug may only contain lowercase letters, numbers and hyphens" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("insights")
    .update(update)
    .eq("slug", slug)
    .select(INSIGHT_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An insight with that slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { slug } = await params;

  const { error } = await supabaseAdmin
    .from("insights")
    .delete()
    .eq("slug", slug);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
