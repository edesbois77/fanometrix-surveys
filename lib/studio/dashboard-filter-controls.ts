// ── Survey Studio → Dashboards — manifest → rendered filter controls (pure) ──
// The frontend NEVER decides which filter dimensions exist. It renders exactly
// what the governed Phase 1 manifest provides. This pure mapping turns the
// server manifest into the control list the UI renders 1:1 — a dimension the
// manifest OMITTED yields NO control (never a disabled one), so e.g. a single-
// publisher (FotMob / Football365-only) caller gets no Publisher control at all.
//
// Each control carries an "All …" default (value "") = no narrowing applied to
// the already-authorised Campaign universe. The top-line scope is therefore "all
// authorised publishers" by absence of a Publisher selection — NOT a synthetic
// ALL_PUBLISHERS value or any special entitlement.

import type { DashboardManifest } from "@/lib/studio/dashboard-manifest";

export type FilterControlOption = { value: string; label: string };
export type FilterControl = { key: string; label: string; options: FilterControlOption[] };

export function manifestToFilterControls(manifest: DashboardManifest): FilterControl[] {
  return manifest.dimensions.map((d) => ({
    key: d.key,
    label: d.label,
    // Leading "All …" = the top-line, no-narrowing default (value "").
    options: [{ value: "", label: `All ${d.label}s` }, ...d.values.map((v) => ({ value: v.id, label: v.label }))],
  }));
}
