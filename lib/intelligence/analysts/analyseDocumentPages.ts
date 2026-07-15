// Reusable analyst: visual analysis of a document's rendered page images —
// detects the human-readable printed page number/range (distinct from the
// technical PDF page index, which is always already known from rendering)
// and describes chart/pull-quote/callout content that a text-only
// extraction pass cannot see. Batched (several images per call, not one
// call per page) to control cost/latency — see this file's own BATCH_SIZE.
//
// Deliberately produces plain-language descriptions, not structured chart
// data (exact series/values) — see this file's header comment in the
// Research Sources expansion plan's deep-intelligence design: a chart's
// precise values are only trustworthy if clearly legible, and the prompt
// below is explicit that an illegible value must be described
// qualitatively, never guessed. The output of this analyst becomes
// ordinary chunk rows (evidence_kind='visual') that the main document
// analyst (analyseDocument.ts) cites exactly like text chunks — this is
// what "reconciled, not a competing pipeline" means in practice: no
// separate visual-findings validation path, the same chunk-citation
// discipline applies uniformly.
import { completeJSON } from "@/lib/intelligence/openai";

export type PageForVisualAnalysis = { pdfPageNumber: number; dataUrl: string };
export type PageVisualResult = { pdfPageNumber: number; printedPageLabel: string | null; visualNotes: string | null };

// 4 images per call — a compact-enough payload to keep individual
// requests fast and reliable, without the per-call prompt-instruction
// overhead of one call per page. Tune upward only if real documents show
// this is unnecessarily conservative; downward if OpenAI payload/latency
// limits prove tighter than expected.
const BATCH_SIZE = 4;

type RawPageVisualResult = { pdf_page_number?: number; printed_page_label?: string | null; visual_notes?: string | null };
type RawVisualBatchResult = { pages?: RawPageVisualResult[] };

function buildVisualAnalysisPrompt(pages: PageForVisualAnalysis[]): string {
  const imageList = pages.map((p, i) => `Image ${i + 1} = PDF page ${p.pdfPageNumber}`).join("\n");
  return `You are visually analysing scanned pages from a PDF document, provided below as images, in this order:
${imageList}

For EACH image, in the same order, report:
- "pdf_page_number": copy the exact PDF page number stated above for that image — never renumber or guess.
- "printed_page_label": the human-readable page number or range PRINTED ON THE PAGE ITSELF, usually in a header or footer (e.g. "4-5" for a two-page spread, or "12"). The JSON literal null if no page number is clearly legible on the page — this is a common, correct answer, do not guess one.
- "visual_notes": a plain-language description of anything on this page that is a chart, graph, pull-quote, highlighted or callout statistic, or another visually distinct element NOT already fully captured by reading the page as ordinary paragraph text. The JSON literal null if the page has nothing like this (e.g. it's plain body text, or a cover page with just a title).

CRITICAL, non-negotiable:
- Only report a precise number, percentage or figure from a chart if it is clearly and unambiguously legible in the image. If a chart's exact value is not crisply readable, describe the pattern qualitatively instead (e.g. "the largest segment", "roughly a third", "well below the others") — never guess or estimate a precise figure you cannot actually read.
- Never invent a quote, statistic or label that isn't visibly present on the page.
- Not every page has a distinct visual element — "null" for "visual_notes" is expected and correct for most plain-text pages.

Return ONLY valid JSON:
{ "pages": [ { "pdf_page_number": 0, "printed_page_label": "..." or null, "visual_notes": "..." or null } ] }`;
}

/** Trusts the model's own reported pdf_page_number when it's a valid
 * member of this batch; falls back to positional matching (i-th result to
 * i-th page sent) only when that fails — never drops a page's result
 * outright just because the label came back malformed. */
function reconcileBatchResults(batch: PageForVisualAnalysis[], raw: RawVisualBatchResult): PageVisualResult[] {
  const rawPages = raw.pages ?? [];

  return batch.map((page, i) => {
    // Prefer a result that correctly echoed this page's own number; fall
    // back to positional order (i-th result for the i-th page sent) if
    // the model's echoed number came back missing or malformed — never
    // drop a page's result outright just because the label was off.
    const byNumber = rawPages.find(r => r.pdf_page_number === page.pdfPageNumber);
    const candidate = byNumber ?? rawPages[i];
    return {
      pdfPageNumber: page.pdfPageNumber,
      printedPageLabel: typeof candidate?.printed_page_label === "string" && candidate.printed_page_label.trim() ? candidate.printed_page_label.trim() : null,
      visualNotes: typeof candidate?.visual_notes === "string" && candidate.visual_notes.trim() ? candidate.visual_notes.trim() : null,
    };
  });
}

function batchPages(pages: PageForVisualAnalysis[]): PageForVisualAnalysis[][] {
  const batches: PageForVisualAnalysis[][] = [];
  for (let i = 0; i < pages.length; i += BATCH_SIZE) batches.push(pages.slice(i, i + BATCH_SIZE));
  return batches;
}

export async function analyseDocumentPages(pages: PageForVisualAnalysis[]): Promise<PageVisualResult[]> {
  const results: PageVisualResult[] = [];
  for (const batch of batchPages(pages)) {
    const raw = await completeJSON<RawVisualBatchResult>({
      prompt: buildVisualAnalysisPrompt(batch),
      model: "gpt-4o",
      temperature: 0.2,
      maxTokens: 1536,
      images: batch.map(p => ({ dataUrl: p.dataUrl, detail: "high" })),
    });
    results.push(...reconcileBatchResults(batch, raw));
  }
  return results;
}
