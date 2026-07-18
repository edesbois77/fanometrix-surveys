"use client";

// Dashboard › Conversation Intelligence (project) — the operational conversation
// dashboard for one Research Project. It reuses the existing conversation
// aggregation and charts, scoped to the project:
//   • KPIs + Top Topics / By Platform / By Market / Sentiment split — the shared
//     ConversationStatsView, fed by /api/social/stats?research_project_id=…
//   • Sentiment trend + Latest AI observations — /api/social/reports?research_project_id=…
//   • Per-search collection status — from the project's attached search evidence.
// Both endpoints aggregate across every search attached to the project (see
// getProjectSocialSearchIds); no aggregation is re-implemented here.
import { useEffect, useState } from "react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ConversationStatsView, type ConversationStats, SL_GOLD, SL_GREEN, SL_GREY, SL_RED } from "@/app/social-listening/ConversationStatsView";

export type ConversationSearchSummary = {
  evidence_id: string;
  name: string;
  mention_count: number;
  reddit_collection_status: string;
  reddit_last_collected_at: string | null;
};

type Reports = {
  sentimentTrend: { date: string; positive: number; neutral: number; negative: number; total: number }[];
  recentSummaries: { topic: string | null; subtopic: string | null; sentiment: string | null; ai_summary: string | null }[];
};

function collectionMeta(status: string, mentions: number): { label: string; color: string } {
  if (status === "collecting") return { label: "Collecting", color: SL_GREEN };
  if (status === "failed") return { label: "Failed", color: SL_RED };
  if (status === "completed" || mentions > 0) return { label: "Collected", color: SL_GREY };
  return { label: "Not collected", color: SL_GREY };
}

// A FACTUAL evidence summary — descriptive only (what/how much/where/sentiment/
// topics). Dashboard is descriptive intelligence; interpretation ("what does
// this mean / what should we do") is Analysis's job, never derived here. These
// lines are read straight from the same aggregates the charts use — no reasoning.
function evidenceSummary(stats: ConversationStats | null, searchesCount: number): string[] {
  if (!stats || stats.total === 0) return [];
  const obs: string[] = [];
  const net = stats.positive_pct - stats.negative_pct;
  const dir = net >= 15 ? "broadly positive" : net <= -15 ? "broadly negative" : "mixed";
  obs.push(`${stats.total.toLocaleString()} conversations analysed across ${searchesCount} search${searchesCount === 1 ? "" : "es"}.`);
  const topTopic = stats.topTopics?.[0];
  if (topTopic) obs.push(`Conversations most commonly focus on ${topTopic.topic} (${topTopic.count.toLocaleString()} conversation${topTopic.count === 1 ? "" : "s"}).`);
  obs.push(`Overall sentiment is ${dir} — ${stats.positive_pct}% positive versus ${stats.negative_pct}% negative.`);
  const topMarket = stats.topMarkets?.[0];
  if (topMarket && stats.topMarkets.length > 1) obs.push(`${topMarket.market} generated the highest discussion volume.`);
  const topPlatform = stats.topPlatforms?.[0];
  if (topPlatform) obs.push(`Most conversations were found on ${topPlatform.platform}.`);
  return obs;
}

export function ConversationDashboardBody({ projectId, searches }: { projectId: string; searches: ConversationSearchSummary[] }) {
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [reports, setReports] = useState<Reports | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const qs = `?research_project_id=${projectId}`;
    Promise.all([
      fetch(`/api/social/stats${qs}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/social/reports${qs}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([s, rep]) => {
      if (cancelled) return;
      setStats(s);
      setReports(rep);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  const trend = reports?.sentimentTrend ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const conversationsToday = trend.find(d => d.date === today)?.total ?? 0;
  const evidenceFacts = evidenceSummary(stats, searches.length);

  if (searches.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
        <p className="text-sm text-gray-500">No conversation searches attached to this project. Add one in Research.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs text-gray-400">
          Evidence from {searches.length} conversation search{searches.length === 1 ? "" : "es"} in this project.
          {stats && stats.total > 0 ? ` ${conversationsToday.toLocaleString()} new today.` : ""}
        </p>
        <Link href="/social-listening/mentions" className="text-xs font-semibold text-gray-500 hover:text-[#D7B87A] transition-colors">
          View underlying conversations →
        </Link>
      </div>

      <ConversationStatsView
        stats={stats}
        loading={loading}
        totalLabel="Conversations Analysed"
        emptyState={
          <div className="bg-white border border-gray-100 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-500">No mentions collected yet. Run collection in Execution and the analytics appear here.</p>
          </div>
        }
      />

      {trend.length > 1 && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mt-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Sentiment Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend} margin={{ left: 0, right: 8, top: 4 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="positive" stackId="1" stroke={SL_GREEN} fill={SL_GREEN} fillOpacity={0.5} />
              <Area type="monotone" dataKey="neutral"  stackId="1" stroke={SL_GREY}  fill={SL_GREY}  fillOpacity={0.4} />
              <Area type="monotone" dataKey="negative" stackId="1" stroke={SL_RED}   fill={SL_RED}   fillOpacity={0.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {evidenceFacts.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm flex flex-col">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Evidence Summary</h3>
            <p className="text-[11px] text-gray-400 mb-4">A factual snapshot of what&apos;s been collected — the interpretation happens in Analysis.</p>
            <ul className="space-y-2.5">
              {evidenceFacts.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: SL_GOLD }} aria-hidden />
                  {o}
                </li>
              ))}
            </ul>
            <Link href={`/research-projects/${projectId}/analysis`} className="text-xs font-semibold mt-4 hover:underline" style={{ color: "#8A6D2F" }}>
              What does this mean? Generate findings in Analysis →
            </Link>
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Collection Status</h3>
          <ul className="space-y-2.5">
            {searches.map(s => {
              const meta = collectionMeta(s.reddit_collection_status, s.mention_count);
              return (
                <li key={s.evidence_id} className="flex items-center justify-between gap-3">
                  <Link href={`/social-listening/searches/${s.evidence_id}`} className="min-w-0 truncate text-sm text-gray-700 hover:text-[#D7B87A] transition-colors">
                    {s.name}
                  </Link>
                  <span className="flex items-center gap-2 flex-shrink-0 text-xs text-gray-400">
                    <span className="fx-tabular-nums">{s.mention_count.toLocaleString()}</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} aria-hidden />
                      {meta.label}
                    </span>
                    {s.reddit_last_collected_at && <span className="hidden sm:inline">· {formatRelativeTime(s.reddit_last_collected_at)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
