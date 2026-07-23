// Visual constants for the Audience Intelligence Report.
//
// The report is a *document*, not a dashboard: it is read on a laptop, forwarded
// as a link, and printed to PDF. That means light surfaces only, ink that holds
// up on paper, and no colour that carries meaning on its own.
//
// Brand and data colour are deliberately separated:
//
//   • NAVY / GOLD (lib/intelligence/theme) dress the document — the hero, rules,
//     eyebrows, section markers. They are chrome.
//   • DATA.series1 / series2 mark the data. Navy and gold themselves fail the
//     categorical checks for data marks (navy is far too dark and near-neutral;
//     gold sits at 1.9:1 against white), so the data layer uses validated
//     brand-adjacent steps instead. Verified with the data-viz palette
//     validator against a #FFFFFF surface: lightness band, chroma floor, CVD
//     separation (ΔE 27 protan / 26 tritan), normal-vision separation (ΔE 32)
//     and contrast all pass.
//
// The funnel ramp is ordinal — funnel stages have a real order — and passes the
// ordinal checks (monotone lightness, ≥0.06 adjacent ΔL, light end 2.31:1 on
// white, 8° hue spread). It is never used for nominal categories: colouring
// unordered answer options by value would double-encode length as hue.

import { NAVY, GOLD } from "@/lib/intelligence/theme";

export { NAVY, GOLD };

export const DATA = {
  /** Primary data mark. Every single-series chart uses this and only this. */
  series1: "#1D5FA8",
  /** Second series. Only ever the challenger in a two-series comparison. */
  series2: "#BE861A",
  /** Ordered funnel stages, light → dark. */
  funnel: ["#93AEC6", "#5C82A6", "#2C5480", "#0B1929"],
} as const;

/** Document chrome. Aligned with the workspace design tokens so the report
 *  reads as the same product, tuned one notch calmer for long-form reading. */
export const INK = {
  primary: "#181B20",
  secondary: "#565E6B",
  tertiary: "#858D99",
  hairline: "#E3E6EA",
  hairlineSoft: "#EEF0F3",
  surface: "#FFFFFF",
  page: "#F6F7F9",
  paper: "#FBF9F4",
  paperLine: "#EDE3CC",
  grid: "#EDEFF2",
  axis: "#D4D8DE",
} as const;

/** Confidence is communicated by a label and a tone, never by colour alone —
 *  the label is always rendered beside the swatch. */
export const CONFIDENCE_TONE = {
  high: { ink: "#3F5D42", wash: "#EEF3EC", line: "#D3E0D0" },
  moderate: { ink: "#3B5A8A", wash: "#EEF3FB", line: "#D6E2F1" },
  early: { ink: "#6B6459", wash: "#F4F2EE", line: "#E4E0D8" },
} as const;

export const SANS =
  "var(--font-geist), ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
