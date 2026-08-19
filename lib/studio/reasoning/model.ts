// ── Research Reasoner — the OpenAI reasoning call (server-only) ───────────────
// The ONE place that calls the reasoning model. o3 is the validated choice (strongest
// practical reasoning quality; gpt-5 timed out, gpt-4o was materially shallower — see the
// Research-Reasoner evaluation report). Returns the parsed structured output plus usage +
// latency provenance. NO chain-of-thought is requested or stored — only the final
// structured answer the API returns. The service injects this (or a fake) so the normal
// test suite never depends on a live model.
import { IntelligenceError } from "@/lib/intelligence/types";

export const REASONER_MODEL = "o3";
export const REASONER_SCHEMA_VERSION = "reasoner-schema-v1";
export const REASONER_PROMPT_VERSION = "reasoner-proto-v2";

export type ReasonerUsage = { promptTokens?: number; completionTokens?: number; totalTokens?: number; reasoningTokens?: number };
export type ReasonerCallResult = { parsed: unknown; usage: ReasonerUsage; latencyMs: number; model: string };
export type ReasonerCaller = (system: string, user: string) => Promise<ReasonerCallResult>;

const REASONING_MODELS = new Set(["o3", "o4-mini", "o1", "gpt-5"]);

/** Real o3 caller. Reasoning models take `max_completion_tokens` and ignore temperature. */
export function makeDefaultReasonerCaller(model: string = REASONER_MODEL, timeoutMs = 180_000): ReasonerCaller {
  return async (system: string, user: string): Promise<ReasonerCallResult> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new IntelligenceError(503, "OPENAI_API_KEY not configured");
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    };
    if (REASONING_MODELS.has(model)) body.max_completion_tokens = 12000;
    else { body.temperature = 0.4; body.max_tokens = 4000; }
    const t = Date.now();
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      // Network error / timeout — transient; let the job framework retry with backoff.
      throw new IntelligenceError(504, `reasoner request failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const latencyMs = Date.now() - t;
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 200);
      // 4xx (bad request/auth/quota) is permanent; 429/5xx is transient. Encode in status.
      throw new IntelligenceError(res.status === 429 || res.status >= 500 ? 502 : 400, `reasoner error ${res.status}: ${text}`);
    }
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown = null;
    try { parsed = JSON.parse(String(raw).replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()); }
    catch { throw new IntelligenceError(422, "reasoner returned unparseable JSON"); }
    const u = json.usage ?? {};
    return {
      parsed,
      usage: { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens, reasoningTokens: u.completion_tokens_details?.reasoning_tokens },
      latencyMs, model,
    };
  };
}
