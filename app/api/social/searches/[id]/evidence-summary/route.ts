// Cumulative "Evidence Built" summary for one Conversation Search — the evidence
// accumulated across EVERY collection run, reinforcing that a search is one
// research question whose evidence grows over time (not a single scrape).
// Unique conversations (deduped across runs by connector+external_id), total
// runs, and the union of sources and markets ever collected from. Admin, read-only.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const NON_CONVERSATION = new Set(["video", "trend"]); // context kinds, not conversations

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }
  const { id } = await params;

  // Runs + the scope ever used (union of connectors and each run's config.markets).
  const { data: runs } = await supabaseAdmin
    .from("collection_runs")
    .select("connectors, config")
    .eq("search_id", id);

  const sources = new Set<string>();
  const markets = new Set<string>();
  for (const r of (runs ?? []) as { connectors: string[] | null; config: { markets?: string[] } | null }[]) {
    for (const c of r.connectors ?? []) sources.add(c);
    for (const m of r.config?.markets ?? []) markets.add(m);
  }

  // Unique conversations across all runs (history is preserved, so the same item
  // recurs run-to-run; dedup by connector+external_id for the true evidence size).
  const { data: rows } = await supabaseAdmin
    .from("social_mentions")
    .select("connector, external_id, content_kind, market")
    .eq("search_id", id)
    .limit(20000);

  const seen = new Set<string>();
  let conversations = 0;
  for (const row of (rows ?? []) as { connector: string | null; external_id: string | null; content_kind: string | null; market: string | null }[]) {
    if (row.content_kind && NON_CONVERSATION.has(row.content_kind)) continue;
    if (row.external_id) {
      const key = `${row.connector}:${row.external_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    conversations++;
    if (row.market) markets.add(row.market);
  }

  return NextResponse.json({
    evidence_built: {
      conversations,
      runs: runs?.length ?? 0,
      sources: Array.from(sources),
      markets: Array.from(markets),
    },
  });
}
