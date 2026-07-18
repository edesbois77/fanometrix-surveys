"use client";

// The Research Project Dashboard's conversation charts — the KPI row and the
// Top Topics / By Source / By Market / Sentiment panels, rendered in the
// Fanometrix workspace design language: white cards, navy typography, hairline
// borders, GOLD for quantitative evidence and only the muted SENTIMENT tones
// for tone. Deliberately research-native: it shares the workspace design system
// (tokens + ChartContainer), NOT the legacy Social Listening dashboard's
// styling. Purely presentational — it renders whatever `stats` it is given,
// aggregated by /api/social/stats scoped to this project; no maths live here.
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { GOLD, SENTIMENT, CHART_INK, ChartContainer, Card } from "@/app/components/workspace-ui";

export type ConversationStats = {
  total: number;
  positive_pct: number; neutral_pct: number; negative_pct: number;
  topTopics:    { topic: string; count: number }[];
  topPlatforms: { platform: string; count: number }[];
  topMarkets:   { market: string; count: number }[];
};

// Shared Recharts styling so every chart reads as one family: hairline axes,
// muted tick labels, and a tooltip that matches the workspace card.
const AXIS_TICK = { fontSize: 11, fill: CHART_INK.label };
const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  boxShadow: "var(--shadow-md)",
  fontSize: 12,
  padding: "6px 10px",
} as const;

// One KPI: a bare number over a muted label, no coloured border. The total is
// navy (quantitative); the three sentiment figures carry only their muted
// sentiment ink so tone is legible without shouting.
function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="border p-4" style={{ borderRadius: "var(--radius-tile)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-xs)" }}>
      <p className="fx-tabular-nums text-2xl font-bold tracking-[-0.02em]" style={{ color: tone ?? "var(--text-primary)" }}>{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mt-1" style={{ color: "var(--text-tertiary)" }}>{label}</p>
    </div>
  );
}

// A horizontal quantitative bar chart in GOLD — Topics / Sources / Markets all
// share the same evidence colour; nothing here competes with sentiment.
function EvidenceBars({ title, description, data, dataKey, categoryWidth = 120, loading }: {
  title: string;
  description?: string;
  data: { name: string; count: number }[];
  dataKey: string;
  categoryWidth?: number;
  loading: boolean;
}) {
  return (
    <ChartContainer title={title} description={description} height={200} loading={loading}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 2, bottom: 2 }}>
          <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} width={categoryWidth} />
          <Tooltip cursor={{ fill: "var(--surface-hover)" }} contentStyle={TOOLTIP_STYLE} formatter={(v) => [Number(v).toLocaleString(), "conversations"]} />
          <Bar dataKey={dataKey} fill={GOLD} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

// Overall direction of sentiment — a research reading, not just three numbers.
function sentimentDirection(pos: number, neg: number): { label: string; color: string } {
  const net = pos - neg;
  if (net >= 15) return { label: "Broadly positive", color: SENTIMENT.positive.ink };
  if (net <= -15) return { label: "Broadly negative", color: SENTIMENT.negative.ink };
  return { label: "Mixed", color: SENTIMENT.neutral.ink };
}

export function ConversationCharts({ stats, loading, emptyState, totalLabel = "Conversations Analysed" }: {
  stats: ConversationStats | null;
  loading: boolean;
  emptyState: React.ReactNode;
  /** The primary KPI's label — e.g. "Conversations Analysed". */
  totalLabel?: string;
}) {
  const total = stats?.total ?? 0;
  const direction = sentimentDirection(stats?.positive_pct ?? 0, stats?.negative_pct ?? 0);
  const dash = loading ? "—" : undefined;

  return (
    <>
      {/* KPI row — white cards, navy total, muted sentiment ink. No colour borders. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Kpi label={totalLabel} value={dash ?? total.toLocaleString()} />
        <Kpi label="Positive" value={dash ?? `${stats?.positive_pct ?? 0}%`} tone={SENTIMENT.positive.ink} />
        <Kpi label="Neutral"  value={dash ?? `${stats?.neutral_pct  ?? 0}%`} tone={SENTIMENT.neutral.ink} />
        <Kpi label="Negative" value={dash ?? `${stats?.negative_pct ?? 0}%`} tone={SENTIMENT.negative.ink} />
      </div>

      {total === 0 ? emptyState : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(stats?.topTopics ?? []).length > 0 && (
            <EvidenceBars title="Top Topics" data={(stats?.topTopics ?? []).map(t => ({ name: t.topic, count: t.count }))} dataKey="count" categoryWidth={130} loading={loading} />
          )}

          {(stats?.topPlatforms ?? []).length > 0 && (
            <EvidenceBars title="By Source" data={(stats?.topPlatforms ?? []).map(p => ({ name: p.platform, count: p.count }))} dataKey="count" categoryWidth={90} loading={loading} />
          )}

          {(stats?.topMarkets ?? []).length > 0 && (
            <EvidenceBars title="By Market" data={(stats?.topMarkets ?? []).map(m => ({ name: m.market, count: m.count }))} dataKey="count" categoryWidth={90} loading={loading} />
          )}

          {/* Sentiment — the one place colour is allowed, in muted tones. */}
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Overall Sentiment</h3>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: direction.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: direction.color }} aria-hidden />
                {direction.label}
              </span>
            </div>
            <div className="space-y-3">
              {[
                { label: "Positive", pct: stats?.positive_pct ?? 0, color: SENTIMENT.positive.fill },
                { label: "Neutral",  pct: stats?.neutral_pct  ?? 0, color: SENTIMENT.neutral.fill  },
                { label: "Negative", pct: stats?.negative_pct ?? 0, color: SENTIMENT.negative.fill  },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                    <span>{s.label}</span><span className="fx-tabular-nums">{s.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
