import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { searchInOrg } from "@/lib/social-listening/org-scope";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  // ORG-006 WP-02 — a caller may only operate on a search in their Current
  // Organisation; another Organisation's (or a legacy NULL) search is 404.
  if (!(await searchInOrg(id, session.organisationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  // organisation_id is immutable through ordinary update — it is context/scope, not
  // an editable field (never trust it from the body).
  const { keywords, organisation_id: _ignoredOrg, ...fields } = body;
  void _ignoredOrg;

  const { data, error } = await supabaseAdmin
    .from("social_searches").update(fields).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (keywords !== undefined) {
    await supabaseAdmin.from("social_keywords").delete().eq("search_id", id);
    if (keywords.length) {
      await supabaseAdmin.from("social_keywords").insert(
        keywords.map((k: { keyword: string; keyword_type: string }) => ({
          search_id: id, keyword: k.keyword, keyword_type: k.keyword_type ?? "Topic",
        }))
      );
    }
  }
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  // ORG-006 WP-02 — cross-Organisation isolation (see PUT).
  if (!(await searchInOrg(id, session.organisationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await supabaseAdmin.from("social_searches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
