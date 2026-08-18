"use client";

// ── StudioProgressionChart — engagement progression ──────────────────────────
// Started → Q1 … QN answered → Completed as a bar progression. Each Qk is a
// POSITION count (answered position k), NOT a shared research question. Event-based
// (partial-aware). Hover shows count, change from the previous stage, % change, and
// share of Starts. Fanometrix gold.

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CHART_INK } from "@/app/components/workspace-ui";
import { FX_PALETTE } from "@/lib/studio/chart-palette";

export type ProgressionStage = { key: string; label: string; count: number };
type Row = ProgressionStage & { delta: number | null; pctChange: number | null; ofStarts: number | null };

function TooltipCard({ active, payload }: { active?: boolean; payload?: { payload?: Row }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-lg border px-3 py-2 shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border-default)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{d.label}</p>
      <p className="text-xs fx-tabular-nums" style={{ color: "var(--text-secondary)" }}>{d.count.toLocaleString()}{d.ofStarts != null ? ` · ${Math.round(d.ofStarts * 100)}% of starts` : ""}</p>
      {d.delta != null && (
        <p className="text-[11px] fx-tabular-nums" style={{ color: d.delta > 0 ? FX_PALETTE.positive : d.delta < 0 ? FX_PALETTE.negative : "var(--text-tertiary)" }}>
          {d.delta > 0 ? "+" : ""}{d.delta.toLocaleString()}{d.pctChange != null ? ` (${d.delta > 0 ? "+" : ""}${(d.pctChange * 100).toFixed(1)}%)` : ""} from previous
        </p>
      )}
    </div>
  );
}

export function StudioProgressionChart({ stages }: { stages: ProgressionStage[] }) {
  const started = stages[0]?.count ?? 0;
  const data: Row[] = stages.map((s, i) => {
    const prev = i > 0 ? stages[i - 1].count : null;
    return {
      ...s,
      delta: prev != null ? s.count - prev : null,
      pctChange: prev != null && prev > 0 ? (s.count - prev) / prev : null,
      ofStarts: started > 0 ? s.count / started : null,
    };
  });
  return (
    <div role="img" aria-label={`Engagement progression across ${stages.length} stages`} className="w-full">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--text-secondary)" }} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} interval={0} />
          <YAxis width={44} allowDecimals={false} tick={{ fontSize: 11, fill: CHART_INK.label }} tickLine={false} axisLine={false} />
          <Tooltip content={<TooltipCard />} cursor={{ fill: "var(--surface-sunken)" }} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={64}>
            {data.map((d) => <Cell key={d.key} fill={d.key === "completed" ? FX_PALETTE.goldDark : d.key === "started" ? FX_PALETTE.navyMid : FX_PALETTE.gold} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
