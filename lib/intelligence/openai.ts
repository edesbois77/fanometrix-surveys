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

export type CompleteJSONImage = {
  /** A data URL (data:image/png;base64,...) — never a remote URL, since
   * every caller today passes a page image rendered server-side, never a
   * pre-hosted one. */
  dataUrl: string;
  /** "high" is the default: reading small printed folio numbers and chart
   * values reliably needs it — "low" downscales aggressively enough to
   * make that kind of legibility unreliable. Callers that don't need
   * fine-grained reading (rare) can opt into "low" to cut cost. */
  detail?: "low" | "high" | "auto";
};

export async function completeJSON<T>(opts: {
  prompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** When present, sends a multimodal message (text + images) instead of
   * a plain string — the one addition needed for vision-based analysis
   * (Research Library's visual document analysis) to reuse this same
   * wrapper rather than a parallel OpenAI-calling code path. */
  images?: CompleteJSONImage[];
}): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new IntelligenceError(503, "OPENAI_API_KEY not configured");

  const content = opts.images?.length
    ? [
        { type: "text", text: opts.prompt },
        ...opts.images.map(img => ({ type: "image_url", image_url: { url: img.dataUrl, detail: img.detail ?? "high" } })),
      ]
    : opts.prompt;

  const body = JSON.stringify({
    model:           opts.model ?? "gpt-4o",
    temperature:     opts.temperature ?? 0.3,
    max_tokens:      opts.maxTokens ?? 2048,
    // Every caller already asks for "ONLY valid JSON" in the prompt
    // (OpenAI's json_object mode requires the word "json" to appear
    // somewhere in the messages, which all of them satisfy) — this
    // makes that a guarantee from the API instead of a convention the
    // model can drift from. The markdown-fence strip below stays as a
    // defensive no-op: harmless if the response is already clean JSON,
    // still useful if a future prompt or model swap doesn't honour the
    // flag.
    response_format: { type: "json_object" },
    messages:        [{ role: "user", content }],
  });

  // Bounded retry on transient failures — a 429 (rate/TPM limit) or a 5xx
  // is not a bad prompt, it is a "try again shortly" signal, and without
  // this a caller that fires several completions in a burst (the Full
  // Research Report runs its per-theme deep-dives in parallel and then a
  // synthesis call immediately after) can have one call silently rejected
  // and degrade to a fallback. Retries are few and backoff is short,
  // honouring the server's own Retry-After when given; a genuine 4xx (bad
  // request, auth, quota) is NOT retried — it would only fail again.
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const MAX_ATTEMPTS = 4;
  let res: Response | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body,
    });
    if (res.ok || !RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) break;
    lastErr = (await res.text()).slice(0, 200);
    // Prefer the server's Retry-After (seconds) when present — a 429 from
    // OpenAI's TPM limit often carries a real multi-second cooldown, and a
    // shorter guess just burns another rejected attempt; otherwise fall
    // back to exponential backoff (0.8s, 1.6s, 3.2s) with a little jitter.
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 800 * 2 ** (attempt - 1) + Math.floor(Math.random() * 200);
    await new Promise(r => setTimeout(r, waitMs));
  }

  if (!res || !res.ok) {
    const text = res ? await res.text().catch(() => lastErr) : lastErr;
    throw new IntelligenceError(502, `OpenAI error: ${res?.status ?? "no response"}, ${text.slice(0, 200)}`);
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
