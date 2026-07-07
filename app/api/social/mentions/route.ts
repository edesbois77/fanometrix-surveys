import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const searchId  = req.nextUrl.searchParams.get("search_id");
  const sentiment = req.nextUrl.searchParams.get("sentiment");
  const topic     = req.nextUrl.searchParams.get("topic");
  const limit     = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "100"), 500);

  let q = supabaseAdmin
    .from("social_mentions")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (searchId)  q = q.eq("search_id",  searchId);
  if (sentiment) q = q.eq("sentiment",  sentiment);
  if (topic)     q = q.eq("topic",      topic);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, count });
}

export async function DELETE(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { ids }: { ids: string[] } = await req.json();
  const { error } = await supabaseAdmin.from("social_mentions").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
