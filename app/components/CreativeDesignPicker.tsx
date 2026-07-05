"use client";

import { useState } from "react";
import { DESIGN_CATEGORIES, CREATIVE_DESIGNS, type DesignCategory } from "@/lib/creative-designs";

/**
 * Two-step Creative Design picker: category pills filter a grid of design
 * swatches. Shared between the Research Project editor (sets the project's
 * default design) and the Campaigns editor (per-deployment override).
 * Clicking the already-selected design clears it back to `null`.
 */
export function CreativeDesignPicker({
  value, onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const selected = CREATIVE_DESIGNS.find(d => d.id === value);
  const [category, setCategory] = useState<DesignCategory>(selected?.category ?? "fanometrix");
  const designsInCategory = CREATIVE_DESIGNS.filter(d => d.category === category);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {DESIGN_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full transition-colors"
            style={category === cat.id
              ? { background: "#0B1929", color: "#D7B87A" }
              : { background: "#F3F4F6", color: "#6B7280" }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {designsInCategory.length === 0 ? (
        <p className="text-xs text-gray-400 italic px-1 py-2">
          No designs in this category yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {designsInCategory.map(d => {
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
