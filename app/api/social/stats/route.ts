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
// A conversation is "included in the sentiment analysis" only if the classifier
// gave it a determinate sentiment. "Unknown"/null is undetermined, not a fourth
// slice — so it's excluded from the split's denominator and reported separately.
const DETERMINATE = new Set(["Positive", "Neutral", "Negative"]);

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const searchId = req.nextUrl.searchParams.get("search_id");
  // Additive project scope: aggregate across every conversation search attached
  // to the project. `search_id` (single search) keeps priority; with neither the
  // endpoint is platform-wide, exactly as before.
  const projectId = req.nextUrl.searchParams.get("research_project_id");

  let q = supabaseAdmin.from("social_mentions").select("sentiment, topic, platform, market, content_kind");
  if (searchId) {
    q = q.eq("search_id", searchId);
  } else if (projectId) {
    const ids = await getProjectSocialSearchIds(projectId);
    if (ids.length === 0) return NextResponse.json(EMPTY_STATS);
    q = q.in("search_id", ids);
  }

  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The stats describe conversations (opinions), so drop container/signal rows.
  const conversations = (rows ?? []).filter(m => !(m.content_kind && NON_CONVERSATION.has(m.content_kind)));

  const total     = conversations.length;
  const positive  = conversations.filter(m => m.sentiment === "Positive").length;
  const neutral   = conversations.filter(m => m.sentiment === "Neutral").length;
  const negative  = conversations.filter(m => m.sentiment === "Negative").length;
  // The denominator for the split is ONLY conversations the classifier could
  // place — so positive/neutral/negative always sum to 100%.
  const classified   = positive + neutral + negative;
  const undetermined = conversations.filter(m => !(m.sentiment && DETERMINATE.has(m.sentiment))).length;
  const pct = (n: number) => (classified ? Math.round((n / classified) * 100) : 0);

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
