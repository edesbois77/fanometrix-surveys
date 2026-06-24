"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import type { Insight, InsightContentType } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<InsightContentType, string> = {
  report:              "Report",
  market_analysis:     "Market Analysis",
  survey_results:      "Survey Results",
  social_intelligence: "Social Intelligence",
  cheat_sheet:         "Cheat Sheet",
  dashboard:           "Dashboard",
  download:            "Download",
};

const TYPE_ICONS: Record<InsightContentType, string> = {
  report:              "◈",
  market_analysis:     "↗",
  survey_results:      "◫",
  social_intelligence: "◎",
  cheat_sheet:         "☰",
  dashboard:           "▦",
  download:            "⬇",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<string>("all");

  useEffect(() => {
    fetch("/api/insights")
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setInsights(d.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const contentTypes = [...new Set(insights.map(i => i.content_type))];

  const shown = filter === "all"
    ? insights
    : insights.filter(i => i.content_type === filter);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
          <p className="text-sm text-gray-400 mt-0.5">Reports, analyses and intelligence published for your organisation.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(n => (
              <div key={n} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-1/3 mb-3" />
                <div className="h-5 bg-gray-100 rounded w-4/5 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-full mb-1" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : insights.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
            <div className="text-4xl mb-4">◈</div>
            <p className="text-base font-semibold text-gray-700 mb-1">No insights available yet</p>
            <p className="text-sm text-gray-400">Insights published for your organisation will appear here.</p>
          </div>
        ) : (
          <>
            {/* Type filter tabs */}
            {contentTypes.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-5">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    filter === "all"
                      ? "bg-[#0B1929] text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>
                  All
                </button>
                {contentTypes.map(t => (
                  <button key={t}
                    onClick={() => setFilter(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                      filter === t
                        ? "bg-[#0B1929] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {shown.map(i => (
                <InsightCard key={i.id} insight={i} />
              ))}
            </div>

            {shown.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
                <p className="text-sm text-gray-400">No insights of this type available.</p>
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}

// ─── Card component ───────────────────────────────────────────────────────────

function InsightCard({ insight: i }: { insight: Insight }) {
  return (
    <Link href={`/insights/${i.slug}`}
      className="group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all overflow-hidden flex flex-col">

      {/* Featured image */}
      {i.featured_image_url ? (
        <div className="h-36 overflow-hidden bg-gray-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={i.featured_image_url} alt={i.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
        </div>
      ) : (
        <div className="h-20 bg-gradient-to-br from-[#0B1929] to-[#1a3a5c] flex items-center justify-center">
          <span className="text-3xl text-[#D7B87A]/60">{TYPE_ICONS[i.content_type]}</span>
        </div>
      )}

      <div className="p-4 flex flex-col flex-1">
        {/* Type + date row */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {TYPE_LABELS[i.content_type]}
          </span>
          {i.published_at && (
            <span className="text-[10px] text-gray-400">
              {new Date(i.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>

        <h2 className="text-sm font-bold text-gray-900 leading-snug mb-1 group-hover:text-[#0B1929]">
          {i.title}
        </h2>

        {i.subtitle && (
          <p className="text-xs text-gray-500 mb-3 leading-relaxed line-clamp-2">{i.subtitle}</p>
        )}

        {i.summary && (
          <p className="text-xs text-gray-400 leading-relaxed line-clamp-3 flex-1">{i.summary}</p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#0B1929] group-hover:underline">
            {i.content_type === "download" ? "Download ↓" : "Read →"}
          </span>
          {i.download_url && (
            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">
              ⬇ Download available
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
