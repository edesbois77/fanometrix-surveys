// The one Fanometrix report colour source of truth — every report page,
// the shared review components, the PPTX export, and the Workspace's own
// action primitives all import these instead of redeclaring the same two
// hex values locally. Pure constants, no framework dependency, safe to
// import from client or server code.
export const NAVY = "#0B1929";
export const GOLD = "#D7B87A";

// Neutral surface tint for supporting/reference material (Sources,
// Evidence stat boxes) — kept visually distinct from the white primary
// content cards (Executive Summary, Section) so "reference info" and
// "editorial content" read as different kinds of material, not just more
// of the same card. Previously duplicated ad hoc as raw hex on the
// Executive Report's synthetic-research notice box.
export const PAPER = "#FBF9F4";
export const PAPER_LINE = "#EDE3CC";

// One {ink, wash, line} triple per report tone — every Section header,
// numbered marker, tag pill and bordered callout box across Survey,
// Conversation and Executive reports draws from this single table instead
// of each page redeclaring its own saturated Tailwind colour (green-100,
// indigo-50, amber-50...). Muted and desaturated on purpose: colour marks
// meaning here, not decoration, so nothing needs to shout to be read.
// "navy" and "gold" sit alongside the four semantic tones so every section
// header, regardless of subject, resolves through the same lookup.
export const REPORT_TONES = {
  navy:       { ink: "#0B1929", wash: "#EDEFF2", line: "#D7DBE0" },
  gold:       { ink: "#8A6D2F", wash: "#FBF3E1", line: "#EDE3CC" },
  positive:   { ink: "#3F5D42", wash: "#EEF3EC", line: "#D3E0D0" },
  concern:    { ink: "#8A4B33", wash: "#F7ECE6", line: "#E8D2C4" },
  difference: { ink: "#48586B", wash: "#EEF1F4", line: "#D6DCE3" },
  neutral:    { ink: "#6B6459", wash: "#F4F2EE", line: "#E4E0D8" },
} as const;

export type ReportTone = keyof typeof REPORT_TONES;
