// Admin-only endpoint — enforces session auth internally.
// (The /api/embed prefix is public in middleware, so we check here.)
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { searchParams } = req.nextUrl;
  const campaignId  = searchParams.get("campaign_id");
  const publisher   = searchParams.get("publisher");
  const result      = searchParams.get("result");     // "success" | "failed"
  const dateFrom    = searchParams.get("date_from");
  const limit       = Math.min(Number(searchParams.get("limit") ?? 50), 200);

  let query = supabaseAdmin
    .from("submission_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (campaignId) query = query.eq("campaign_id", campaignId);
  if (publisher)  query = query.eq("publisher",   publisher);
  if (result)     query = query.eq("result",      result);
  if (dateFrom)   query = query.gte("created_at", dateFrom);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data });
}
