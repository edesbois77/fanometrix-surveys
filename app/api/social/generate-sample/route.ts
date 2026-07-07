// Phase 7 Wave 1 — Two-phase generation:
//   Phase A: Generate RAW mentions (platform, market, author, content, published_at only)
//   Phase B: Pass each mention through the Fanometrix classification engine
//            → sentiment, topic, subtopic, ai_summary
// This validates the classification engine rather than bypassing it.
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { FOOTBALL_TOPICS, buildClassificationPrompt, type Sentiment } from "@/lib/social-taxonomy";

const MAX_COUNT   = 1000;
const GEN_BATCH   = 25;   // mentions per generation call
const CLASS_BATCH = 5;    // mentions per classification batch (avoid rate limits)
const GEN_CONCUR  = 3;    // concurrent generation calls
const CLASS_CONCUR = 4;   // concurrent classification calls

type RawMention = {
  platform:     string;
  market:       string;
  author:       string;
  source_url:   string | null;
  content:      string;
  published_at: string;
};

// ── Market voice profiles ─────────────────────────────────────────────────────
const MARKET_VOICE: Record<string, string> = {
  GB: "British football fan — Premier League, Wembley, local pubs. Passionate about ticket prices, ownership, atmosphere, clubs.",
  DE: "German football fan — Bundesliga, fan ownership (50+1), Stehplatz terraces, affordable football tradition.",
  FR: "French football fan — Ligue 1, PSG dominance debate, regional clubs, national team pride.",
  ES: "Spanish football fan — La Liga, Barça vs Real rivalry, local derbies, passion for tactics.",
  SE: "Swedish football fan — Allsvenskan, grassroots, community clubs, sustainability, youth development.",
  US: "American football (soccer) fan — MLS growth, USMNT, international players, new stadiums, accessibility.",
  IN: "Indian football fan — ISL, streaming access, national team following, merchandise hunger, cricket comparison.",
  CN: "Chinese football fan — CSL, streaming rights, national team, grassroots investment, football culture.",
  BR: "Brazilian football fan — Serie A, iconic clubs, football culture, national team, talent pipeline.",
  MX: "Mexican football fan — Liga MX, rivalry with USA, national team, community passion.",
};

function buildRawGenerationPrompt(
  search: { name: string; entity_type: string; research_goal: string; keywords: string[] },
  count: number,
  platform: string,
  markets: string[],
  seed: number
): string {
  const kwStr      = search.keywords.length ? search.keywords.join(", ") : search.name;
  const today      = new Date().toISOString().slice(0, 10);
  const thirtyAgo  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const marketVoices = markets
    .map(m => MARKET_VOICE[m] ? `${m}: ${MARKET_VOICE[m]}` : m)
    .join("\n");

  const platformGuide = {
    Reddit:  "Conversational, opinionated. Uses phrases like 'honestly', 'tbh', 'as a match-going fan', 'unpopular opinion'. 20-80 words. May start with context like '[r/soccer]' or '[r/PremierLeague]'.",
    YouTube: "Reactive, shorter. Emoji occasionally. References video content like 'this clip', 'the interview', 'saw this yesterday'. 10-40 words.",
    News:    "Formal journalism excerpt. Third-person. References quotes, statistics, fixtures, transfer fees. 40-120 words. Reads like BBC Sport, Sky Sports, The Athletic.",
    X:       "Short, punchy. May use hashtags. Max 25 words. Single strong opinion.",
  }[platform] ?? "Conversational fan comment.";

  return `You are generating RAW synthetic football fan content for the Fanometrix conversation intelligence platform.

Search: "${search.name}"
Entity / Subject: ${kwStr} (${search.entity_type})
Research Goal: ${search.research_goal}
Platform: ${platform}
Markets and fan voices:
${marketVoices}
Date Range: ${thirtyAgo} to ${today}
Variation seed: ${seed}

Platform writing guide for ${platform}:
${platformGuide}

Generate exactly ${count} realistic ${platform} mentions about ${kwStr}.

CRITICAL RULES:
1. Do NOT include any sentiment labels, topic names or AI classification — raw content ONLY
2. Vary sentiment naturally (some fans happy, some critical, some neutral) — do NOT label it
3. Vary markets across: ${markets.join(", ")} — weight distribution naturally
4. Spread dates across the 30-day window, heavier towards recent
5. Use authentic fan vocabulary for each market (not generic English)
6. Cover varied angles: prices, performances, sponsorship, atmosphere, players, transfers, etc.
7. For News: use credible journalism style with specific (invented but plausible) details

Return ONLY a valid JSON array — no markdown, no explanation:
[
  {
    "platform": "${platform}",
    "market": "ISO 2-letter code from [${markets.join(", ")}]",
    "author": "realistic username or journalist name",
    "content": "the raw fan mention text",
    "published_at": "ISO 8601 datetime"
  }
]`;
}

// ── Phase A: Generate raw mentions ────────────────────────────────────────────
async function generateRawBatch(
  search: Parameters<typeof buildRawGenerationPrompt>[0],
  count: number,
  platform: string,
  markets: string[],
  seed: number
): Promise<RawMention[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:       "gpt-4o-mini",
      temperature: 0.9,
      max_tokens:  4096,
      messages:    [{ role: "user", content: buildRawGenerationPrompt(search, count, platform, markets, seed) }],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI generate ${res.status}`);
  const json   = await res.json();
  const raw    = json.choices?.[0]?.message?.content ?? "[]";
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed  = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed.map((m: RawMention) => ({ ...m, source_url: null })) : [];
}

// ── Phase B: Classify through the Fanometrix engine ──────────────────────────
async function classifyMention(content: string): Promise<{
  sentiment: Sentiment; topic: string; subtopic: string | null; ai_summary: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackClassify(content);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini", temperature: 0.1, max_tokens: 256,
        messages: [{ role: "user", content: buildClassificationPrompt(content) }],
      }),
    });
    if (!res.ok) return fallbackClassify(content);
    const json    = await res.json();
    const raw     = json.choices?.[0]?.message?.content ?? "{}";
    const parsed  = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return {
      sentiment:  (["Positive","Neutral","Negative","Unknown"].includes(parsed.sentiment) ? parsed.sentiment : "Unknown") as Sentiment,
      topic:      FOOTBALL_TOPICS.includes(parsed.topic) ? parsed.topic : "Transfers",
      subtopic:   parsed.subtopic ?? null,
      ai_summary: parsed.ai_summary ?? "",
    };
  } catch { return fallbackClassify(content); }
}

function fallbackClassify(content: string): { sentiment: Sentiment; topic: string; subtopic: string | null; ai_summary: string } {
  const lower = content.toLowerCase();
  let sentiment: Sentiment = "Neutral";
  if (/great|love|amazing|brilliant|fantastic|incredible/.test(lower)) sentiment = "Positive";
  if (/awful|terrible|hate|ridiculous|worst|overpriced|poor|not enough/.test(lower)) sentiment = "Negative";
  let topic = "Transfers";
  if (/ticket|season.?pass|membership/.test(lower)) topic = "Ticketing";
  else if (/stream|tv|watch|broadcast/.test(lower)) topic = "Streaming";
  else if (/atmosphere|stadium|matchday/.test(lower)) topic = "Matchday Experience";
  else if (/sponsor|kit|brand/.test(lower)) topic = "Sponsorship";
  return { sentiment, topic, subtopic: null,
    ai_summary: `Fan ${sentiment === "Positive" ? "expresses positive views" : sentiment === "Negative" ? "expresses concerns" : "comments"} about ${topic.toLowerCase()}.` };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let session;
  try { session = await requireUser(req, ["admin"]); } catch (err) { return err as Response; }

  const {
    search_id,
    count: rawCount,
    platform_distribution,  // e.g. { Reddit: 60, YouTube: 30, News: 10 }
  } = await req.json();

  if (!search_id) return NextResponse.json({ error: "search_id is required" }, { status: 400 });

  const count = Math.min(Math.max(parseInt(rawCount) || 100, 10), MAX_COUNT);

  // Load the search + keywords
  const { data: search, error: sErr } = await supabaseAdmin
    .from("social_searches")
    .select("id, name, entity_type, research_goal, markets, platforms, social_keywords(keyword)")
    .eq("id", search_id)
    .single();

  if (sErr || !search) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  const markets  = (search.markets as string[]).length ? (search.markets as string[]) : ["GB"];
  const keywords = (search.social_keywords as { keyword: string }[]).map(k => k.keyword);
  const searchCtx = { name: search.name, entity_type: search.entity_type, research_goal: search.research_goal, keywords };

  // Resolve platform distribution (default by entity type if not provided)
  const rawDist: Record<string, number> = platform_distribution ?? getDefaultDistribution(search.entity_type);
  const totalPct = Object.values(rawDist).reduce((s, v) => s + v, 0);
  const dist: Record<string, number> = {};
  for (const [p, pct] of Object.entries(rawDist)) {
    dist[p] = Math.max(1, Math.round((pct / totalPct) * count));
  }

  // ── PHASE A: Generate raw mentions ─────────────────────────────────────────
  let rawMentions: RawMention[] = [];
  let genErrors = 0;

  for (const [platform, platformCount] of Object.entries(dist)) {
    const batches: number[] = [];
    let remaining = platformCount;
    while (remaining > 0) { batches.push(Math.min(remaining, GEN_BATCH)); remaining -= GEN_BATCH; }

    for (let i = 0; i < batches.length; i += GEN_CONCUR) {
      const chunk   = batches.slice(i, i + GEN_CONCUR);
      const results = await Promise.allSettled(
        chunk.map((size, j) => generateRawBatch(searchCtx, size, platform, markets, i + j + Date.now()))
      );
      for (const r of results) {
        if (r.status === "fulfilled") rawMentions = rawMentions.concat(r.value);
        else { genErrors++; console.error("[generate-sample] gen error:", r.reason); }
      }
    }
  }

  if (!rawMentions.length) return NextResponse.json({ error: "No mentions generated. Check OPENAI_API_KEY." }, { status: 500 });

  // ── PHASE B: Classify through the Fanometrix engine ───────────────────────
  const classified: { raw: RawMention; cls: Awaited<ReturnType<typeof classifyMention>> }[] = [];

  for (let i = 0; i < rawMentions.length; i += CLASS_BATCH * CLASS_CONCUR) {
    const window = rawMentions.slice(i, i + CLASS_BATCH * CLASS_CONCUR);
    const chunks: RawMention[][] = [];
    for (let j = 0; j < window.length; j += CLASS_BATCH) chunks.push(window.slice(j, j + CLASS_BATCH));

    const results = await Promise.allSettled(
      chunks.map(chunk => Promise.all(chunk.map(m => classifyMention(m.content).then(cls => ({ raw: m, cls })))))
    );
    for (const r of results) {
      if (r.status === "fulfilled") classified.push(...r.value);
      else console.error("[generate-sample] classify error:", r.reason);
    }
  }

  // ── Insert into social_mentions ────────────────────────────────────────────
  const inserts = classified.map(({ raw, cls }) => ({
    search_id,
    platform:      raw.platform || "Unknown",
    market:        raw.market   || null,
    author:        raw.author   || null,
    source_url:    raw.source_url || null,
    content:       raw.content,
    published_at:  raw.published_at || null,
    sentiment:     cls.sentiment,
    topic:         cls.topic,
    subtopic:      cls.subtopic,
    ai_summary:    cls.ai_summary,
    import_source: "synthetic",
  }));

  const { error: insertErr } = await supabaseAdmin.from("social_mentions").insert(inserts);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  console.info(`[generate-sample] ${session.workEmail}: generated ${rawMentions.length} raw → ${classified.length} classified for "${search.name}"`);

  return NextResponse.json({
    raw_generated:    rawMentions.length,
    classified:       classified.length,
    inserted:         inserts.length,
    gen_errors:       genErrors,
    platform_counts:  Object.fromEntries(Object.entries(dist)),
  });
}

function getDefaultDistribution(entityType: string): Record<string, number> {
  switch (entityType) {
    case "Club":        return { Reddit: 60, YouTube: 30, News: 10 };
    case "Brand":       return { Reddit: 40, News: 40, YouTube: 20 };
    case "Competition": return { Reddit: 35, News: 45, YouTube: 20 };
    case "Topic":       return { Reddit: 40, News: 30, YouTube: 30 };
    default:            return { Reddit: 40, YouTube: 30, News: 30 };
  }
}
