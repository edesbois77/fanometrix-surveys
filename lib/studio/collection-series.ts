// ── Collection-over-time aggregation (pure) ──────────────────────────────────
// The Study "Collection over time" chart re-buckets a governed series (hourly or
// daily instants) into Hourly | Daily | Weekly | Monthly, for ONE OR TWO metrics
// at a time. Switching interval changes ONLY the bucket boundary; switching metric
// changes ONLY which column is summed — never a value DEFINITION. Totals are
// conserved: Σ(buckets) === Σ(points) per metric. Chart TYPE (line vs bars) reads
// the identical rows, so it can never change a value. Framework-free → unit-testable.

export type CollectionPoint = { t: string; answers: number; impressions: number; starts: number; completions: number };
export type CollectionMetricKey = "answers" | "impressions" | "starts" | "completions";
export type Interval = "hourly" | "daily" | "weekly" | "monthly";
/** One bucket carries a value per selected metric, plus the delta of each metric
 *  vs the previous bucket (null on the first). */
export type MultiBucket = { key: string; values: Record<string, number>; deltas: Record<string, number | null> };

/** ISO date (YYYY-MM-DD) of the Monday of the week containing `iso` (UTC). */
export function mondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Collapse an ISO instant `t` to its bucket key for the interval. */
export function bucketKey(t: string, interval: Interval): string {
  const date = t.slice(0, 10);
  return interval === "hourly" ? t.slice(0, 13) // YYYY-MM-DDTHH
    : interval === "daily" ? date
    : interval === "weekly" ? mondayOf(date)
    : date.slice(0, 7); // YYYY-MM
}

/** Sum the SELECTED metrics into interval buckets, sorted ascending, with a
 *  per-metric delta vs the previous bucket. Metrics are summed independently — a
 *  metric is never mixed into another's column. */
export function aggregateSeries(series: CollectionPoint[], metrics: CollectionMetricKey[], interval: Interval): MultiBucket[] {
  const acc = new Map<string, Record<string, number>>();
  for (const p of series) {
    const k = bucketKey(p.t, interval);
    const row = acc.get(k) ?? Object.fromEntries(metrics.map((m) => [m, 0]));
    for (const m of metrics) row[m] = (row[m] ?? 0) + (p[m] ?? 0);
    acc.set(k, row);
  }
  const keys = [...acc.keys()].sort();
  return keys.map((key, i) => {
    const values = acc.get(key)!;
    const prev = i > 0 ? acc.get(keys[i - 1])! : null;
    const deltas: Record<string, number | null> = {};
    for (const m of metrics) deltas[m] = prev ? values[m] - (prev[m] ?? 0) : null;
    return { key, values, deltas };
  });
}

/** Total of one metric across the whole series (used to prove conservation / scale). */
export function metricTotal(series: CollectionPoint[], metric: CollectionMetricKey): number {
  return series.reduce((a, p) => a + (p[metric] ?? 0), 0);
}

/** Two metrics need a secondary axis when their magnitudes differ enough that the
 *  smaller would be visually invisible on a shared axis (≥ 8× the larger's max).
 *  Returns the metric that should move to the secondary axis, or null for shared. */
export function secondaryAxisMetric(series: CollectionPoint[], metrics: CollectionMetricKey[]): CollectionMetricKey | null {
  if (metrics.length !== 2) return null;
  const max = (m: CollectionMetricKey) => series.reduce((a, p) => Math.max(a, p[m] ?? 0), 0);
  const [a, b] = metrics;
  const ma = max(a), mb = max(b);
  if (ma === 0 || mb === 0) return null;
  const ratio = ma > mb ? ma / mb : mb / ma;
  if (ratio < 8) return null;
  return ma > mb ? b : a; // the smaller-scale metric moves to the secondary axis
}
