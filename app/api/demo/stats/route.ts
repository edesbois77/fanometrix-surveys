import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  try {
    // P0 exposure remediation. Was requireUser(req) with no role check, so ANY
    // authenticated user could read platform-wide real and demo response counts
    // with no organisation filter — a small but genuine cross-tenant read. The
    // two callers (/demo-data, /embed-test) are admin tools whose other actions
    // (generate, delete) already require admin, so this only aligns the read
    // with the writes beside it.
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const [demoRes, realRes] = await Promise.all([
    supabaseAdmin.from("responses").select("*", { count: "exact", head: true }).eq("is_demo", true),
    supabaseAdmin.from("responses").select("*", { count: "exact", head: true }).eq("is_demo", false),
  ]);

  return NextResponse.json({
    demo_count: demoRes.count ?? 0,
    real_count: realRes.count ?? 0,
  });
}
