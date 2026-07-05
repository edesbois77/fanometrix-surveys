import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json();

  const {
    deleted_at: _da, created_at: _ca, updated_at: _ua, slug: _sl,
    publisher_name: _pn, publishers: _p,
    ...safe
  } = body as Record<string, unknown>;

  const theme = safe.theme as string | undefined;
  if (theme === "publisher") {
    safe.sub_theme = null;
  } else if (theme) {
    safe.publisher_id = null;
  }

  const { data, error } = await supabaseAdmin
    .from("creative_designs")
    .update({ ...safe, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*, publishers(name)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: { ...data, publisher_name: (data as { publishers?: { name: string } | null }).publishers?.name ?? null },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  const now = new Date().toISOString();

  const { data: design } = await supabaseAdmin
    .from("creative_designs")
    .select("slug")
    .eq("id", id)
    .single();

  if (!design) return NextResponse.json({ error: "Design not found." }, { status: 404 });

  const [{ count: campaignCount }, { count: projectCount }] = await Promise.all([
    supabaseAdmin.from("campaigns").select("id", { count: "exact", head: true })
      .eq("creative_design", design.slug).is("deleted_at", null),
    supabaseAdmin.from("research_projects").select("id", { count: "exact", head: true })
      .eq("creative_design", design.slug).is("deleted_at", null),
  ]);

  const inUse = (campaignCount ?? 0) + (projectCount ?? 0);
  if (inUse > 0 && !force) {
    return NextResponse.json(
      { error: `This design is in use by ${inUse} campaign(s)/project(s). Confirm to delete anyway — they'll keep rendering with it, it just won't be selectable for new ones.` },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("creative_designs")
    .update({ deleted_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
