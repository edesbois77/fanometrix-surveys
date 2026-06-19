import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession(req);
  } catch (err) {
    return err as Response;
  }

  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  let query = supabase
    .from("responses")
    .select("*")
    .order("created_at", { ascending: false });

  // Apply URL filter first (stacks with role filter below)
  if (campaignId) query = query.eq("campaign_id", campaignId);

  // Role-based data filtering
  if (session.role === "brand" || session.role === "agency") {
    const ids = session.allowedCampaignIds;
    if (ids.length === 0) return NextResponse.json({ data: [] });
    query = query.in("campaign_id", ids);
  } else if (session.role === "publisher") {
    const ids = session.allowedPublisherIds;
    if (ids.length === 0) return NextResponse.json({ data: [] });
    query = query.in("publisher", ids);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Supabase fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch responses" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
