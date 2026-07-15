// Deterministic, content-aware emptiness predicates for optional report
// sections — the single source of truth shared by the Full Research Report's
// browser render (which the PDF export prints verbatim) and its PPTX
// exporter, so all three surfaces hide the same sections for the same
// reasons. No AI, no heuristics: a section is empty when it carries no
// meaningful human-readable content.
//
// The rules deliberately treat as EMPTY:
//   - an empty array;
//   - null / undefined;
//   - an array whose entries are all blank strings (or whitespace);
//   - an array of "placeholder-only" objects — e.g. the blanked Area of
//     Difference `{ finding: "", explanation: "", supporting_findings: [...] }`
//     a human left behind when they removed its text but not the row.
//
// And deliberately NOT empty:
//   - a genuine zero-valued statistic, because that lives inside a non-blank
//     string ("0% of respondents said...") and `hasText` sees a real string.
//     These predicates never inspect numeric meaning, only whether readable
//     text is present, so a meaningful "0%" is always kept.
//
// Each `with*` helper returns the FILTERED list (blanks dropped), so a
// caller both decides whether to render the section (non-empty result) AND
// iterates only the real entries — a section that is half real, half
// placeholder renders just the real half.

/** A value is meaningful text when it is a string with non-whitespace. */
export function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Non-blank strings only (handles null/undefined array). */
export function nonBlankStrings(arr: readonly (string | null | undefined)[] | null | undefined): string[] {
  return (arr ?? []).filter(hasText);
}

/** Entries whose `finding` carries real text — Areas of Agreement/Difference.
 * This is what drops the blanked placeholder Area-of-Difference object. */
export function withFinding<T extends { finding?: string | null }>(arr: readonly T[] | null | undefined): T[] {
  return (arr ?? []).filter(x => hasText(x?.finding));
}

/** Entries whose `action` carries real text — Recommendations. */
export function withAction<T extends { action?: string | null }>(arr: readonly T[] | null | undefined): T[] {
  return (arr ?? []).filter(x => hasText(x?.action));
}

/** Entries whose `insight` carries real text — Additional Evidence-Led Insights. */
export function withInsight<T extends { insight?: string | null }>(arr: readonly T[] | null | undefined): T[] {
  return (arr ?? []).filter(x => hasText(x?.insight));
}
