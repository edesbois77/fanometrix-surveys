// Shared synthesis mechanic reused by both Library-mode document analysis
// (analyseDocument.ts's Stage B) and Project-mode Document Intelligence
// (analyseDocumentForProject.ts). Same reasoning depth and evidence
// discipline in both modes — only the organising question differs (the
// document's own central argument vs. one Research Project's Research
// Question). Project mode is NOT a second, weaker analysis pipeline: it
// runs this exact mechanic again, over the exact same full evidence pool,
// with the organising question swapped — never a pre-filtered subset of
// it. See analyseDocumentForProject.ts's header comment for the full
// architecture decision.
import type {
  DocumentFinding, DocumentStatistic, DocumentQuote, DocumentRecommendation, ReportFramework,
} from "@/lib/library-documents/analysis-schema";

/** Re-orders (never drops, never invents) a validated evidence array by a
 * significance judgement — an index the model omitted or got wrong keeps
 * its original relative position, appended after the ranked ones, so a
 * malformed ordering can only fail to improve the order, never lose an
 * item. Same "derived, not freeform" discipline as
 * lib/intelligence/validate-references.ts's clampReferences, adapted for a
 * full re-ordering rather than a reference subset. This is THE mechanic
 * that keeps both Library and Project mode "the full evidence pool,
 * reordered by relevance," never "a filtered subset" — see the Research
 * Sources expansion plan's Document Intelligence architecture decision. */
export function reorderBySignificance<T>(items: T[], order: number[] | undefined): T[] {
  if (!Array.isArray(order)) return items;
  const seen = new Set<number>();
  const reordered: T[] = [];
  for (const idx of order) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= items.length || seen.has(idx)) continue;
    seen.add(idx);
    reordered.push(items[idx]);
  }
  for (let i = 0; i < items.length; i++) {
    if (!seen.has(i)) reordered.push(items[i]);
  }
  return reordered;
}

/** Recovers, for every item in a reordered array, the index it originally
 * held before reordering — needed wherever a model's own output (e.g.
 * recommended_actions[].based_on_findings) cites an index into the
 * ORIGINAL, pre-reorder list (the numbering it was actually shown in the
 * prompt), but the report exposes only the reordered array. Relies on
 * reorderBySignificance never cloning items (same object references
 * throughout), so identity lookup is exact, not approximate. */
export function buildOriginalIndexLookup<T>(original: T[], reordered: T[]): Map<number, number> {
  const originalIndexByItem = new Map(original.map((item, i) => [item, i]));
  const positionByOriginalIndex = new Map<number, number>();
  reordered.forEach((item, newPosition) => {
    const originalIndex = originalIndexByItem.get(item);
    if (originalIndex !== undefined) positionByOriginalIndex.set(originalIndex, newPosition);
  });
  return positionByOriginalIndex;
}

export function describeFindingsForPrompt(findings: DocumentFinding[]): string {
  return findings.map((f, i) => `[${i}] ${f.text}`).join("\n") || "(none)";
}

export function describeStatisticsForPrompt(statistics: DocumentStatistic[]): string {
  return statistics.map((s, i) => `[${i}] ${s.value ? `${s.value}: ` : ""}${s.text}`).join("\n") || "(none)";
}

export function describeRecommendationsForPrompt(recommendations: DocumentRecommendation[]): string {
  return recommendations.map(r => `- ${r.text}`).join("\n") || "(none)";
}

export function describeQuotesForPrompt(quotes: DocumentQuote[]): string {
  return quotes.map(q => `- "${q.text}"${q.attribution ? ` — ${q.attribution}` : ""}${q.theme ? ` (theme: ${q.theme})` : ""}`).join("\n") || "(none)";
}

export function describeFrameworkForPrompt(framework: ReportFramework | null): string {
  return framework
    ? `"${framework.name}" — ${framework.components.map(c => `${c.label} (${c.description})`).join("; ")}`
    : "(no named framework)";
}
