// Server-only. Stage 3 of the ingestion pipeline: extracting → analysing →
// pending_review (or failed). Two entry points share the same core work
// (performDocumentAnalysis):
//   - runAnalysis() — the automatic pipeline stage run-extraction.ts chains
//     into. Claims extracting → analysing as its own atomic transition
//     (conditional UPDATE ... WHERE status = 'extracting'), not
//     run-extraction.ts writing 'analysing' and this function trusting
//     that write — a claim that only ever matched its own target status
//     would be a no-op mutex (two genuinely concurrent calls could both
//     pass it), so this only proceeds if it's the one call that actually
//     moved the row out of 'extracting'.
//   - performDocumentAnalysis() alone — called directly by the "Re-analyse"
//     API route (an explicit, authenticated user action, not a
//     background race-prone trigger, so it doesn't need the claim).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { analyseDocument, type AnalyseDocumentChunk } from "@/lib/intelligence/analysts/analyseDocument";
import { saveNewAnalysis, approveAnalysis, type LibraryDocumentAnalysisRow } from "@/lib/library-documents/analysis-store";
import { promoteApprovedMetadata } from "@/lib/library-documents/promote-approved-metadata";

/** Runs the analyst against a document's already-extracted chunks and
 * saves the result as a new library_document_analysis version. Does not
 * touch library_documents.status — callers decide what that means for
 * the pipeline (first run vs. a manual re-analysis). `generatedBy` is
 * "system" for the automatic pipeline (runAnalysis below) and the
 * requesting admin's email for an explicit "Re-analyse" call. */
export async function performDocumentAnalysis(libraryDocumentId: string, title: string, generatedBy: string): Promise<LibraryDocumentAnalysisRow> {
  const { data: chunkRows } = await supabaseAdmin
    .from("library_document_chunks")
    .select("id, chunk_index, page_start, page_end, printed_page_label, section_label, evidence_kind, chunk_text")
    .eq("library_document_id", libraryDocumentId)
    .order("chunk_index", { ascending: true });

  const chunks: AnalyseDocumentChunk[] = (chunkRows ?? []).map(c => ({
    id: c.id,
    chunk_index: c.chunk_index,
    page_start: c.page_start,
    page_end: c.page_end,
    printed_page_label: c.printed_page_label,
    section_label: c.section_label,
    evidence_kind: c.evidence_kind,
    chunk_text: c.chunk_text,
  }));

  const content = await analyseDocument(title, chunks);

  return saveNewAnalysis({ libraryDocumentId, content, model: "gpt-4o", generatedBy });
}

export async function runAnalysis(libraryDocumentId: string, hooks: { heartbeat?: () => Promise<void> } = {}): Promise<void> {
  const beat = hooks.heartbeat ?? (async () => {});

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("library_documents")
    .update({ status: "analysing", error_message: null })
    .eq("id", libraryDocumentId)
    .eq("status", "extracting")
    .select("id, title")
    .maybeSingle();

  // A DB error on the claim is transient — surface it so the job framework
  // retries rather than silently dropping the document.
  if (claimError) throw new Error(`Could not claim document for analysis: ${claimError.message}`);
  // Not currently 'extracting' — either already claimed by another trigger, or
  // genuinely not ready yet. Nothing to do.
  if (!claimed) return;

  await beat();
  // Auto-approve: the product has no human review gate in the Research Project
  // workflow. Analysis runs, then its output is approved and promoted
  // automatically, so the document lands on 'approved' ("Ready").
  // promoteApprovedMetadata is guarded — it never overwrites a title, author or
  // description a human has already edited. The internal pending_review/approved
  // states still exist behind the scenes.
  //
  // No catch here: any failure propagates so the job framework decides retry vs.
  // terminal (see run-extraction.ts's error-contract note). Analysis errors are
  // transient (AI timeout / rate limit), so they are retried, not failed outright.
  const saved = await performDocumentAnalysis(libraryDocumentId, claimed.title, "system");
  await beat();
  const approved = await approveAnalysis(saved.id, "system");
  await promoteApprovedMetadata(libraryDocumentId, approved.edited_content ?? approved.content, "system");
}
