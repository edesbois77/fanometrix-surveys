import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { toSlugPart } from "@/lib/naming";

export async function GET(req: NextRequest) {
  try {
    // Publishers get read-only access — they can pick an existing design
    // on Campaigns/Research Projects, but authoring new ones (POST/PUT/
    // DELETE below, and the Creative Lab builder page) stays admin-only.
    await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  // Default: only active designs (today's behaviour, for pickers). The
  // Creative Gallery browse page passes ?status=all to also see archived
  // ones — either way, hard-deleted rows never come back.
  const includeArchived = req.nextUrl.searchParams.get("status") === "all";

  let query = supabaseAdmin
    .from("creative_designs")
    .select("*")
    .is("deleted_at", null);
  if (!includeArchived) query = query.eq("status", "active");

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Usage count per design — one batched query each against campaigns and
  // research_projects (not N+1), grouped by creative_design slug.
  const [{ data: campaignRows }, { data: projectRows }] = await Promise.all([
    supabaseAdmin.from("campaigns").select("creative_design").is("deleted_at", null).not("creative_design", "is", null),
    supabaseAdmin.from("research_projects").select("creative_design").is("deleted_at", null).not("creative_design", "is", null),
  ]);
  const usageBySlug: Record<string, number> = {};
  for (const row of [...(campaignRows ?? []), ...(projectRows ?? [])]) {
    const slug = (row as { creative_design: string | null }).creative_design;
    if (slug) usageBySlug[slug] = (usageBySlug[slug] ?? 0) + 1;
  }

  // Resolve the publisher organisation name live, never a copy, so a
  // publisher rename never orphans a design's sub-theme label.
  const orgIds = Array.from(new Set(
    (data ?? []).map(d => (d as { publisher_org_id: string | null }).publisher_org_id).filter((id): id is string => !!id)
  ));
  const { data: orgs } = orgIds.length > 0
    ? await supabaseAdmin.from("organisations").select("id, name").in("id", orgIds)
    : { data: [] as { id: string; name: string }[] };
  const orgNameById = new Map((orgs ?? []).map(o => [o.id, o.name]));

  const flattened = (data ?? []).map(d => {
    const publisherOrgId = (d as { publisher_org_id: string | null }).publisher_org_id;
    return {
      ...d,
      publisher_name: publisherOrgId ? orgNameById.get(publisherOrgId) ?? null : null,
      usage_count: usageBySlug[(d as { slug: string }).slug] ?? 0,
    };
  });

  return NextResponse.json({ data: flattened });
}

export async function POST(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();

  const {
    deleted_at: _da, created_at: _ca, updated_at: _ua,
    publisher_name: _pn, is_system: _is, status: _st,
    ...safe
  } = body as Record<string, unknown>;

  const theme = safe.theme as string;
  const name = (safe.name as string)?.trim();

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!["fanometrix", "brand", "tournament", "publisher"].includes(theme)) {
    return NextResponse.json({ error: "Invalid theme." }, { status: 400 });
  }
  if (theme === "publisher") {
    if (!safe.publisher_org_id) {
      return NextResponse.json({ error: "Select a publisher for the Publisher theme." }, { status: 400 });
    }
    safe.sub_theme = null;
  } else {
    safe.publisher_org_id = null;
  }
  if (!safe.builder_state) {
    return NextResponse.json({ error: "Missing design colours." }, { status: 400 });
  }

  const slug = toSlugPart(name).slice(0, 60) || `design_${Date.now()}`;

  const { data, error } = await supabaseAdmin
    .from("creative_designs")
    .insert([{ ...safe, name, slug, updated_at: new Date().toISOString() }])
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A design with this name already exists, try a different name." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let publisherName: string | null = null;
  if (data.publisher_org_id) {
    const { data: org } = await supabaseAdmin.from("organisations").select("name").eq("id", data.publisher_org_id).single();
    publisherName = org?.name ?? null;
  }

  return NextResponse.json({
    data: { ...data, publisher_name: publisherName },
  }, { status: 201 });
}
