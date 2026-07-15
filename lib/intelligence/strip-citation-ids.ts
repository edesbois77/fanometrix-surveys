// Pure display helper: removes the raw internal citation tokens the model
// sometimes echoes into Full Research Report prose — composite evidence
// IDs like "[survey:…:q1_by_market]" or "[document:…]" (copied from the
// chart-menu / quote-pool labels it was shown), and bare index citations
// like "[4]" or "[10, 13]". These are internal references, not
// client-facing text; the human-readable evidence links live in the
// separate "Evidence" reference chips beside each section, which this does
// not touch. Applied at RENDER time only (on-screen read view, PDF print
// via that view, and the PPTX export) — it never mutates stored report
// content, so the underlying draft is unchanged and editing still shows
// exactly what was generated.
//
// Deliberately generic: it keys off the shape of an ID token (a bracketed
// lowercase prefix + colon + non-space payload, or a bracketed number
// list), never off any specific source, market or wording, so it works for
// every project.
export function stripCitationIds(text: string): string {
  if (!text) return text;
  return text
    // Composite IDs: "[survey:16165368-…:q1_by_Spain]", "[s:…]", "[document:…]".
    // A bracketed lowercase prefix, a colon, then non-space payload.
    .replace(/\[[a-z_]+:[^\]\s]*\]/gi, "")
    // Bare index citations the model uses inline: "[4]", "[10, 13]".
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "")
    // Tidy the fallout: an emptied parenthetical "(, )" the stripped IDs
    // left behind, doubled spaces, and a space now sitting before
    // punctuation.
    .replace(/\(\s*[,;]*\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
