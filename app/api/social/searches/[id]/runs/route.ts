// Collection run history for one search — every run as a timestamped snapshot
// (config, connector statuses, totals, AI-output rollups, warnings). Read-only,
// admin. Powers the run-history UI; the raw mentions per run remain in
// social_mentions keyed by collection_run_id.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("collection_runs")
    .select("id, status, started_at, completed_at, connectors, config, stats, warnings, error, triggered_by")
    .eq("search_id", id)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
