// Conversation mention generator for the Simulation engine. Extends
// the two-phase pipeline in app/api/social/generate-sample/route.ts
// unchanged in structure — raw content generation, then routed through
// the real classification engine — with one addition: the tone preset
// steers the raw-content prompt's sentiment mix (lib/simulation/tone-
// presets.ts's tonePromptDescriptor). Classification itself (Phase B)
// is untouched, since the whole point of the two-phase design is that
// it stays genuine, not shortcut. Written directly to social_mentions
// — never reachable through collect-reddit or mentions/import (Phase 3
// closed those paths for a simulated search).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { FOOTBALL_TOPICS, buildClassificationPrompt, type Sentiment } from "@/lib/social-taxonomy";
import { tonePromptDescriptor, type TonePreset } from "@/lib/simulation/tone-presets";

const GEN_BATCH    = 25;
const CLASS_BATCH  = 5;
const GEN_CONCUR   = 3;
const CLASS_CONCUR = 4;

type RawMention = {
  platform:     string;
  market:       string;
  author:       string;
  source_url:   string | null;
  content:      string;
  published_at: string;
};

const MARKET_VOICE: Record<string, string> = {
  GB: "British football fan, Premier League, Wembley, local pubs. Passionate about ticket prices, ownership, atmosphere, clubs.",
  DE: "German football fan, Bundesliga, fan ownership (50+1), Stehplatz terraces, affordable football tradition.",
  FR: "French football fan, Ligue 1, PSG dominance debate, regional clubs, national team pride.",
  ES: "Spanish football fan, La Liga, Barça vs Real rivalry, local derbies, passion for tactics.",
  SE: "Swedish football fan, Allsvenskan, grassroots, community clubs, sustainability, youth development.",
  US: "American football (soccer) fan, MLS growth, USMNT, international players, new stadiums, accessibility.",
  IN: "Indian football fan, ISL, streaming access, national team following, merchandise hunger, cricket comparison.",
  CN: "Chinese football fan, CSL, streaming rights, national team, grassroots investment, football culture.",
  BR: "Brazilian football fan, Serie A, iconic clubs, football culture, national team, talent pipeline.",
  MX: "Mexican football fan, Liga MX, rivalry with USA, national team, community passion.",
};

function buildRawGenerationPrompt(
  topic: string,
  tonePreset: TonePreset,
  count: number,
  platform: string,
  markets: string[],
  seed: number
): string {
  const today     = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const marketVoices = markets
    .map(m => MARKET_VOICE[m] ? `${m}: ${MARKET_VOICE[m]}` : m)
    .join("\n");

  const platformGuide = {
    Reddit:  "Conversational, opinionated. Uses phrases like 'honestly', 'tbh', 'as a match-going fan', 'unpopular opinion'. 20-80 words. May start with context like '[r/soccer]' or '[r/PremierLeague]'.",
    YouTube: "Reactive, shorter. Emoji occasionally. References video content like 'this clip', 'the interview', 'saw this yesterday'. 10-40 words.",
    News:    "Formal journalism excerpt. Third-person. References quotes, statistics, fixtures, transfer fees. 40-120 words. Reads like BBC Sport, Sky Sports, The Athletic.",
    X:       "Short, punchy. May use hashtags. Max 25 words. Single strong opinion.",
  }[platform] ?? "Conversational fan comment.";

  return `You are generating RAW synthetic football fan content for the Fanometrix conversation intelligence platform, for a simulated research scenario used in sales/training demonstrations.

Topic: ${topic}
Platform: ${platform}
Markets and fan voices:
${marketVoices}
Date Range: ${thirtyAgo} to ${today}
Variation seed: ${seed}

${tonePromptDescriptor(tonePreset)}

Platform writing guide for ${platform}:
${platformGuide}

Generate exactly ${count} realistic ${platform} mentions about ${topic}.

CRITICAL RULES:
1. Do NOT include any sentiment labels, topic names or AI classification, raw content ONLY
2. Follow the requested overall sentiment mix above, do NOT label it in the content
3. Vary markets across: ${markets.join(", ")}, weight distribution naturally
4. Spread dates across the 30-day window, heavier towards recent
5. Use authentic fan vocabulary for each market (not generic English)
6. Cover varied angles relevant to the topic: prices, performances, sponsorship, atmosphere, players, transfers, etc.
7. For News: use credible journalism style with specific (invented but plausible) details

Return ONLY a valid JSON array, no markdown, no explanation:
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

async function generateRawBatch(
  topic: string, tonePreset: TonePreset, count: number, platform: string, markets: string[], seed: number
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
      messages:    [{ role: "user", content: buildRawGenerationPrompt(topic, tonePreset, count, platform, markets, seed) }],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI generate ${res.status}`);
  const json    = await res.json();
  const raw     = json.choices?.[0]?.message?.content ?? "[]";
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed  = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed.map((m: RawMention) => ({ ...m, source_url: null })) : [];
}

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
    const json   = await res.json();
    const raw    = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
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

function defaultPlatformDistribution(count: number): Record<string, number> {
  const raw = { Reddit: 40, News: 30, YouTube: 30 };
  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  return Object.fromEntries(Object.entries(raw).map(([p, pct]) => [p, Math.max(1, Math.round((pct / total) * count))]));
}

export type GenerateConversationMentionsInput = {
  searchId: string;           // social_searches.id — must already exist, is_simulated=true
  evidenceSimulationId: string;
  count: number;
  tonePreset: TonePreset;
  topic: string;
  markets: string[];
};

async function classifyAndInsert(
  input: GenerateConversationMentionsInput, rawMentions: RawMention[]
): Promise<number> {
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
      else console.error("[simulation] mention classification error:", r.reason);
    }
  }

  if (!classified.length) return 0;

  const inserts = classified.map(({ raw, cls }) => ({
    search_id:              input.searchId,
    evidence_simulation_id: input.evidenceSimulationId,
    platform:               raw.platform || "Unknown",
    market:                 raw.market   || null,
    author:                 raw.author   || null,
    source_url:             raw.source_url || null,
    content:                raw.content,
    published_at:           raw.published_at || null,
    sentiment:               cls.sentiment,
    topic:                   cls.topic,
    subtopic:                cls.subtopic,
    ai_summary:              cls.ai_summary,
    import_source:           "simulation",
    is_simulated:            true,
  }));

  const { error } = await supabaseAdmin.from("social_mentions").insert(inserts);
  if (error) throw new Error(`Failed to insert simulated mentions: ${error.message}`);
  return inserts.length;
}

export async function generateConversationMentions(input: GenerateConversationMentionsInput): Promise<{
  raw_generated: number; classified: number; inserted: number; gen_errors: number;
}> {
  const markets = input.markets.length ? input.markets : ["GB"];
  const dist = defaultPlatformDistribution(input.count);

  let rawGenerated = 0;
  let inserted = 0;
  let genErrors = 0;

  for (const [platform, platformCount] of Object.entries(dist)) {
    const batches: number[] = [];
    let remaining = platformCount;
    while (remaining > 0) { batches.push(Math.min(remaining, GEN_BATCH)); remaining -= GEN_BATCH; }

    for (let i = 0; i < batches.length; i += GEN_CONCUR) {
      const chunk   = batches.slice(i, i + GEN_CONCUR);
      const results = await Promise.allSettled(
        chunk.map((size, j) => generateRawBatch(input.topic, input.tonePreset, size, platform, markets, i + j + Date.now()))
      );
      const rawChunk: RawMention[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") rawChunk.push(...r.value);
        else { genErrors++; console.error("[simulation] mention generation error:", r.reason); }
      }
      rawGenerated += rawChunk.length;

      // Classify and write this chunk immediately rather than waiting for
      // every platform to finish generating — social_mentions' row count
      // then grows in real time as work completes (instead of sitting at
      // 0 for the entire run and jumping to `count` in one shot at the
      // very end), so the Showroom's progress bar reflects genuine
      // progress rather than a guess.
      if (rawChunk.length) inserted += await classifyAndInsert(input, rawChunk);
    }
  }

  if (!rawGenerated) throw new Error("No mentions generated. Check OPENAI_API_KEY.");

  return { raw_generated: rawGenerated, classified: inserted, inserted, gen_errors: genErrors };
}
