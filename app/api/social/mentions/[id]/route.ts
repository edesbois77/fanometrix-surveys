import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireSession(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
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
  try { await requireSession(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const { error } = await supabaseAdmin.from("social_mentions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
