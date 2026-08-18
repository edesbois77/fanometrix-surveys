// ── Fanometrix data-visualisation palette ────────────────────────────────────
// A small, reusable chart palette built on the brand tokens (Gold #D7B87A, Navy
// #0B1929) with tonal variants + a restrained neutral for context/inactive series.
// Use these instead of one-off hard-coded chart colours so every Study/Survey chart
// reads as one system. Deltas reuse the existing semantic success/danger tones.

export const FX_PALETTE = {
  gold: "#D7B87A",       // primary — research yield
  goldDark: "#B08A3E",
  goldLight: "#ECD9AF",
  navy: "#0B1929",       // secondary — comparison
  navyMid: "#3A4A61",
  navyLight: "#8A98AD",
  neutral: "#C7CCD4",    // context / inactive
  positive: "#3F7D46",
  negative: "#B4694C",
} as const;

/** Ordered categorical series (gold → navy → tonal), no rainbow, no cycling. */
export const FX_SERIES = [FX_PALETTE.gold, FX_PALETTE.navy, FX_PALETTE.goldLight, FX_PALETTE.navyMid, FX_PALETTE.navyLight] as const;
export const fxSeries = (i: number): string => FX_SERIES[i] ?? FX_PALETTE.neutral;

export type CollectionMetric = "answers" | "impressions" | "starts" | "completions";

/** Consistent colour per collection metric — Answers (yield) leads in gold. */
export function metricColor(m: CollectionMetric): string {
  return m === "answers" ? FX_PALETTE.gold
    : m === "starts" ? FX_PALETTE.navy
    : m === "completions" ? FX_PALETTE.goldDark
    : FX_PALETTE.navyLight; // impressions
}
