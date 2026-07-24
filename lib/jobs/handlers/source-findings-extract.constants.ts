// Shared so a route can enqueue this job without importing the handler (and thus
// the extraction stack).
export const SOURCE_FINDINGS_EXTRACT_JOB = "source-findings.extract";

/** One bounded, resumable unit of extraction. Each covers exactly one source
 *  instance, so the work is small, retryable, and cannot recreate the timeout. */
export type SourceExtractUnit = "survey" | "document" | "search";
