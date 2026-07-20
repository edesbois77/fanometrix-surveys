import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProjectSocialSearchIds } from "@/lib/research-sources/project-searches";

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const searchId  = req.nextUrl.searchParams.get("search_id");
  const projectId = req.nextUrl.searchParams.get("research_project_id");
  const sentiment = req.nextUrl.searchParams.get("sentiment");
  const topic     = req.nextUrl.searchParams.get("topic");
  // Paged so the caller can load the FULL cumulative base (no silent 500 cap) —
  // one page ≤ 1000 (PostgREST's ceiling); the client loops on `offset` until it
  // has `count` rows, so the Evidence list always matches the Dashboard total.
  const limit  = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "1000", 10) || 1000, 1), 1000);
  const offset = Math.max(parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10) || 0, 0);

  let q = supabaseAdmin
    .from("social_mentions")
    .select("*", { count: "exact" })
    // Stable total order (published_at, id) so pages never skip or repeat a row.
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (searchId) {
    // A single search's evidence.
    q = q.eq("search_id", searchId);
  } else if (projectId) {
    // Every conversation collected across the project's attached searches —
    // the same project→search resolution the stats/reports endpoints use.
    const ids = await getProjectSocialSearchIds(projectId);
    if (ids.length === 0) return NextResponse.json({ data: [], count: 0 });
    q = q.in("search_id", ids);
  } else {
    // Platform-wide list (no search / project scope): real conversations only —
    // simulated (Product Walkthrough) mentions must never appear in it.
    q = q.eq("is_simulated", false);
  }
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
