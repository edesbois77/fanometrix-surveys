// Server-only. Orchestrates rendering + vision analysis + persistence for
// one PDF document's pages — called from run-extraction.ts, still inside
// the 'extracting' pipeline stage (no new status introduced; DOCX has no
// page-image concept, so this is never called for it). A visual chunk is
// an ordinary library_document_chunks row (evidence_kind='visual') that
// the main document analyst cites exactly like a text chunk — see
// analyseDocumentPages.ts's header comment for why that's the whole point
// of this design (reconciled evidence, not a parallel findings system).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { renderPdfPages } from "@/lib/library-documents/extract-text";
import { uploadPageImage } from "@/lib/library-documents/storage";
import { analyseDocumentPages } from "@/lib/intelligence/analysts/analyseDocumentPages";

/** `nextChunkIndex` is the count of already-inserted text chunks for this
 * document — visual chunks continue the same chunk_index sequence rather
 * than starting a separate numbering space, since chunk_index only needs
 * to be unique per document, not meaningful as a page-order sequence. */
export async function runVisualAnalysis(libraryDocumentId: string, pdfBuffer: Buffer, nextChunkIndex: number): Promise<void> {
  const pages = await renderPdfPages(pdfBuffer);
  if (pages.length === 0) return;

  const uploaded = await Promise.all(pages.map(async p => {
    const path = await uploadPageImage(libraryDocumentId, p.pdfPageNumber, p.data);
    return { pdfPageNumber: p.pdfPageNumber, path, width: p.width, height: p.height, dataUrl: `data:image/png;base64,${p.data.toString("base64")}` };
  }));

  const visualResults = await analyseDocumentPages(uploaded.map(p => ({ pdfPageNumber: p.pdfPageNumber, dataUrl: p.dataUrl })));
  const visualByPage = new Map(visualResults.map(r => [r.pdfPageNumber, r]));

  // Replace any previous page set outright — same "a retry must never
  // leave stale rows from a partial prior attempt" discipline
  // run-extraction.ts already applies to chunks.
  await supabaseAdmin.from("library_document_pages").delete().eq("library_document_id", libraryDocumentId);

  const { error: pagesError } = await supabaseAdmin.from("library_document_pages").insert(
    uploaded.map(p => ({
      library_document_id: libraryDocumentId,
      pdf_page_number: p.pdfPageNumber,
      printed_page_label: visualByPage.get(p.pdfPageNumber)?.printedPageLabel ?? null,
      image_storage_path: p.path,
      // pdfjs-dist reports rendered dimensions in points × scale, which is
      // only an integer for PDFs whose page box happens to land on a whole
      // pixel at this scale — real-world PDFs (this one included) commonly
      // don't. image_width/height are informational only, so rounding here
      // is correct, not a workaround for anything downstream.
      image_width: Math.round(p.width),
      image_height: Math.round(p.height),
    }))
  );
  if (pagesError) throw new Error(pagesError.message);

  // One visual chunk per page that actually has something to say — a page
  // with no distinct visual element (most plain-text pages) gets no chunk
  // at all, never an empty placeholder one.
  let chunkIndex = nextChunkIndex;
  const visualChunkRows = uploaded
    .map(p => {
      const visual = visualByPage.get(p.pdfPageNumber);
      if (!visual?.visualNotes) return null;
      return {
        library_document_id: libraryDocumentId,
        chunk_index: chunkIndex++,
        page_start: p.pdfPageNumber,
        page_end: p.pdfPageNumber,
        printed_page_label: visual.printedPageLabel,
        section_label: null,
        evidence_kind: "visual" as const,
        chunk_text: visual.visualNotes,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (visualChunkRows.length > 0) {
    const { error: chunksError } = await supabaseAdmin.from("library_document_chunks").insert(visualChunkRows);
    if (chunksError) throw new Error(chunksError.message);
  }

  // Backfill the detected printed page label onto the page's existing TEXT
  // chunks too — provenance display never needs to know which kind of
  // chunk it's reading (see migration 103's header comment).
  for (const p of uploaded) {
    const label = visualByPage.get(p.pdfPageNumber)?.printedPageLabel;
    if (!label) continue;
    await supabaseAdmin
      .from("library_document_chunks")
      .update({ printed_page_label: label })
      .eq("library_document_id", libraryDocumentId)
      .eq("page_start", p.pdfPageNumber)
      .eq("evidence_kind", "text");
  }
}
