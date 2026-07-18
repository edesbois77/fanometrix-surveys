"use client";

// Dashboard › Conversation Intelligence (project) — the operational conversation
// dashboard for one Research Project, rendered in the Fanometrix workspace
// design language (white cards, navy typography, gold evidence, muted
// sentiment) so it reads as part of the project, not a separate BI tool:
//   • KPIs + Top Topics / By Source / By Market / Sentiment — ConversationCharts,
//     fed by /api/social/stats?research_project_id=…
//   • Sentiment trend + factual Evidence Summary — /api/social/reports?research_project_id=…
//   • Per-search collection status — from the project's attached search evidence.
// Both endpoints aggregate across every search attached to the project (see
// getProjectSocialSearchIds); no aggregation is re-implemented here. Every link
// stays inside the Research Project — no hand-off to /social-listening/*.
import { useEffect, useState } from "react";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { GOLD, SENTIMENT, CHART_INK, Card } from "@/app/components/workspace-ui";
import { ConversationCharts, type ConversationStats } from "@/app/components/research-projects/dashboard/ConversationCharts";

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
  if (status === "collecting") return { label: "Collecting", color: SENTIMENT.positive.fill };
  if (status === "failed") return { label: "Failed", color: SENTIMENT.negative.ink };
  if (status === "completed" || mentions > 0) return { label: "Collected", color: "var(--text-tertiary)" };
  return { label: "Not collected", color: "var(--text-disabled)" };
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
      <Card padding="lg" className="text-center">
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No conversation searches attached to this project. Add one in Research.</p>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Evidence from {searches.length} conversation search{searches.length === 1 ? "" : "es"} in this project.
          {stats && stats.total > 0 ? ` ${conversationsToday.toLocaleString()} new today.` : ""}
        </p>
        <Link href={`/research-projects/${projectId}/dashboard/conversation/evidence`} className="text-xs font-semibold transition-colors hover:underline" style={{ color: "var(--accent-ink)" }}>
          Review the conversations →
        </Link>
      </div>

      <ConversationCharts
        stats={stats}
        loading={loading}
        totalLabel="Conversations Analysed"
        emptyState={
          <Card padding="lg" className="text-center">
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No conversations collected yet. Run collection in Execution and the analytics appear here.</p>
          </Card>
        }
      />

      {trend.length > 1 && (
        <Card padding="md" className="mt-4">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-primary)" }}>Sentiment Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend} margin={{ left: 0, right: 8, top: 4 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART_INK.label }} tickLine={false} axisLine={{ stroke: CHART_INK.axis }} />
              <YAxis tick={{ fontSize: 11, fill: CHART_INK.label }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border-default)", boxShadow: "var(--shadow-md)", fontSize: 12, padding: "6px 10px" }} />
              <Area type="monotone" dataKey="positive" stackId="1" stroke={SENTIMENT.positive.fill} fill={SENTIMENT.positive.fill} fillOpacity={0.55} />
              <Area type="monotone" dataKey="neutral"  stackId="1" stroke={SENTIMENT.neutral.fill}  fill={SENTIMENT.neutral.fill}  fillOpacity={0.5} />
              <Area type="monotone" dataKey="negative" stackId="1" stroke={SENTIMENT.negative.fill} fill={SENTIMENT.negative.fill} fillOpacity={0.55} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {evidenceFacts.length > 0 && (
          <Card padding="md" className="flex flex-col">
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Evidence Summary</h3>
            <p className="text-xs mt-1 mb-4" style={{ color: "var(--text-tertiary)" }}>A factual snapshot of what&apos;s been collected — the interpretation happens in Analysis.</p>
            <ul className="space-y-2.5">
              {evidenceFacts.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: GOLD }} aria-hidden />
                  {o}
                </li>
              ))}
            </ul>
            <Link href={`/research-projects/${projectId}/analysis`} className="text-xs font-semibold mt-4 hover:underline" style={{ color: "var(--accent-ink)" }}>
              What does this mean? Generate findings in Analysis →
            </Link>
          </Card>
        )}

        <Card padding="md">
          <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-primary)" }}>Collection Status</h3>
          <ul className="space-y-2.5">
            {searches.map(s => {
              const meta = collectionMeta(s.reddit_collection_status, s.mention_count);
              return (
                <li key={s.evidence_id} className="flex items-center justify-between gap-3">
                  <Link href={`/research-projects/${projectId}/dashboard/conversation/evidence?search=${s.evidence_id}`} className="min-w-0 truncate text-sm transition-colors hover:underline" style={{ color: "var(--text-secondary)" }}>
                    {s.name}
                  </Link>
                  <span className="flex items-center gap-2 flex-shrink-0 text-xs" style={{ color: "var(--text-tertiary)" }}>
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
        </Card>
      </div>
    </div>
  );
}
