// Server-only. Called by the analysis approve route once a document's
// global analysis is approved — copies the approved, human-reviewed
// fields onto library_documents' own queryable columns, which is what the
// Research Library's search/filter page actually queries (see
// supabase-migration-099.sql's header comment: library_documents holds the
// CURRENT approved metadata as real columns, not the richer narrative
// content, which stays in library_document_analysis).
//
// document_type is deliberately never touched here — it's chosen by the
// uploader at upload time and stays authoritative; the analysis's own
// suggested_document_type is shown to a reviewer as a hint, never
// auto-applied, so a document can't silently change category on approval.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { DocumentAnalysisContent } from "@/lib/library-documents/analysis-schema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Flattens every deep-intelligence text field into one unstructured blob
 * for search only (migration 104) — never displayed, never re-parsed, its
 * only job is to give library_documents.search_vector something to match
 * against beyond the promoted metadata arrays below. Key findings,
 * statistics, recommendations and quotes are exactly the fields the
 * existing metadata columns (tags/topics/brands_mentioned/etc.) can't
 * capture, since a search term can appear inside a finding's prose without
 * being one of the document's own extracted tags. */
function buildAnalysisSearchText(content: DocumentAnalysisContent): string {
  const parts: string[] = [
    content.executive_summary,
    ...content.key_findings.map(f => f.text),
    ...content.statistics.map(s => s.text),
    ...content.document_recommendations.map(r => r.text),
    ...content.quotes.map(q => q.text),
  ];
  if (content.report_framework) {
    parts.push(content.report_framework.name);
    parts.push(...content.report_framework.components.flatMap(c => [c.label, c.description]));
  }
  return parts.filter(Boolean).join(" ");
}

export async function promoteApprovedMetadata(
  libraryDocumentId: string,
  content: DocumentAnalysisContent,
  approvedBy: string
): Promise<void> {
  const now = new Date().toISOString();
  // A malformed or non-ISO date from the model must never reach a `date`
  // column, which would throw and abort the whole approval — dropped to
  // null instead, same "normalise, don't fail the operation" discipline
  // used throughout lib/intelligence's analysts.
  const publicationDate = content.publication_date && ISO_DATE.test(content.publication_date) ? content.publication_date : null;

  // Title, author and description are each canonical once a human edits
  // them and must never be overwritten by approval — same protection
  // document_type already gets above. The per-field *_manually_edited flags
  // (set by PATCH) gate each one; the AI-suggested value only lands when no
  // human has touched that field.
  const { data: doc } = await supabaseAdmin
    .from("library_documents")
    .select("title_manually_edited, author_manually_edited, description_manually_edited, tags_manually_edited, author")
    .eq("id", libraryDocumentId)
    .single();

  const update: Record<string, unknown> = {
    source_publisher: content.source_publisher,
    publication_date: publicationDate,
    markets: content.markets,
    sports_competitions: content.sports_competitions,
    audience_segments: content.audience_segments,
    brands_mentioned: content.brands_mentioned,
    topics: content.topics,
    analysis_search_text: buildAnalysisSearchText(content),
    status: "approved",
    approved_by: approvedBy,
    approved_at: now,
  };
  if (!doc?.title_manually_edited) {
    update.title = content.title;
  }
  // Author: prefer the file's embedded metadata (already stored during
  // extraction). Only fall back to the AI's extracted author when the field
  // is still empty and the human hasn't set one.
  if (!doc?.author_manually_edited && !doc?.author && content.author?.trim()) {
    update.author = content.author.trim();
  }
  // Description: the concise AI abstract (what the document is, key findings,
  // why it matters — distinct from the fuller executive_summary) becomes the
  // document's primary introduction, unless a human has written their own.
  if (!doc?.description_manually_edited && content.summary?.trim()) {
    update.description = content.summary.trim();
  }
  // Tags: the AI's suggested tags land unless a human has curated them.
  if (!doc?.tags_manually_edited) {
    update.tags = content.tags;
  }

  const { error } = await supabaseAdmin
    .from("library_documents")
    .update(update)
    .eq("id", libraryDocumentId);

  if (error) throw new Error(error.message);
}
