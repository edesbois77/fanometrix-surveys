// ── Fanometrix Analytical Core — descriptive calculators (pure) ───────────────
// Canonical, deterministic descriptive statistics. Behaviour-equivalent to the
// existing production implementations identified in the Stage 1 spec:
//   • shares         mirrors lib/studio/survey-results.ts (base = Σcount; pct = base>0 ? count/base : null)
//   • marginOfError  identical expression to lib/reports/stats.ts::marginOfError
//   • index100       identical expression to lib/reports/stats.ts::index100
// Stage 1 does NOT wire these into any product (no caller swaps).

/** One option's share of the base. `pct` is a PROPORTION in [0,1] (unit
 *  "proportion"; the same scale Survey Studio stores), or null when the base is
 *  0. A consumer that needs percentage points calls evidence/scale.ts. */
export type Share = { id: string; count: number; pct: number | null };

/** Distribution shares over a set of option counts. base = Σ counts; each pct is
 *  count/base, or null when base is 0. Mirrors survey-results.ts exactly. */
export function shares(options: { id: string; count: number }[]): { base: number; options: Share[] } {
  const base = options.reduce((a, o) => a + (Number.isFinite(o.count) ? o.count : 0), 0);
  return {
    base,
    options: options.map((o) => ({ id: o.id, count: o.count, pct: base > 0 ? o.count / base : null })),
  };
}

/** Margin of error at 95%, worst case p = 0.5. OUTPUT SCALE: percentage points
 *  (0–100, e.g. 9.8 for n=100) — unit "percentage_points". Identical expression
 *  to lib/reports/stats.ts::marginOfError: n<=0 → 100. */
export function marginOfError(n: number): number {
  if (n <= 0) return 100;
  return 196 * Math.sqrt(0.25 / n);
}

/** Index a value against a base on the familiar 100 scale.
 *  Identical to lib/reports/stats.ts::index100: base===0 → 0. */
export function index100(value: number, base: number): number {
  if (base === 0) return 0;
  return Math.round((value / base) * 100);
}
