// Reusable analyst: turns a Conversation Search's classified mentions
// into a structured, client-ready intelligence report. Extracted
// unchanged from the original app/api/social/insights/route.ts — same
// prompt, same aggregation, same OpenAI call.
//
// Pure generation only: this function never persists anything. Callers
// (route handlers) decide what happens to the result via
// lib/intelligence/store.ts.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { clampReferences } from "@/lib/intelligence/validate-references";
import type { StructuredEvidenceBlock } from "@/lib/intelligence/structured-evidence";

export type InsightReport = {
  headline:               string;
  executive_summary:      string;
  positive_drivers:       string[];
  key_concerns:           string[];
  /** Renamed from fastest_growing_topics — the underlying data is a
   * point-in-time volume count with no time-series behind it, so a
   * "growing"/"momentum" claim was never actually supported by the
   * evidence. This is topic volume and what's being said, not a trend. */
  notable_topics:         string[];
  market_differences:     { finding: string; markets: string[] }[];
  recommended_actions: {
    action: string;
    rationale: string;
    /** AI-tagged 0-based indices into positive_drivers/key_concerns — the
     * same evidence-to-action trace Executive Report recommendations
     * already carry, split across the two source arrays since Conversation
     * Intelligence has no single findings list. */
    based_on_positive_drivers: number[];
    based_on_key_concerns:     number[];
  }[];
  generated_at:           string;
  mention_count:          number;
  // Computed directly from the mention rows, never model-generated —
  // same reasoning as SurveyIntelligenceReport.sources_summary in
  // analyseSurvey.ts.
  sources_summary: {
    platforms:  string[];               // top platform names, most mentions first
    markets:    string[];               // top market codes, most mentions first
    date_range: { from: string; to: string } | null;
  };
  /** Exact, frozen quantitative data exposed through the shared
   * lib/intelligence/structured-evidence.ts contract — same reasoning as
   * SurveyIntelligenceReport.structured_evidence in analyseSurvey.ts. */
  structured_evidence: StructuredEvidenceBlock[];
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
${summary.topMarkets.map(m => `- ${m.market}: ${m.count} mentions, ${m.positive_pct}% positive, ${m.negative_pct}% negative`).join("\n")}

By Platform:
${summary.topPlatforms.map(p => `- ${p.platform}: ${p.count} mentions`).join("\n")}

Representative quotes (sample):
${summary.quotes.map(q => `[${q.market}/${q.sentiment}/${q.topic}]: "${q.content}"`).join("\n")}

YOUR TASK:
Write a structured intelligence report. Use polished, senior, client-ready language suitable for presentation to a major brand, agency, publisher or rights holder. Ground every finding in the actual data above — cite the specific percentage or count that supports it, never a bare qualitative claim with no number behind it.

Each field has a distinct job, do not blur them together:
- "positive_drivers" and "key_concerns" are the evidence itself, what fans are actually saying and how it splits by sentiment.
- "market_differences" is a market-to-market contrast, only include it if it adds a comparison not already stated in positive_drivers or key_concerns, do not restate one of those with a market tag attached.
- "recommended_actions" is what the client should do about it, every action must cite "based_on_positive_drivers" and/or "based_on_key_concerns", the 0-based index/indices into those arrays that justify it. Do not invent a recommendation that has no finding behind it.

EVIDENCE HONESTY, non-negotiable:
- This data is a snapshot, not a time series. Never claim a topic is "growing", "trending", "gaining momentum" or any other claim implying change over time, the evidence above cannot support that. "notable_topics" should describe what is being discussed and why it matters, grounded in mention count and sentiment, never in a rate of change.
- Treat any market's figures with visible caution if its mention count is small (single digits or low tens against the totals above), a percentage from a handful of mentions is not a robust finding. Either say so explicitly when you cite it ("based on a small number of mentions") or leave it out rather than stating it with unwarranted confidence.

EVIDENCE SPECIFICITY, non-negotiable — do not let one colourful quote become "what fans want":
- The quotes above are a small sample, not a census. If only one or two quotes raise a specific named idea, product or execution (e.g. a particular kind of event, programme or initiative), do not present that specific idea as the reason for a broader percentage or as something "fans" plural are asking for. Either describe the underlying theme it belongs to (e.g. "community investment", "grassroots funding") which the wider percentage actually supports, or explicitly attribute it to a single voice ("one fan suggested...") rather than generalising it.
- A percentage always describes sentiment (positive/negative/neutral), never a specific execution idea. Do not write "X% of mentions were positive, with fans suggesting [specific idea]" unless that specific idea is what multiple mentions in that percentage actually said, not just the most quotable one.
- Every percentage above is computed at one specific level only: overall, per-market (By Market) or per-platform (By Platform) — there is no percentage computed per-topic anywhere in this data. Never attach an overall or market percentage to a specific topic, theme or idea as if it measured sentiment toward that narrower thing, e.g. Germany's overall 64% positive figure describes all German mentions, not sentiment toward youth academies specifically, even if youth academies is a topic mentioned within Germany. When writing about a specific topic, describe it using its mention count and what mentions actually say, never by attaching a percentage that was computed at a different level.
- The mention counts in "By Market" and "By Platform" show how much conversation was captured from each, that is collection volume, not evidence of audience size, popularity or commercial value, a market may simply be easier or harder to monitor. Never describe the market or platform with the most mentions as the "largest audience", "most valuable" or a "priority" on volume alone. A popularity, value or priority claim must come from that market or platform's own sentiment percentages, never from its raw mention count.
- A topic's mention count shows how much it was discussed, nothing else. It does not by itself establish what that discussion means, whether it was positive or negative, or that it is evidence the brand is performing a particular role. Do not write "[topic] was the most-discussed topic, reflecting positive sentiment toward [a specific role or benefit, e.g. enhancing the experience]" unless the mentions themselves establish that specific interpretation, topic frequency alone never does, and neither does an overall sentiment percentage borrowed from a different level (see the rule above).
- Before attributing an outcome, concern or behaviour specifically to the brand or entity being researched, check whether the evidence actually connects them, or only describes a general concern in the same topic area (e.g. sponsorship-linked costs generally, not this brand's own pricing decisions specifically). Never state a general concern as if it were this brand's own established causal influence, that invents a relationship the evidence doesn't support. Keep three things visibly distinct in what you write: what the evidence explicitly says, what can plausibly be inferred from it, and what is simply not established, never write the third as if it were the first.
- Every recommendation must pass a test before it can name a specific execution (a particular initiative, format or programme): does the evidence show fans actually raised or responded to that specific thing across multiple mentions, not just one quotable example or a broader theme? If yes, name it, and say so plainly in the rationale. If the evidence only shows a broader theme, sentiment split or concern (e.g. positive sentiment toward sponsorship, or concern about matchday experience) without multiple mentions establishing what specific execution would work, do not invent one, recommend that the client investigate, test or validate specific approaches instead. A specific recommendation is valuable and encouraged when the evidence genuinely supports it, this rule exists to stop invented specificity, not to make every recommendation vague.

Return ONLY valid JSON:
{
  "headline": "One punchy, specific headline summarising the most important finding (max 15 words)",
  "executive_summary": "2-3 sentences. The single most important story in this data. What does this mean for the client?",
  "positive_drivers": [
    "3-5 specific findings, each citing a real percentage or count exactly as computed above, overall, per-market or per-platform, never invented for a single topic. What is driving positive sentiment? E.g. '90% of mentions from Spain were positive, the most positive market tracked, with sponsorship the most-discussed topic there (14 mentions).'"
  ],
  "key_concerns": [
    "3-5 specific concerns, each citing a real percentage or count exactly as computed above. What should the client pay attention to? E.g. '31% of mentions from Great Britain were negative, the highest of any market tracked, with matchday experience a recurring theme among them.'"
  ],
  "notable_topics": [
    "3-4 topics with genuine volume behind them. What are fans discussing and what are they actually saying about it? Written as an insight grounded in mention count and sentiment, not a label, and never framed as growth or momentum."
  ],
  "market_differences": [
    {
      "finding": "A specific, actionable difference between markets, not already covered in positive_drivers or key_concerns. E.g. 'Indian supporters prioritise streaming access and international broadcast rights, while UK fans focus on matchday experience and ticket pricing.'",
      "markets": ["IN", "GB"]
    }
  ],
  "recommended_actions": [
    {
      "action": "A specific action if the evidence directly supports one, otherwise a recommendation to investigate, test or validate specific approaches",
      "rationale": "Why, based on the data",
      "based_on_positive_drivers": [0],
      "based_on_key_concerns": [1]
    }
  ]
}

Write as a senior analyst. Be specific, insightful and commercially relevant. Never write generic observations.`;
}

export async function analyseConversation(searchId: string): Promise<InsightReport> {
  const { data: search } = await supabaseAdmin
    .from("social_searches")
    .select("name, entity_type, research_goal, social_keywords(keyword)")
    .eq("id", searchId)
    .single();

  if (!search) throw new IntelligenceError(404, "Search not found");

  const { data: mentions } = await supabaseAdmin
    .from("social_mentions")
    .select("content, sentiment, topic, subtopic, market, platform, published_at")
    .eq("search_id", searchId)
    .not("sentiment", "is", null)
    .neq("import_source", "synthetic");

  const all = mentions ?? [];
  if (!all.length) throw new IntelligenceError(400, "No classified mentions found for this search.");

  // Build summary stats to send to AI (avoids token limit issues)
  const total    = all.length;
  const positive = all.filter(m => m.sentiment === "Positive").length;
  const neutral  = all.filter(m => m.sentiment === "Neutral").length;
  const negative = all.filter(m => m.sentiment === "Negative").length;

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

  const report = await completeJSON<Omit<InsightReport, "generated_at" | "mention_count" | "sources_summary" | "structured_evidence">>({
    prompt: buildInsightPrompt(
      { name: search.name, entity_type: search.entity_type, research_goal: search.research_goal, keywords },
      summary
    ),
    model:       "gpt-4o",
    temperature: 0.3,
    maxTokens:   2048,
  });

  const dates = all.map(m => m.published_at as string).filter(Boolean).sort();
  const sourcesSummary = {
    platforms:  topPlatforms.map(p => p.platform),
    markets:    topMarkets.map(m => m.market),
    date_range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
  };

  // Reshapes numbers already computed above (never re-derived, never
  // model-generated) into the shared structured-evidence contract — same
  // reasoning as analyseSurvey.ts's own structured_evidence block.
  const structured_evidence: StructuredEvidenceBlock[] = [
    {
      id:                    "sentiment_overall",
      source_type:           "conversation_search",
      source_id:             searchId,
      source_label:          search.name,
      title:                 "Overall sentiment",
      unit:                  "percent",
      suggested_chart_type:  "pie",
      series: [
        { label: "Positive", value: summary.positive_pct },
        { label: "Neutral",  value: summary.neutral_pct },
        { label: "Negative", value: summary.negative_pct },
      ],
    },
    ...(topMarkets.length ? [
      {
        id:                    "positive_by_market",
        source_type:           "conversation_search" as const,
        source_id:             searchId,
        source_label:          search.name,
        title:                 "Positive sentiment by market",
        unit:                  "percent" as const,
        suggested_chart_type:  "bar" as const,
        series:                topMarkets.map(m => ({ label: m.market, value: m.positive_pct })),
      },
      {
        id:                    "negative_by_market",
        source_type:           "conversation_search" as const,
        source_id:             searchId,
        source_label:          search.name,
        title:                 "Negative sentiment by market",
        unit:                  "percent" as const,
        suggested_chart_type:  "bar" as const,
        series:                topMarkets.map(m => ({ label: m.market, value: m.negative_pct })),
      },
      {
        id:                    "mentions_by_market",
        source_type:           "conversation_search" as const,
        source_id:             searchId,
        source_label:          search.name,
        title:                 "Mentions by market",
        unit:                  "count" as const,
        suggested_chart_type:  "bar" as const,
        series:                topMarkets.map(m => ({ label: m.market, value: m.count })),
      },
    ] : []),
    ...(topTopics.length ? [{
      id:                    "top_topics",
      source_type:           "conversation_search" as const,
      source_id:             searchId,
      source_label:          search.name,
      title:                 "Most-discussed topics",
      unit:                  "count" as const,
      suggested_chart_type:  "bar" as const,
      series:                topTopics.map(t => ({ label: t.topic, value: t.count })),
    }] : []),
  ];

  // A hallucinated or out-of-range based_on_positive_drivers /
  // based_on_key_concerns index must never reach storage or the screen as
  // if it were real evidence.
  const recommended_actions = report.recommended_actions.map(a => ({
    ...a,
    based_on_positive_drivers: clampReferences(a.based_on_positive_drivers, report.positive_drivers.length),
    based_on_key_concerns:     clampReferences(a.based_on_key_concerns, report.key_concerns.length),
  }));

  return {
    ...report,
    recommended_actions,
    generated_at: new Date().toISOString(),
    mention_count: total,
    sources_summary: sourcesSummary,
    structured_evidence,
  };
}
