import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");

  let query = supabase
    .from("responses")
    .select("*")
    .order("created_at", { ascending: false });

  if (campaignId) query = query.eq("campaign_id", campaignId);

  const { data, error } = await query;

  if (error) {
    console.error("Supabase fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch responses" }, { status: 500 });
  }

  return NextResponse.json({ data });
}
