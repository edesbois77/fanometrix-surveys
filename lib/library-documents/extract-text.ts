// Server-only. Raw text extraction for the two v1-supported formats — PDF
// (page-boundary-aware) and DOCX (heading-boundary-aware, since DOCX has
// no native page concept). Kept deliberately separate from chunk-text.ts:
// this file only extracts labelled units of text (pages or sections);
// packing them into size-bounded chunks is a distinct concern.
//
// PDF worker configuration — required, not optional, in this environment:
// pdf-parse wraps pdfjs-dist's Node-oriented "legacy" build
// (pdfjs-dist/legacy/build/pdf.mjs) and loads its parsing worker via a
// path resolved relative to that module's own location. Left to Next.js's
// default server bundling, pdfjs-dist gets chunked into
// .next/.../server/chunks/... at a path that no longer matches what it
// expects, failing with "Setting up fake worker failed: Cannot find
// module .../pdf.worker.mjs" the first time a PDF is parsed.
//
// Two parts, both required:
//   1. next.config.ts's serverExternalPackages excludes pdf-parse and
//      pdfjs-dist from Next's own bundling — they load via native Node
//      resolution from their real node_modules location instead.
//   2. PDFParse.setWorker() below points GlobalWorkerOptions.workerSrc at
//      that real location explicitly.
//
// The path itself is built with plain path.join() from process.cwd(),
// deliberately NOT require.resolve()/import.meta.resolve() — Turbopack's
// production build (`next build`) statically traces even a require.resolve()
// call with a literal argument, and errors on the target's non-JS
// extensions ("Unknown module type") for pdfjs-dist's .bcmap/.pfb data
// files, and warns on its .mjs worker file, even though the package is
// already marked external and none of this is ever meant to be bundled.
// path.join() produces the identical real filesystem path with nothing
// for the bundler to try to trace or type — confirmed by running an actual
// `next build`, not just `next dev`, after this fix (dev-mode compilation
// alone did not surface the Turbopack-specific failure above). No copy of
// any pdfjs-dist file is placed under .next.
// MUST be first: installs DOMMatrix/Path2D/ImageData onto globalThis before
// pdf-parse (pdfjs-dist) is evaluated, which references them at load time and
// would otherwise throw "DOMMatrix is not defined" in the Node/Vercel runtime.
import "@/lib/library-documents/pdf-polyfills";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import path from "path";

const PDFJS_DIST_DIR = path.join(process.cwd(), "node_modules", "pdfjs-dist");
PDFParse.setWorker(path.join(PDFJS_DIST_DIR, "legacy", "build", "pdf.worker.mjs"));

// Also ships with pdfjs-dist — pointing these at pdfjs-dist's own bundled
// data (rather than leaving them unset, which just logs a recoverable
// warning per file parsed) avoids relying on non-embedded-font glyph-width
// guesses for any PDF whose fonts aren't embedded. Trailing separator
// required — pdfjs-dist treats these as directory URLs, not file paths.
const STANDARD_FONT_DATA_URL = path.join(PDFJS_DIST_DIR, "standard_fonts") + path.sep;
const CMAP_URL = path.join(PDFJS_DIST_DIR, "cmaps") + path.sep;

export type ExtractedPage = { num: number; text: string };
export type ExtractedSection = { label: string | null; text: string };

// Embedded PDF document metadata (the Info dictionary). Best-effort — used
// to seed Author/Title before falling back to AI extraction.
export type PdfInfo = { author: string | null; title: string | null };
export type PdfExtraction = { kind: "pdf"; pageCount: number; pages: ExtractedPage[]; info: PdfInfo };
export type DocxExtraction = { kind: "docx"; sections: ExtractedSection[] };

export async function extractPdf(buffer: Buffer): Promise<PdfExtraction> {
  const parser = new PDFParse({
    data: buffer,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
  });
  try {
    const result = await parser.getText();
    // Embedded document metadata (PDF Info dictionary: Author, Title, …).
    // Best-effort — a missing or garbled Info block must never fail text
    // extraction; the AI fills Author in from the contents when it's absent.
    let info: PdfInfo = { author: null, title: null };
    try {
      const infoResult = await parser.getInfo();
      const dict = (infoResult?.info ?? {}) as Record<string, unknown>;
      const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      info = { author: clean(dict.Author), title: clean(dict.Title) };
    } catch { /* metadata unavailable — leave nulls */ }
    return {
      kind: "pdf",
      pageCount: result.total,
      pages: result.pages.map(p => ({ num: p.num, text: p.text })),
      info,
    };
  } finally {
    await parser.destroy();
  }
}

export type RenderedPage = { pdfPageNumber: number; data: Buffer; width: number; height: number };

// scale 1.5 on a standard 612×792pt page renders at ~918×1188px — enough
// resolution for a vision model to read a printed footer folio and
// moderate chart labels reliably without an excessive per-image token
// cost (see analyseDocumentPages.ts for the "high" detail tradeoff this
// resolution is chosen alongside).
const PAGE_RENDER_SCALE = 1.5;

/** Renders every page to a PNG, backed by pdfjs-dist's own
 * @napi-rs/canvas dependency (a prebuilt native binary, not compiled from
 * source — confirmed working in this environment via a standalone spike
 * before this was wired in). Uses the same PDFParse instance/worker
 * config as extractPdf — deliberately not a second PDF parse of the same
 * buffer; callers needing both text and images call both functions on
 * their own PDFParse instance, parsing happens once per instance either
 * way since pdfjs-dist caches per-document internally. */
export async function renderPdfPages(buffer: Buffer): Promise<RenderedPage[]> {
  const parser = new PDFParse({
    data: buffer,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
  });
  try {
    const result = await parser.getScreenshot({ scale: PAGE_RENDER_SCALE });
    return result.pages.map(p => ({ pdfPageNumber: p.pageNumber, data: Buffer.from(p.data), width: p.width, height: p.height }));
  } finally {
    await parser.destroy();
  }
}

// [\s\S]*? instead of a dotAll ('s') flag — this project's TS target
// (ES2017) predates the 's' regex flag.
const HEADING_TAG = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;

// mammoth's convertToHtml output is conservative/predictable enough (no
// scripts, no attributes worth preserving) that a regex-based strip is
// sufficient here — this is not a general-purpose HTML sanitiser.
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

/** Splits on Word's Heading 1-6 styles (mammoth's default style map maps
 * these to <h1>-<h6>) so each section carries a real, human-written label —
 * not a fabricated "Section N". A document with no headings at all becomes
 * one section with label: null, which chunk-text.ts already treats as "no
 * section provenance available", the same as a DOCX section legitimately
 * has no page number. */
export async function extractDocx(buffer: Buffer): Promise<DocxExtraction> {
  const html = await mammoth.convertToHtml({ buffer });
  const matches = [...html.value.matchAll(HEADING_TAG)];

  const sections: ExtractedSection[] = [];

  if (matches.length === 0) {
    const text = stripHtml(html.value);
    if (text) sections.push({ label: null, text });
    return { kind: "docx", sections };
  }

  const preambleText = stripHtml(html.value.slice(0, matches[0].index));
  if (preambleText) sections.push({ label: null, text: preambleText });

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : html.value.length;
    const label = stripHtml(matches[i][1]) || null;
    const text = stripHtml(html.value.slice(start, end));
    if (text) sections.push({ label, text });
  }

  return { kind: "docx", sections };
}
