// The Project Findings layer: types shared across extraction, storage and the
// final analysis (docs architecture: Evidence → Source Findings → Approval →
// Analysis → Reports).
//
// A Source Finding answers ONE question: "what did this evidence source find?"
// It is factual, single-source, and carries its own citation. It is NOT
// cross-source strategic reasoning — that happens later, over the APPROVED set.
//
// PURE types + declarations. No I/O.
import type { ContributionKind } from "@/lib/analysis/types";
import type { ResearchMethod } from "@/lib/research-design";

/** The sources findings are grouped by. News/YouTube/Bluesky are distinct even
 *  though they arrive through one conversation connector, because the analyst
 *  reviews and trusts them differently. */
export type SourceKind = "survey" | "document" | "news" | "youtube" | "bluesky" | "reddit" | "conversation";

export const SOURCE_KINDS: SourceKind[] = ["survey", "document", "news", "youtube", "bluesky", "reddit", "conversation"];

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  survey: "Survey Research",
  document: "Research Library",
  news: "News",
  youtube: "YouTube",
  bluesky: "Bluesky",
  reddit: "Reddit",
  conversation: "Conversation Intelligence",
};

/** Display order on the board. */
export const SOURCE_KIND_ORDER: SourceKind[] = ["survey", "document", "news", "youtube", "bluesky", "reddit", "conversation"];

export type EvidenceStrength = "strong" | "moderate" | "limited";

/** One candidate finding a source produced, before it is stored. */
export type SourceFindingDraft = {
  sourceKind: SourceKind;
  /** The source instance: survey id, library document id, or search id. */
  sourceRef: string;
  sourceLabel: string;
  /** Plain-English finding, leading with what was found. */
  statement: string;
  /** Audience / market / time scope, where known. */
  scope: string | null;
  evidenceStrength: EvidenceStrength;
  /** The exact evidence behind it. At least one. */
  citations: { snippet: string; provenance: string | null }[];
};

/** The research methods a source's evidence executes, for assigning APPROVED
 *  findings to the design's requirements in the final analysis (the same
 *  declared mapping lib/analysis/assignment.ts uses). */
export function methodsForSource(kind: SourceKind): ResearchMethod[] {
  switch (kind) {
    case "survey":   return ["survey"];
    case "document": return ["library", "industry_report", "academic"];
    case "news":     return ["news"];
    default:         return ["conversation"]; // youtube, bluesky, reddit, conversation
  }
}

/** What kind of knowledge a source supplies — inherited from the same contracts
 *  the raw-evidence path uses, so an approved finding carries the same
 *  admissibility properties its evidence did. Documents are read conservatively
 *  as interested claims until authorship is recorded. */
export function contributionForSource(kind: SourceKind): ContributionKind {
  switch (kind) {
    case "survey":   return "elicited_perception";
    case "document": return "interested_claim";
    case "news":     return "documented_activity";
    default:         return "unprompted_discourse";
  }
}

/** The observation unit an approved finding stands on. Survey and document
 *  findings share their instrument's pool (two findings from one survey are one
 *  observation of respondents, not two); a conversation/news finding is its own
 *  human-approved observation. */
export function observationKeyForFinding(kind: SourceKind, sourceRef: string, findingId: string): string {
  switch (kind) {
    case "survey":   return `survey:${sourceRef}`;
    case "document": return `document:${sourceRef}`;
    default:         return `finding:${findingId}`;
  }
}
