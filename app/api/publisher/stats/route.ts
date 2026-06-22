// Publisher/agency stats — returns KPI numbers filtered to the caller's publisher access.
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession(req, ["publisher", "agency", "brand", "admin"]);
  } catch (err) {
    return err as Response;
  }

  const publisherIds  = session.allowedPublisherIds ?? [];
  const sevenDaysAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const isRestricted  = session.role !== "admin" && publisherIds.length > 0;
  const noAccess      = session.role !== "admin" && publisherIds.length === 0;

  if (noAccess) {
    return NextResponse.json({
      totalResponses: 0, responsesThisWeek: 0, activeCampaigns: 0, publisherCount: 0,
    });
  }

  // Total responses
  let totalQ = supabaseAdmin.from("responses")
    .select("*", { count: "exact", head: true })
    .eq("is_demo", false);
  if (isRestricted) totalQ = totalQ.in("publisher", publisherIds);

  // Responses this week
  let weekQ = supabaseAdmin.from("responses")
    .select("*", { count: "exact", head: true })
    .eq("is_demo", false)
    .gte("created_at", sevenDaysAgo);
  if (isRestricted) weekQ = weekQ.in("publisher", publisherIds);

  // Live campaigns
  let campQ = supabaseAdmin.from("campaigns")
    .select("*", { count: "exact", head: true })
    .eq("status", "live");
  if (isRestricted) campQ = campQ.in("publisher", publisherIds);

  const [totalRes, weekRes, campRes] = await Promise.all([totalQ, weekQ, campQ]);

  return NextResponse.json({
    totalResponses:    totalRes.count ?? 0,
    responsesThisWeek: weekRes.count  ?? 0,
    activeCampaigns:   campRes.count  ?? 0,
    publisherCount:    publisherIds.length,
  });
}
