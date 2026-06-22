// CSV import endpoint — saves mentions then AI-classifies each one.
// Expected CSV columns: platform, market, author, source_url, content, published_at
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildClassificationPrompt, FOOTBALL_TOPICS, type Sentiment } from "@/lib/social-taxonomy";

type CsvRow = {
  platform:     string;
  market?:      string;
  author?:      string;
  source_url?:  string;
  content:      string;
  published_at?: string;
};

async function classify(content: string): Promise<{
  sentiment: Sentiment; topic: string; subtopic: string | null; ai_summary: string;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback(content);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini", temperature: 0.1, max_tokens: 256,
        messages: [{ role: "user", content: buildClassificationPrompt(content) }],
      }),
    });
    if (!res.ok) return fallback(content);
    const json   = await res.json();
    const raw    = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return {
      sentiment:  (["Positive","Neutral","Negative","Unknown"].includes(parsed.sentiment) ? parsed.sentiment : "Unknown") as Sentiment,
      topic:      FOOTBALL_TOPICS.includes(parsed.topic) ? parsed.topic : "Transfers",
      subtopic:   parsed.subtopic ?? null,
      ai_summary: parsed.ai_summary ?? "",
    };
  } catch { return fallback(content); }
}

function fallback(content: string) {
  const lower = content.toLowerCase();
  let sentiment: Sentiment = "Neutral";
  if (/great|love|amazing|brilliant|fantastic/.test(lower)) sentiment = "Positive";
  if (/awful|terrible|hate|ridiculous|worst|overpriced|poor/.test(lower)) sentiment = "Negative";
  let topic = "Transfers";
  if (/ticket|season.?pass|membership/.test(lower))      topic = "Ticketing";
  else if (/stream|tv|watch|broadcast/.test(lower))      topic = "Streaming";
  else if (/atmosphere|stadium|matchday/.test(lower))    topic = "Matchday Experience";
  else if (/sponsor|kit|brand/.test(lower))              topic = "Sponsorship";
  return { sentiment, topic, subtopic: null as string | null,
    ai_summary: `Fan ${sentiment === "Positive" ? "expresses positive views" : sentiment === "Negative" ? "expresses concerns" : "comments"} about ${topic.toLowerCase()}.` };
}

export async function POST(req: NextRequest) {
  try { await requireSession(req, ["admin"]); } catch (err) { return err as Response; }

  const body = await req.json();
  const { rows, search_id }: { rows: CsvRow[]; search_id?: string } = body;

  if (!rows?.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 });

  let saved = 0, failed = 0;
  const BATCH = 5; // classify in small batches to avoid rate limits

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const classified = await Promise.all(batch.map(r => classify(r.content)));

    const inserts = batch.map((r, j) => ({
      search_id:    search_id ?? null,
      platform:     r.platform || "Unknown",
      market:       r.market   || null,
      author:       r.author   || null,
      source_url:   r.source_url || null,
      content:      r.content,
      published_at: r.published_at || null,
      sentiment:    classified[j].sentiment,
      topic:        classified[j].topic,
      subtopic:     classified[j].subtopic,
      ai_summary:   classified[j].ai_summary,
      import_source: "manual_csv",
    }));

    const { error } = await supabaseAdmin.from("social_mentions").insert(inserts);
    if (error) { failed += batch.length; } else { saved += batch.length; }
  }

  return NextResponse.json({ saved, failed });
}
