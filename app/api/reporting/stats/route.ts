import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isReportingAuthorized, isReportingKeyConfigured } from "@/lib/reporting-auth";

const API_KEY = process.env.REPORTING_API_KEY;

function auth(req: NextRequest): boolean {
  return isReportingAuthorized(
    req.headers.get("authorization"),
    req.nextUrl.searchParams.get("api_key"),
    API_KEY,
  );
}

export async function GET(req: NextRequest) {
  if (!auth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Real responses only — exclude simulated / demo rows so the external reporting
  // metadata never over-reports the true response total or a synthetic "latest".
  const [countRes, latestRes] = await Promise.all([
    supabase.from("responses").select("*", { count: "exact", head: true }).eq("is_demo", false),
    supabase.from("responses").select("created_at").eq("is_demo", false).order("created_at", { ascending: false }).limit(1),
  ]);

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.fanometrix.com";

  return NextResponse.json({
    total_rows:         countRes.count ?? 0,
    last_response_at:   latestRes.data?.[0]?.created_at ?? null,
    view_name:          "vw_campaign_responses",
    endpoint:           `${base}/api/reporting`,
    api_key_configured: isReportingKeyConfigured(API_KEY),
  });
}
