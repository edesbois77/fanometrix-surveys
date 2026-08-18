// ── Creative library: interaction TYPES + design VARIANTS ────────────────────
// The new Create model: THREE V1 interaction types (the mechanic — "how do fans
// interact?"), each with design/colour VARIANTS beneath it. Derived entirely from
// the existing `layout` metadata — no new taxonomy, no schema.
//
//   layout 'timer'   → Countdown Clock
//   layout 'stack'   → Stack
//   layout 'classic' → Classic
//
// `invitation` (fan-invitation) is NOT a fourth type in new Create — it is a
// legacy timer + intro implementation kept fully intact for historical/live
// campaigns, and simply excluded from this library (see EXCLUDED_LAYOUTS). The
// intro is a SURVEY-STAGE journey frame in the new model, not a Creative type.

import type { CreativeLayout } from "@/lib/creative-rules";

export type CreativeMechanic = "timer" | "stack" | "classic";

export interface CreativeTypeInfo {
  mechanic: CreativeMechanic;
  label: string;
  /** One concise line describing the INTERACTION (not a research purpose). */
  description: string;
  /** Whether the mechanic can render a Survey Intro frame (renderer capability). */
  supportsIntro: boolean;
}

/** The three V1 interaction types, in display order. */
export const CREATIVE_TYPES: CreativeTypeInfo[] = [
  {
    mechanic: "timer",
    label: "Countdown Clock",
    description: "Fast, time-limited questions that encourage fans to answer instinctively.",
    supportsIntro: true,
  },
  {
    mechanic: "stack",
    label: "Stack",
    description: "Questions presented one at a time as quick, tappable cards fans move through.",
    supportsIntro: true,
  },
  {
    mechanic: "classic",
    label: "Classic",
    description: "A straightforward question-and-answer experience that's immediately familiar to fans.",
    // The Classic MECHANIC participates in the standard Survey journey (incl. an
    // optional Intro) — the refreshed StudioClassicSurvey is intro-capable. The
    // historical ClassicSurvey's lack of an intro is a legacy renderer limit, not
    // the definition of the mechanic, so it must NOT harden the compatibility model.
    supportsIntro: true,
  },
];

/** Layouts that never appear as a selectable type in new Create (legacy intact). */
export const EXCLUDED_LAYOUTS: CreativeLayout[] = ["invitation"];

/** Specific slugs withdrawn from NEW Create selection. They are NOT deleted,
 *  renamed, or archived — the rows, their slugs, and their rendering are fully
 *  preserved, so any existing survey/campaign/project/evidence that references
 *  them keeps resolving and rendering exactly as before (this list is a
 *  client-side grouping filter for the new Create picker only; it does not touch
 *  the row, the embed resolver, reports, or the legacy picker).
 *    • `classic` — the legacy Classic identity; new Create offers the refreshed
 *      `studio-classic` instead.
 *    • `ocean`   — visually near-identical to Sky Pulse; withdrawn from new
 *      selection to avoid a confusing duplicate. (No live/historical references
 *      exist, but its slug/rendering are preserved regardless.) */
export const EXCLUDED_SLUGS: string[] = ["classic", "ocean"];

/** Map a design row's `layout` to its interaction mechanic (invitation⇒timer is
 *  never reached here because invitation rows are excluded from the library). */
export function mechanicForLayout(layout: string): CreativeMechanic | null {
  if (layout === "timer") return "timer";
  if (layout === "stack") return "stack";
  if (layout === "classic") return "classic";
  return null; // 'invitation' / anything unknown → not a new-Create type
}

export interface VariantRow {
  slug: string;
  name: string;
  layout: string;
  theme?: string;
  sub_theme?: string | null;
  publisher_org_id?: string | null;
  publisher_name?: string | null;
  is_system?: boolean;
  usage_count?: number;
  created_at?: string | null;
  [k: string]: unknown;
}

/** The default variant for a type: ALWAYS a Fanometrix/global variant — never a
 *  publisher-specific one. Prefers the canonical Fanometrix slug, then any
 *  non-publisher (global) variant, then the first row. A publisher-specific
 *  variant is only ever an explicit additional choice, never the default. */
export function defaultVariant<T extends VariantRow>(variants: T[]): T | undefined {
  if (variants.length === 0) return undefined;
  const canonical = variants.find((v) => ["fanometrix", "fanometrix-stack", "studio-classic"].includes(v.slug));
  if (canonical) return canonical;
  const global = variants.find((v) => v.theme !== "publisher" && !v.publisher_org_id);
  return global ?? variants[0];
}

/** Group rows into the three interaction types (excluding legacy layouts). Within
 *  a type, global/Fanometrix variants first (default resolvable), then
 *  publisher-specific; stable tiebreak on usage then recency. */
export function groupIntoTypes<T extends VariantRow>(rows: T[]): { type: CreativeTypeInfo; variants: T[] }[] {
  const orderVariants = (a: T, b: T) => {
    const ap = a.publisher_org_id ? 1 : 0;
    const bp = b.publisher_org_id ? 1 : 0;
    if (ap !== bp) return ap - bp; // global before publisher-specific
    return (b.usage_count ?? 0) - (a.usage_count ?? 0)
      || String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
  };
  return CREATIVE_TYPES
    .map((type) => ({
      type,
      variants: rows
        .filter((r) => !EXCLUDED_SLUGS.includes(r.slug) && mechanicForLayout(r.layout) === type.mechanic)
        .sort(orderVariants),
    }))
    .filter((g) => g.variants.length > 0);
}
