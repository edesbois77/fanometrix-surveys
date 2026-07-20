import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProjectSocialSearchIds } from "@/lib/research-sources/project-searches";

const EMPTY_STATS = {
  total: 0, classified: 0, undetermined: 0,
  positive: 0, neutral: 0, negative: 0,
  positive_pct: 0, neutral_pct: 0, negative_pct: 0,
  topTopics: [], topPlatforms: [], topMarkets: [],
};

// Videos/trends are containers and signals, not opinions — the conversation is
// the comment/post/article. They're excluded from the conversation stats, same
// as the collection run's own by_sentiment rollup.
const NON_CONVERSATION = new Set(["video", "trend"]);

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const searchId = req.nextUrl.searchParams.get("search_id");
  // Additive project scope: aggregate across every conversation search attached
  // to the project. `search_id` (single search) keeps priority; with neither the
  // endpoint is platform-wide, exactly as before.
  const projectId = req.nextUrl.searchParams.get("research_project_id");

  // Resolve the scope to a set of search ids.
  let ids: string[] | null = null;
  if (searchId) ids = [searchId];
  else if (projectId) {
    ids = await getProjectSocialSearchIds(projectId);
    if (ids.length === 0) return NextResponse.json(EMPTY_STATS);
  } else {
    // Platform-wide: restrict to REAL searches so simulated (Product Walkthrough)
    // searches never inflate the platform-wide conversation stats. Their sentiment
    // and volume must stay out of any "real" aggregate.
    const { data: real } = await supabaseAdmin
      .from("social_searches").select("id").eq("is_simulated", false);
    ids = (real ?? []).map(s => s.id as string);
    if (ids.length === 0) return NextResponse.json(EMPTY_STATS);
  }

  // EXACT totals + sentiment from the same per-search aggregate the read model
  // uses (vw_conversation_search_stats) — server-side, so it never caps and
  // always agrees with the Dashboard/Execution/Evidence base.
  let aggQ = supabaseAdmin.from("vw_conversation_search_stats").select("conversations, positive, neutral, negative");
  if (ids) aggQ = aggQ.in("search_id", ids);
  const { data: agg, error: aggErr } = await aggQ;
  if (aggErr) return NextResponse.json({ error: aggErr.message }, { status: 500 });

  const sum = (k: "conversations" | "positive" | "neutral" | "negative") => (agg ?? []).reduce((s, r) => s + (r[k] as number), 0);
  const total = sum("conversations");
  const positive = sum("positive"), neutral = sum("neutral"), negative = sum("negative");
  const classified = positive + neutral + negative;
  const undetermined = total - classified;
  const pct = (n: number) => (classified ? Math.round((n / classified) * 100) : 0);

  // Top-N lists come from a bounded sample of the base (top lists are inherently
  // approximate; exact per-facet grouping isn't worth a per-facet view here).
  let sampleQ = supabaseAdmin.from("social_mentions").select("topic, platform, market, content_kind").limit(2000);
  if (searchId) sampleQ = sampleQ.eq("search_id", searchId);
  else if (ids) sampleQ = sampleQ.in("search_id", ids);
  const { data: rows } = await sampleQ;
  const conversations = (rows ?? []).filter(m => !(m.content_kind && NON_CONVERSATION.has(m.content_kind)));

  const topN = (key: "topic" | "platform" | "market", fallbackUnknown: boolean) => {
    const counts: Record<string, number> = {};
    for (const m of conversations) {
      const v = m[key] || (fallbackUnknown ? "Unknown" : null);
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };

  return NextResponse.json({
    total, classified, undetermined,
    positive, neutral, negative,
    positive_pct: pct(positive),
    neutral_pct:  pct(neutral),
    negative_pct: pct(negative),
    topTopics:    topN("topic", false).map(([topic, count]) => ({ topic, count })),
    topPlatforms: topN("platform", true).map(([platform, count]) => ({ platform, count })),
    topMarkets:   topN("market", true).map(([market, count]) => ({ market, count })),
  });
}
