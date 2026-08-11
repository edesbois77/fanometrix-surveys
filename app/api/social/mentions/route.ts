import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProjectSocialSearchIds } from "@/lib/research-sources/project-searches";
import { currentOrgSearchIds, searchInOrg } from "@/lib/social-listening/org-scope";

export async function GET(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

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
    // A single search's evidence — only if it belongs to the Current Organisation
    // (ORG-006 WP-02: no cross-Organisation access by supplying a search id).
    if (!(await searchInOrg(searchId, session.organisationId))) return NextResponse.json({ data: [], count: 0 });
    q = q.eq("search_id", searchId);
  } else if (projectId) {
    // Every conversation collected across the project's attached searches —
    // the same project→search resolution the stats/reports endpoints use. This is
    // the Research Project workspace surface (project-membership scoped), not the
    // ordinary platform-wide Social Listening list.
    const ids = await getProjectSocialSearchIds(projectId);
    if (ids.length === 0) return NextResponse.json({ data: [], count: 0 });
    q = q.in("search_id", ids);
  } else {
    // Platform-wide list: the Current Organisation's real conversations only.
    // Simulated (Product Walkthrough) and legacy NULL-scope searches never appear.
    const ids = await currentOrgSearchIds(session.organisationId);
    if (ids.length === 0) return NextResponse.json({ data: [], count: 0 });
    q = q.in("search_id", ids);
  }
  if (sentiment) q = q.eq("sentiment",  sentiment);
  if (topic)     q = q.eq("topic",      topic);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, count });
}

export async function DELETE(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { ids }: { ids: string[] } = await req.json();
  // ORG-006 WP-02 — only delete mentions whose search belongs to the Current
  // Organisation, so a caller cannot delete another Organisation's evidence by id.
  const orgSearchIds = await currentOrgSearchIds(session.organisationId);
  if (orgSearchIds.length === 0) return NextResponse.json({ success: true });
  const { error } = await supabaseAdmin.from("social_mentions").delete().in("id", ids).in("search_id", orgSearchIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
