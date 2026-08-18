// ── Survey Studio → Dashboards — deterministic performance insights (pure) ───
// Computed observations from GOVERNED metrics only — no AI, no interpretation, no
// "did you know" engine. The route resolves each dimension's counts via the existing
// dashboard_event_counts RPC (scoped by that dimension's own campaign slugs, so no
// publisher-text mismatch and no raw rows), then this pure builder turns the slices
// into explainable statements. An insight offers a filter action ONLY when that
// dimension+value is in the authorised manifest — never a hidden capability.

export type InsightDimension = "publisher" | "market" | "device";
export type DimensionSlice = { value: string; label: string; starts: number; completions: number };
export type Insight = {
  id: string;
  text: string;
  /** Present only when the dimension+value is a legitimate authorised filter. */
  filter?: { dimension: "publisher" | "market"; value: string };
};

const pct = (n: number, d: number): number => (d > 0 ? n / d : 0);
const round = (r: number) => Math.round(r * 100);

/** Minimum sample before an insight is emitted (avoids noise on thin data). */
const MIN_STARTS = 30;
const MIN_SLICE_STARTS = 10;

export function buildInsights(input: {
  totalStarts: number;
  byMarket: DimensionSlice[];
  byDevice: DimensionSlice[];
  byPublisher: DimensionSlice[];
  /** Manifest dimension keys present (so we only offer authorised filter actions). */
  manifestDimensions: Set<string>;
}): Insight[] {
  const out: Insight[] = [];
  const { totalStarts } = input;
  if (totalStarts < MIN_STARTS) return out;

  // Geographic — the market that generated the greatest share of starts.
  const topMarket = [...input.byMarket].filter((m) => m.starts >= MIN_SLICE_STARTS).sort((a, b) => b.starts - a.starts)[0];
  if (topMarket && input.byMarket.length >= 2) {
    const share = round(pct(topMarket.starts, totalStarts));
    if (share >= 25) {
      out.push({
        id: "geo",
        text: `${topMarket.label} generated ${share}% of survey starts.`,
        filter: input.manifestDimensions.has("market") ? { dimension: "market", value: topMarket.value } : undefined,
      });
    }
  }

  // Device — the device that dominated starts (device isn't a manifest filter → no action).
  const topDevice = [...input.byDevice].filter((d) => d.starts > 0).sort((a, b) => b.starts - a.starts)[0];
  if (topDevice) {
    const share = round(pct(topDevice.starts, totalStarts));
    if (share >= 50) out.push({ id: "device", text: `${topDevice.label} accounted for ${share}% of survey starts.` });
  }

  // Publisher — highest completion rate among publishers with enough starts.
  const pubs = input.byPublisher.filter((p) => p.starts >= MIN_SLICE_STARTS);
  if (pubs.length >= 2) {
    const ranked = [...pubs].sort((a, b) => pct(b.completions, b.starts) - pct(a.completions, a.starts));
    const top = ranked[0];
    const rate = round(pct(top.completions, top.starts));
    out.push({
      id: "publisher",
      text: `${top.label} had the highest completion rate (${rate}%) of ${pubs.length} publishers.`,
      filter: input.manifestDimensions.has("publisher") ? { dimension: "publisher", value: top.value } : undefined,
    });
  }

  return out;
}
