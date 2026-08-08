import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { canAccessInsight } from "@/lib/insights-access";
import { validateAllowedOrganisationIds } from "@/lib/insights-authoring";
import { loadOperatorDomains } from "@/lib/authz/operator-access";
import type { Insight } from "@/lib/types";

const INSIGHT_SELECT = "id,title,subtitle,slug,content_type,status,published_at,summary,content_blocks,download_url,featured_image_url,tags,visibility,allowed_organisation_ids,created_by,created_at,updated_at";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  let session;
  try {
    session = await requireUser(req);
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

  // ORG-005 IW-11 / DEC-2 — operator access via the governed standing entitlement.
  const operatorInsightAccess = session.role === "admin" && (await loadOperatorDomains(session.id)).has("insight");
  if (!canAccessInsight(insight as Insight, session, operatorInsightAccess)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: insight });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireUser(req, ["admin"]);
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

  // ORG-005 IW-11 / DEC-2 — governed organisation-ID association (validated).
  if ("allowed_organisation_ids" in body) {
    const orgs = await validateAllowedOrganisationIds(body.allowed_organisation_ids);
    if (!orgs.ok) return NextResponse.json({ error: orgs.error }, { status: 400 });
    update.allowed_organisation_ids = orgs.ids.length ? orgs.ids : null;
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
    await requireUser(req, ["admin"]);
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
