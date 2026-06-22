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

  const publisherIds = session.allowedPublisherIds ?? [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Build the publisher filter — admin sees all
  const applyFilter = (q: ReturnType<typeof supabaseAdmin.from>) => {
    if (session.role !== "admin" && publisherIds.length > 0) {
      return (q as unknown as { in: (col: string, vals: string[]) => typeof q })
        .in("publisher", publisherIds);
    }
    return q;
  };

  const [totalRes, weekRes, campaignRes] = await Promise.all([
    // Total responses
    applyFilter(
      supabaseAdmin.from("responses").select("*", { count: "exact", head: true }).eq("is_demo", false)
    ),
    // Responses in the last 7 days
    applyFilter(
      supabaseAdmin.from("responses")
        .select("*", { count: "exact", head: true })
        .eq("is_demo", false)
        .gte("created_at", sevenDaysAgo)
    ),
    // Live campaigns for this publisher
    applyFilter(
      supabaseAdmin.from("campaigns").select("*", { count: "exact", head: true }).eq("status", "live")
    ),
  ]);

  return NextResponse.json({
    totalResponses:   totalRes.count   ?? 0,
    responsesThisWeek: weekRes.count   ?? 0,
    activeCampaigns:  campaignRes.count ?? 0,
    publisherCount:   publisherIds.length,
  });
}
