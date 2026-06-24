import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import { filterInsights } from "@/lib/insights-access";
import type { FullUser, Insight } from "@/lib/types";

const INSIGHT_SELECT = "id,title,subtitle,slug,content_type,status,published_at,summary,content_blocks,download_url,featured_image_url,tags,visibility,created_by,created_at,updated_at";

const USER_AUDIENCE_SELECT = "id,username,role,organisation_name,associated_agency,associated_brand,associated_publisher,associated_projects,associated_markets,allowed_campaign_ids,allowed_publisher_ids,is_active,force_password_change,created_at,updated_at,last_seen_at";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession(req);
  } catch (err) {
    return err as Response;
  }

  const { data: insights, error } = await supabaseAdmin
    .from("insights")
    .select(INSIGHT_SELECT)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (session.role === "admin") {
    return NextResponse.json({ data: insights ?? [] });
  }

  // Non-admin: fetch full user record to run audience matching
  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select(USER_AUDIENCE_SELECT)
    .eq("id", session.sub)
    .single();

  if (userError || !user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const filtered = filterInsights((insights ?? []) as Insight[], user as FullUser);
  return NextResponse.json({ data: filtered });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { title, slug, content_type, status, visibility } = body as {
    title?: string;
    slug?: string;
    content_type?: string;
    status?: string;
    visibility?: string;
  };

  if (!title || !slug || !content_type || !status || !visibility) {
    return NextResponse.json(
      { error: "title, slug, content_type, status and visibility are required" },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9-]+$/.test(slug as string)) {
    return NextResponse.json(
      { error: "Slug may only contain lowercase letters, numbers and hyphens" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("insights")
    .insert({
      title:              body.title,
      subtitle:           body.subtitle ?? null,
      slug:               body.slug,
      content_type:       body.content_type,
      status:             body.status,
      published_at:       body.published_at ?? null,
      summary:            body.summary ?? null,
      content_blocks:     body.content_blocks ?? [],
      download_url:       body.download_url ?? null,
      featured_image_url: body.featured_image_url ?? null,
      tags:               body.tags ?? [],
      visibility:         body.visibility,
      created_by:         session.username,
    })
    .select(INSIGHT_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "An insight with that slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
