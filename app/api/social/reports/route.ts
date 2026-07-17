import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProjectSocialSearchIds } from "@/lib/research-sources/project-searches";

export async function GET(req: NextRequest) {
  try { await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const searchId = req.nextUrl.searchParams.get("search_id");
  // Additive project scope — same rules as /api/social/stats.
  const projectId = req.nextUrl.searchParams.get("research_project_id");

  let q = supabaseAdmin
    .from("social_mentions")
    .select("sentiment, topic, subtopic, platform, market, published_at, content, ai_summary")
    .order("published_at", { ascending: true });
  if (searchId) {
    q = q.eq("search_id", searchId);
  } else if (projectId) {
    const ids = await getProjectSocialSearchIds(projectId);
    if (ids.length === 0) return NextResponse.json({ sentimentTrend: [], topicBreakdown: [], marketComparison: [], recentSummaries: [] });
    q = q.in("search_id", ids);
  }

  const { data: mentions, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = mentions ?? [];

  // Sentiment trend — group by day
  const dayMap: Record<string, { date: string; positive: number; neutral: number; negative: number; total: number }> = {};
  for (const m of all) {
    const date = (m.published_at ?? "").slice(0, 10);
    if (!date) continue;
    if (!dayMap[date]) dayMap[date] = { date, positive: 0, neutral: 0, negative: 0, total: 0 };
    dayMap[date].total++;
    if (m.sentiment === "Positive") dayMap[date].positive++;
    else if (m.sentiment === "Neutral")  dayMap[date].neutral++;
    else if (m.sentiment === "Negative") dayMap[date].negative++;
  }
  const sentimentTrend = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));

  // Topic breakdown
  const topicMap: Record<string, { topic: string; count: number; positive: number; negative: number }> = {};
  for (const m of all) {
    if (!m.topic) continue;
    if (!topicMap[m.topic]) topicMap[m.topic] = { topic: m.topic, count: 0, positive: 0, negative: 0 };
    topicMap[m.topic].count++;
    if (m.sentiment === "Positive") topicMap[m.topic].positive++;
    if (m.sentiment === "Negative") topicMap[m.topic].negative++;
  }
  const topicBreakdown = Object.values(topicMap).sort((a, b) => b.count - a.count);

  // Market comparison
  const marketMap: Record<string, { market: string; total: number; positive_pct: number }> = {};
  for (const m of all) {
    const mk = m.market || "Unknown";
    if (!marketMap[mk]) marketMap[mk] = { market: mk, total: 0, positive_pct: 0 };
    marketMap[mk].total++;
  }
  for (const [, v] of Object.entries(marketMap)) {
    const mMentions = all.filter(m => (m.market || "Unknown") === v.market);
    v.positive_pct = Math.round((mMentions.filter(m => m.sentiment === "Positive").length / v.total) * 100);
  }
  const marketComparison = Object.values(marketMap).sort((a, b) => b.total - a.total);

  // Recent AI summaries for emerging themes
  const recentSummaries = all
    .filter(m => m.ai_summary)
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, 10)
    .map(m => ({ topic: m.topic, subtopic: m.subtopic, sentiment: m.sentiment, ai_summary: m.ai_summary }));

  return NextResponse.json({ sentimentTrend, topicBreakdown, marketComparison, recentSummaries });
}
