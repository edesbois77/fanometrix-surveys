"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/app/components/AdminShell";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type Stats = {
  total: number;
  positive_pct: number; neutral_pct: number; negative_pct: number;
  topTopics:    { topic: string; count: number }[];
  topPlatforms: { platform: string; count: number }[];
  topMarkets:   { market: string; count: number }[];
};

const GOLD  = "#D7B87A";
const GREEN = "#22C55E";
const RED   = "#EF4444";
const GREY  = "#9CA3AF";
const TEAL  = "#4FA3A5";

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: accent ?? GREY }} />
      <p className="text-2xl font-bold mt-1" style={{ color: accent ?? "#0B1929" }}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-300 mt-2">{sub}</p>}
    </div>
  );
}

// Reads the ?search_id= query param a Research Project Workspace's
// Conversation Search Source Performance card navigates here with —
// isolated in its own leaf component so only this needs the
// useSearchParams() Suspense boundary, not the whole (otherwise
// statically-rendered) page. `null` means "no scope" (the platform-wide
// view); the sentinel `undefined` default on the parent's state means
// "not read yet", so the first fetch waits for it instead of racing it.
function SearchScopeReader({ onSearchId }: { onSearchId: (id: string | null) => void }) {
  const searchParams = useSearchParams();
  const searchId = searchParams.get("search_id");
  useEffect(() => { onSearchId(searchId); }, [searchId, onSearchId]);
  return null;
}

export default function SLDashboardPage() {
  // undefined = not read from the URL yet, null = confirmed unscoped
  const [scopeSearchId, setScopeSearchId] = useState<string | null | undefined>(undefined);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (scopeSearchId === undefined) return;
    setLoading(true);
    const qs = scopeSearchId ? `?search_id=${scopeSearchId}` : "";
    fetch(`/api/social/stats${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { setStats(json); setLoading(false); })
      .catch(() => setLoading(false));
  }, [scopeSearchId]);

  const total = stats?.total ?? 0;

  return (
    <AdminShell>
      <Suspense fallback={null}>
        <SearchScopeReader onSearchId={setScopeSearchId} />
      </Suspense>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Social Listening</h1>
          <p className="text-sm text-gray-400 mt-0.5">Football Conversation Intelligence</p>
          <p className="text-sm text-gray-500 mt-2 max-w-xl leading-relaxed">
            Understand what football fans discuss naturally across public platforms and combine those findings with survey data.
          </p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <KpiCard label="Total Mentions"   value={loading ? "—" : total.toLocaleString()} accent={total > 0 ? GREEN : GREY} />
          <KpiCard label="Positive"  value={loading ? "—" : `${stats?.positive_pct ?? 0}%`} accent={GREEN} />
          <KpiCard label="Neutral"   value={loading ? "—" : `${stats?.neutral_pct  ?? 0}%`} accent={GREY}  />
          <KpiCard label="Negative"  value={loading ? "—" : `${stats?.negative_pct ?? 0}%`} accent={RED}   />
        </div>

        {total === 0 ? (
          <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-3" style={{ color: GOLD }}>No data yet</p>
            <h2 className="text-xl font-bold text-white mb-3">Start by importing mentions</h2>
            <p className="text-sm text-white/60 max-w-md mx-auto leading-relaxed mb-5">
              Create a search, then import a CSV of fan conversations from Reddit, news sites, or any source.
              AI will classify each mention automatically.
            </p>
            <a href="/social-listening/mentions"
              className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl"
              style={{ background: GOLD, color: "#0B1929" }}>
              Import Mentions →
            </a>
          </div>
        ) : (
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
                    <Bar dataKey="count" fill={GOLD} radius={[0, 4, 4, 0]} />
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
                    <Bar dataKey="count" fill={TEAL} radius={[0, 4, 4, 0]} />
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
                        <Cell key={i} fill={[GOLD, TEAL, "#5B6CFA", "#4FAF7B", "#7A63D1"][i % 5]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Sentiment split */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Sentiment Split</h3>
              <div className="space-y-3">
                {[
                  { label: "Positive", pct: stats?.positive_pct ?? 0, color: GREEN },
                  { label: "Neutral",  pct: stats?.neutral_pct  ?? 0, color: GREY  },
                  { label: "Negative", pct: stats?.negative_pct ?? 0, color: RED   },
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
      </div>
    </AdminShell>
  );
}
