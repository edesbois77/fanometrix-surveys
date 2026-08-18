"use client";

// ── StudioBarChart — ranked horizontal bars for question results ─────────────
// The automatic treatment for a single-select question distribution: recharts
// horizontal bars, token-bound, rendered as the BODY of a workspace-ui
// ChartContainer. Reuses recharts ^3.8.1 + CHART tokens — no new charting stack,
// no chart picker. Accessible: a role="img" wrapper with a text description; each
// bar's value/percentage is also rendered as an inline label.

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { FX_PALETTE } from "@/lib/studio/chart-palette";

export type BarDatum = { label: string; value: number; pct: number | null };

// Restrained Fanometrix categorical palette for answer OPTIONS (not a rainbow, no
// semantic green/red — these are neutral research choices). The dominant answer
// (largest value) leads in gold; the rest read as slate / blue-grey / sand / muted
// grey, all drawn from the existing brand tokens.
const CATEGORICAL = [FX_PALETTE.gold, FX_PALETTE.navyMid, FX_PALETTE.navyLight, FX_PALETTE.goldLight, FX_PALETTE.neutral] as const;

function TooltipCard({ active, payload }: { active?: boolean; payload?: { payload?: BarDatum }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-lg border px-3 py-2 shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border-default)" }}>
      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{d.label}</p>
      <p className="text-xs fx-tabular-nums" style={{ color: "var(--text-secondary)" }}>
        {d.value.toLocaleString()}{d.pct != null ? ` · ${Math.round(d.pct * 100)}%` : ""}
      </p>
    </div>
  );
}

export function StudioBarChart({ data, ariaLabel, color }: { data: BarDatum[]; ariaLabel?: string; color?: string }) {
  const height = Math.max(96, data.length * 40 + 16);
  const label = ariaLabel ?? `Distribution across ${data.length} options`;
  // Colour by RANK so the dominant answer always leads in gold, whatever the
  // authored option order. `color` (if passed) forces a single fill.
  const rank = new Map<number, number>();
  [...data.keys()].sort((a, b) => data[b].value - data[a].value).forEach((idx, r) => rank.set(idx, r));
  const fillFor = (i: number) => color ?? CATEGORICAL[(rank.get(i) ?? i) % CATEGORICAL.length];
  return (
    <div role="img" aria-label={label} className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 2, right: 44, bottom: 2, left: 0 }} barCategoryGap="28%">
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="label" width={148} tick={{ fontSize: 12, fill: "var(--text-secondary)" }} tickLine={false} axisLine={false} interval={0} />
          <Tooltip content={<TooltipCard />} cursor={{ fill: "var(--surface-sunken)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={26}>
            {data.map((d, i) => <Cell key={d.label + i} fill={fillFor(i)} />)}
            <LabelList
              dataKey="pct" position="right"
              formatter={(v) => (v == null ? "" : `${Math.round(Number(v) * 100)}%`)}
              style={{ fontSize: 11, fontWeight: 700, fill: "var(--text-secondary)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
