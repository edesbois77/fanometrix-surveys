"use client";

// The Conversation Search detail/editor — extracted verbatim from this route's
// page.tsx so the SAME component can be mounted in two shells:
//   • standalone  → app/social-listening/searches/[id]/page.tsx  (AdminShell)
//   • in-project  → app/research-projects/[id]/(workspace)/research/[method]/[recordId]/page.tsx
// Both mount this body, call the same /api/social APIs, and edit the same
// search record — only the surrounding chrome + "back" target differ, which is
// why they're props rather than read from the URL here.
//
// Renders no chrome of its own (no AdminShell) and no width wrapper beyond its
// own max-w-5xl column, so it drops cleanly into either shell. `onRecordLabel`
// lets the in-project mount surface the search name in the workspace breadcrumb.
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { SEARCH_STATUSES } from "@/lib/social-taxonomy";

type RedditStatus = "not_collected" | "collecting" | "completed" | "failed";
type Search = {
  id: string; name: string; entity_type: string; research_goal: string;
  description: string | null; status: string; markets: string[];
  platforms: string[]; frequency: string;
  social_keywords: { keyword: string; keyword_type: string }[];
  reddit_subreddits: string[];
  reddit_collection_status: RedditStatus;
  reddit_last_collected_at: string | null;
  reddit_mentions_collected: number;
  reddit_collection_error: string | null;
};
type Stats = {
  total: number; positive_pct: number; neutral_pct: number; negative_pct: number;
  topTopics: { topic: string; count: number }[];
  topPlatforms: { platform: string; count: number }[];
  topMarkets: { market: string; count: number }[];
};
type Summary = { topic: string | null; sentiment: string | null; ai_summary: string | null };

const SENT_COLOURS: Record<string, string> = { Positive: "#22C55E", Neutral: "#9CA3AF", Negative: "#EF4444" };
const STATUS_COLOURS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600", Active: "bg-green-100 text-green-700",
  Paused: "bg-amber-100 text-amber-700", Archived: "bg-red-100 text-red-500",
};
const REDDIT_STATUS_COLOURS: Record<RedditStatus, string> = {
  not_collected: "bg-gray-100 text-gray-600",
  collecting:    "bg-blue-100 text-blue-700",
  completed:     "bg-green-100 text-green-700",
  failed:        "bg-red-100 text-red-600",
};
const REDDIT_STATUS_LABELS: Record<RedditStatus, string> = {
  not_collected: "Not collected",
  collecting:    "Collecting…",
  completed:     "Completed",
  failed:        "Failed",
};

export function SearchDetailBody({ id, backHref, backLabel, onRecordLabel }: {
  id: string;
  backHref: string;
  backLabel: string;
  /** Surfaces the search name to the surrounding shell (in-project breadcrumb). */
  onRecordLabel?: (label: string | null) => void;
}) {
  const [search,         setSearch]         = useState<Search | null>(null);
  const [stats,          setStats]          = useState<Stats | null>(null);
  const [summaries,      setSummaries]      = useState<Summary[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [subredditInput, setSubredditInput] = useState("");
  const [savingSubs,     setSavingSubs]     = useState(false);
  const [collecting,     setCollecting]     = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [toast,          setToast]          = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [sJson, statsJson, reportJson] = await Promise.all([
        fetch(`/api/social/searches`).then(r => r.json()),
        fetch(`/api/social/stats?search_id=${id}`).then(r => r.json()),
        fetch(`/api/social/reports?search_id=${id}`).then(r => r.json()),
      ]);
      const found = (sJson.data ?? []).find((s: Search) => s.id === id);
      setSearch(found ?? null);
      setSubredditInput((found?.reddit_subreddits ?? []).join(", "));
      setStats(statsJson);
      setSummaries(reportJson.recentSummaries ?? []);
    } catch {
      setSearch(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Surface the record name to the workspace breadcrumb (no-op when standalone).
  useEffect(() => {
    onRecordLabel?.(search?.name ?? null);
    return () => onRecordLabel?.(null);
  }, [search?.name, onRecordLabel]);

  async function handleSaveSubreddits() {
    if (!search) return;
    const subs = subredditInput.split(",").map(s => s.trim().replace(/^\/?r\//i, "")).filter(Boolean);
    setSavingSubs(true);
    const res = await fetch(`/api/social/searches/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reddit_subreddits: subs }),
    });
    setSavingSubs(false);
    if (res.ok) { showToast("Subreddits saved."); load(); }
    else { const j = await res.json(); showToast(j.error ?? "Failed to save subreddits.", false); }
  }

  // Status was previously only editable from the list page's edit drawer —
  // meant navigating away and back just to flip Draft → Active, the exact
  // step a newly-attached Conversation Search needs before Run Research
  // (Product Walkthrough) will allow generating simulated mentions.
  // Immediate on-change commit, no separate Save step — a single field,
  // low-risk, matching how simple a status flip should feel.
  async function handleChangeStatus(newStatus: string) {
    if (!search || newStatus === search.status) return;
    setChangingStatus(true);
    const res = await fetch(`/api/social/searches/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setChangingStatus(false);
    if (res.ok) { showToast(`Status changed to ${newStatus}.`); load(); }
    else { const j = await res.json().catch(() => ({})); showToast(j.error ?? "Failed to change status.", false); }
  }

  async function handleCollectReddit() {
    setCollecting(true);
    showToast("Collecting the latest content…");
    const res  = await fetch(`/api/social/searches/${id}/collect`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setCollecting(false);
    if (res.ok) {
      const byKind = (json.stats?.by_kind ?? {}) as Record<string, number>;
      const parts = Object.entries(byKind).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`);
      showToast(`✓ Collected ${parts.length ? parts.join(", ") : `${json.inserted ?? 0} items`}.`);
    } else showToast(json.error ?? "Collection failed.", false);
    load();
  }

  if (loading) return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="h-8 w-64 bg-gray-100 rounded-lg animate-pulse mb-4" />
      <div className="grid grid-cols-4 gap-3">{[0,1,2,3].map(i => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 h-20 animate-pulse" />
      ))}</div>
    </div>
  );

  if (!search) return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href={backHref} className="text-sm text-gray-400 hover:text-gray-600">{backLabel}</Link>
      <p className="mt-6 text-gray-400">Search not found.</p>
    </div>
  );

  const total = stats?.total ?? 0;

  return (
    <>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <Link href={backHref} className="text-xs text-gray-400 hover:text-gray-600">{backLabel}</Link>
          <div className="flex items-start gap-3 mt-2">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">{search.name}</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <select
                  value={search.status}
                  onChange={e => handleChangeStatus(e.target.value)}
                  disabled={changingStatus}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 ${STATUS_COLOURS[search.status]}`}
                  title="Change status"
                >
                  {SEARCH_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{search.entity_type}</span>
                <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{search.research_goal}</span>
              </div>
              {search.description && <p className="text-sm text-gray-500 mt-2 leading-relaxed">{search.description}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Link href={`/social-listening/mentions`}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                Mentions →
              </Link>
              <Link href={`/social-listening/searches/${id}/insights`}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                style={{ background: "#0B1929" }}>
                Generate Insights →
              </Link>
            </div>
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {search.social_keywords.length ? search.social_keywords.map((k, i) => (
                <span key={i} className="text-xs bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">
                  {k.keyword} <span className="text-gray-300">· {k.keyword_type}</span>
                </span>
              )) : <span className="text-xs text-gray-300">No keywords set</span>}
            </div>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Markets</p>
            <p className="text-sm text-gray-700">{search.markets.join(" · ") || "All markets"}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Platforms · Frequency</p>
            <p className="text-sm text-gray-700">{search.platforms.join(", ") || "All"}</p>
            <p className="text-xs text-gray-400 mt-1">{search.frequency}</p>
          </div>
        </div>

        {/* Reddit Collection */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <h3 className="text-sm font-semibold text-gray-900">Reddit Collection</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${REDDIT_STATUS_COLOURS[search.reddit_collection_status] ?? REDDIT_STATUS_COLOURS.not_collected}`}>
                  {REDDIT_STATUS_LABELS[search.reddit_collection_status] ?? "Not collected"}
                </span>
              </div>
              <div className="flex gap-4 text-xs text-gray-400 flex-wrap">
                <span>Source: Reddit</span>
                <span>{search.reddit_mentions_collected ?? 0} mentions collected</span>
                <span>Last collected: {search.reddit_last_collected_at ? new Date(search.reddit_last_collected_at).toLocaleString() : "Never"}</span>
              </div>
              {search.reddit_collection_status === "failed" && search.reddit_collection_error && (
                <p className="text-xs text-red-500 mt-1.5">{search.reddit_collection_error}</p>
              )}
            </div>
            <button onClick={handleCollectReddit}
              disabled={collecting || !search.reddit_subreddits?.length}
              className="text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-40 flex-shrink-0"
              style={{ background: "#D7B87A", color: "#0B1929" }}
              title={!search.reddit_subreddits?.length ? "Add a target subreddit first" : undefined}>
              {collecting ? "Fetching…" : "Fetch Reddit Data"}
            </button>
          </div>

          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Target Subreddits</label>
          <div className="flex gap-2">
            <input value={subredditInput} onChange={e => setSubredditInput(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]"
              placeholder="e.g. soccer, LiverpoolFC, PremierLeague (comma-separated, no r/)" />
            <button onClick={handleSaveSubreddits} disabled={savingSubs}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8] disabled:opacity-40">
              {savingSubs ? "Saving…" : "Save"}
            </button>
          </div>
          {(search.reddit_subreddits ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {search.reddit_subreddits.map(sr => (
                <span key={sr} className="text-xs bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">r/{sr}</span>
              ))}
            </div>
          )}
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Mentions", value: total.toLocaleString(), color: total > 0 ? "#22C55E" : "#9CA3AF" },
            { label: "Positive",  value: `${stats?.positive_pct ?? 0}%`, color: "#22C55E" },
            { label: "Neutral",   value: `${stats?.neutral_pct  ?? 0}%`, color: "#9CA3AF" },
            { label: "Negative",  value: `${stats?.negative_pct ?? 0}%`, color: "#EF4444" },
          ].map(k => (
            <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: k.color }} />
              <p className="text-2xl font-bold mt-1" style={{ color: k.color }}>{k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {total === 0 ? (
          <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
            <p className="text-white/60 text-sm mb-4">No mentions collected yet for this search.</p>
            <Link href={backHref}
              className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl"
              style={{ background: "#D7B87A", color: "#0B1929" }}>
              {backLabel}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">

            {/* Top Topics */}
            {(stats?.topTopics ?? []).length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Top Topics</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats?.topTopics?.slice(0,6)} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="topic" tick={{ fontSize: 10 }} width={130} />
                    <Tooltip formatter={(v) => [Number(v), "mentions"]} />
                    <Bar dataKey="count" fill="#D7B87A" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top Markets */}
            {(stats?.topMarkets ?? []).length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">By Market</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={stats?.topMarkets} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="market" tick={{ fontSize: 10 }} width={50} />
                    <Tooltip formatter={(v) => [Number(v), "mentions"]} />
                    <Bar dataKey="count" radius={[0,4,4,0]}>
                      {(stats?.topMarkets ?? []).map((_, i) => (
                        <Cell key={i} fill={["#4FA3A5","#D7B87A","#5B6CFA","#22C55E","#7A63D1","#4FAF7B"][i%6]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* By Platform */}
            {(stats?.topPlatforms ?? []).length > 0 && (
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">By Platform</h3>
                <div className="space-y-3">
                  {(stats?.topPlatforms ?? []).map(p => (
                    <div key={p.platform}>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{p.platform}</span><span>{p.count}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[#4FA3A5]"
                          style={{ width: `${Math.round((p.count / total) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sentiment split */}
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Sentiment Split</h3>
              <div className="space-y-3">
                {[
                  { label: "Positive", pct: stats?.positive_pct ?? 0 },
                  { label: "Neutral",  pct: stats?.neutral_pct  ?? 0 },
                  { label: "Negative", pct: stats?.negative_pct ?? 0 },
                ].map(s => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{s.label}</span><span>{s.pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: SENT_COLOURS[s.label] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Latest AI summaries */}
        {summaries.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Latest AI Summaries</h3>
            <div className="space-y-2">
              {summaries.slice(0, 8).map((s, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex gap-1.5 flex-shrink-0 pt-0.5">
                    {s.topic && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{s.topic}</span>}
                    {s.sentiment && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: (SENT_COLOURS[s.sentiment] ?? "#9CA3AF") + "22", color: SENT_COLOURS[s.sentiment] ?? "#9CA3AF" }}>
                        {s.sentiment}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 italic flex-1">{s.ai_summary}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </>
  );
}
