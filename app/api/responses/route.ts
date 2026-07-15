import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  const researchProjectId = req.nextUrl.searchParams.get("research_project_id");

  let query = supabase
    .from("responses")
    .select("*")
    .order("created_at", { ascending: false });

  // Apply URL filter first (stacks with role filter below)
  if (campaignId) query = query.eq("campaign_id", campaignId);

  // Scope to one Research Project's own Workspace dashboard — resolve to the
  // text campaign_ids belonging to that project (responses.campaign_id is
  // the human-readable text id, not campaigns.id), same resolution pattern
  // as the role filter below.
  if (researchProjectId) {
    const { data: rows } = await supabaseAdmin
      .from("campaigns")
      .select("campaign_id")
      .eq("research_project_id", researchProjectId);
    const ids = (rows ?? []).map(r => r.campaign_id as string);
    if (ids.length === 0) return NextResponse.json({ data: [] });
    query = query.in("campaign_id", ids);
  }

  // responses.campaign_id is the human-readable text id (matching
  // campaigns.campaign_id), not the campaigns.id uuid, so resolve this
  // user's visible campaigns (unified across publisher/brand/agency
  // org-wide and Selected Access) down to that text id.
  if (session.role !== "admin") {
    const uuids = await visibleResourceIds(session, "campaign");
    if (uuids !== null) {
      if (uuids.length === 0) return NextResponse.json({ data: [] });
      const { data: rows } = await supabaseAdmin.from("campaigns").select("campaign_id").in("id", uuids);
      const ids = (rows ?? []).map(r => r.campaign_id as string);
      if (ids.length === 0) return NextResponse.json({ data: [] });
      query = query.in("campaign_id", ids);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("Supabase fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch responses" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
