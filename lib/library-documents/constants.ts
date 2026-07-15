// Shared constants for the Research Library's Uploaded Documents feature —
// imported by both the upload API route and (later) the upload UI, so the
// allowed formats/size cap/document types are defined exactly once.

export const LIBRARY_DOCUMENTS_BUCKET = "library-documents";

// v1 supports PDF and DOCX only — the two formats that cover Industry
// Reports/Case Studies/Benchmarks/Research Papers/Strategy Documents/Market
// Reports in practice. Scanned images (OCR), XLSX, PPTX and plain text are
// deliberately out of scope for the first release.
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

// 25MB — comfortably above a typical industry report, well below what
// would strain a single serverless function's extraction/analysis step.
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Matches library_documents.document_type's CHECK constraint
// (supabase-migration-099.sql) exactly — one flexible type field, not a
// separate table per category.
export const DOCUMENT_TYPES = [
  { value: "industry_report", label: "Industry Report" },
  { value: "case_study", label: "Case Study" },
  { value: "benchmark", label: "Benchmark" },
  { value: "research_paper", label: "Research Paper" },
  { value: "client_document", label: "Client Document" },
  { value: "strategy_document", label: "Strategy Document" },
  { value: "audience_study", label: "Audience Study" },
  { value: "sponsorship_evaluation", label: "Sponsorship Evaluation" },
  { value: "market_report", label: "Market Report" },
  { value: "internal_research", label: "Internal Research" },
  { value: "other", label: "Other" },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]["value"];

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && DOCUMENT_TYPES.some(t => t.value === value);
}
