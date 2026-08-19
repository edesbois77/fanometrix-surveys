// ── Fanometrix Analytical Core — Quantity scale conversion (pure) ─────────────
// The ONLY sanctioned place a percentage-family value changes scale. Adapters
// must NEVER rescale source values; a consumer that needs a specific scale calls
// these explicit, deterministic, unit-tested converters. Non-percentage units
// (count/index) have no scale conversion and throw, by design.

import type { Quantity } from "./types";

/** Return the value as a proportion (0–1). proportion → as-is;
 *  percentage_points → /100. Throws for non-percentage-family units. */
export function toProportion(q: Quantity): number {
  if (q.unit === "proportion") return q.value;
  if (q.unit === "percentage_points") return q.value / 100;
  throw new Error(`toProportion: "${q.unit}" is not a percentage-family unit`);
}

/** Return the value in percentage points (0–100). percentage_points → as-is;
 *  proportion → *100. Throws for non-percentage-family units. */
export function toPercentagePoints(q: Quantity): number {
  if (q.unit === "percentage_points") return q.value;
  if (q.unit === "proportion") return q.value * 100;
  throw new Error(`toPercentagePoints: "${q.unit}" is not a percentage-family unit`);
}

/** Convenience constructors that make the scale explicit at the call site. */
export const proportion = (value: number): Quantity => ({ value, unit: "proportion" });
export const percentagePoints = (value: number): Quantity => ({ value, unit: "percentage_points" });
