// Shared Research Aspect classifier — ONE aspect architecture across every
// evidence source (docs/analysis-workspace-blueprint.md step 3). Conversations
// are aspect-classified at collection time (lib/ai-classify.ts, football-shaped);
// surveys and documents have no per-item text to classify at ingest and their
// aspect depends on the PROJECT's research question, so they are classified here,
// lazily at synthesis time, against the SAME research aspects.
//
// It reuses the conversation classifier's contract deliberately: the same
// research-question + primary-subject anchor, the same "materially helps answer
// the question?" relevance test, the same short Title Case aspect label and
// "why this matters" rationale. The one addition is `candidateAspects` — the
// aspects already discovered (e.g. from conversations) are offered as the
// preferred vocabulary so evidence from different sources lands on the SAME
// aspect and genuinely merges, instead of each source inventing near-duplicates.
//
// Source-neutral: it never assumes football, sentiment, topics or entities — it
// judges a piece of evidence text against a research question. No new AI concept;
// the same completeJSON call the analysts already use.
import { completeJSON } from "@/lib/intelligence/openai";

export type AspectClassification = {
  research_aspect: string | null;   // short Title Case facet, or "Off-topic", or null on failure
  relevance: number | null;         // 0–1
  why_this_matters: string | null;
  confidence: "High" | "Medium" | "Low" | null;
};

export type AspectClassifyInput = {
  text: string;                     // the evidence text to classify
  unitLabel: string;                // what it is, e.g. "a survey statistic", "a finding from a research document"
  researchQuestion: string | null;
  primarySubject?: string | null;
  candidateAspects?: string[];      // existing aspects to prefer, for cross-source alignment
};

function buildPrompt(i: AspectClassifyInput): string {
  const candidates = (i.candidateAspects ?? []).filter(Boolean);
  const aspectRule = candidates.length
    ? `Prefer ONE of these existing research aspects if it genuinely fits, so evidence from different sources groups together:\n${candidates.map(a => `- ${a}`).join("\n")}\nOnly propose a NEW short (1–3 word) Title Case label if none of these fit.`
    : `Generate a short (1–3 word) Title Case label that names the facet of the research question this evidence informs.`;

  return `You are a research analyst deciding how a single piece of research evidence bears on a research question.

Research question: "${i.researchQuestion ?? "(not specified)"}"
${i.primarySubject ? `Primary subject — the evidence must engage this to be relevant: "${i.primarySubject}"\n` : ""}
The evidence is ${i.unitLabel}:
"""
${i.text.slice(0, 1200)}
"""

Decide, grounded ONLY in the text above — never invent:
1. relevance (0.0–1.0): does this MATERIALLY HELP ANSWER the research question? Not "does it mention a related topic" — does it provide evidence that bears on the question? If it does not, relevance is near 0.
2. research_aspect: the facet of the research question this evidence informs. ${aspectRule}
   If it is not relevant, use exactly "Off-topic".
3. why_this_matters: one plain sentence on what this evidence contributes to the research question (or why it is off-topic).
4. confidence: "High", "Medium" or "Low" — how confident you are in this classification, given how directly the evidence speaks to the question.

Return ONLY valid JSON:
{ "relevance": 0.0, "research_aspect": "...", "why_this_matters": "...", "confidence": "High" }`;
}

const CONF = new Set(["High", "Medium", "Low"]);

/** Classify one evidence item into a Research Aspect. Never throws — returns
 *  nulls on failure so a single bad item never breaks a synthesis. */
export async function classifyAspect(input: AspectClassifyInput): Promise<AspectClassification> {
  if (!input.text.trim()) return { research_aspect: null, relevance: null, why_this_matters: null, confidence: null };
  try {
    const raw = await completeJSON<{ relevance?: unknown; research_aspect?: unknown; why_this_matters?: unknown; confidence?: unknown }>({
      prompt: buildPrompt(input), model: "gpt-4o-mini", temperature: 0.1, maxTokens: 300,
    });
    const rel = typeof raw.relevance === "number" ? Math.max(0, Math.min(1, raw.relevance)) : null;
    const aspect = typeof raw.research_aspect === "string" ? raw.research_aspect.trim().slice(0, 60) : null;
    const why = typeof raw.why_this_matters === "string" ? raw.why_this_matters.trim() : null;
    const conf = typeof raw.confidence === "string" && CONF.has(raw.confidence) ? (raw.confidence as "High" | "Medium" | "Low") : null;
    return { research_aspect: aspect || null, relevance: rel, why_this_matters: why, confidence: conf };
  } catch {
    return { research_aspect: null, relevance: null, why_this_matters: null, confidence: null };
  }
}

/** Classify many items with bounded concurrency (synthesis-time, admin-triggered,
 *  so a handful of parallel calls is fine; the cap protects rate limits). */
export async function classifyAspects<T>(
  items: T[],
  toInput: (item: T) => AspectClassifyInput,
  concurrency = 6,
): Promise<Map<T, AspectClassification>> {
  const out = new Map<T, AspectClassification>();
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(it => classifyAspect(toInput(it))));
    batch.forEach((it, j) => out.set(it, results[j]));
  }
  return out;
}
