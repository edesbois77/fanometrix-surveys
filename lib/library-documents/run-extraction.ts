// Server-only. Stage 2 of the ingestion pipeline: uploaded → extracting →
// (chains into analysing, run-analysis.ts). Downloads the stored file,
// extracts text by format, persists library_document_chunks, and — for
// PDFs only, DOCX has no page-image concept — renders and visually
// analyses every page (run-visual-analysis.ts). Same "atomic claim, no
// double-processing" discipline as evidence_simulations' Run Research
// (see app/api/research-projects/[id]/evidence/generate/route.ts): the
// uploaded → extracting transition is a conditional UPDATE ... WHERE
// status = 'uploaded', so a duplicate trigger can't run extraction twice.
// On success this calls runAnalysis directly rather than resting at an
// 'analysing' status nothing then claims — see run-analysis.ts's own header
// comment for why extracting → analysing is itself a second atomic claim.
//
// Error contract: this function THROWS rather than writing status='failed'
// itself. It is driven by the durable job framework (lib/jobs, job_type
// 'document.process'), which owns the retry/terminal decision — a transient
// failure (thrown Error) is retried with backoff; a permanent one
// (UnprocessableDocumentError) fails without retry. Reflecting that onto
// library_documents.status is the handler's job, not this function's. The
// optional `heartbeat` renews the job's lease so a long PDF isn't reclaimed
// mid-run.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ALLOWED_MIME_TYPES, IMAGE_EXTS } from "@/lib/library-documents/constants";
import { downloadFile } from "@/lib/library-documents/storage";
import { extractPdf, extractDocx } from "@/lib/library-documents/extract-text";
import { extractImageContent } from "@/lib/library-documents/extract-image";
import { chunkPdfPages, chunkDocxSections, type ChunkRow } from "@/lib/library-documents/chunk-text";
import { runVisualAnalysis } from "@/lib/library-documents/run-visual-analysis";
import { runAnalysis } from "@/lib/library-documents/run-analysis";
import { UnprocessableDocumentError } from "@/lib/library-documents/errors";

export type PipelineHooks = { heartbeat?: () => Promise<void> };

export async function runExtraction(libraryDocumentId: string, hooks: PipelineHooks = {}): Promise<void> {
  const beat = hooks.heartbeat ?? (async () => {});

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("library_documents")
    .update({ status: "extracting", error_message: null, pages_done: null })
    .eq("id", libraryDocumentId)
    .eq("status", "uploaded")
    .select("id, mime_type, storage_path, author_manually_edited")
    .maybeSingle();

  // A DB error on the claim is transient — surface it so the job retries rather
  // than silently no-op'ing and leaving the document stranded (the original bug).
  if (claimError) throw new Error(`Could not claim document for extraction: ${claimError.message}`);
  // Not currently 'uploaded' (the handler resets it to 'uploaded' before each
  // attempt, so this only happens if it was already advanced/terminal) — nothing
  // to do; the handler's post-run check decides whether that's success.
  if (!claimed) return;

  const buffer = await downloadFile(claimed.storage_path);
  await beat();
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
  } else if (IMAGE_EXTS.has(ext)) {
    // Image document: no text layer — the vision model reads the whole image
    // and its transcribed content becomes the document's single content chunk.
    pageCount = 1;
    const content = await extractImageContent(buffer, claimed.mime_type);
    if (!content) throw new UnprocessableDocumentError("No readable content was found in this image.");
    chunkRows = [{ page_start: 1, page_end: 1, section_label: null, chunk_text: content }];
  } else {
    // Should never reach here (mime is validated on upload), but if it does,
    // re-running cannot fix it — permanent.
    throw new UnprocessableDocumentError(`Unsupported mime type: ${claimed.mime_type}`);
  }
  await beat();

  if (chunkRows.length === 0) {
    throw new UnprocessableDocumentError("No extractable text was found in this document.");
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
    await runVisualAnalysis(libraryDocumentId, buffer, chunkRows.length, { heartbeat: beat });
  }
  await beat();

  await runAnalysis(libraryDocumentId, { heartbeat: beat });
}
