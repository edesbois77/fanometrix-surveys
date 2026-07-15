"use client";

import { useState, useEffect } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";

type ReportData = {
  sentimentTrend:   { date: string; positive: number; neutral: number; negative: number; total: number }[];
  topicBreakdown:   { topic: string; count: number; positive: number; negative: number }[];
  marketComparison: { market: string; total: number; positive_pct: number }[];
  recentSummaries:  { topic: string | null; subtopic: string | null; sentiment: string | null; ai_summary: string | null }[];
};

type Search = { id: string; name: string };

const SENT_COLOURS: Record<string, string> = {
  Positive: "#22C55E", Neutral: "#9CA3AF", Negative: "#EF4444", Unknown: "#E5E7EB",
};

export default function SLReportsPage() {
  const [data,     setData]     = useState<ReportData | null>(null);
  const [searches, setSearches] = useState<Search[]>([]);
  const [selected, setSelected] = useState("");
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch("/api/social/searches").then(r => r.json()).then(j => setSearches(j.data ?? []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = `/api/social/reports${selected ? `?search_id=${selected}` : ""}`;
    fetch(url).then(r => r.ok ? r.json() : null).then(json => { setData(json); setLoading(false); });
  }, [selected]);

  const hasTrend   = (data?.sentimentTrend   ?? []).length > 0;
  const hasTopics  = (data?.topicBreakdown   ?? []).length > 0;
  const hasMarkets = (data?.marketComparison ?? []).length > 0;
  const hasSummary = (data?.recentSummaries  ?? []).length > 0;
  const hasAnyData = hasTrend || hasTopics || hasMarkets || hasSummary;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-400 mt-0.5">Sentiment trends, topic breakdown and market comparison</p>
          </div>
          {searches.length > 0 && (
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#D7B87A]">
              <option value="">All Searches</option>
              {searches.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {!hasAnyData && !loading ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center shadow-sm">
            <p className="text-gray-400 text-sm">No data yet. Import mentions to generate reports.</p>
            <a href="/social-listening/mentions" className="inline-block mt-4 text-sm font-semibold text-[#D7B87A] hover:underline">
              Import Mentions →
            </a>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Sentiment Trend */}
            {hasTrend && (
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Sentiment Trend</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data?.sentimentTrend} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="positive" stackId="1" stroke="#22C55E" fill="#DCFCE7" />
                    <Area type="monotone" dataKey="neutral"  stackId="1" stroke="#9CA3AF" fill="#F3F4F6" />
                    <Area type="monotone" dataKey="negative" stackId="1" stroke="#EF4444" fill="#FEE2E2" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Topic Breakdown */}
            {hasTopics && (
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Topic Breakdown</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data?.topicBreakdown?.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="topic" tick={{ fontSize: 11 }} width={140} />
                    <Tooltip />
                    <Bar dataKey="positive" stackId="a" fill="#22C55E" name="Positive" />
                    <Bar dataKey="negative" stackId="a" fill="#EF4444" name="Negative" />
                    <Bar dataKey="count"    stackId="a" fill="#E5E7EB" name="Other"    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Market Comparison */}
            {hasMarkets && (
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Market Comparison</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data?.marketComparison} margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="market" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v, name) => [name === "positive_pct" ? `${Number(v)}%` : Number(v), name === "positive_pct" ? "Positive %" : "Total"]} />
                    <Bar dataKey="total"        fill="#D7B87A" name="Total"      radius={[4,4,0,0]} />
                    <Bar dataKey="positive_pct" fill="#22C55E" name="Positive %" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Emerging Themes — AI Summaries */}
            {hasSummary && (
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Emerging Themes, AI Summaries</h3>
                <div className="space-y-3">
                  {(data?.recentSummaries ?? []).map((s, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="flex gap-1.5 flex-shrink-0 pt-0.5">
                        {s.topic && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{s.topic}</span>}
                        {s.subtopic && <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full">{s.subtopic}</span>}
                        {s.sentiment && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: SENT_COLOURS[s.sentiment] + "20", color: SENT_COLOURS[s.sentiment] }}>
                            {s.sentiment}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 italic flex-1">{s.ai_summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </AdminShell>
  );
}
