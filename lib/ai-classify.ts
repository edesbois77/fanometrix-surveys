// Shared AI classification helper — OpenAI with a rule-based fallback.
// Requires OPENAI_API_KEY in Vercel environment variables; without it (or
// on any failure), falls back to keyword heuristics so callers always get
// a usable result and never have to handle a thrown error.
import { buildClassificationPrompt, FOOTBALL_TOPICS, type Sentiment, type ClassificationContext } from "@/lib/social-taxonomy";

export type ClassificationEntity = { name: string; type: string };
export type ConfidenceLabel = "High" | "Medium" | "Low";

export type ClassificationResult = {
  sentiment:  Sentiment;
  topic:      string;
  subtopic:   string | null;
  ai_summary: string;
  entities:   ClassificationEntity[];
  relevance:  number | null;        // 0.0–1.0 question relevance; null = not judged (fallback)
  relevance_rationale: string | null; // "Why this matters" — 1–2 sentences of research value
  research_aspect: string | null;   // facet of the research (a defined aspect when needs are supplied)
  information_need: string | null;  // the specific Information Need this conversation best answers
  confidence: number;               // 0.0–1.0 numeric certainty
  confidence_label: ConfidenceLabel; // derived High / Medium / Low, for display
};

const clamp01 = (v: unknown, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : dflt;
};

// The three-level confidence a researcher reads, derived from the model's
// numeric certainty. One definition so every surface labels it identically.
export function confidenceLabel(confidence: number): ConfidenceLabel {
  return confidence >= 0.75 ? "High" : confidence >= 0.45 ? "Medium" : "Low";
}

function parseEntities(raw: unknown): ClassificationEntity[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is { name: string; type?: unknown } => !!e && typeof (e as { name?: unknown }).name === "string")
    .map(e => ({ name: e.name.trim(), type: typeof e.type === "string" ? e.type : "Topic" }))
    .filter(e => e.name.length > 0)
    .slice(0, 12);
}

async function classifyWithOpenAI(content: string, context?: ClassificationContext): Promise<ClassificationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:       "gpt-4o-mini",
      temperature: 0.1,
      max_tokens:  500,
      messages:    [{ role: "user", content: buildClassificationPrompt(content, context) }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);

  const json   = await res.json();
  const raw    = json.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());

  const confidence = clamp01(parsed.confidence, 0.5);
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  // "Why this matters" — prefer the new field, fall back to the old name.
  const rationale = str(parsed.why_this_matters) ?? str(parsed.relevance_rationale);
  const aspect = str(parsed.research_aspect);
  const isOffTopic = !!aspect && aspect.toLowerCase() === "off-topic";
  const need = str(parsed.information_need);
  return {
    sentiment:  (["Positive","Neutral","Negative","Unknown"].includes(parsed.sentiment) ? parsed.sentiment : "Unknown") as Sentiment,
    topic:      FOOTBALL_TOPICS.includes(parsed.topic) ? parsed.topic : "Transfers",
    subtopic:   parsed.subtopic ?? null,
    ai_summary: parsed.ai_summary ?? "Unable to summarise.",
    entities:   parseEntities(parsed.entities),
    relevance:  clamp01(parsed.relevance, 0.5),
    relevance_rationale: rationale,
    research_aspect: aspect && !isOffTopic ? aspect.slice(0, 60) : (aspect ? "Off-topic" : null),
    // No need is recorded for off-topic evidence.
    information_need: isOffTopic ? null : (need ? need.slice(0, 300) : null),
    confidence,
    confidence_label: confidenceLabel(confidence),
  };
}

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
    entities:   [],
    // A rule-based fallback CANNOT judge question relevance — leave it unscored
    // (null) so the Evidence view never hides it on a guess. No rationale/aspect.
    relevance:  null,
    relevance_rationale: null,
    research_aspect: null,
    information_need: null,
    confidence: 0.3,    // low: rule-based, not model-derived
    confidence_label: "Low",
  };
}

export async function classifyContent(content: string, context?: ClassificationContext): Promise<ClassificationResult> {
  try {
    return await classifyWithOpenAI(content, context);
  } catch {
    return classifyRuleBased(content);
  }
}
