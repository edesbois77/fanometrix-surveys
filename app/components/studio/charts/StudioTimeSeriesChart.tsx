"use client";

// ── StudioTimeSeriesChart — the shared Survey Studio time-series plot ─────────
// The smallest reusable recharts wrapper the Dashboards need: a token-bound area
// chart that renders as the BODY of a workspace-ui ChartContainer (which owns the
// frame/title/legend/empty). Reuses recharts ^3.8.1 and the validated CHART tokens
// — no second charting stack, no per-page recharts config. Accessible: a role="img"
// wrapper carries a text description so the trend isn't shape-only.

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_INK, seriesColor } from "@/app/components/workspace-ui";

export type SeriesPoint = { date: string; value: number };

function fmtDate(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

function TooltipCard({ active, payload, label, valueLabel }: {
  active?: boolean; payload?: { value?: number }[]; label?: string; valueLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0]?.value ?? 0);
  return (
    <div className="rounded-lg border px-3 py-2 shadow-sm" style={{ background: "var(--surface)", borderColor: "var(--border-default)" }}>
      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{fmtDate(String(label ?? ""))}</p>
      <p className="text-xs font-semibold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>
        {v.toLocaleString()} {valueLabel}
      </p>
    </div>
  );
}

export function StudioTimeSeriesChart({
  data, color, valueLabel = "responses", height = 240, ariaLabel,
}: {
  data: SeriesPoint[];
  color?: string;
  valueLabel?: string;
  height?: number;
  ariaLabel?: string;
}) {
  const stroke = color ?? seriesColor(0);
  const gid = `sts-${stroke.replace(/[^a-z0-9]/gi, "")}`;
  const total = data.reduce((n, p) => n + (p.value || 0), 0);
  const label = ariaLabel ?? `${valueLabel} over time — ${total.toLocaleString()} total across ${data.length} days`;

  return (
    <div role="img" aria-label={label} className="w-full h-full">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
              <stop offset="95%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis
            dataKey="date" tickFormatter={fmtDate} minTickGap={28}
            tick={{ fontSize: 11, fill: CHART_INK.label }} tickLine={false} axisLine={{ stroke: CHART_INK.axis }}
          />
          <YAxis
            width={38} allowDecimals={false}
            tick={{ fontSize: 11, fill: CHART_INK.label }} tickLine={false} axisLine={false}
          />
          <Tooltip content={<TooltipCard valueLabel={valueLabel} />} cursor={{ stroke: CHART_INK.axis, strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} fill={`url(#${gid})`} dot={false} activeDot={{ r: 3 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
