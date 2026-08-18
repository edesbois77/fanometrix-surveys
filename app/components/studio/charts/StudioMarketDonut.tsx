"use client";

// ── StudioMarketDonut — "Answers by market" composition ──────────────────────
// A donut (share-of-whole) paired with a ranked list, because donuts alone are weak
// for precise comparison and poor for accessibility. Slices read CLOCKWISE from 12
// o'clock in descending order (largest first) so the ring visually follows the list.
// Hovering a market swaps the donut CENTRE to that market's detail (label / answers /
// share / starts) instead of a floating tooltip — so nothing ever overlaps the centre
// total. Uses the Fanometrix tonal series (gold → navy → tonal), never a rainbow.
// Optional click-to-filter routes ONLY through the caller's existing authorised path.

import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { FX_SERIES, FX_PALETTE } from "@/lib/studio/chart-palette";

export type MarketDatum = { label: string; answers: number; starts: number };
const nf = (n: number) => n.toLocaleString();
const sliceColor = (i: number) => FX_SERIES[i % FX_SERIES.length] ?? FX_PALETTE.neutral;

export function StudioMarketDonut({ markets, totalAnswers, activeLabel, onSelect }: {
  markets: MarketDatum[]; totalAnswers: number; activeLabel?: string; onSelect?: (label: string) => void;
}) {
  const sorted = [...markets].sort((a, b) => b.answers - a.answers); // descending → clockwise
  const total = totalAnswers > 0 ? totalAnswers : sorted.reduce((a, m) => a + m.answers, 0);
  const selectable = !!onSelect;
  const [hover, setHover] = useState<number | null>(null);
  const focus = hover != null ? sorted[hover] : null;
  const focusPct = focus && total > 0 ? (focus.answers / total) * 100 : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2 items-center">
      {/* Donut — clockwise from 12 o'clock (startAngle 90 → endAngle -270) */}
      <div className="relative mx-auto" style={{ width: 220, height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={sorted} dataKey="answers" nameKey="label" cx="50%" cy="50%" innerRadius={70} outerRadius={100}
              startAngle={90} endAngle={-270} paddingAngle={1.5} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}
              onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)}
              onClick={selectable ? (_, i) => onSelect!(sorted[i].label) : undefined}
              style={{ cursor: selectable ? "pointer" : "default", outline: "none" }}>
              {sorted.map((m, i) => (
                <Cell key={m.label} fill={sliceColor(i)} opacity={(activeLabel && activeLabel !== m.label) || (hover != null && hover !== i) ? 0.4 : 1} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Centre — total by default, selected market on hover. Opaque so nothing shows through. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
          {focus ? (
            <>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] truncate max-w-full" style={{ color: "var(--text-tertiary)" }}>{focus.label}</span>
              <span className="fx-tabular-nums text-2xl font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{nf(focus.answers)}</span>
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>answers · {focusPct.toFixed(1)}%</span>
              <span className="text-[11px] fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>{nf(focus.starts)} starts</span>
            </>
          ) : (
            <>
              <span className="fx-tabular-nums text-2xl font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{nf(total)}</span>
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>answers</span>
            </>
          )}
        </div>
      </div>

      {/* Ranked list — same descending order; exact comparison + accessibility + optional filter */}
      <ul className="space-y-1.5">
        {sorted.map((m, i) => {
          const pct = total > 0 ? (m.answers / total) * 100 : 0;
          const active = activeLabel === m.label;
          const Row = (
            <>
              <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: sliceColor(i) }} />
              <span className="text-xs font-semibold truncate flex-1 min-w-0" style={{ color: "var(--text-primary)" }}>{m.label}</span>
              <span className="text-xs fx-tabular-nums flex-shrink-0" style={{ color: "var(--text-secondary)" }}>{nf(m.answers)}</span>
              <span className="text-[11px] fx-tabular-nums w-10 text-right flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>{pct.toFixed(1)}%</span>
            </>
          );
          return (
            <li key={m.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {selectable ? (
                <button onClick={() => onSelect!(m.label)} aria-pressed={active}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors text-left"
                  style={{ background: active || hover === i ? "var(--surface-sunken)" : "transparent" }}>{Row}</button>
              ) : (
                <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md" style={{ background: hover === i ? "var(--surface-sunken)" : "transparent" }}>{Row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
