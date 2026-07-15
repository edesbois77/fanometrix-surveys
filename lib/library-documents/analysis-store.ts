// Server-only. Reads and writes library_document_analysis rows — the
// mirror of lib/intelligence/store.ts for global document analysis
// (deliberately a separate table, not research_summaries — see
// supabase-migration-101.sql's header comment for why). Same "thin and
// mechanical, workflow validation lives in the route handler" contract as
// store.ts, adapted for this table's two differences: a 3-state lifecycle
// (no 'published' — see migration 101) and real version history
// (version/is_current) instead of overwrite-in-place.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DOCUMENT_ANALYSIS_SCHEMA_VERSION, type DocumentAnalysisContent } from "@/lib/library-documents/analysis-schema";

export type AnalysisStatus = "draft" | "edited" | "approved";

export type LibraryDocumentAnalysisRow = {
  id: string;
  library_document_id: string;
  version: number;
  schema_version: number;
  content: DocumentAnalysisContent;
  edited_content: DocumentAnalysisContent | null;
  status: AnalysisStatus;
  model: string | null;
  generated_at: string;
  generated_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  is_current: boolean;
  created_at: string;
  updated_at: string;
};

export async function getCurrentAnalysis(libraryDocumentId: string): Promise<LibraryDocumentAnalysisRow | null> {
  const { data } = await supabaseAdmin
    .from("library_document_analysis")
    .select("*")
    .eq("library_document_id", libraryDocumentId)
    .eq("is_current", true)
    .maybeSingle();
  return data as LibraryDocumentAnalysisRow | null;
}

/** Inserts a new version and demotes the previous current row (if any) in
 * the same call — a "Re-analyse" never overwrites the prior approved
 * version in place, so correcting a bad extraction can't silently discard
 * review history. */
export async function saveNewAnalysis(opts: {
  libraryDocumentId: string;
  content: DocumentAnalysisContent;
  model: string;
  generatedBy: string;
}): Promise<LibraryDocumentAnalysisRow> {
  const previous = await getCurrentAnalysis(opts.libraryDocumentId);

  if (previous) {
    await supabaseAdmin
      .from("library_document_analysis")
      .update({ is_current: false })
      .eq("id", previous.id);
  }

  const { data, error } = await supabaseAdmin
    .from("library_document_analysis")
    .insert([{
      library_document_id: opts.libraryDocumentId,
      version:              (previous?.version ?? 0) + 1,
      schema_version:        DOCUMENT_ANALYSIS_SCHEMA_VERSION,
      content:               opts.content,
      status:                "draft",
      model:                 opts.model,
      generated_by:          opts.generatedBy,
      is_current:            true,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as LibraryDocumentAnalysisRow;
}

export async function saveAnalysisEdit(id: string, editedContent: DocumentAnalysisContent): Promise<LibraryDocumentAnalysisRow> {
  const { data, error } = await supabaseAdmin
    .from("library_document_analysis")
    .update({
      edited_content: editedContent,
      status:         "edited",
      reviewed_by:    null,
      reviewed_at:    null,
      approved_at:    null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as LibraryDocumentAnalysisRow;
}

export async function approveAnalysis(id: string, reviewedBy: string): Promise<LibraryDocumentAnalysisRow> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("library_document_analysis")
    .update({ status: "approved", reviewed_by: reviewedBy, reviewed_at: now, approved_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as LibraryDocumentAnalysisRow;
}
