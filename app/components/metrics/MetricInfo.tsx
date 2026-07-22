"use client";

// Reusable metric-definition tooltip. Renders an (i) icon that, on hover, focus
// or click, reveals the canonical Definition / Formula / Why-it-matters for a
// metric pulled from the platform registry (lib/metrics). Use this everywhere a
// metric is labelled so every surface shows one consistent definition.
//
//   <MetricInfo metricId="q1_answer_rate" />
//
// Hover or keyboard-focus opens it transiently; clicking pins it open (click
// again, Escape, or click-outside to dismiss) so the text can be read/selected.

import { useEffect, useId, useRef, useState } from "react";
import { getMetric } from "@/lib/metrics";

export function MetricInfo({
  metricId,
  align = "left",
}: {
  metricId: string;
  /** Which edge of the icon the panel aligns to (avoid clipping at row ends). */
  align?: "left" | "right";
}) {
  const metric = getMetric(metricId);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  const show = hovered || pinned;

  useEffect(() => {
    if (!show) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setPinned(false); setHovered(false); }
    }
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPinned(false); setHovered(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [show]);

  // Unknown id → render nothing rather than a broken icon. In dev, surface it.
  if (!metric) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[MetricInfo] unknown metric id: "${metricId}"`);
    }
    return null;
  }

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`${metric.name} — definition`}
        aria-expanded={show}
        aria-describedby={show ? panelId : undefined}
        onClick={(e) => { e.stopPropagation(); setPinned((p) => !p); }}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        style={{ cursor: "help", fontSize: 11, lineHeight: 1, color: "#9CA3AF" }}
        className="hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-full"
      >
        ⓘ
      </button>

      {show && (
        <span
          id={panelId}
          role="tooltip"
          className="absolute z-50 top-full mt-1.5 block cursor-auto rounded-lg border border-gray-200 bg-white p-3 shadow-lg"
          style={{
            width: 260,
            maxWidth: "min(260px, 80vw)",
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            // normalise inherited uppercase/tracking from card labels
            textTransform: "none",
            letterSpacing: "normal",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block text-[13px] font-bold text-[#0B1929]">{metric.name}</span>
          <span className="mt-1 block text-xs font-normal leading-relaxed text-gray-600">
            {metric.definition}
          </span>

          {metric.formula && (
            <span className="mt-2 block">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Formula</span>
              <span className="mt-0.5 block rounded bg-gray-50 px-1.5 py-1 font-mono text-[11px] leading-snug text-[#0B1929]">
                {metric.formula}
              </span>
            </span>
          )}

          <span className="mt-2 block">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Why it matters</span>
            <span className="mt-0.5 block text-xs font-normal leading-relaxed text-gray-600">
              {metric.whyItMatters}
            </span>
          </span>
        </span>
      )}
    </span>
  );
}
