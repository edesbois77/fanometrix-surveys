// ── Survey Studio — Reports V1 (Slice A) — Deterministic page packer (skeleton) ──
// The smallest deterministic packing abstraction that later lets a report span multiple
// pages. It knows only abstract layout UNITS (never pixels, never FedEx values): each module
// declares a `weight` (its vertical footprint) and a `priority`; a page has a capacity. The
// packer places required modules first, then optional ones by priority while they fit, and
// reports what overflowed (→ a later page, in future slices) plus the resulting fill ratio.
//
// Slice A uses this for ONE archetype (the Executive page). The interface is archetype-neutral
// so future archetypes reuse it unchanged.

/** Abstract vertical capacity of an A4 content column, in layout units (not pixels). */
export const A4_CONTENT_UNITS = 60;

export type PackItem = { id: string; weight: number; priority: number; required?: boolean };
export type PackResult = { placed: string[]; overflow: string[]; usedUnits: number; capacityUnits: number; fillRatio: number };

/**
 * Place items into a fixed capacity. Required items are always placed (they may, together,
 * exceed capacity — the caller is responsible for not over-requiring; overflow still reports
 * honestly). Optional items are added by descending priority while they fit. Order within the
 * result preserves the caller's input order (rendering owns visual order).
 */
export function packModules(items: PackItem[], capacityUnits: number = A4_CONTENT_UNITS): PackResult {
  const placed = new Set<string>();
  let used = 0;
  for (const it of items.filter((i) => i.required)) { placed.add(it.id); used += it.weight; }
  for (const it of [...items.filter((i) => !i.required)].sort((a, b) => b.priority - a.priority)) {
    if (used + it.weight <= capacityUnits) { placed.add(it.id); used += it.weight; }
  }
  const order = items.map((i) => i.id);
  return {
    placed: order.filter((id) => placed.has(id)),
    overflow: order.filter((id) => !placed.has(id)),
    usedUnits: used,
    capacityUnits,
    fillRatio: capacityUnits > 0 ? Math.min(1, Math.round((used / capacityUnits) * 100) / 100) : 0,
  };
}

/** Would these items ALL fit within capacity? */
export function fits(items: PackItem[], capacityUnits: number = A4_CONTENT_UNITS): boolean {
  return items.reduce((s, i) => s + i.weight, 0) <= capacityUnits;
}

/** Footprint of a distribution chart in layout units (header + one row per option). */
export function distributionWeight(optionCount: number): number {
  return 6 + Math.max(1, optionCount) * 2;
}
