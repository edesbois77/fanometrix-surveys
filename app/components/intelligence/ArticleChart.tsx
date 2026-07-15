"use client";

// Static, non-interactive renderer for an ArticleChartSpec (see
// lib/intelligence/analysts/analyseEditorialArticle.ts) — deliberately not
// the live, filterable dashboard charts in
// app/dashboard/components/ChartGrid.tsx. An Editorial Article's charts
// are rendered from a stored spec with exact, frozen values; there is no
// live data to filter against, so this component takes a spec and renders
// it, nothing more.
//
// Styled as an editorial figure (hairline rules, caption above, source
// line below, no card/shadow/background) rather than a dashboard widget
// — this is the one visual element embedded directly in the article's
// reading flow, so it needs to look like a chart in a published piece,
// not a report module.
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import { NAVY, GOLD } from "@/lib/intelligence/theme";
import type { ArticleChartSpec } from "@/lib/intelligence/analysts/analyseEditorialArticle";

// Same palette as app/dashboard/components/ChartGrid.tsx's CHART_PALETTE —
// duplicated rather than imported, since that file is dashboard-specific
// and this component has no other reason to depend on it.
const PALETTE = ["#D7B87A", "#4FA3A5", "#6B7A99", "#5B6CFA", "#4FAF7B", "#7A63D1"];

export function ArticleChart({ spec }: { spec: ArticleChartSpec }) {
  const unitSuffix = spec.unit === "percent" ? "%" : "";
  const data = spec.series.map(s => ({ name: s.label, value: s.value }));

  return (
    <figure className="my-8 py-5 border-y border-gray-100 print:break-inside-avoid">
      <figcaption className="mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {spec.title}{spec.scope ? ` — ${spec.scope}` : ""}
        </p>
        {spec.subtitle && <p className="text-xs text-gray-400 mt-0.5">{spec.subtitle}</p>}
      </figcaption>
      <div>
        {spec.chart_type === "pie" ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={2}>
                {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <RTooltip formatter={v => `${v}${unitSuffix}`} contentStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : spec.chart_type === "line" ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8eaf0" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <RTooltip formatter={v => `${v}${unitSuffix}`} contentStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="value" stroke={GOLD} strokeWidth={2} dot={{ fill: NAVY, stroke: GOLD, strokeWidth: 1.5, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(120, data.length * 32 + 24)}>
            <BarChart layout="vertical" data={data} margin={{ left: 0, right: 28, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={100} axisLine={false} tickLine={false} />
              <RTooltip formatter={v => `${v}${unitSuffix}`} contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 9, fill: "#9ca3af" }}>
                {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="text-[11px] text-gray-400 mt-2 italic">Source: {spec.source_label}</p>
    </figure>
  );
}
