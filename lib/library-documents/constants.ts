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
  // Images (screenshots, infographics, scanned pages) — no text layer, so they
  // are read end-to-end by the vision model rather than text-extracted.
  "image/png": "png",
  "image/jpeg": "jpg",
};

// Extensions that are image documents (read by vision, not text extraction).
export const IMAGE_EXTS = new Set(["png", "jpg"]);

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

// Friendly display label for a document_type value (e.g. audience_study →
// "Audience Study"). The one place raw document_type is turned into UI copy
// — use this everywhere document type is shown, never the raw enum.
export function documentTypeLabel(value: string): string {
  return DOCUMENT_TYPES.find(t => t.value === value)?.label ?? value;
}

// Access posture — reuses library_documents.confidentiality's CHECK
// vocabulary (supabase-migration-099.sql) exactly. Editable metadata, but
// the access-control field: changing it is confirmed in the UI and audited,
// since a library_document is a single record shared across every project.
export const CONFIDENTIALITY_LEVELS = [
  { value: "public",       label: "Public" },
  { value: "internal",     label: "Internal" },
  { value: "confidential", label: "Confidential" },
] as const;

export type Confidentiality = (typeof CONFIDENTIALITY_LEVELS)[number]["value"];

export function isConfidentiality(value: unknown): value is Confidentiality {
  return typeof value === "string" && CONFIDENTIALITY_LEVELS.some(c => c.value === value);
}

// Tags are free-form (not an enum) — a document can carry many, AI-suggested
// at processing time and freely editable. This is a shared vocabulary of
// common tags offered as UI suggestions (and nudged in the analyst prompt)
// so the Library trends toward consistent, reusable tags over time — the
// long-term goal being tags as a primary way documents are organised,
// searched and retrieved. Not exhaustive or enforced.
export const COMMON_DOCUMENT_TAGS = [
  "Women's Football", "Men's Football", "Tournament", "Club Football",
  "Domestic League", "International Football", "UEFA", "FIFA",
  "Financial", "Sponsorship", "Fan Behaviour", "Audience Research",
  "Broadcast", "Social Media", "Brand", "Commercial", "Technology",
] as const;

// Normalise a raw tag: trim, collapse inner whitespace, cap length. Returns
// null for anything empty. Used by the edit UI and the PATCH endpoint so a
// tag looks the same however it was entered.
export function normaliseTag(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\s+/g, " ").slice(0, 40);
  return t || null;
}

export const MAX_DOCUMENT_TAGS = 25;
