// Lightweight identifiers for the document.process job, split out from the
// handler module so enqueue sites (confirm-upload, reprocess) can reference the
// job type and dedupe key WITHOUT importing the handler — which pulls in the
// heavy PDF/vision pipeline (runExtraction → pdfjs) at module load. The handler
// itself (document-process.ts) is only ever loaded inside the worker /
// after()-drain, never at a route's top level.

export const DOCUMENT_PROCESS_JOB = "document.process";

/** Stable dedupe key so a document can only ever have one live processing job. */
export function documentProcessDedupeKey(documentId: string): string {
  return `${DOCUMENT_PROCESS_JOB}:${documentId}`;
}
