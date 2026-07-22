// Commissioning-synthesis engine (docs/overview-page.md §B.4–§B.6). Reads the
// Understanding + the gathered Existing Intelligence and produces the Overview's
// closing beats — Confidence, the Frontier, and Fanometrix's Recommendation — in
// one grounded pass. It introduces NO new claims: it reasons only over the
// understanding and the findings it is given.
//
// Core principle: the recommendation optimises for the CLIENT'S business outcome,
// never for generating research. Research is a cost to be justified — recommended
// only when it would materially improve the eventual business recommendation. If
// the evidence already supports a confident recommendation, it says so.
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { stripEmDash } from "@/lib/strip-em-dash";
import type { ProjectUnderstanding } from "@/lib/understanding";
import type { ExistingIntelligence } from "@/lib/intelligence/existing/types";
import {
  type KnowledgePosition, type ConfidenceLevel, type ConfidenceDimension,
  type RecommendationOutcome, type KnowledgeGapItem,
} from "@/lib/knowledge-position";

const MODEL = "gpt-4o";

export type KnowledgePositionInput = {
  understanding: ProjectUnderstanding;
  intelligence: ExistingIntelligence;
};

function serialiseIntelligence(intel: ExistingIntelligence): string {
  const lines: string[] = [];
  for (const cat of intel.categories) {
    for (const p of cat.providers) {
      for (const f of p.findings) {
        lines.push(`- [${cat.category} · ${f.strength}] ${f.statement}${f.detail ? ` — ${f.detail}` : ""} (source: ${f.sources.map(s => s.label).join(", ")})`);
      }
    }
  }
  return lines.length ? lines.join("\n") : "(no prior evidence could be genuinely retrieved)";
}

function buildPrompt(input: KnowledgePositionInput): string {
  const u = input.understanding;
  const problem = [
    `Business challenge: ${u.business_challenge.value || "(unclear)"}`,
    `Research question: ${u.research_question.value || "(none)"}`,
    u.objectives.values.length ? `Objectives: ${u.objectives.values.join("; ")}` : "",
    u.target_audience.value ? `Audience: ${u.target_audience.value}` : "",
  ].filter(Boolean).join("\n");

  return `You are a senior research consultant at Fanometrix. You have (1) our understanding of a client's business problem and (2) the existing intelligence we can genuinely evidence about it. Advise the client on the single best NEXT STEP toward a confident BUSINESS RECOMMENDATION.

Your job is NOT to sell research. Research is a means to an end and a cost to be justified. Recommend additional research ONLY when it would MATERIALLY improve the quality of the eventual business recommendation. If the available evidence already supports a confident recommendation, say so plainly.

THE PROBLEM (our understanding):
${problem}

EXISTING INTELLIGENCE WE CAN ALREADY EVIDENCE:
${serialiseIntelligence(input.intelligence)}

Produce, grounded ONLY in the problem + the evidence above (introduce no new facts):

1. confidence — how well we understand the problem GIVEN THE EVIDENCE:
   - overall: "high" | "moderate" | "low"
   - summary: one honest sentence.
   - dimensions: 2-4 key facets of the problem, each { dimension, level (high|moderate|low), basis }. A facet is high only where the evidence genuinely supports it; a facet with no supporting evidence is "low". Ground each basis in the evidence (or note its absence).

2. frontier — the questions that remain genuinely unanswered and would matter to the decision. Method-neutral (never mention surveys, conversations, or any method). Empty array if the evidence is already sufficient.

3. recommendation — the best next step for the client:
   - "ready_to_decide": the evidence already supports a confident business recommendation. Proceed to recommendations.
   - "focused_research": the decision hinges on a SMALL number of specific unknowns that research would materially resolve.
   - "full_research": significant unknowns across the problem; a broader programme is warranted before a confident decision.
   - "refine_understanding": the business challenge itself is too broad or ambiguous to judge readiness — sharpen it first.
   Be CONSERVATIVE about "focused_research"/"full_research": pick them only when research would materially improve the recommendation. Prefer "ready_to_decide" when the evidence is genuinely sufficient. Prefer "refine_understanding" when the problem is too vague to assess.
   - headline: one-line verdict, plain business language.
   - rationale: 2-3 sentences that cite the confidence and the specific gaps. No new facts.

PUNCTUATION: use commas; NEVER use em-dashes or any long dash in any text you write; always a comma instead.

Return ONLY valid JSON:
{
  "confidence": { "overall": "high|moderate|low", "summary": "...", "dimensions": [ { "dimension": "...", "level": "high|moderate|low", "basis": "..." } ] },
  "frontier": [ { "question": "..." } ],
  "recommendation": { "outcome": "ready_to_decide|focused_research|full_research|refine_understanding", "headline": "...", "rationale": "..." }
}`;
}

// ── defensive parsing ─────────────────────────────────────────────────────────
const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const LEVELS: ConfidenceLevel[] = ["high", "moderate", "low"];
const OUTCOMES: RecommendationOutcome[] = ["ready_to_decide", "focused_research", "full_research", "refine_understanding"];
const level = (v: unknown): ConfidenceLevel => { const s = clean(v).toLowerCase(); return (LEVELS as string[]).includes(s) ? (s as ConfidenceLevel) : "low"; };

export async function analyseKnowledgePosition(input: KnowledgePositionInput): Promise<KnowledgePosition> {
  if (!input.understanding?.research_question?.value?.trim() && !input.understanding?.business_challenge?.value?.trim()) {
    throw new IntelligenceError(422, "An understanding of the problem is needed before assessing readiness.");
  }

  const raw = await completeJSON<Record<string, unknown>>({
    prompt: buildPrompt(input), model: MODEL, maxTokens: 1400, temperature: 0.2,
  });

  const conf = (raw.confidence ?? {}) as Record<string, unknown>;
  const dimensions: ConfidenceDimension[] = (Array.isArray(conf.dimensions) ? conf.dimensions : [])
    .map(d => { const r = d as Record<string, unknown>; const dim = clean(r?.dimension); return dim ? { dimension: stripEmDash(dim), level: level(r?.level), basis: stripEmDash(clean(r?.basis)) } : null; })
    .filter((d): d is ConfidenceDimension => !!d).slice(0, 5);

  const frontier: KnowledgeGapItem[] = (Array.isArray(raw.frontier) ? raw.frontier : [])
    .map(g => { const q = clean((g as Record<string, unknown>)?.question); return q ? { question: stripEmDash(q) } : null; })
    .filter((g): g is KnowledgeGapItem => !!g).slice(0, 6);

  const rec = (raw.recommendation ?? {}) as Record<string, unknown>;
  const outcome = ((): RecommendationOutcome => { const s = clean(rec.outcome).toLowerCase(); return (OUTCOMES as string[]).includes(s) ? (s as RecommendationOutcome) : "focused_research"; })();

  return {
    confidence: { overall: level(conf.overall), summary: stripEmDash(clean(conf.summary)), dimensions },
    frontier,
    recommendation: { outcome, headline: stripEmDash(clean(rec.headline)), rationale: stripEmDash(clean(rec.rationale)) },
    generated_at: new Date().toISOString(),
    model: MODEL,
  };
}
