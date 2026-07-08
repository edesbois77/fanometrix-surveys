// Server-only. Generic "send a prompt, get parsed JSON back" wrapper for
// the AI Intelligence Layer's analyst functions — the one place that
// calls OpenAI, so future analysts (analyseSurvey(), compareMarkets(),
// etc.) don't each re-implement the same fetch/parse logic.
//
// Unlike lib/ai-classify.ts, this never falls back silently: a
// mis-generated research report has no sensible non-AI substitute, so
// failures are thrown as IntelligenceError for the caller (a route
// handler) to surface to the admin.
import { IntelligenceError } from "@/lib/intelligence/types";

export async function completeJSON<T>(opts: {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new IntelligenceError(503, "OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:       opts.model ?? "gpt-4o",
      temperature: opts.temperature ?? 0.3,
      max_tokens:  opts.maxTokens ?? 2048,
      messages:    [{ role: "user", content: opts.prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new IntelligenceError(502, `OpenAI error: ${res.status} — ${text.slice(0, 200)}`);
  }

  const json    = await res.json();
  const raw     = json.choices?.[0]?.message?.content ?? "{}";
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new IntelligenceError(500, `Failed to parse AI response: ${cleaned.slice(0, 500)}`);
  }
}
