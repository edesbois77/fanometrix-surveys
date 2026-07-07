// Returns the count of users seen in the last 10 minutes.
// Admin-only. Used by the homepage KPI card.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const { count, error } = await supabaseAdmin
    .from("users")
    .select("*", { count: "exact", head: true })
    .gte("last_seen_at", tenMinutesAgo)
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
