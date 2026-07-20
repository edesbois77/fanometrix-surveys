// Research Plan advisor — turns a project's Research Question into a methodology
// briefing (docs/research-plan-blueprint.md). Methodology-first: it decides HOW the
// question should be answered across every method (conversation, survey, document,
// news), recommends and briefs each, predicts evidence gaps, and states the
// evidence each theme requires — WITHOUT ever using "confidence" (that is Analysis's
// word, from real evidence). It is a research advisor, not a search generator.
//
// Pure generation — never persists (the route stores via store.ts). Reuses the
// connector/method availability registry so it never recommends a dead source.
import { completeJSON } from "@/lib/intelligence/openai";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { IntelligenceError } from "@/lib/intelligence/types";
import { getMethodAvailability } from "@/lib/method-availability";
import {
  EVIDENCE_METHODS, METHOD_LABEL,
  type ResearchPlan, type EvidenceMethod, type MethodSuitability,
  type RecommendedMethod, type EvidenceTheme, type RequiredEvidence,
  type CoverageCell, type PlanGap, type MethodConfigs, type ConversationIntent, type Coverage,
} from "@/lib/research-plan";

const MODEL = "gpt-4o";
const SUITABILITIES: MethodSuitability[] = ["Well suited", "Partly suited", "Not suited"];
const isMethod = (v: unknown): v is EvidenceMethod => typeof v === "string" && (EVIDENCE_METHODS as string[]).includes(v);

function buildPrompt(question: string, availability: ReturnType<typeof getMethodAvailability>): string {
  const methodsList = availability.map(a =>
    `- ${a.method} (${METHOD_LABEL[a.method]}): ${a.available ? `AVAILABLE — sources: ${a.sources.join(", ") || "n/a"}` : `NOT AVAILABLE — ${a.note}`}`
  ).join("\n");

  return `You are a senior research director at a fan/sports insight consultancy. A client has commissioned research with this question:

"${question}"

Your job is to write the METHODOLOGY BRIEFING — how you would answer this question — BEFORE any evidence is collected. Think like a consultancy agreeing an approach with a client, not like a tool running a search.

The methods available to you, and what each can collect today:
${methodsList}

Decide which methods should be used, why, and what each will and won't contribute. Break the question into 3–6 evidence THEMES (the facets that must be investigated). For each theme, state the evidence that would answer it well, per method, with a rough checkable target where sensible.

Return ONLY valid JSON in EXACTLY this shape:
{
  "objective": "one or two sentences: what this research must establish",
  "hypothesis": "an initial hypothesis the research will test, or null if the question is purely exploratory",
  "assumptions": ["assumptions the methodology rests on, so the client can challenge them"],
  "methodology": {
    "approach": "the methodology in one or two sentences",
    "advisor_note": "the single most important methodological point (e.g. 'conversations give sentiment but a survey is needed to measure how widespread it is')",
    "recommended_methods": [
      {
        "method": "conversation" | "survey" | "document" | "news",
        "recommended": true/false,
        "suitability": "Well suited" | "Partly suited" | "Not suited",
        "why_recommended": "why this method fits THIS question",
        "role": "the role it plays in answering the question",
        "expected_contribution": "what it will bring to the answer",
        "evidence_requirements": "what evidence is needed to answer well (with a rough target where sensible)",
        "limitations": "what it cannot establish, even done well",
        "expected_outputs": "what the client gets from this method if completed"
      }
      // one entry for EVERY method above, available or not
    ]
  },
  "evidence_themes": [
    {
      "theme": "short 1-3 word Title Case label",
      "description": "what this theme is",
      "best_methods": ["conversation", "survey", ...],
      "required_evidence": [ { "method": "conversation", "description": "what evidence answers this theme", "rough_target": "e.g. '>=30 relevant conversations' or null" } ]
    }
  ],
  "method_configs": {
    "conversation": [ { "theme": "<one of the themes>", "research_question": "the specific question this search answers", "search_focus": "plain-language: what it should look for", "sources": ["YouTube", ...] } ],
    "survey":   { "recommended": true/false, "brief": "what a survey should measure and why", "themes": ["..."], "suggested_target": "e.g. '>=200 responses across GB, DE'", "markets": ["GB", ...] },
    "document": { "recommended": true/false, "brief": "what desk research / documents to gather and why", "looking_for": ["..."] },
    "news":     { "recommended": true/false, "brief": "what news coverage would add" }
  },
  "expected_coverage": [ { "theme": "...", "method": "conversation", "coverage": "strong" | "partial" | "none" } ],
  "gaps": [ { "theme": "... or null", "missing": "method" | "source", "message": "what the evidence won't cover", "recommended_action": "what to do about it" } ],
  "expected_outputs": ["what the PROJECT will be able to say/deliver if this methodology is completed"],
  "remaining_limitations": ["what the methodology still won't answer, stated up front"]
}

RULES — read carefully:
- NEVER use the word "confidence" or any numeric confidence. You are judging METHOD SUITABILITY and EXPECTED CONTRIBUTION before evidence exists. Confidence is calculated later, from real evidence, by a different stage.
- Be an honest advisor. If conversations alone cannot answer the question well, say so and recommend adding a survey / documents / news — do NOT paper over a gap by generating more conversation searches.
- Only recommend a method as usable if it is AVAILABLE above. A NOT AVAILABLE method (e.g. news) may still be recommended in principle, but must be flagged and must appear as a gap — never as a generated search.
- method_configs.conversation should exist ONLY if conversation is recommended AND available; one entry per conversation theme.
- Ground everything in the research question. Do not invent findings — you have no evidence yet; you are designing how to get it.
- Plain, confident consultancy prose. No hedging boilerplate, no mention of AI or prompts.`;
}

// ── coercion helpers ─────────────────────────────────────────────────────────
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strOrNull = (v: unknown): string | null => { const s = str(v); return s || null; };
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const methodArr = (v: unknown): EvidenceMethod[] => (Array.isArray(v) ? v.filter(isMethod) : []);
const suitability = (v: unknown): MethodSuitability => (SUITABILITIES.includes(v as MethodSuitability) ? (v as MethodSuitability) : "Partly suited");
const coverage = (v: unknown): Coverage => (v === "strong" || v === "partial" || v === "none" ? v : "none");

type RawPlan = Record<string, unknown>;

export async function analyseResearchPlan(projectId: string): Promise<ResearchPlan> {
  const { data: proj } = await supabaseAdmin
    .from("research_projects").select("research_question").eq("id", projectId).maybeSingle();
  const question = (proj?.research_question as string | null)?.trim();
  if (!question) {
    throw new IntelligenceError(422, "This project has no research question yet. Add one, then generate the Research Plan.");
  }

  const availability = getMethodAvailability();
  const availByMethod = new Map(availability.map(a => [a.method, a]));

  const raw = await completeJSON<RawPlan>({ prompt: buildPrompt(question, availability), model: MODEL, temperature: 0.3, maxTokens: 3200 });

  const rawMethodology = (raw.methodology ?? {}) as Record<string, unknown>;

  // Recommended methods — one per method, availability ENFORCED server-side from
  // the registry (the model may reason but never overrides ground truth).
  const rmByMethod = new Map<EvidenceMethod, Record<string, unknown>>();
  for (const m of (Array.isArray(rawMethodology.recommended_methods) ? rawMethodology.recommended_methods : []) as Record<string, unknown>[]) {
    if (isMethod(m?.method)) rmByMethod.set(m.method, m);
  }
  const recommended_methods: RecommendedMethod[] = EVIDENCE_METHODS.map(method => {
    const m = rmByMethod.get(method) ?? {};
    const avail = availByMethod.get(method)!;
    return {
      method,
      recommended: !!m.recommended,   // a method can be recommended in principle even if unavailable (flagged below)
      suitability: suitability(m.suitability),
      why_recommended: str(m.why_recommended),
      role: str(m.role),
      expected_contribution: str(m.expected_contribution),
      evidence_requirements: str(m.evidence_requirements),
      limitations: str(m.limitations),
      expected_outputs: str(m.expected_outputs),
      available: avail.available,              // ground truth
      availability_note: avail.note,           // ground truth
    };
  });

  const evidence_themes: EvidenceTheme[] = (Array.isArray(raw.evidence_themes) ? raw.evidence_themes : [])
    .map((t: Record<string, unknown>): EvidenceTheme => ({
      theme: str(t?.theme).slice(0, 60),
      description: str(t?.description),
      best_methods: methodArr(t?.best_methods),
      required_evidence: (Array.isArray(t?.required_evidence) ? t.required_evidence : [])
        .map((r: Record<string, unknown>): RequiredEvidence => ({ method: isMethod(r?.method) ? r.method : "conversation", description: str(r?.description), rough_target: strOrNull(r?.rough_target) }))
        .filter(r => r.description.length > 0),
    }))
    .filter(t => t.theme.length > 0);

  // method_configs — conversation intents only when conversation is available.
  const rawConfigs = (raw.method_configs ?? {}) as Record<string, unknown>;
  const conversationAvailable = availByMethod.get("conversation")!.available;
  const conversation: ConversationIntent[] = conversationAvailable
    ? (Array.isArray(rawConfigs.conversation) ? rawConfigs.conversation : [])
        .map((c: Record<string, unknown>): ConversationIntent => ({ theme: str(c?.theme), research_question: str(c?.research_question), search_focus: str(c?.search_focus), sources: strArr(c?.sources) }))
        .filter(c => c.theme.length > 0 && c.research_question.length > 0)
    : [];
  const surveyCfg = rawConfigs.survey as Record<string, unknown> | undefined;
  const documentCfg = rawConfigs.document as Record<string, unknown> | undefined;
  const newsCfg = rawConfigs.news as Record<string, unknown> | undefined;
  const method_configs: MethodConfigs = {
    conversation,
    survey: surveyCfg ? { recommended: !!surveyCfg.recommended, brief: str(surveyCfg.brief), themes: strArr(surveyCfg.themes), suggested_target: strOrNull(surveyCfg.suggested_target), markets: strArr(surveyCfg.markets) } : null,
    document: documentCfg ? { recommended: !!documentCfg.recommended, brief: str(documentCfg.brief), looking_for: strArr(documentCfg.looking_for) } : null,
    news: newsCfg ? { recommended: !!newsCfg.recommended, brief: str(newsCfg.brief), available: false } : null,
  };

  const expected_coverage: CoverageCell[] = (Array.isArray(raw.expected_coverage) ? raw.expected_coverage : [])
    .map((c: Record<string, unknown>): CoverageCell => ({ theme: str(c?.theme), method: isMethod(c?.method) ? c.method : "conversation", coverage: coverage(c?.coverage) }))
    .filter(c => c.theme.length > 0);

  const gaps: PlanGap[] = (Array.isArray(raw.gaps) ? raw.gaps : [])
    .map((g: Record<string, unknown>): PlanGap => ({ theme: strOrNull(g?.theme), missing: g?.missing === "source" ? "source" : "method", message: str(g?.message), recommended_action: str(g?.recommended_action) }))
    .filter(g => g.message.length > 0);

  // Ensure any recommended-but-unavailable method is honestly represented as a gap.
  for (const rm of recommended_methods) {
    if (rm.recommended && !rm.available && !gaps.some(g => g.message.toLowerCase().includes(rm.method))) {
      gaps.push({ theme: null, missing: "source", message: `${METHOD_LABEL[rm.method]} is recommended but not available (${rm.availability_note ?? "no source"})`, recommended_action: "Cannot be collected yet; revisit when a source is available." });
    }
  }

  return {
    objective: str(raw.objective),
    hypothesis: strOrNull(raw.hypothesis),
    assumptions: strArr(raw.assumptions),
    methodology: { recommended_methods, approach: str(rawMethodology.approach), advisor_note: str(rawMethodology.advisor_note) },
    evidence_themes,
    method_configs,
    expected_coverage,
    gaps,
    expected_outputs: strArr(raw.expected_outputs),
    remaining_limitations: strArr(raw.remaining_limitations),
    generated_at: new Date().toISOString(),
    edited: false,
    model: MODEL,
  };
}
