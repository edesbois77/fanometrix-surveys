// Typography system for the theme-gallery prototype.
// Isolated under /creative-lab/theme-gallery — no production dependencies.

export type TypographyMode = "system" | "electric";

export const FONT_GROTESK = "var(--font-space-grotesk, 'Space Grotesk', system-ui, sans-serif)";
export const FONT_INTER   = "var(--font-inter, 'Inter', system-ui, sans-serif)";
export const FONT_SYSTEM  = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

/** Font for questions / headings */
export const fontQ = (m: TypographyMode) => m === "electric" ? FONT_GROTESK : FONT_SYSTEM;

/** Font for answers, labels, body copy */
export const fontA = (m: TypographyMode) => m === "electric" ? FONT_INTER : FONT_SYSTEM;
