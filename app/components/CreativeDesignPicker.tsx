"use client";

import { useState, useEffect, useMemo } from "react";
import { DESIGN_CATEGORIES, CREATIVE_DESIGNS, type DesignCategory } from "@/lib/creative-designs";
import { buildEmbedThemeFromState, type BuilderState } from "@/lib/creative-theme-builder";

type DynamicDesignRow = {
  slug: string;
  name: string;
  theme: DesignCategory;
  sub_theme: string | null;
  publisher_name: string | null;
  builder_state: BuilderState;
};

type AnyDesign = {
  id: string;
  name: string;
  theme: DesignCategory;
  subTheme: string | null; // resolved label — publisher name when theme is "publisher"
  gradient: string;
};

const GENERAL = "General";

const SELECT_CLASS = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] disabled:bg-gray-50 disabled:text-gray-400";

/**
 * Creative Design picker: two side-by-side Theme / Sub-theme dropdowns,
 * followed by a filtered grid of design swatches once both are chosen.
 * Shared between the Research Project editor (sets the project's default
 * design) and the Campaigns editor (per-deployment override). Clicking the
 * already-selected design clears it back to `null`.
 *
 * Merges the static built-in catalog (lib/creative-designs.ts) with designs
 * authored dynamically in the Creative Gallery (fetched from
 * /api/creative-designs) so new ones appear here with no code deploy.
 */
export function CreativeDesignPicker({
  value, onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [dynamicRows, setDynamicRows] = useState<DynamicDesignRow[]>([]);

  useEffect(() => {
    fetch("/api/creative-designs")
      .then(r => r.ok ? r.json() : null)
      .then(json => setDynamicRows(json?.data ?? []))
      .catch(() => {/* fall back to static-only catalog */});
  }, []);

  const allDesigns: AnyDesign[] = useMemo(() => {
    const staticDesigns: AnyDesign[] = CREATIVE_DESIGNS.map(d => ({
      id: d.id, name: d.name, theme: d.category, subTheme: d.subTheme, gradient: d.gradient,
    }));
    const dynamicDesigns: AnyDesign[] = dynamicRows.map(row => {
      let gradient = "#0B1929";
      try { gradient = buildEmbedThemeFromState(row.builder_state).gradient; } catch { /* keep fallback swatch */ }
      return {
        id: row.slug,
        name: row.name,
        theme: row.theme,
        subTheme: row.theme === "publisher" ? row.publisher_name : row.sub_theme,
        gradient,
      };
    });
    return [...staticDesigns, ...dynamicDesigns];
  }, [dynamicRows]);

  const selected = allDesigns.find(d => d.id === value);
  const [theme, setTheme] = useState<DesignCategory>(selected?.theme ?? "fanometrix");
  const [subTheme, setSubTheme] = useState<string | null>(null);

  const subThemeOptions = useMemo(() => {
    const named = new Set<string>();
    let hasGeneral = false;
    for (const d of allDesigns) {
      if (d.theme !== theme) continue;
      if (d.subTheme) named.add(d.subTheme); else hasGeneral = true;
    }
    const sorted = Array.from(named).sort();
    return hasGeneral ? [GENERAL, ...sorted] : sorted;
  }, [allDesigns, theme]);

  // Keep the selected sub-theme valid as theme/data change — default to the
  // currently-selected design's own sub-theme, or the first available option.
  useEffect(() => {
    if (selected && selected.theme === theme) {
      setSubTheme(selected.subTheme ?? GENERAL);
      return;
    }
    setSubTheme(prev => (prev && subThemeOptions.includes(prev)) ? prev : (subThemeOptions[0] ?? null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, subThemeOptions.join("|")]);

  const designsToShow = allDesigns.filter(d => d.theme === theme && (d.subTheme ?? GENERAL) === subTheme);

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Theme</label>
          <select
            value={theme}
            onChange={e => setTheme(e.target.value as DesignCategory)}
            className={SELECT_CLASS}
          >
            {DESIGN_CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Sub-theme</label>
          <select
            value={subTheme ?? ""}
            onChange={e => setSubTheme(e.target.value || null)}
            disabled={subThemeOptions.length === 0}
            className={SELECT_CLASS}
          >
            {subThemeOptions.length === 0 ? (
              <option value="">None yet</option>
            ) : (
              subThemeOptions.map(st => <option key={st} value={st}>{st}</option>)
            )}
          </select>
        </div>
      </div>

      {designsToShow.length === 0 ? (
        <p className="text-xs text-gray-400 italic px-1 py-2">
          No designs in this {subThemeOptions.length > 0 ? "sub-theme" : "theme"} yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {designsToShow.map(d => {
            const active = value === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onChange(active ? null : d.id)}
                className="flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all"
                style={{ borderColor: active ? "#D7B87A" : "#E5E7EB", background: active ? "#FBF5E8" : "#fff" }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, background: d.gradient, border: "1px solid rgba(0,0,0,0.08)" }} />
                <span className="text-xs font-medium leading-tight" style={{ color: active ? "#0B1929" : "#374151" }}>
                  {d.name}
                </span>
                {active && <span className="ml-auto text-[#D7B87A] text-xs font-bold flex-shrink-0">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
