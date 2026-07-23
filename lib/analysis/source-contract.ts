// Source Contracts — what a source may establish, and what one observation of it
// is (docs/intelligence-model.md §4 Layer 2).
//
// The platform's extension point. A new evidence source is a new contract and
// nothing else: admissibility, independence, gap detection and diversity all
// follow from the declaration. Nothing downstream of this file infers, derives or
// overrides either property, because a gatherer that makes epistemic judgements
// is a gatherer that quietly redefines what the platform is entitled to say.
//
// PURE. Contracts are declarations over minimal structural item shapes, never
// over database rows: what a source can establish is a property of the source,
// not of how we happen to store it.
import type { ContributionKind } from "@/lib/analysis/types";
import { CONTRIBUTION_LABEL } from "@/lib/analysis/types";

/** The part of a contract that needs no item. Readable on its own, so a person
 *  (or a research design) can ask what a source is good for before any evidence
 *  of it exists. */
export type SourceContractDeclaration = {
  id: string;
  label: string;
  /** Every kind this source may supply. One entry for most sources; several
   *  where the source genuinely produces different kinds of knowledge. */
  produces: ContributionKind[];
  observation: {
    /** The smallest independent observation, as a person would say it. */
    unit: string;
    plural: string;
  };
  /** What this source can never establish, in plain language, for the analyst
   *  surface. Stated once here rather than reconstructed from the matrix at
   *  every call site. */
  cannotEstablish: string;
};

export type SourceContract<Item> = SourceContractDeclaration & {
  /** The kind this particular item supplies. A constant for most sources, a
   *  DECLARED MAPPING where a source produces several kinds. Either way the rule
   *  lives here and never in a gatherer. */
  contributionFor(item: Item): ContributionKind;
  /** Stable key for the observation behind this item. Two items sharing it are
   *  one observation, not two, whatever their volume. */
  observationKeyFor(item: Item): string;
  /** How many independent observations this item carries. One for most items.
   *  More where an item AGGREGATES observations, as a survey statistic stands on
   *  every response behind it. */
  observationCountFor(item: Item): number;
};

// ── Conversation ─────────────────────────────────────────────────────────────

export type ConversationItem = { id: string; author: string | null };

export const CONVERSATION_CONTRACT: SourceContract<ConversationItem> = {
  id: "conversation",
  label: "Conversation",
  produces: ["unprompted_discourse"],
  observation: { unit: "unique author", plural: "unique authors" },
  cannotEstablish: "how many people hold a view, or what those who said nothing think",
  contributionFor: () => "unprompted_discourse",
  // One person posting forty times is one observation of what one person thinks.
  // Anonymous items fall back to their own id, which counts them as distinct: the
  // safer error is to treat one person as several and dilute their weight, rather
  // than to merge several people into one and erase them.
  observationKeyFor: it => (it.author?.trim() ? `author:${it.author.trim().toLowerCase()}` : `item:${it.id}`),
  observationCountFor: () => 1,
};

// ── News ─────────────────────────────────────────────────────────────────────
// The clearest case for a declared MAPPING rather than a constant kind. What a
// journalist reports, what a brand announces about itself and what a columnist
// argues are three different kinds of knowledge arriving through one connector,
// and the platform already classifies them at collection.

export type NewsItem = {
  id: string;
  /** The syndication cluster this article belongs to, where one was resolved.
   *  Fifty outlets carrying one wire story are one observation of one event. */
  syndicationKey: string | null;
  publisher: string | null;
  /** As classified at collection (lib/news-taxonomy.ts). */
  sourceType: "reporting" | "brand_announcement" | "opinion" | "unclear";
};

export const NEWS_CONTRACT: SourceContract<NewsItem> = {
  id: "news",
  label: "News Coverage",
  produces: ["documented_activity", "interested_claim", "expert_judgement"],
  observation: { unit: "original publisher", plural: "original publishers" },
  cannotEstablish: "what any audience thought of what was reported",
  contributionFor: it => {
    switch (it.sourceType) {
      case "brand_announcement": return "interested_claim";
      case "opinion":            return "expert_judgement";
      case "reporting":          return "documented_activity";
      // An unclassified article is read as an interested claim, the most
      // constrained of the three. Where we cannot tell whose voice it is, we
      // assume the one that can establish least.
      default:                   return "interested_claim";
    }
  },
  observationKeyFor: it =>
    it.syndicationKey ? `story:${it.syndicationKey}`
    : it.publisher?.trim() ? `publisher:${it.publisher.trim().toLowerCase()}`
    : `item:${it.id}`,
  observationCountFor: () => 1,
};

// ── Survey ───────────────────────────────────────────────────────────────────

export type SurveyItem = {
  /** The instrument the statistic came from. Two statistics from one survey draw
   *  on ONE pool of respondents, so the instrument is the dedup key even though
   *  the observation is the response. */
  surveyId: string;
  /** Completed responses behind this statistic. */
  responses: number;
};

export const SURVEY_CONTRACT: SourceContract<SurveyItem> = {
  id: "survey",
  label: "Survey",
  produces: ["elicited_perception"],
  observation: { unit: "completed response", plural: "completed responses" },
  cannotEstablish: "what people actually did, as opposed to what they say they did or would do",
  contributionFor: () => "elicited_perception",
  observationKeyFor: it => `survey:${it.surveyId}`,
  // A survey statistic AGGREGATES its observations. This is what stops a
  // well-sampled survey being scored as a single line of evidence and capped
  // below High on a magnitude claim it is the native instrument for.
  observationCountFor: it => Math.max(1, it.responses),
};

// ── Research Library ─────────────────────────────────────────────────────────

export type DocumentItem = {
  documentId: string;
  /** Who stands behind the document. An independent study and a client's own
   *  case study are different kinds of knowledge, and the difference is not
   *  recoverable from the file. */
  authorship: "independent" | "interested";
};

export const DOCUMENT_CONTRACT: SourceContract<DocumentItem> = {
  id: "document",
  label: "Research Library",
  produces: ["established_knowledge", "interested_claim"],
  observation: { unit: "document", plural: "documents" },
  cannotEstablish: "that what it found elsewhere holds for this engagement",
  contributionFor: it => (it.authorship === "interested" ? "interested_claim" : "established_knowledge"),
  observationKeyFor: it => `document:${it.documentId}`,
  observationCountFor: () => 1,
};

// ── Registry ─────────────────────────────────────────────────────────────────

const DECLARATIONS: SourceContractDeclaration[] = [
  CONVERSATION_CONTRACT, NEWS_CONTRACT, SURVEY_CONTRACT, DOCUMENT_CONTRACT,
];

export const sourceContracts = (): SourceContractDeclaration[] => [...DECLARATIONS];

export const sourceContract = (id: string): SourceContractDeclaration | null =>
  DECLARATIONS.find(d => d.id === id) ?? null;

/** Which declared sources could supply a given kind of knowledge. The question
 *  Research Design asks when a requirement needs something the collected
 *  evidence cannot give it, answered from declarations rather than from a
 *  hand-maintained list. */
export const sourcesProducing = (kind: ContributionKind): SourceContractDeclaration[] =>
  DECLARATIONS.filter(d => d.produces.includes(kind));

/** What a contract says about one item. The single point at which a source's
 *  declaration becomes properties of a piece of evidence, so "inherited from the
 *  contract, never inferred downstream" is a thing the code does rather than a
 *  thing the documentation asks for. */
export type ResolvedContract = {
  contribution: ContributionKind;
  observationKey: string;
  observations: number;
};

export function resolve<Item>(contract: SourceContract<Item>, item: Item): ResolvedContract {
  return {
    contribution: contract.contributionFor(item),
    observationKey: contract.observationKeyFor(item),
    observations: Math.max(1, Math.floor(contract.observationCountFor(item))),
  };
}

/** A plain sentence describing what a source is for. Analyst surface. */
export function describeSource(d: SourceContractDeclaration): string {
  const kinds = d.produces.map(k => CONTRIBUTION_LABEL[k]).join(", ");
  return `${d.label} supplies ${kinds}, measured in ${d.observation.plural}. It cannot establish ${d.cannotEstablish}.`;
}
