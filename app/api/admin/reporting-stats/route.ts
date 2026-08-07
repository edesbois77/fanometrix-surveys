import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isReportingKeyConfigured } from "@/lib/reporting-auth";

// Session-authenticated (admin-only) companion to /api/reporting/stats.
//
// The admin Reporting page needs the same non-sensitive status metadata
// (row count, latest submission, whether the Reporting key is configured),
// but the public /api/reporting/stats endpoint is now key-gated (fail closed).
// The browser must never hold REPORTING_API_KEY, so the admin page reads this
// route instead — authorised by the caller's admin session, not the Reporting
// API key. Returns only aggregate metadata; no response rows are exposed.
export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  // Real responses only — exclude simulated / demo rows, mirroring
  // /api/reporting/stats so the admin view matches the external metadata.
  const [countRes, latestRes] = await Promise.all([
    supabaseAdmin.from("responses").select("*", { count: "exact", head: true }).eq("is_demo", false),
    supabaseAdmin.from("responses").select("created_at").eq("is_demo", false).order("created_at", { ascending: false }).limit(1),
  ]);

  return NextResponse.json({
    total_rows:         countRes.count ?? 0,
    last_response_at:   latestRes.data?.[0]?.created_at ?? null,
    api_key_configured: isReportingKeyConfigured(process.env.REPORTING_API_KEY),
  });
}
