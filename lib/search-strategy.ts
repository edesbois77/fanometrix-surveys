// Search Strategy — the structured, human-editable retrieval plan for one
// Conversation Search (docs/search-strategy-blueprint.md). Client- and
// server-safe: the type, the breadth vocabulary, and the plain-language preview
// live here so the config UI and the generator share one definition. Connectors
// do NOT consume this in Phase 1 — it is planning + presentation only.

export type StrategyEntity = { term: string; type: string; aliases: string[] };
export type SearchBreadth = "broad" | "balanced" | "strict";

export type SearchStrategy = {
  /** The one thing the research is about (e.g. FedEx). */
  primary_entity: StrategyEntity | null;
  /** Concepts/organisations/competitions/clubs/people that anchor relevance —
   *  the `type` distinguishes them (Competition, Club, Organisation, Person…). */
  context_entities: StrategyEntity[];
  synonyms: string[];
  campaigns: string[];
  /** Conservative disambiguation terms (e.g. logistics, delivery, parcel). */
  exclusions: string[];
  breadth: SearchBreadth;
  /** Carried from the search (not AI-invented). */
  languages: string[];
  markets: string[];
  /** Per-connector hints (e.g. Reddit subreddits) — never compiled query syntax. */
  connector_hints: Record<string, Record<string, unknown>>;
  generated_at: string | null;
  /** True once a researcher has hand-edited the generated strategy. */
  edited: boolean;
};

export const BREADTHS: { value: SearchBreadth; label: string; help: string }[] = [
  { value: "broad", label: "Broad", help: "Anything mentioning the subject. Widest reach, more noise for the relevance classifier to filter." },
  { value: "balanced", label: "Balanced", help: "The subject together with any of its research context. The recommended default." },
  { value: "strict", label: "Strict", help: "The subject only where it appears alongside specific context. Highest precision, may miss looser mentions." },
];

export function emptyStrategy(): SearchStrategy {
  return { primary_entity: null, context_entities: [], synonyms: [], campaigns: [], exclusions: [], breadth: "balanced", languages: [], markets: [], connector_hints: {}, generated_at: null, edited: false };
}

// Join a list into "a, b or c".
function orList(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
}

/** The context concepts a human reads — context entities plus a few synonyms. */
export function strategyContextTerms(s: SearchStrategy, max = 5): string[] {
  const terms = [...s.context_entities.map(e => e.term), ...s.synonyms];
  return Array.from(new Set(terms.filter(Boolean))).slice(0, max);
}

/** Plain-language description of what Fanometrix intends to search for — NO
 *  boolean syntax, no query strings. `platform` names the source when given
 *  ("On YouTube, …"); otherwise it's a general statement. */
export function describeStrategy(s: SearchStrategy, platform?: string): string {
  const subject = s.primary_entity?.term?.trim();
  if (!subject) return "Add a research question and generate a strategy to see what Fanometrix will search for.";

  const context = strategyContextTerms(s);
  const lead = platform ? `On ${platform}, Fanometrix will look for` : "Fanometrix will look for";

  let core: string;
  if (!context.length || s.breadth === "broad") {
    core = `content mentioning ${subject}`;
  } else if (s.breadth === "strict") {
    core = `content about ${subject} specifically in the context of ${orList(context)}`;
  } else {
    core = `content about ${subject} that also relates to ${orList(context)}`;
  }

  const reduce = s.exclusions.length ? `, while reducing general ${orList(s.exclusions.slice(0, 4))} content` : "";
  return `${lead} ${core}${reduce}.`;
}
