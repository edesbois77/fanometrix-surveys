// The validated, versioned shape of library_document_analysis.content /
// .edited_content — not arbitrary JSON. Every finding, statistic,
// recommendation, quote, methodology note and limitation gets a stable id,
// assigned here and never trusted from the model (same "derived, not
// freeform" discipline as lib/intelligence/validate-references.ts's
// clampReferences), and, where applicable, an explicit provenance
// reference resolved back to the exact chunk/page it was drawn from.
//
// schema_version 2 (bumped from 1): adds document_recommendations, quotes,
// report_framework, author_perspective and research_quality — see the
// Research Sources expansion plan's "deep document intelligence" follow-up
// for why the v1 shape (metadata + flat findings/stats) under-served a real
// report: it had nowhere to put a report's own named framework or
// recommendations, no selective-quote capture, no author-context signal,
// and no evidence-strength assessment. Existing v1 rows are left as-is —
// "Re-analyse" produces a v2 row when a reviewer wants the richer shape,
// no backfill migration.
//
// Stable ids matter beyond this table: this is deliberately the shape
// Knowledge/Discovery will eventually want to surface an individual
// approved finding by (see the Research Sources expansion plan) — an id
// assigned here, once approved, never has to change to support that
// later, no format migration required.
import { isDocumentType, type DocumentType } from "@/lib/library-documents/constants";
import { IntelligenceError } from "@/lib/intelligence/types";

export const DOCUMENT_ANALYSIS_SCHEMA_VERSION = 2;
export const MAX_TAGS = 10;
export const MAX_QUOTES = 8;
export const MAX_QUOTE_LENGTH = 320;

export type ProvenanceRef = {
  chunk_id: string;
  chunk_index: number;
  /** Technical, always-reliable PDF page index. */
  page_start: number | null;
  page_end: number | null;
  /** Best-effort, human-readable printed folio detected from the page
   * image (e.g. "4–5" for a two-page spread) — null when not legible.
   * Prefer this over page_start/page_end for display; added by the visual
   * pipeline (Research Sources expansion plan, deep-intelligence step 4),
   * present in the type now so the review UI can be built against its
   * final shape before that step lands. */
  printed_page_label: string | null;
  section_label: string | null;
  /** Whether this citation points at extracted text or a vision-model
   * description of the page's visual content — lets the review UI show
   * "from a chart on this page" distinctly from "from the text". */
  evidence_kind: "text" | "visual";
  /** A short, exact excerpt the model says this was drawn from — for a
   * reviewer to visually confirm against the chunk. Never re-validated
   * against the chunk's own text (the model may paraphrase slightly). */
  quote: string | null;
};

export type DocumentFinding = { id: string; text: string; provenance: ProvenanceRef[] };
export type DocumentStatistic = { id: string; text: string; value: string | null; provenance: ProvenanceRef[] };
export type DocumentRecommendation = { id: string; text: string; provenance: ProvenanceRef[] };
export type DocumentQuote = {
  id: string;
  text: string;
  attribution: string | null;
  /** Which finding/theme this quote substantiates — free text, not an
   * index into key_findings, since a quote can support a theme that isn't
   * itself a single extracted finding. */
  theme: string | null;
  provenance: ProvenanceRef[];
};
export type DocumentMethodologyNote = { id: string; text: string };
export type DocumentLimitation = { id: string; text: string };

/** A report's own named organising model (e.g. "Flexibility, Affordability,
 * Gamification, Video, Authenticity") — captured as its own structured
 * field rather than flattened into topics, since it represents the
 * document's own argument structure, not just a theme it touches on. Null
 * when the document doesn't propose one — never invented to fill the
 * field. */
export type ReportFrameworkComponent = { label: string; description: string };
export type ReportFramework = { name: string; components: ReportFrameworkComponent[] };

/** Grounded in the document itself only — no external/background
 * knowledge about the publisher (see this file's header comment and the
 * Research Sources expansion plan's Author Perspective decision). Built
 * from what the document says about its own publisher/author and whether
 * its own recommendations concentrate around that publisher's apparent
 * business. Worded as context, not an accusation — see
 * buildAuthorPerspectiveInstruction below for the exact framing rule.
 * Null when source_publisher itself is unknown — there's nothing to
 * assess. */
export type AuthorPerspective = {
  publisher_description: string | null;
  commercial_interest_note: string | null;
  independence_note: string;
} | null;

/** AI-tagged, individually checkable disclosure facts — never an AI-judged
 * holistic score. Each is a plain yes/no read of whether the document
 * itself states this, not an inference. */
export type ResearchQualitySignals = {
  methodology_disclosed: boolean;
  sample_size_disclosed: boolean;
  geography_disclosed: boolean;
  fieldwork_dates_disclosed: boolean;
  demographic_definitions_disclosed: boolean;
  source_type: "primary" | "secondary" | "mixed" | "unclear";
};

export type EvidenceStrength = "robust" | "directional" | "limited";

/** evidence_strength and rationale are CODE-computed from the signals
 * above (see computeEvidenceStrength) — never AI-judged. This is the same
 * "AI tags atomic facts, code derives the classification" discipline
 * lib/intelligence/analysts/analyseExecutiveReport.ts already uses for
 * corroboration/method_diversity/answer_status: a transparent, auditable
 * rule over checkable facts, not an opaque LLM credibility score. */
export type ResearchQualityAssessment = ResearchQualitySignals & {
  evidence_strength: EvidenceStrength;
  rationale: string;
};

export type DocumentAnalysisContent = {
  schema_version: number;
  title: string;
  source_publisher: string | null;
  publication_date: string | null;
  /** The AI's own suggestion — document_type itself is chosen by the
   * uploader at upload time and stays authoritative unless a reviewer
   * changes it to match this suggestion. */
  suggested_document_type: DocumentType | null;
  markets: string[];
  sports_competitions: string[];
  audience_segments: string[];
  brands_mentioned: string[];
  topics: string[];
  tags: string[];
  report_framework: ReportFramework | null;
  key_findings: DocumentFinding[];
  statistics: DocumentStatistic[];
  document_recommendations: DocumentRecommendation[];
  quotes: DocumentQuote[];
  methodology_notes: DocumentMethodologyNote[];
  limitations: DocumentLimitation[];
  research_quality: ResearchQualityAssessment;
  author_perspective: AuthorPerspective;
  executive_summary: string;
  generated_at: string;
};

// ── What the model is actually asked to return ──────────────────────────
// No ids, no resolved chunk/page data — only what a model can be trusted
// to produce. validateDocumentAnalysisContent below is the only place a
// RawDocumentAnalysis becomes a DocumentAnalysisContent. Every field is
// optional here regardless of the prompt's own instructions — this type
// describes untrusted external JSON, not a guarantee.
export type RawProvenanceRef = { chunk_index?: number; quote?: string | null };
export type RawDocumentFinding = { text?: string; provenance?: RawProvenanceRef[] };
export type RawDocumentStatistic = { text?: string; value?: string | null; provenance?: RawProvenanceRef[] };
export type RawDocumentRecommendation = { text?: string; provenance?: RawProvenanceRef[] };
export type RawDocumentQuote = { text?: string; attribution?: string | null; theme?: string | null; provenance?: RawProvenanceRef[] };
export type RawReportFramework = { name?: string; components?: { label?: string; description?: string }[] } | null;
export type RawAuthorPerspective = { publisher_description?: string | null; commercial_interest_note?: string | null; independence_note?: string } | null;
export type RawResearchQualitySignals = {
  methodology_disclosed?: boolean;
  sample_size_disclosed?: boolean;
  geography_disclosed?: boolean;
  fieldwork_dates_disclosed?: boolean;
  demographic_definitions_disclosed?: boolean;
  source_type?: string;
};

export type RawDocumentAnalysis = {
  title?: string;
  source_publisher?: string | null;
  /** What the document itself says about its publisher's business,
   * expertise or focus (e.g. an "about us" section or byline) — Stage A's
   * job to extract, since Stage B (lib/intelligence/analysts/
   * analyseDocument.ts) never sees raw source text, only Stage A's
   * validated output; without this field Stage B would have nothing
   * grounded to build author_perspective's commercial_interest_note from.
   * Not part of DocumentAnalysisContent itself — consumed directly by
   * analyseDocument() and folded into the final author_perspective. */
  publisher_description?: string | null;
  publication_date?: string | null;
  suggested_document_type?: string | null;
  markets?: unknown[];
  sports_competitions?: unknown[];
  audience_segments?: unknown[];
  brands_mentioned?: unknown[];
  topics?: unknown[];
  tags?: unknown[];
  report_framework?: RawReportFramework;
  key_findings?: (RawDocumentFinding | null)[];
  statistics?: (RawDocumentStatistic | null)[];
  document_recommendations?: (RawDocumentRecommendation | null)[];
  quotes?: (RawDocumentQuote | null)[];
  methodology_notes?: (string | { text?: string } | null)[];
  limitations?: (string | { text?: string } | null)[];
  research_quality?: RawResearchQualitySignals;
  author_perspective?: RawAuthorPerspective;
  executive_summary?: string;
};

export type ChunkLookup = {
  id: string;
  chunk_index: number;
  page_start: number | null;
  page_end: number | null;
  printed_page_label: string | null;
  section_label: string | null;
  /** 'text' (extracted from the document) or 'visual' (a vision-model
   * description of a rendered page's chart/quote/callout content) — see
   * supabase-migration-103.sql. Prompt-display only; provenance
   * validation/resolution treats both kinds identically. */
  evidence_kind: "text" | "visual";
};

/** Models occasionally emit the literal string "null" (or "n/a") instead of
 * a JSON null when a field genuinely doesn't apply — a plain `?.trim() ||
 * null` doesn't catch that, since the string is non-empty and truthy. Used
 * everywhere a raw nullable string field is normalised. */
export function nullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^(null|n\/a|none)$/i.test(trimmed) ? null : trimmed;
}

function dedupeStrings(arr: unknown[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr ?? []) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    out.push(trimmed);
  }
  return out;
}

function textOf(item: string | { text?: string } | null | undefined): string | null {
  if (typeof item === "string") return nullableText(item);
  if (item && typeof item.text === "string") return nullableText(item.text);
  return null;
}

function cap(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen - 1).trimEnd()}…` : text;
}

/** Resolves and validates provenance references against the document's
 * REAL chunks — an out-of-range or hallucinated chunk_index is dropped,
 * never fabricated, identical discipline to clampReferences. */
function normaliseProvenance(refs: RawProvenanceRef[] | undefined, chunksByIndex: Map<number, ChunkLookup>): ProvenanceRef[] {
  if (!refs) return [];
  const seen = new Set<number>();
  const out: ProvenanceRef[] = [];
  for (const r of refs) {
    if (!r || typeof r.chunk_index !== "number" || !Number.isInteger(r.chunk_index) || seen.has(r.chunk_index)) continue;
    const chunk = chunksByIndex.get(r.chunk_index);
    if (!chunk) continue;
    seen.add(r.chunk_index);
    out.push({
      chunk_id: chunk.id,
      chunk_index: chunk.chunk_index,
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      printed_page_label: chunk.printed_page_label,
      section_label: chunk.section_label,
      evidence_kind: chunk.evidence_kind,
      quote: typeof r.quote === "string" && r.quote.trim() ? r.quote.trim() : null,
    });
  }
  return out;
}

function normaliseReportFramework(raw: RawReportFramework | undefined): ReportFramework | null {
  const name = raw?.name?.trim();
  if (!name) return null;
  const components = (raw?.components ?? [])
    .map(c => {
      const label = c?.label?.trim();
      if (!label) return null;
      return { label, description: c?.description?.trim() ?? "" };
    })
    .filter((c): c is ReportFrameworkComponent => c !== null);
  // A "framework" with fewer than two named components isn't really an
  // organising model — dropped rather than stored as a near-empty stub.
  if (components.length < 2) return null;
  return { name, components };
}

const VALID_SOURCE_TYPES = new Set(["primary", "secondary", "mixed", "unclear"]);

/** Never assumes disclosure when the model's output is missing/malformed
 * — defaults to false/"unclear", the evidentially cautious reading,
 * matching how computeEvidenceStrength below treats an undisclosed
 * dimension as counting against, not for, evidence strength. */
function normaliseResearchQualitySignals(raw: RawResearchQualitySignals | undefined): ResearchQualitySignals {
  return {
    methodology_disclosed: raw?.methodology_disclosed === true,
    sample_size_disclosed: raw?.sample_size_disclosed === true,
    geography_disclosed: raw?.geography_disclosed === true,
    fieldwork_dates_disclosed: raw?.fieldwork_dates_disclosed === true,
    demographic_definitions_disclosed: raw?.demographic_definitions_disclosed === true,
    source_type: raw?.source_type && VALID_SOURCE_TYPES.has(raw.source_type) ? (raw.source_type as ResearchQualitySignals["source_type"]) : "unclear",
  };
}

const DISCLOSURE_LABELS: Record<keyof Omit<ResearchQualitySignals, "source_type">, string> = {
  methodology_disclosed: "methodology",
  sample_size_disclosed: "sample size",
  geography_disclosed: "research geography",
  fieldwork_dates_disclosed: "fieldwork dates",
  demographic_definitions_disclosed: "demographic definitions",
};

/** The one place evidence_strength and its rationale are decided — a
 * transparent count over five checkable disclosure facts, never an AI
 * judgement call. See ResearchQualityAssessment's own doc comment. */
export function computeEvidenceStrength(signals: ResearchQualitySignals): { evidence_strength: EvidenceStrength; rationale: string } {
  const keys = Object.keys(DISCLOSURE_LABELS) as (keyof typeof DISCLOSURE_LABELS)[];
  const missing = keys.filter(k => !signals[k]);
  const disclosedCount = keys.length - missing.length;

  const evidence_strength: EvidenceStrength = disclosedCount >= 4 ? "robust" : disclosedCount >= 2 ? "directional" : "limited";

  const closing = evidence_strength === "robust"
    ? "findings can be treated as reasonably well-substantiated."
    : evidence_strength === "directional"
    ? "findings should be treated as directional rather than definitive."
    : "findings should be treated as directional only, not robust standalone research.";

  const rationale = missing.length === 0
    ? `Methodology, sample size, research geography, fieldwork dates and demographic definitions are all disclosed; ${closing}`
    : `${missing.map(k => DISCLOSURE_LABELS[k]).join(", ")} ${missing.length === 1 ? "is" : "are"} not disclosed; ${closing}`;

  return { evidence_strength, rationale };
}

/** Exported for Stage B (lib/intelligence/analysts/analyseDocument.ts) to
 * reuse directly on its own completion — the same "grounded, or null"
 * normalisation applies whether the raw author_perspective object came
 * from Stage A (unused now that Stage B owns this field exclusively) or
 * Stage B. */
export function normaliseAuthorPerspective(raw: RawAuthorPerspective | undefined, sourcePublisher: string | null): AuthorPerspective {
  // Nothing to assess without a known publisher — never fabricated.
  if (!sourcePublisher) return null;
  const independence_note = nullableText(raw?.independence_note);
  if (!independence_note) return null;
  return {
    publisher_description: nullableText(raw?.publisher_description),
    commercial_interest_note: nullableText(raw?.commercial_interest_note),
    independence_note,
  };
}

/** The only place a raw model completion becomes a stored
 * DocumentAnalysisContent. Assigns every item's stable id here, resolves
 * every provenance reference against the document's real chunks (dropping,
 * never fabricating, anything that doesn't resolve), computes
 * evidence_strength deterministically, and throws IntelligenceError on a
 * genuinely unusable completion (no title, no findings at all) rather
 * than storing something misleadingly empty. */
export function validateDocumentAnalysisContent(raw: RawDocumentAnalysis, chunks: ChunkLookup[]): DocumentAnalysisContent {
  const chunksByIndex = new Map(chunks.map(c => [c.chunk_index, c]));

  const title = raw.title?.trim();
  if (!title) throw new IntelligenceError(500, "Document analysis did not produce a title.");

  const key_findings: DocumentFinding[] = (raw.key_findings ?? [])
    .map(f => {
      const text = f?.text?.trim();
      if (!text) return null;
      return { id: crypto.randomUUID(), text, provenance: normaliseProvenance(f?.provenance, chunksByIndex) };
    })
    .filter((f): f is DocumentFinding => f !== null);

  if (key_findings.length === 0) {
    throw new IntelligenceError(500, "Document analysis did not produce any key findings.");
  }

  const statistics: DocumentStatistic[] = (raw.statistics ?? [])
    .map(s => {
      const text = s?.text?.trim();
      if (!text) return null;
      return {
        id: crypto.randomUUID(),
        text,
        value: nullableText(s?.value),
        provenance: normaliseProvenance(s?.provenance, chunksByIndex),
      };
    })
    .filter((s): s is DocumentStatistic => s !== null);

  const document_recommendations: DocumentRecommendation[] = (raw.document_recommendations ?? [])
    .map(r => {
      const text = r?.text?.trim();
      if (!text) return null;
      return { id: crypto.randomUUID(), text, provenance: normaliseProvenance(r?.provenance, chunksByIndex) };
    })
    .filter((r): r is DocumentRecommendation => r !== null);

  const quotes: DocumentQuote[] = (raw.quotes ?? [])
    .map(q => {
      const text = q?.text?.trim();
      if (!text) return null;
      return {
        id: crypto.randomUUID(),
        text: cap(text, MAX_QUOTE_LENGTH),
        attribution: nullableText(q?.attribution),
        theme: nullableText(q?.theme),
        provenance: normaliseProvenance(q?.provenance, chunksByIndex),
      };
    })
    .filter((q): q is DocumentQuote => q !== null)
    .slice(0, MAX_QUOTES);

  const methodology_notes: DocumentMethodologyNote[] = (raw.methodology_notes ?? [])
    .map(textOf)
    .filter((t): t is string => t !== null)
    .map(text => ({ id: crypto.randomUUID(), text }));

  const limitations: DocumentLimitation[] = (raw.limitations ?? [])
    .map(textOf)
    .filter((t): t is string => t !== null)
    .map(text => ({ id: crypto.randomUUID(), text }));

  const signals = normaliseResearchQualitySignals(raw.research_quality);
  const { evidence_strength, rationale } = computeEvidenceStrength(signals);

  const source_publisher = nullableText(raw.source_publisher);

  return {
    schema_version: DOCUMENT_ANALYSIS_SCHEMA_VERSION,
    title,
    source_publisher,
    publication_date: nullableText(raw.publication_date),
    suggested_document_type: isDocumentType(raw.suggested_document_type) ? raw.suggested_document_type : null,
    markets: dedupeStrings(raw.markets),
    sports_competitions: dedupeStrings(raw.sports_competitions),
    audience_segments: dedupeStrings(raw.audience_segments),
    brands_mentioned: dedupeStrings(raw.brands_mentioned),
    topics: dedupeStrings(raw.topics),
    tags: dedupeStrings(raw.tags).slice(0, MAX_TAGS),
    report_framework: normaliseReportFramework(raw.report_framework),
    key_findings,
    statistics,
    document_recommendations,
    quotes,
    methodology_notes,
    limitations,
    research_quality: { ...signals, evidence_strength, rationale },
    author_perspective: normaliseAuthorPerspective(raw.author_perspective, source_publisher),
    executive_summary: raw.executive_summary?.trim() || "",
    generated_at: new Date().toISOString(),
  };
}
