import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProjectSocialSearchIds } from "@/lib/research-sources/project-searches";

const EMPTY_STATS = { total: 0, positive_pct: 0, neutral_pct: 0, negative_pct: 0, topTopics: [], topPlatforms: [], topMarkets: [] };

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const searchId = req.nextUrl.searchParams.get("search_id");
  // Additive project scope: aggregate across every conversation search attached
  // to the project. `search_id` (single search) keeps priority; with neither the
  // endpoint is platform-wide, exactly as before.
  const projectId = req.nextUrl.searchParams.get("research_project_id");

  let q = supabaseAdmin.from("social_mentions").select("sentiment, topic, platform, market, published_at, content");
  if (searchId) {
    q = q.eq("search_id", searchId);
  } else if (projectId) {
    const ids = await getProjectSocialSearchIds(projectId);
    if (ids.length === 0) return NextResponse.json(EMPTY_STATS);
    q = q.in("search_id", ids);
  }

  const { data: mentions, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total    = mentions?.length ?? 0;
  const positive = mentions?.filter(m => m.sentiment === "Positive").length ?? 0;
  const neutral  = mentions?.filter(m => m.sentiment === "Neutral").length  ?? 0;
  const negative = mentions?.filter(m => m.sentiment === "Negative").length ?? 0;

  // Top topics
  const topicCounts: Record<string, number> = {};
  for (const m of mentions ?? []) {
    if (m.topic) topicCounts[m.topic] = (topicCounts[m.topic] ?? 0) + 1;
  }
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));

  // Top platforms
  const platformCounts: Record<string, number> = {};
  for (const m of mentions ?? []) {
    const p = m.platform || "Unknown";
    platformCounts[p] = (platformCounts[p] ?? 0) + 1;
  }
  const topPlatforms = Object.entries(platformCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([platform, count]) => ({ platform, count }));

  // Top markets
  const marketCounts: Record<string, number> = {};
  for (const m of mentions ?? []) {
    const mk = m.market || "Unknown";
    marketCounts[mk] = (marketCounts[mk] ?? 0) + 1;
  }
  const topMarkets = Object.entries(marketCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([market, count]) => ({ market, count }));

  return NextResponse.json({
    total,
    positive_pct: total ? Math.round((positive / total) * 100) : 0,
    neutral_pct:  total ? Math.round((neutral  / total) * 100) : 0,
    negative_pct: total ? Math.round((negative / total) * 100) : 0,
    topTopics, topPlatforms, topMarkets,
  });
}
