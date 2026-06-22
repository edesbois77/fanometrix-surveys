// Generates synthetic football fan mentions for a search using AI.
// Each batch asks the model to produce content + classification together,
// saving a second API round-trip per mention.
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { FOOTBALL_TOPICS } from "@/lib/social-taxonomy";

const BATCH_SIZE = 25;   // mentions per OpenAI call
const MAX_COUNT  = 500;
const CONCURRENT = 3;    // parallel batches

type GeneratedMention = {
  platform:     string;
  market:       string;
  author:       string;
  content:      string;
  published_at: string;
  sentiment:    string;
  topic:        string;
  subtopic:     string | null;
  ai_summary:   string;
};

function buildPrompt(search: {
  name: string;
  entity_type: string;
  research_goal: string;
  keywords: string[];
  markets: string[];
  platforms: string[];
}, count: number, seed: number): string {
  const keywordStr = search.keywords.length
    ? search.keywords.join(", ")
    : search.name;

  const marketStr = search.markets.length
    ? search.markets.join(", ")
    : "GB, DE, FR, ES, SE, US";

  const platformStr = (search.platforms.length ? search.platforms : ["Reddit", "YouTube", "News"])
    .filter(p => ["Reddit","YouTube","News","X"].includes(p))
    .join(", ") || "Reddit, YouTube, News";

  const today = new Date();
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0,10);

  return `You are generating a realistic synthetic dataset of football fan conversations for the Fanometrix conversation intelligence platform.

Search: "${search.name}"
Entity Type: ${search.entity_type}
Research Goal: ${search.research_goal}
Keywords / Subjects: ${keywordStr}
Markets: ${marketStr}
Platforms: ${platformStr}
Date Range: ${thirtyAgo} to ${today.toISOString().slice(0,10)}
Variation seed: ${seed}

Generate exactly ${count} realistic football fan mentions. Return ONLY a valid JSON array — no markdown, no explanation.

Each item must have these exact fields:
{
  "platform": "Reddit" | "YouTube" | "News" | "X",
  "market": one of [${marketStr}],
  "author": "realistic username or author name",
  "content": "realistic fan comment, post or article excerpt (20-120 words)",
  "published_at": "ISO 8601 datetime within the date range above",
  "sentiment": "Positive" | "Neutral" | "Negative",
  "topic": one of [${FOOTBALL_TOPICS.map(t => `"${t}"`).join(", ")}],
  "subtopic": specific subtopic string or null,
  "ai_summary": "one sentence analyst summary starting with 'Fans' or 'Fan'"
}

Distribution requirements (vary these naturally — do NOT make them exactly equal):
- Sentiments: roughly 40% Positive, 35% Neutral, 25% Negative
- Platforms: vary across ${platformStr}
- Markets: vary across the listed markets, weigh GB and DE more heavily
- Topics: vary across the football taxonomy, focus on topics relevant to "${keywordStr}"
- Dates: spread across the full 30-day range, heavier towards recent days

Platform voice:
- Reddit: conversational, opinionated, uses phrases like "honestly", "tbh", "as a fan"
- YouTube: shorter, emoji-friendly, reactive to video content
- News: formal excerpt style from football journalism, third-person
- X: short, punchy, may use hashtags

Ensure variety across all ${count} items. Do not repeat content verbatim.`;
}

async function generateBatch(
  search: Parameters<typeof buildPrompt>[0],
  count: number,
  seed: number
): Promise<GeneratedMention[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:       "gpt-4o-mini",
      temperature: 0.9,    // high temperature for variety
      max_tokens:  4000,
      messages:    [{ role: "user", content: buildPrompt(search, count, seed) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const raw  = json.choices?.[0]?.message?.content ?? "[]";

  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed  = JSON.parse(cleaned);
  return Array.isArray(parsed) ? parsed : [];
}

export async function POST(req: NextRequest) {
  let session;
  try { session = await requireSession(req, ["admin"]); } catch (err) { return err as Response; }

  const { search_id, count: rawCount } = await req.json();
  if (!search_id) return NextResponse.json({ error: "search_id is required" }, { status: 400 });

  const count = Math.min(Math.max(parseInt(rawCount) || 100, 10), MAX_COUNT);

  // Load the search + keywords
  const { data: search, error: sErr } = await supabaseAdmin
    .from("social_searches")
    .select("id, name, entity_type, research_goal, markets, platforms, social_keywords(keyword)")
    .eq("id", search_id)
    .single();

  if (sErr || !search) return NextResponse.json({ error: "Search not found" }, { status: 404 });

  const searchCtx = {
    name:          search.name,
    entity_type:   search.entity_type,
    research_goal: search.research_goal,
    markets:       search.markets as string[],
    platforms:     search.platforms as string[],
    keywords:      (search.social_keywords as { keyword: string }[]).map(k => k.keyword),
  };

  // Split count into batches
  const batchSizes: number[] = [];
  let remaining = count;
  while (remaining > 0) {
    batchSizes.push(Math.min(remaining, BATCH_SIZE));
    remaining -= BATCH_SIZE;
  }

  // Run batches with concurrency limit
  let allMentions: GeneratedMention[] = [];
  let errors = 0;

  for (let i = 0; i < batchSizes.length; i += CONCURRENT) {
    const chunk = batchSizes.slice(i, i + CONCURRENT);
    const results = await Promise.allSettled(
      chunk.map((size, j) => generateBatch(searchCtx, size, i + j + Date.now()))
    );
    for (const r of results) {
      if (r.status === "fulfilled") allMentions = allMentions.concat(r.value);
      else { errors++; console.error("[generate-sample] batch error:", r.reason); }
    }
  }

  if (!allMentions.length) {
    return NextResponse.json({ error: "No mentions generated. Check your OPENAI_API_KEY." }, { status: 500 });
  }

  // Insert into social_mentions
  const inserts = allMentions.map(m => ({
    search_id:     search_id,
    platform:      m.platform     || "Unknown",
    market:        m.market       || null,
    author:        m.author       || null,
    source_url:    null,
    content:       m.content      || "",
    published_at:  m.published_at || null,
    sentiment:     ["Positive","Neutral","Negative","Unknown"].includes(m.sentiment) ? m.sentiment : "Unknown",
    topic:         FOOTBALL_TOPICS.includes(m.topic as typeof FOOTBALL_TOPICS[number]) ? m.topic : null,
    subtopic:      m.subtopic     || null,
    ai_summary:    m.ai_summary   || null,
    import_source: "synthetic",
  }));

  const { error: insertErr } = await supabaseAdmin.from("social_mentions").insert(inserts);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  console.info(`[generate-sample] ${session.username} generated ${inserts.length} mentions for search "${search.name}"`);

  return NextResponse.json({ generated: allMentions.length, inserted: inserts.length, errors });
}
