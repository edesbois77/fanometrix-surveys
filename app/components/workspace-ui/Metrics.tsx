"use client";

// ── MetricTile ───────────────────────────────────────────────────────────────
// The quantified-signal tile: a labelled value with an optional change delta,
// target progress, and a slot for an inline sparkline. Richer than the
// foundation's StatTile (which is a bare number) — this one is built for a KPI
// row where trend and target matter. Figures are tabular so a row of tiles
// aligns and doesn't jitter as values update.

import { Icon } from "./icons";

type DeltaSentiment = "good" | "bad" | "neutral";

function deltaColor(direction: "up" | "down" | "flat", sentiment?: DeltaSentiment): string {
  const s: DeltaSentiment = sentiment ?? (direction === "up" ? "good" : direction === "down" ? "bad" : "neutral");
  return s === "good" ? "#3F7D46" : s === "bad" ? "#B4694C" : "var(--text-tertiary)";
}

export function MetricTile({
  label, value, unit, delta, caption, breakdown, target, spark, icon,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  /** Change vs a prior period. `sentiment` overrides the up=good/down=bad default. */
  delta?: { value: React.ReactNode; direction: "up" | "down" | "flat"; sentiment?: DeltaSentiment };
  caption?: React.ReactNode;
  /** A vertical label/value breakdown under the value (e.g. source composition). */
  breakdown?: { label: React.ReactNode; value: React.ReactNode }[];
  /** Progress toward a target, 0–100, with an optional label. */
  target?: { pct: number; label?: React.ReactNode };
  /** An inline sparkline / mini-chart. */
  spark?: React.ReactNode;
  /** A small leading glyph name. */
  icon?: keyof typeof Icon;
}) {
  const Ico = icon ? Icon[icon] : null;
  const dColor = delta ? deltaColor(delta.direction, delta.sentiment) : undefined;
  return (
    <div className="border p-4" style={{ borderRadius: "var(--radius-tile)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-xs)" }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] truncate" style={{ color: "var(--text-tertiary)" }}>{label}</p>
        {Ico && <span style={{ color: "var(--text-disabled)" }}><Ico size={15} /></span>}
      </div>

      <div className="flex items-baseline gap-1.5 mt-2">
        <span className="fx-tabular-nums text-2xl font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{value}</span>
        {unit && <span className="text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>{unit}</span>}
      </div>

      {(delta || caption) && (
        <div className="flex items-center gap-2 mt-1.5 min-h-[18px]">
          {delta && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold fx-tabular-nums" style={{ color: dColor }}>
              {delta.direction === "up" ? <Icon.arrowUp size={13} /> : delta.direction === "down" ? <Icon.arrowDown size={13} /> : null}
              {delta.value}
            </span>
          )}
          {caption && <span className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{caption}</span>}
        </div>
      )}

      {breakdown && breakdown.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {breakdown.map((b, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{b.label}</span>
              <span className="fx-tabular-nums text-xs font-semibold flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{b.value}</span>
            </div>
          ))}
        </div>
      )}

      {spark && <div className="mt-3 -mx-1">{spark}</div>}

      {target && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{target.label ?? "Target"}</span>
            <span className="fx-tabular-nums text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>{Math.round(target.pct)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, target.pct))}%`, background: target.pct >= 100 ? "#5C8560" : "var(--accent-gold)" }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function MetricTileSkeleton() {
  return (
    <div className="border p-4" style={{ borderRadius: "var(--radius-tile)", borderColor: "var(--border-default)", background: "var(--surface)" }}>
      <div className="fx-skeleton h-2.5 w-16 rounded mb-3" />
      <div className="fx-skeleton h-7 w-20 rounded mb-2" />
      <div className="fx-skeleton h-3 w-24 rounded" />
    </div>
  );
}
