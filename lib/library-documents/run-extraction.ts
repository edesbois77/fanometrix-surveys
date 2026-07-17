// Server-only. Stage 2 of the ingestion pipeline: uploaded → extracting →
// (chains into analysing, run-analysis.ts). Downloads the stored file,
// extracts text by format, persists library_document_chunks, and — for
// PDFs only, DOCX has no page-image concept — renders and visually
// analyses every page (run-visual-analysis.ts). Same "atomic claim, no
// double-processing" discipline as evidence_simulations' Run Research
// (see app/api/research-projects/[id]/evidence/generate/route.ts): the
// uploaded → extracting transition is a conditional UPDATE ... WHERE
// status = 'uploaded', so a duplicate trigger (e.g. a retried after()
// call) can't run extraction twice. On success this calls runAnalysis
// directly rather than resting at an 'analysing' status nothing then
// claims — see run-analysis.ts's own header comment for why extracting →
// analysing is itself a second atomic claim, not this function just
// writing 'analysing' and stopping.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ALLOWED_MIME_TYPES } from "@/lib/library-documents/constants";
import { downloadFile } from "@/lib/library-documents/storage";
import { extractPdf, extractDocx } from "@/lib/library-documents/extract-text";
import { chunkPdfPages, chunkDocxSections, type ChunkRow } from "@/lib/library-documents/chunk-text";
import { runVisualAnalysis } from "@/lib/library-documents/run-visual-analysis";
import { runAnalysis } from "@/lib/library-documents/run-analysis";

export async function runExtraction(libraryDocumentId: string): Promise<void> {
  const { data: claimed } = await supabaseAdmin
    .from("library_documents")
    .update({ status: "extracting", error_message: null })
    .eq("id", libraryDocumentId)
    .eq("status", "uploaded")
    .select("id, mime_type, storage_path, author_manually_edited")
    .maybeSingle();

  // Not found, or already past 'uploaded' (already claimed by another
  // trigger, or a later stage already ran) — nothing to do.
  if (!claimed) return;

  try {
    const buffer = await downloadFile(claimed.storage_path);
    const ext = ALLOWED_MIME_TYPES[claimed.mime_type];

    let chunkRows: ChunkRow[];
    let pageCount: number | null = null;
    // Author from the file's own embedded metadata (PDF Info dictionary).
    // Seeds the Author field before analysis so the AI only fills it in when
    // the document itself doesn't carry one. DOCX has no equivalent here.
    let embeddedAuthor: string | null = null;

    if (ext === "pdf") {
      const extraction = await extractPdf(buffer);
      pageCount = extraction.pageCount;
      embeddedAuthor = extraction.info.author;
      chunkRows = chunkPdfPages(extraction.pages);
    } else if (ext === "docx") {
      const extraction = await extractDocx(buffer);
      chunkRows = chunkDocxSections(extraction.sections);
    } else {
      throw new Error(`Unsupported mime type: ${claimed.mime_type}`);
    }

    if (chunkRows.length === 0) {
      throw new Error("No extractable text was found in this document.");
    }

    // Replace any previous chunk set outright (a retry after a failure
    // must never leave stale chunks from a partial prior attempt sitting
    // alongside the new ones).
    await supabaseAdmin.from("library_document_chunks").delete().eq("library_document_id", libraryDocumentId);

    const { error: insertError } = await supabaseAdmin
      .from("library_document_chunks")
      .insert(chunkRows.map((c, i) => ({ library_document_id: libraryDocumentId, chunk_index: i, ...c })));
    if (insertError) throw new Error(insertError.message);

    await supabaseAdmin
      .from("library_documents")
      .update({
        page_count: pageCount,
        error_message: null,
        // Seed the embedded author only when present and no human has set one.
        ...(embeddedAuthor && !claimed.author_manually_edited ? { author: embeddedAuthor } : {}),
      })
      .eq("id", libraryDocumentId);

    // Visual analysis — PDF only, continuing the same chunk_index
    // sequence the text chunks above just used.
    if (ext === "pdf") {
      await runVisualAnalysis(libraryDocumentId, buffer, chunkRows.length);
    }

    await runAnalysis(libraryDocumentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    await supabaseAdmin
      .from("library_documents")
      .update({ status: "failed", error_message: message })
      .eq("id", libraryDocumentId);
  }
}
