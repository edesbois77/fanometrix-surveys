// Single source of truth for which evidence types currently produce their
// own per-source AI Intelligence, and how each one maps onto
// research_summaries' source_type / its own backing table. Before this
// file, that same evidence_type === "survey" ? ... : "conversation_search"
// comparison — and the equivalent ["survey", "social_search"] allow-list —
// was duplicated across lib/report-readiness.ts, lib/intelligence/store.ts
// and lib/intelligence/analysts/analyseExecutiveReport.ts. Adding a new
// source type that produces Intelligence (Document, Phase 1) is meant to be
// one entry added here, not a repeated edit across all three.
//
// Deliberately narrow — this only models "does this evidence type have its
// own per-source Intelligence, and where does its data live." Several
// similar-looking things are NOT routed through this registry, on purpose:
//   - research_project_evidence's own evidence_type CHECK already permits
//     'document' at the database level; that's a storage-layer fact, not an
//     Intelligence-eligibility one.
//   - The "Choose Research Source Type" modal's 14-item roadmap list in
//     WorkspaceBody.tsx mixes real, working types with not-yet-built
//     placeholders as UI copy — it isn't business-logic branching, so it
//     stays a plain literal list there.
//   - The Showroom's simulated progress-bar summaries in
//     research-projects/route.ts track a different concept ("has a
//     current/target count for Run Research"), which will not always
//     coincide with "has Intelligence" as more source types are added
//     (Documents never get simulated content, but will have Intelligence) —
//     conflating the two here would be a subtle bug waiting to happen, so
//     that file keeps its own literal filter.
import type { IntelligenceSourceType } from "@/lib/intelligence/types";

export type EvidenceTypeId = "survey" | "social_search" | "document";

export type ResearchSourceDefinition = {
  evidenceType: EvidenceTypeId;
  label: string;
  /** research_summaries.source_type used for this type's OWN per-source
   * Intelligence (Survey Intelligence / Conversation Intelligence /
   * Document Intelligence). Deliberately not always equal to evidenceType —
   * "social_search" (evidence_type) and "conversation_search" (source_type)
   * name the same source with different vocabularies, a pre-existing,
   * intentional split this registry preserves rather than papers over. */
  intelligenceSourceType: IntelligenceSourceType;
  /** The table evidence_id resolves into for this type — used only for the
   * evidence-attach provenance pre-check (is evidence_id's own is_simulated
   * consistent with the project's mode). null means "no such check applies"
   * (Document: library_documents has no is_simulated column at all,
   * uploaded documents are never simulated content — migration 078's
   * trigger already documents this same "nothing to cross-check" case).
   * Deliberately NOT reused for resolving research_summaries.source_id
   * (see store.ts's resolveProvenance) — Document Intelligence's source_id
   * is the research_project_evidence row's own id (migration 102), not a
   * row in this table, so that lookup needs its own explicit handling
   * rather than this same field. */
  sourceTable: "surveys" | "social_searches" | null;
};

export const RESEARCH_SOURCE_REGISTRY: Record<EvidenceTypeId, ResearchSourceDefinition> = {
  survey: {
    evidenceType: "survey",
    label: "Survey",
    intelligenceSourceType: "survey",
    sourceTable: "surveys",
  },
  social_search: {
    evidenceType: "social_search",
    label: "Conversation Search",
    intelligenceSourceType: "conversation_search",
    sourceTable: "social_searches",
  },
  document: {
    evidenceType: "document",
    label: "Document",
    intelligenceSourceType: "document_project",
    sourceTable: null,
  },
};

/** Every evidence type that currently produces its own per-source
 * Intelligence — the answer to "which attached sources does the Executive
 * Report / readiness check actually consider." Not a general-purpose
 * "known evidence types" list; see this file's header comment. */
export function getEvidenceTypesWithIntelligence(): EvidenceTypeId[] {
  return Object.keys(RESEARCH_SOURCE_REGISTRY) as EvidenceTypeId[];
}

export function isKnownEvidenceType(evidenceType: string): evidenceType is EvidenceTypeId {
  return evidenceType in RESEARCH_SOURCE_REGISTRY;
}

export function getIntelligenceSourceType(evidenceType: EvidenceTypeId): IntelligenceSourceType {
  return RESEARCH_SOURCE_REGISTRY[evidenceType].intelligenceSourceType;
}

export function getSourceLabel(evidenceType: EvidenceTypeId): string {
  return RESEARCH_SOURCE_REGISTRY[evidenceType].label;
}

/** Returns null for any evidence type with no registry entry, or whose
 * entry has no cross-check table (Document) — callers already treat null
 * as "no provenance table to cross-check," unchanged from the literal
 * ternary this replaces. */
export function getSourceTable(evidenceType: string): string | null {
  return isKnownEvidenceType(evidenceType) ? RESEARCH_SOURCE_REGISTRY[evidenceType].sourceTable : null;
}

/** Reverse lookup, keyed by IntelligenceSourceType (research_summaries'
 * source_type) rather than evidence_type — used by store.ts's
 * resolveProvenance, which only ever sees the former. "research_project"
 * has no table of its own here (its source_id is already a research_projects
 * id), so it never appears in this map — resolveProvenance keeps that as
 * its own explicit case rather than forcing it into this shape.
 * "document_project" is excluded the same way, for the same reason: its
 * registry entry's sourceTable is null (see that field's own comment), and
 * a null value here would be indistinguishable from "absent" to every
 * caller anyway, so it's simplest to just not include it. */
export const SOURCE_TYPE_TABLE: Partial<Record<IntelligenceSourceType, string>> = Object.fromEntries(
  Object.values(RESEARCH_SOURCE_REGISTRY)
    .filter((def): def is typeof def & { sourceTable: string } => def.sourceTable !== null)
    .map(def => [def.intelligenceSourceType, def.sourceTable])
);
