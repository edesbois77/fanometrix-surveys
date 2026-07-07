// Publisher/agency/brand stats — returns KPI numbers filtered to the
// caller's visible campaigns.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";
import { supabaseAdmin } from "@/lib/supabase-admin";

const EMPTY = { totalResponses: 0, responsesThisWeek: 0, activeCampaigns: 0, publisherCount: 0 };

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["publisher", "agency", "brand", "admin"]);
  } catch (err) {
    return err as Response;
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // null = unrestricted (admin). Previously this route only ever checked
  // allowed_publisher_ids regardless of role, which meant brand/agency
  // users (who are scoped by allowed_campaign_ids instead) always fell
  // into the "no access" branch here — a pre-existing bug. Resolving
  // through visibleResourceIds() fixes that for all three roles at once.
  let campaignUuids: string[] | null = null;
  let campaignTextIds: string[] = [];
  let publisherCount = 0;

  if (session.role !== "admin") {
    campaignUuids = await visibleResourceIds(session, "campaign");
    if (campaignUuids !== null) {
      if (campaignUuids.length === 0) return NextResponse.json(EMPTY);
      const { data: rows } = await supabaseAdmin
        .from("campaigns")
        .select("campaign_id, publisher_org_id")
        .in("id", campaignUuids);
      campaignTextIds = (rows ?? []).map(r => r.campaign_id as string);
      publisherCount = new Set((rows ?? []).map(r => r.publisher_org_id).filter(Boolean)).size;
    }
  }

  const isRestricted = campaignUuids !== null;

  let totalQ = supabaseAdmin.from("responses")
    .select("*", { count: "exact", head: true })
    .eq("is_demo", false);
  if (isRestricted) totalQ = totalQ.in("campaign_id", campaignTextIds);

  let weekQ = supabaseAdmin.from("responses")
    .select("*", { count: "exact", head: true })
    .eq("is_demo", false)
    .gte("created_at", sevenDaysAgo);
  if (isRestricted) weekQ = weekQ.in("campaign_id", campaignTextIds);

  let campQ = supabaseAdmin.from("campaigns")
    .select("*", { count: "exact", head: true })
    .eq("status", "live");
  if (isRestricted) campQ = campQ.in("id", campaignUuids as string[]);

  const [totalRes, weekRes, campRes] = await Promise.all([totalQ, weekQ, campQ]);

  return NextResponse.json({
    totalResponses:    totalRes.count ?? 0,
    responsesThisWeek: weekRes.count  ?? 0,
    activeCampaigns:   campRes.count  ?? 0,
    publisherCount:    isRestricted ? publisherCount : 0,
  });
}
