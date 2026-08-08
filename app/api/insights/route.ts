import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { filterInsights } from "@/lib/insights-access";
import { validateAllowedOrganisationIds } from "@/lib/insights-authoring";
import { loadOperatorDomains } from "@/lib/authz/operator-access";
import type { Insight } from "@/lib/types";

const INSIGHT_SELECT = "id,title,subtitle,slug,content_type,status,published_at,summary,content_blocks,download_url,featured_image_url,tags,visibility,allowed_organisation_ids,created_by,created_at,updated_at";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const { data: insights, error } = await supabaseAdmin
    .from("insights")
    .select(INSIGHT_SELECT)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ORG-005 IW-11 / DEC-2 — operator access via the governed standing entitlement.
  const operatorInsightAccess = session.role === "admin" && (await loadOperatorDomains(session.id)).has("insight");
  const filtered = filterInsights((insights ?? []) as Insight[], session, operatorInsightAccess);
  return NextResponse.json({ data: filtered });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin"]);
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

  // ORG-005 IW-11 / DEC-2 — governed organisation-ID association (validated).
  const orgs = await validateAllowedOrganisationIds(body.allowed_organisation_ids);
  if (!orgs.ok) return NextResponse.json({ error: orgs.error }, { status: 400 });

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
      allowed_organisation_ids: orgs.ids.length ? orgs.ids : null,
      created_by:         session.workEmail,
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
