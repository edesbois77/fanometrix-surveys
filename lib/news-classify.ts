// Article classification — the News sibling of lib/ai-classify.ts.
//
// Same contract as classifyContent(): OpenAI first, never throws, always returns
// something usable. The difference is WHAT it returns. Alongside the shared
// fields the collection pipeline already stores (sentiment, relevance, aspect,
// need, summary, entities) it returns the news provenance fields that keep an
// article honest on its way into Analysis — what kind of statement it is, who is
// making the claim, whether the claim is established, and whether the article
// contains any actual evidence of fan reaction.
//
// The fallback is deliberately unhelpful. Where the conversation classifier can
// guess sentiment from keywords, there is no rule-based way to tell a press
// release from reporting, and getting that wrong is exactly the failure the news
// safeguards exist to prevent. So without a model the article is stored
// UNJUDGED: relevance null (nothing is hidden on a guess) and source_type
// "unclear" (nothing is asserted on a guess).
import type { ClassificationResult, ClassificationEntity } from "@/lib/ai-classify";
import { confidenceLabel } from "@/lib/ai-classify";
import {
  buildNewsClassificationPrompt, asNewsSourceType, asClaimBasis,
  type NewsClassificationContext, type NewsSourceType, type NewsClaimBasis,
} from "@/lib/news-taxonomy";
import type { Sentiment } from "@/lib/social-taxonomy";

/** Whether the article carries any actual evidence of fan reaction. "none" is
 *  the default and the safe answer: it is what forbids synthesis from talking
 *  about fans on the strength of this article. */
export const FAN_EVIDENCE_LEVELS = ["none", "reported", "quoted"] as const;
export type FanEvidenceLevel = (typeof FAN_EVIDENCE_LEVELS)[number];

/** The news-only fields. Stored on the mention's metadata, so no schema change:
 *  social_mentions.metadata is jsonb and already carries per-connector fields. */
export type NewsProvenance = {
  source_type: NewsSourceType;
  attribution: string | null;
  claim_basis: NewsClaimBasis;
  fan_evidence: FanEvidenceLevel;
  fan_evidence_note: string | null;
  outcome_claimed: string | null;
  /** False when no model was available, so downstream can tell "we judged this
   *  and found nothing" from "we never judged it". */
  classified: boolean;
};

export type ArticleClassification = ClassificationResult & { news: NewsProvenance };

const clamp01 = (v: unknown, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : dflt;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function parseEntities(raw: unknown): ClassificationEntity[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is { name: string; type?: unknown } => !!e && typeof (e as { name?: unknown }).name === "string")
    .map(e => ({ name: e.name.trim(), type: typeof e.type === "string" ? e.type : "Topic" }))
    .filter(e => e.name.length > 0)
    .slice(0, 12);
}

function asFanEvidence(v: unknown): FanEvidenceLevel {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (FAN_EVIDENCE_LEVELS as readonly string[]).includes(s) ? (s as FanEvidenceLevel) : "none";
}

const UNJUDGED: ArticleClassification = {
  sentiment: "Unknown",
  topic: null,
  subtopic: null,
  ai_summary: "Not yet assessed — no classifier was available for this article.",
  entities: [],
  relevance: null,            // never hide an article on a guess
  relevance_rationale: null,
  research_aspect: null,
  information_need: null,
  confidence: 0,
  confidence_label: "Low",
  news: {
    source_type: "unclear",   // never assert a source type on a guess
    attribution: null,
    claim_basis: "not_applicable",
    fan_evidence: "none",
    fan_evidence_note: null,
    outcome_claimed: null,
    classified: false,
  },
};

async function classifyWithOpenAI(content: string, context?: NewsClassificationContext): Promise<ArticleClassification> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildNewsClassificationPrompt(content, context) }],
    }),
    signal: AbortSignal.timeout(Number(process.env.OPENAI_TIMEOUT_MS) || 60_000),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);

  const json = await res.json();
  const parsed = JSON.parse(String(json.choices?.[0]?.message?.content ?? "{}").replace(/```json|```/g, "").trim());

  const confidence = clamp01(parsed.confidence, 0.5);
  const aspect = str(parsed.research_aspect);
  const isOffTopic = !!aspect && aspect.toLowerCase() === "off-topic";
  const need = str(parsed.information_need);
  const fanEvidence = asFanEvidence(parsed.fan_evidence);

  return {
    // Coverage tone, NOT audience sentiment. The distinction is carried in the
    // prompt, in the UI label and in the attribution rules; the column is shared
    // with conversation evidence only because it stores the same three values.
    sentiment: (["Positive", "Neutral", "Negative", "Unknown"].includes(parsed.sentiment) ? parsed.sentiment : "Unknown") as Sentiment,
    // The legacy football vocabulary is not applied to articles. research_aspect
    // is the taxonomy that matters and it comes from the research itself.
    topic: null,
    subtopic: null,
    ai_summary: str(parsed.ai_summary) ?? "Unable to summarise.",
    entities: parseEntities(parsed.entities),
    relevance: clamp01(parsed.relevance, 0.5),
    relevance_rationale: str(parsed.why_this_matters),
    research_aspect: aspect && !isOffTopic ? aspect.slice(0, 60) : (aspect ? "Off-topic" : null),
    information_need: isOffTopic ? null : (need ? need.slice(0, 300) : null),
    confidence,
    confidence_label: confidenceLabel(confidence),
    news: {
      source_type: asNewsSourceType(parsed.source_type),
      attribution: str(parsed.attribution)?.slice(0, 200) ?? null,
      claim_basis: asClaimBasis(parsed.claim_basis),
      fan_evidence: fanEvidence,
      fan_evidence_note: fanEvidence === "none" ? null : str(parsed.fan_evidence_note)?.slice(0, 400) ?? null,
      outcome_claimed: str(parsed.outcome_claimed)?.slice(0, 400) ?? null,
      classified: true,
    },
  };
}

export async function classifyArticle(content: string, context?: NewsClassificationContext): Promise<ArticleClassification> {
  try {
    return await classifyWithOpenAI(content, context);
  } catch {
    return { ...UNJUDGED, news: { ...UNJUDGED.news } };
  }
}
