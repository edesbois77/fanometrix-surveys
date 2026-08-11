import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mentionInOrg } from "@/lib/social-listening/org-scope";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  // ORG-006 WP-02 — a mention is scoped through its search's Current Organisation.
  if (!(await mentionInOrg(id, session.organisationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  // Allow overriding sentiment, topic, subtopic, ai_summary
  const allowed = ["sentiment", "topic", "subtopic", "ai_summary"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) { if (k in body) update[k] = body[k]; }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("social_mentions").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  // ORG-006 WP-02 — cross-Organisation isolation (see PATCH).
  if (!(await mentionInOrg(id, session.organisationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { error } = await supabaseAdmin.from("social_mentions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
