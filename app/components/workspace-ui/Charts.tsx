"use client";

// ── ChartContainer & chart primitives ───────────────────────────────────────
// The frame around a chart — never the chart itself (the workspace uses
// Recharts for that). It standardises the anatomy every chart needs: a titled
// header with a toolbar, an always-present legend that names each series in ink
// (so identity never rests on colour alone — the relief the validated palette
// requires), a plot area with its own loading / empty / error states, and a
// footnote/source line for provenance.

import { Icon } from "./icons";
import { CHART_SERIES } from "./tokens";

// The categorical series colour for slot `i` (0-based), assigned in fixed order
// and never cycled — a 9th series must fold to "Other" rather than wrap around.
export function seriesColor(i: number): string {
  return CHART_SERIES[i] ?? "var(--text-tertiary)";
}

// ── ChartLegend ──────────────────────────────────────────────────────────────
export function ChartLegend({
  items, className = "",
}: {
  items: { label: React.ReactNode; color?: string; value?: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${className}`}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: it.color ?? seriesColor(i) }} aria-hidden />
          <span>{it.label}</span>
          {it.value != null && <span className="fx-tabular-nums font-semibold" style={{ color: "var(--text-tertiary)" }}>{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

export function ChartContainer({
  title, description, actions, legend, footnote, source, height = 260,
  loading = false, empty = false, error, children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  legend?: { label: React.ReactNode; color?: string; value?: React.ReactNode }[];
  footnote?: React.ReactNode;
  /** Provenance line, e.g. "Source: 1,284 survey responses". */
  source?: React.ReactNode;
  height?: number;
  loading?: boolean;
  empty?: boolean | React.ReactNode;
  error?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="border overflow-hidden" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-sm)" }}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
          {description && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>}
      </div>

      {legend && legend.length > 0 && <ChartLegend items={legend} className="px-5 mt-3" />}

      <div className="px-5 py-4">
        <div style={{ height }} className="relative">
          {loading ? (
            <div className="absolute inset-0 flex flex-col justify-end gap-2 pb-6" aria-busy>
              <span className="sr-only">Loading chart…</span>
              {[0.4, 0.7, 0.55, 0.85, 0.5, 0.65].map((h, i) => (
                <div key={i} className="fx-skeleton rounded" style={{ height: 10, width: `${h * 100}%` }} />
              ))}
            </div>
          ) : error ? (
            <ChartMessage icon="alert" tone="#8A4B33" title="Couldn't render this chart" body={error} />
          ) : empty ? (
            <ChartMessage icon="chart" tone="var(--text-tertiary)" title={typeof empty === "boolean" ? "No data yet" : undefined} body={typeof empty === "boolean" ? "Data will appear here once collection begins." : empty} />
          ) : (
            children
          )}
        </div>
      </div>

      {(footnote || source) && (
        <div className="px-5 py-2.5 border-t flex items-center justify-between gap-3" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
          {source && <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{source}</span>}
          {footnote && <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{footnote}</span>}
        </div>
      )}
    </div>
  );
}

function ChartMessage({ icon, tone, title, body }: { icon: "alert" | "chart"; tone: string; title?: string; body?: React.ReactNode }) {
  const Ico = Icon[icon];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
      <span style={{ color: tone }}><Ico size={24} /></span>
      {title && <p className="text-sm font-semibold mt-2" style={{ color: "var(--text-primary)" }}>{title}</p>}
      {body && <p className="text-xs mt-1 max-w-xs" style={{ color: "var(--text-tertiary)" }}>{body}</p>}
    </div>
  );
}

// ── Sparkline ────────────────────────────────────────────────────────────────
// A tiny, axis-less trend line for inline use inside a MetricTile. Pure SVG, no
// dependency. One series only — identity comes from the tile it sits in.
export function Sparkline({
  data, width = 120, height = 32, color, fill = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  if (data.length < 2) return null;
  const stroke = color ?? seriesColor(0);
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pad = 2;
  const pts = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (d - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height - pad} L${pts[0][0].toFixed(1)},${height - pad} Z`;
  const gid = `spark-${stroke.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.16" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      )}
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={stroke} />
    </svg>
  );
}
