// Search Strategist — a config-time analyst that turns a Conversation Search's
// intent (Research Question + keywords + goal + subject/entity context) into a
// structured Search Strategy (docs/search-strategy-blueprint.md). Sibling of the
// collection-time relevance classifier and the aspect-synthesis analyst.
//
// Pure generation — never persists. Connectors do NOT consume the result in
// Phase 1; it is planned, stored and edited, then previewed in plain language.
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { emptyStrategy, type SearchStrategy, type SearchBreadth, type StrategyEntity } from "@/lib/search-strategy";

export type StrategyInput = {
  researchQuestion?: string | null;
  keywords?: string[];
  researchGoal?: string | null;
  entityType?: string | null;   // subject type hint (Brand | Club | Competition | Topic …)
  markets?: string[];
  languages?: string[];
};

function buildPrompt(input: StrategyInput): string {
  const bits = [
    input.researchQuestion?.trim() ? `Research question: "${input.researchQuestion.trim()}"` : "",
    input.keywords?.length ? `Existing search terms: ${input.keywords.join(", ")}` : "",
    input.researchGoal ? `Research goal: ${input.researchGoal}` : "",
    input.entityType ? `Subject type hint: ${input.entityType}` : "",
    input.markets?.length ? `Markets: ${input.markets.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  return `You are a research retrieval strategist for a fan/sports intelligence platform. Turn the research intent below into a structured Search Strategy that will help retrieve genuinely relevant conversations — not just keyword matches.

${bits}

Return ONLY valid JSON:
{
  "primary_entity": { "term": "the single main subject", "type": "Brand|Club|Competition|Person|Organisation|Topic", "aliases": ["alternate names / spellings"] },
  "context_entities": [ { "term": "a concept, competition, club, organisation or person that anchors relevance", "type": "Competition|Club|Organisation|Person|Topic|Concept", "aliases": ["..."] } ],
  "synonyms": ["broader synonyms / related phrasings for recall"],
  "campaigns": ["named campaigns or activations, if any"],
  "exclusions": ["conservative disambiguation terms — the OTHER meanings of the subject to reduce"],
  "breadth": "broad | balanced | strict"
}

Rules:
- primary_entity is the ONE thing the research is about. Include obvious aliases/abbreviations (e.g. UEFA Champions League → "UCL", "Champions League").
- context_entities are the concepts/competitions/clubs/organisations/people that make a conversation RELEVANT to the question — the "aboutness". For "How do football fans perceive FedEx's UEFA Champions League sponsorship?" these are: UEFA Champions League, Champions League, football, sponsorship.
- exclusions are CONSERVATIVE and only for genuine disambiguation — the subject's unrelated meanings. For FedEx the sponsor, reduce the FedEx LOGISTICS business: "logistics", "delivery", "parcel", "package tracking", "driver". Never exclude terms that could carry relevant fan opinion. When in doubt, leave exclusions empty.
- Prefer positive context anchoring over exclusion.
- breadth: default "balanced" (subject + any context). Use "strict" only if the question is narrow; "broad" only if the subject itself is the whole topic.
- Do NOT output boolean operators, query strings, or connector-specific syntax. Terms only.
- Keep each list focused (≤ 6 items). Omit a field's items rather than padding.`;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
function entity(raw: unknown): StrategyEntity | null {
  const r = raw as { term?: unknown; type?: unknown; aliases?: unknown } | null;
  const term = clean(r?.term);
  if (!term) return null;
  const aliases = Array.isArray(r?.aliases) ? (r!.aliases as unknown[]).map(clean).filter(Boolean).slice(0, 8) : [];
  return { term, type: clean(r?.type) || "Topic", aliases };
}
const strList = (raw: unknown, max = 6): string[] =>
  (Array.isArray(raw) ? (raw as unknown[]).map(clean).filter(Boolean) : []).filter((v, i, a) => a.indexOf(v) === i).slice(0, max);

export async function analyseSearchStrategy(input: StrategyInput): Promise<SearchStrategy> {
  if (!input.researchQuestion?.trim() && !(input.keywords?.length)) {
    throw new IntelligenceError(422, "Add a research question or some keywords before generating a search strategy.");
  }

  const raw = await completeJSON<Record<string, unknown>>({ prompt: buildPrompt(input), maxTokens: 900, temperature: 0.2 });

  const breadthRaw = clean(raw.breadth).toLowerCase();
  const breadth: SearchBreadth = breadthRaw === "broad" || breadthRaw === "strict" ? breadthRaw : "balanced";

  return {
    ...emptyStrategy(),
    primary_entity: entity(raw.primary_entity),
    context_entities: (Array.isArray(raw.context_entities) ? raw.context_entities : []).map(entity).filter((e): e is StrategyEntity => !!e).slice(0, 8),
    synonyms: strList(raw.synonyms),
    campaigns: strList(raw.campaigns),
    exclusions: strList(raw.exclusions),
    breadth,
    languages: input.languages ?? [],
    markets: input.markets ?? [],
    generated_at: new Date().toISOString(),
    edited: false,
  };
}
