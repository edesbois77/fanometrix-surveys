// Researcher Notes — the human interpretation layer over Analysis
// (docs/analysis-workspace-blueprint.md §11.3). Notes live in their own table,
// never in the AI synthesis, so regenerating Analysis never touches them.
//   GET    → all notes for the project
//   POST   → create { scope, scope_ref, body }
//   PATCH  → edit   { id, body }
//   DELETE → remove ?noteId=
// Admin-only writes.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SCOPES = new Set(["project", "aspect", "finding"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("research_notes")
    .select("id, scope, scope_ref, body, author, created_at, updated_at")
    .eq("research_project_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const scope = body?.scope as string | undefined;
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!scope || !SCOPES.has(scope)) return NextResponse.json({ error: "scope must be project, aspect or finding" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "note body is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("research_notes")
    .insert([{ research_project_id: id, scope, scope_ref: typeof body?.scope_ref === "string" ? body.scope_ref : "", body: text, author: session.workEmail }])
    .select("id, scope, scope_ref, body, author, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const noteId = body?.id as string | undefined;
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!noteId || !text) return NextResponse.json({ error: "id and body are required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("research_notes")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", noteId).eq("research_project_id", id)
    .select("id, scope, scope_ref, body, author, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const noteId = req.nextUrl.searchParams.get("noteId");
  if (!noteId) return NextResponse.json({ error: "noteId is required" }, { status: 400 });
  const { error } = await supabaseAdmin
    .from("research_notes").delete().eq("id", noteId).eq("research_project_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
