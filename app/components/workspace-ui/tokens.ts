// ─────────────────────────────────────────────────────────────────────────────
// Fanometrix Workspace — Design Tokens (UI v2, Phase 1)
// ─────────────────────────────────────────────────────────────────────────────
//
// The single source of truth for the visual foundation every Research Project
// area (Overview, Research, Execution, Dashboard, Analysis, Reports,
// Conclusions) inherits. The goal is a calm, premium, information-dense
// workspace closer to Linear / Stripe / Vercel / Notion than a traditional
// survey tool: neutral surfaces, restrained accent colour, generous
// whitespace, and typography doing most of the work.
//
// Two consumers, one source:
//   • JS/inline styles import the constants below.
//   • CSS / Tailwind arbitrary values read the matching custom properties
//     declared in app/globals.css (kept byte-for-byte in sync with this file).
//
// Brand hues (NAVY, GOLD, PAPER) still live in lib/intelligence/theme.ts — the
// report engine, PPTX export and this foundation all import them from there so
// there is exactly one definition. This module layers the neutral system and
// the semantic scale on top; it never redefines the brand.

import { NAVY, GOLD } from "@/lib/intelligence/theme";

export { NAVY, GOLD };

// ── Neutral surface & text scale ─────────────────────────────────────────────
// A cool, slightly-blue grey ramp. Deliberately restrained: the workspace is
// mostly white cards floating on a soft page wash, separated by hairline
// borders rather than heavy shadows. Text uses near-black (not pure #000) so
// long-form reading stays soft.
export const COLOR = {
  // Backgrounds — three levels of surface hierarchy.
  pageBg:     "#F6F7F9", // the app content canvas behind every card
  surface:    "#FFFFFF", // the default card / panel
  surfaceSunken: "#F1F3F5", // insets, wells, code/preview areas, table zebra
  surfaceHover:  "#F8F9FB", // row / card hover
  surfaceCover:  "#ECEFF3", // full-width project "cover" band (borderless editorial zone)

  // Borders — hairlines carry the structure so shadows can stay whisper-light.
  borderSubtle:  "#EEF0F3", // card-internal dividers, low-emphasis separation
  borderDefault: "#E3E6EA", // card outlines, inputs at rest
  borderStrong:  "#D4D8DE", // hover / focus-adjacent emphasis

  // Text — four steps of emphasis.
  textPrimary:   "#181B20", // headings, primary values
  textSecondary: "#565E6B", // body copy, descriptions
  textTertiary:  "#858D99", // meta, captions, muted labels
  textDisabled:  "#AAB0B9",

  // Accents (brand). Used sparingly — one gold moment per surface.
  accent:      GOLD,
  accentInk:   "#8A6D2F", // gold text on light backgrounds (AA-legible)
  accentWash:  "#FBF3E1", // gold tint fill
  brand:       NAVY,
} as const;

// ── Semantic tones ───────────────────────────────────────────────────────────
// Muted on purpose — colour marks meaning (a status, a confidence), never
// decoration, so nothing shouts. Each tone is a {ink, wash, line} triple:
// ink = text/icon, wash = fill, line = border. Aligned with REPORT_TONES so
// badges and report callouts read as one family.
export const TONE = {
  neutral:  { ink: "#565E6B", wash: "#F1F3F5", line: "#E3E6EA" },
  info:     { ink: "#3B5A8A", wash: "#EEF3FB", line: "#D6E2F1" },
  success:  { ink: "#3F5D42", wash: "#EEF3EC", line: "#D3E0D0" },
  warning:  { ink: "#8A6A2F", wash: "#FBF3E1", line: "#ECDCB8" },
  danger:   { ink: "#8A4B33", wash: "#F7ECE6", line: "#E8D2C4" },
  accent:   { ink: "#8A6D2F", wash: "#FBF3E1", line: "#EDE3CC" },
} as const;

export type Tone = keyof typeof TONE;

// ── Spacing scale (px) ───────────────────────────────────────────────────────
// A 4px base grid. Components compose from these rather than ad-hoc values so
// vertical rhythm stays consistent across every area.
export const SPACE = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48, "4xl": 64,
} as const;

// ── Typography ───────────────────────────────────────────────────────────────
// One family (Geist, wired in globals.css), a compact type ramp, and tracking
// that tightens as size grows — the Linear/Stripe signature. `eyebrow` is the
// small uppercase label used above section titles and on stat tiles.
export const TYPE = {
  fontSans: "var(--font-geist), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontMono: "var(--font-geist-mono), ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  // size / line-height / tracking, as Tailwind-friendly descriptors.
  scale: {
    eyebrow: { size: "11px", weight: 600, tracking: "0.08em", transform: "uppercase" },
    caption: { size: "12px", weight: 500, tracking: "0" },
    body:    { size: "14px", weight: 400, tracking: "0" },
    title:   { size: "18px", weight: 700, tracking: "-0.01em" },
    h1:      { size: "22px", weight: 700, tracking: "-0.02em" },
    display: { size: "28px", weight: 700, tracking: "-0.025em" },
  },
} as const;

// ── Radii ────────────────────────────────────────────────────────────────────
// Sharpened toward Linear / Stripe / Vercel while keeping the calm editorial
// feel. Prefer the semantic aliases (control / tile / panel) — they mirror the
// CSS custom properties every component consumes, so radius tunes in one place.
// Status badges stay pills.
export const RADIUS = {
  sm: "6px", md: "8px", lg: "8px", xl: "10px", pill: "9999px",
  control: "8px", // buttons, inputs, chips
  tile: "8px",    // metric / stat tiles
  panel: "10px",  // cards, large panels
} as const;

// ── Shadows ──────────────────────────────────────────────────────────────────
// Whisper-light. Elevation is communicated mostly by borders; shadow only
// lifts interactive/floating surfaces off the page.
export const SHADOW = {
  none: "none",
  xs:   "0 1px 2px rgba(16, 24, 40, 0.04)",
  sm:   "0 1px 2px rgba(16, 24, 40, 0.05), 0 1px 3px rgba(16, 24, 40, 0.04)",
  md:   "0 4px 12px rgba(16, 24, 40, 0.06), 0 2px 4px rgba(16, 24, 40, 0.04)",
  lg:   "0 12px 32px rgba(16, 24, 40, 0.10), 0 4px 8px rgba(16, 24, 40, 0.05)",
} as const;

// ── Chart palette ────────────────────────────────────────────────────────────
// The categorical series colours for every chart in the workspace. This is the
// data-viz skill's validated reference palette (assigned in fixed order, never
// cycled) — it clears the CVD and normal-vision gates on a white surface; the
// three sub-3:1 hues rely on the always-present legend labels for relief, which
// ChartContainer guarantees. A 9th series never generates a new hue: fold to
// "Other", facet, or small-multiples.
//
// SENTIMENT is a fixed three-part scale (positive / neutral / negative) used by
// ThemeCard and conversation evidence — deliberately distinct from the
// categorical slots so sentiment never impersonates a series.
export const CHART_SERIES = [
  "#2a78d6", // 1 blue
  "#008300", // 2 green
  "#e87ba4", // 3 magenta
  "#eda100", // 4 yellow
  "#1baf7a", // 5 aqua
  "#eb6834", // 6 orange
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
] as const;

export const CHART_INK = {
  grid:     "#EAECEF", // hairline gridlines
  axis:     "#D4D8DE", // baseline / axis
  label:    "#858D99", // axis tick labels
  surface:  "#FFFFFF",
} as const;

export const SENTIMENT = {
  positive: { ink: "#3F5D42", fill: "#5C8560", wash: "#EEF3EC" },
  neutral:  { ink: "#6B6459", fill: "#A6ADB6", wash: "#F1F3F5" },
  negative: { ink: "#8A4B33", fill: "#B4694C", wash: "#F7ECE6" },
} as const;

export type SentimentKey = keyof typeof SENTIMENT;

// ── Layout ───────────────────────────────────────────────────────────────────
// Content column width, shared by the project header/nav (ProjectShell) and
// every area's PageContainer so the header rule, the nav tabs and the page
// content all align to the same left/right edges.
export const LAYOUT = {
  maxWidth: "64rem",        // matches ProjectShell's max-w-5xl
  pagePadX: "1.5rem",       // 24px — desktop gutter
  pagePadXMobile: "1rem",   // 16px
  pagePadY: "1.5rem",
} as const;
