// Generates client-ready intelligence insights from classified mentions.
// Sends a structured data summary (not raw mentions) to avoid token limits.
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type InsightReport = {
  headline:               string;
  executive_summary:      string;
  positive_drivers:       string[];
  key_concerns:           string[];
  fastest_growing_topics: string[];
  market_differences:     { finding: string; markets: string[] }[];
  recommended_actions:    { action: string; rationale: string }[];
  generated_at:           string;
  mention_count:          number;
};

function buildInsightPrompt(
  search: { name: string; entity_type: string; research_goal: string; keywords: string[] },
  summary: {
    total: number;
    positive_pct: number; neutral_pct: number; negative_pct: number;
    topTopics:    { topic: string; count: number }[];
    topMarkets:   { market: string; positive_pct: number; neutral_pct: number; negative_pct: number; count: number }[];
    topPlatforms: { platform: string; count: number }[];
    quotes:       { content: string; sentiment: string; market: string; topic: string }[];
  }
): string {
  return `You are a senior football fan intelligence analyst at Fanometrix. You are writing a client-ready intelligence report for a brand, club or agency.

Search: "${search.name}"
Entity: ${search.entity_type}
Research Goal: ${search.research_goal}
Keywords tracked: ${search.keywords.join(", ")}

DATA SUMMARY
Total mentions analysed: ${summary.total}
Sentiment: ${summary.positive_pct}% positive · ${summary.neutral_pct}% neutral · ${summary.negative_pct}% negative

Top Topics:
${summary.topTopics.slice(0, 8).map(t => `- ${t.topic}: ${t.count} mentions`).join("\n")}

By Market:
${summary.topMarkets.map(m => `- ${m.market}: ${m.count} mentions — ${m.positive_pct}% positive, ${m.negative_pct}% negative`).join("\n")}

By Platform:
${summary.topPlatforms.map(p => `- ${p.platform}: ${p.count} mentions`).join("\n")}

Representative quotes (sample):
${summary.quotes.map(q => `[${q.market}/${q.sentiment}/${q.topic}]: "${q.content}"`).join("\n")}

YOUR TASK:
Write a structured intelligence report. Use client-ready language — write as you would present to Carlsberg, Liverpool FC, Nike or a Premier League rights holder. Do NOT write statistics — write insights and implications.

Return ONLY valid JSON:
{
  "headline": "One punchy, specific headline summarising the most important finding (max 15 words)",
  "executive_summary": "2-3 sentences. The single most important story in this data. What does this mean for the client?",
  "positive_drivers": [
    "3-5 specific findings. What is driving positive sentiment? Written as client-ready insights, not statistics. E.g. 'Indian supporters are significantly more excited about merchandise and kit launches than UK supporters, suggesting untapped commercial opportunity.'"
  ],
  "key_concerns": [
    "3-5 specific concerns. What should the client pay attention to? Be specific. E.g. 'German fans are consistently critical of ticket pricing — a sentiment that has intensified in match-going discussions over the past 14 days.'"
  ],
  "fastest_growing_topics": [
    "3-4 topics gaining momentum. What is fans discussing more? Written as an insight, not a label."
  ],
  "market_differences": [
    {
      "finding": "A specific, actionable difference between markets. E.g. 'Indian supporters prioritise streaming access and international broadcast rights, while UK fans focus on matchday experience and ticket pricing.'",
      "markets": ["IN", "GB"]
    }
  ],
  "recommended_actions": [
    {
      "action": "Specific recommended action for the client (a brand, club or agency)",
      "rationale": "Why — based on the data"
    }
  ]
}

Write as a senior analyst. Be specific, insightful and commercially relevant. Never write generic observations.`;
}

export async function POST(req: NextRequest) {
  try { await requireSession(req, ["admin"]); } catch (err) { return err as Response; }

  const { search_id } = await req.json();
  if (!search_id) return NextResponse.json({ error: "search_id is required" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 503 });

  // Load search
  const { data: search } = await supabaseAdmin
    .from("social_searches")
    .select("name, entity_type, research_goal, social_keywords(keyword)")
    .eq("id", search_id)
    .single();

  if (!search) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  // Load all mentions for this search
  const { data: mentions } = await supabaseAdmin
    .from("social_mentions")
    .select("content, sentiment, topic, subtopic, market, platform, published_at")
    .eq("search_id", search_id)
    .not("sentiment", "is", null);

  const all = mentions ?? [];
  if (!all.length) return NextResponse.json({ error: "No classified mentions found for this search." }, { status: 400 });

  // Build summary stats to send to AI (avoids token limit issues)
  const total     = all.length;
  const positive  = all.filter(m => m.sentiment === "Positive").length;
  const neutral   = all.filter(m => m.sentiment === "Neutral").length;
  const negative  = all.filter(m => m.sentiment === "Negative").length;

  const topicMap: Record<string, number> = {};
  for (const m of all) { if (m.topic) topicMap[m.topic] = (topicMap[m.topic] ?? 0) + 1; }
  const topTopics = Object.entries(topicMap).sort((a, b) => b[1] - a[1])
    .slice(0, 10).map(([topic, count]) => ({ topic, count }));

  const platformMap: Record<string, number> = {};
  for (const m of all) { platformMap[m.platform] = (platformMap[m.platform] ?? 0) + 1; }
  const topPlatforms = Object.entries(platformMap).sort((a, b) => b[1] - a[1])
    .map(([platform, count]) => ({ platform, count }));

  const markets = [...new Set(all.map(m => m.market).filter(Boolean))] as string[];
  const topMarkets = markets.map(market => {
    const mAll = all.filter(m => m.market === market);
    const mPos = mAll.filter(m => m.sentiment === "Positive").length;
    const mNeg = mAll.filter(m => m.sentiment === "Negative").length;
    return {
      market,
      count:        mAll.length,
      positive_pct: Math.round((mPos / mAll.length) * 100),
      neutral_pct:  Math.round(((mAll.length - mPos - mNeg) / mAll.length) * 100),
      negative_pct: Math.round((mNeg / mAll.length) * 100),
    };
  }).sort((a, b) => b.count - a.count);

  // Sample representative quotes: 3 per sentiment, varied markets
  const byMarket = markets.reduce<Record<string, typeof all>>((acc, m) => {
    acc[m] = all.filter(x => x.market === m);
    return acc;
  }, {});

  const quotes: { content: string; sentiment: string; market: string; topic: string }[] = [];
  for (const sentiment of ["Positive", "Neutral", "Negative"]) {
    for (const market of markets.slice(0, 4)) {
      const sample = (byMarket[market] ?? []).filter(m => m.sentiment === sentiment)[0];
      if (sample?.content) {
        quotes.push({ content: sample.content.slice(0, 150), sentiment, market, topic: sample.topic ?? "" });
      }
    }
  }

  const summary = {
    total,
    positive_pct: Math.round((positive / total) * 100),
    neutral_pct:  Math.round((neutral  / total) * 100),
    negative_pct: Math.round((negative / total) * 100),
    topTopics, topPlatforms, topMarkets,
    quotes: quotes.slice(0, 16),
  };

  const keywords = (search.social_keywords as { keyword: string }[]).map(k => k.keyword);

  // Call OpenAI with GPT-4o for better insight quality
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:       "gpt-4o",           // Use GPT-4o for insight quality
      temperature: 0.3,
      max_tokens:  2048,
      messages:    [{ role: "user", content: buildInsightPrompt({ name: search.name, entity_type: search.entity_type, research_goal: search.research_goal, keywords }, summary) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `OpenAI error: ${res.status} — ${text.slice(0, 200)}` }, { status: 502 });
  }

  const json    = await res.json();
  const raw     = json.choices?.[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let report: Omit<InsightReport, "generated_at" | "mention_count">;
  try {
    report = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "Failed to parse AI response", raw: cleaned.slice(0, 500) }, { status: 500 });
  }

  const result: InsightReport = {
    ...report,
    generated_at:  new Date().toISOString(),
    mention_count: total,
  };

  return NextResponse.json(result);
}
