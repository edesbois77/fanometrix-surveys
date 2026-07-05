import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import { toSlugPart } from "@/lib/naming";

export async function GET(req: NextRequest) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { data, error } = await supabaseAdmin
    .from("creative_designs")
    .select("*, publishers(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten the joined publisher name so a design's sub-theme label is
  // always resolved live from the current publisher record, never a copy.
  const flattened = (data ?? []).map(d => ({
    ...d,
    publisher_name: (d as { publishers?: { name: string } | null }).publishers?.name ?? null,
  }));

  return NextResponse.json({ data: flattened });
}

export async function POST(req: NextRequest) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();

  const {
    deleted_at: _da, created_at: _ca, updated_at: _ua,
    publisher_name: _pn, publishers: _p,
    ...safe
  } = body as Record<string, unknown>;

  const theme = safe.theme as string;
  const name = (safe.name as string)?.trim();

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!["fanometrix", "brand", "tournament", "publisher"].includes(theme)) {
    return NextResponse.json({ error: "Invalid theme." }, { status: 400 });
  }
  if (theme === "publisher") {
    if (!safe.publisher_id) {
      return NextResponse.json({ error: "Select a publisher for the Publisher theme." }, { status: 400 });
    }
    safe.sub_theme = null;
  } else {
    safe.publisher_id = null;
  }
  if (!safe.builder_state) {
    return NextResponse.json({ error: "Missing design colours." }, { status: 400 });
  }

  const slug = toSlugPart(name).slice(0, 60) || `design_${Date.now()}`;

  const { data, error } = await supabaseAdmin
    .from("creative_designs")
    .insert([{ ...safe, name, slug, updated_at: new Date().toISOString() }])
    .select("*, publishers(name)")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A design with this name already exists — try a different name." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: { ...data, publisher_name: (data as { publishers?: { name: string } | null }).publishers?.name ?? null },
  }, { status: 201 });
}
