import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const API_KEY = process.env.REPORTING_API_KEY;

function auth(req: NextRequest): boolean {
  if (!API_KEY) return true;
  const header = req.headers.get("authorization");
  const query  = req.nextUrl.searchParams.get("api_key");
  return header === `Bearer ${API_KEY}` || query === API_KEY;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [countRes, latestRes] = await Promise.all([
    supabase.from("responses").select("*", { count: "exact", head: true }),
    supabase.from("responses").select("created_at").order("created_at", { ascending: false }).limit(1),
  ]);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.fanometrix.com";

  return NextResponse.json({
    total_rows:         countRes.count ?? 0,
    last_response_at:   latestRes.data?.[0]?.created_at ?? null,
    view_name:          "vw_campaign_responses",
    endpoint:           `${base}/api/reporting`,
    api_key_configured: !!API_KEY,
  });
}
