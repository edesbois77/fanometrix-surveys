// AI classification for a single mention using OpenAI.
// Requires OPENAI_API_KEY in Vercel environment variables.
// Falls back to rule-based classification if no key is configured.
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { buildClassificationPrompt, FOOTBALL_TOPICS, type Sentiment } from "@/lib/social-taxonomy";

export type ClassificationResult = {
  sentiment:  Sentiment;
  topic:      string;
  subtopic:   string | null;
  ai_summary: string;
};

async function classifyWithOpenAI(content: string): Promise<ClassificationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:       "gpt-4o-mini",
      temperature: 0.1,
      max_tokens:  256,
      messages:    [{ role: "user", content: buildClassificationPrompt(content) }],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);

  const json    = await res.json();
  const raw     = json.choices?.[0]?.message?.content ?? "{}";
  const parsed  = JSON.parse(raw.replace(/```json|```/g, "").trim());

  return {
    sentiment:  (["Positive","Neutral","Negative","Unknown"].includes(parsed.sentiment) ? parsed.sentiment : "Unknown") as Sentiment,
    topic:      FOOTBALL_TOPICS.includes(parsed.topic) ? parsed.topic : "Transfers",
    subtopic:   parsed.subtopic ?? null,
    ai_summary: parsed.ai_summary ?? "Unable to summarise.",
  };
}

/** Simple rule-based fallback when no OpenAI key is available */
function classifyRuleBased(content: string): ClassificationResult {
  const lower = content.toLowerCase();
  let sentiment: Sentiment = "Neutral";
  if (/\b(great|love|amazing|brilliant|fantastic|excellent)\b/.test(lower)) sentiment = "Positive";
  if (/\b(awful|terrible|hate|ridiculous|worst|disgusting|overpriced|poor)\b/.test(lower)) sentiment = "Negative";

  let topic = "Transfers";
  if (/ticket|season.?pass|membership|hospitality/i.test(lower)) topic = "Ticketing";
  else if (/stream|tv|watch|broadcast/i.test(lower)) topic = "Streaming";
  else if (/transfer|sign|bought|sold|deal/i.test(lower)) topic = "Transfers";
  else if (/atmosphere|stadium|matchday|ground/i.test(lower)) topic = "Matchday Experience";
  else if (/sponsor|kit|brand|logo/i.test(lower)) topic = "Sponsorship";

  return {
    sentiment,
    topic,
    subtopic:   null,
    ai_summary: `Fan ${sentiment === "Positive" ? "expresses positive views" : sentiment === "Negative" ? "expresses concerns" : "comments"} about ${topic.toLowerCase()}.`,
  };
}

export async function POST(req: NextRequest) {
  try { await requireSession(req, ["admin"]); } catch (err) { return err as Response; }

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "content is required" }, { status: 400 });

  try {
    const result = await classifyWithOpenAI(content);
    return NextResponse.json(result);
  } catch {
    // Fallback — still useful without OpenAI key
    return NextResponse.json({ ...classifyRuleBased(content), fallback: true });
  }
}
