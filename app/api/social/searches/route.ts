import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const { data, error } = await supabaseAdmin
    .from("social_searches")
    .select("*, social_keywords(id, keyword, keyword_type)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const body = await req.json();
  const { keywords, ...searchFields } = body;

  const { data: search, error } = await supabaseAdmin
    .from("social_searches")
    .insert({ ...searchFields, created_by: session.workEmail })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Insert keywords if provided
  if (keywords?.length && search) {
    await supabaseAdmin.from("social_keywords").insert(
      keywords.map((k: { keyword: string; keyword_type: string }) => ({
        search_id:    search.id,
        keyword:      k.keyword,
        keyword_type: k.keyword_type ?? "Topic",
      }))
    );
  }

  return NextResponse.json({ data: search }, { status: 201 });
}
