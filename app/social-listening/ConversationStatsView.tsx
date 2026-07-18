"use client";

// The Conversation dashboard's stats visualisations — the KPI row and the
// Top Topics / By Platform / By Market / Sentiment Split charts — extracted
// verbatim from the standalone Social Listening dashboard so the SAME charts
// render in both hosts:
//   • the platform-wide Social Listening dashboard, and
//   • the Research Project's Dashboard › Conversation Intelligence sub-page,
//     project-scoped.
// It is purely presentational: it renders whatever `stats` it is given. The
// aggregation itself is reused unchanged from /api/social/stats (scoped by
// search_id or research_project_id) — no calculations live here. The `emptyState`
// is supplied by the host so each can offer the right next step.
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export type ConversationStats = {
  total: number;
  positive_pct: number; neutral_pct: number; negative_pct: number;
  topTopics:    { topic: string; count: number }[];
  topPlatforms: { platform: string; count: number }[];
  topMarkets:   { market: string; count: number }[];
};

export const SL_GOLD  = "#D7B87A";
export const SL_GREEN = "#22C55E";
export const SL_RED   = "#EF4444";
export const SL_GREY  = "#9CA3AF";
export const SL_TEAL  = "#4FA3A5";

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accent ?? SL_GREY }} />
      <p className="text-2xl font-bold mt-1" style={{ color: accent ?? "#0B1929" }}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

// Overall direction of sentiment — a research reading, not just three numbers.
function sentimentDirection(pos: number, neg: number): { label: string; color: string } {
  const net = pos - neg;
  if (net >= 15) return { label: "Broadly positive", color: SL_GREEN };
  if (net <= -15) return { label: "Broadly negative", color: SL_RED };
  return { label: "Mixed", color: SL_GREY };
}

export function ConversationStatsView({ stats, loading, emptyState, totalLabel = "Total Mentions" }: {
  stats: ConversationStats | null;
  loading: boolean;
  emptyState: React.ReactNode;
  /** The primary KPI's label — research hosts pass e.g. "Conversations Analysed". */
  totalLabel?: string;
}) {
  const total = stats?.total ?? 0;
  const direction = sentimentDirection(stats?.positive_pct ?? 0, stats?.negative_pct ?? 0);

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard label={totalLabel} value={loading ? "—" : total.toLocaleString()} accent={total > 0 ? SL_GREEN : SL_GREY} />
        <KpiCard label="Positive" value={loading ? "—" : `${stats?.positive_pct ?? 0}%`} accent={SL_GREEN} />
        <KpiCard label="Neutral"  value={loading ? "—" : `${stats?.neutral_pct  ?? 0}%`} accent={SL_GREY}  />
        <KpiCard label="Negative" value={loading ? "—" : `${stats?.negative_pct ?? 0}%`} accent={SL_RED}   />
      </div>

      {total === 0 ? emptyState : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Top Topics */}
          {(stats?.topTopics ?? []).length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Top Topics</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats?.topTopics} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="topic" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip formatter={(v) => [Number(v), "mentions"]} />
                  <Bar dataKey="count" fill={SL_GOLD} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Platforms */}
          {(stats?.topPlatforms ?? []).length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">By Platform</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats?.topPlatforms} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="platform" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v) => [Number(v), "mentions"]} />
                  <Bar dataKey="count" fill={SL_TEAL} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Markets */}
          {(stats?.topMarkets ?? []).length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">By Market</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats?.topMarkets} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="market" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip formatter={(v) => [Number(v), "mentions"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {(stats?.topMarkets ?? []).map((_, i) => (
                      <Cell key={i} fill={[SL_GOLD, SL_TEAL, "#5B6CFA", "#4FAF7B", "#7A63D1"][i % 5]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Sentiment split */}
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Overall Sentiment</h3>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: direction.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: direction.color }} aria-hidden />
                {direction.label}
              </span>
            </div>
            <div className="space-y-3">
              {[
                { label: "Positive", pct: stats?.positive_pct ?? 0, color: SL_GREEN },
                { label: "Neutral",  pct: stats?.neutral_pct  ?? 0, color: SL_GREY  },
                { label: "Negative", pct: stats?.negative_pct ?? 0, color: SL_RED   },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{s.label}</span><span>{s.pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
