import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const body = await req.json();
  const { keywords, ...fields } = body;

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
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;
  const { error } = await supabaseAdmin.from("social_searches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
