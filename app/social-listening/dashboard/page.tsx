"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/app/components/AdminShell";
import { ConversationStatsView, type ConversationStats, SL_GOLD } from "@/app/social-listening/ConversationStatsView";

// Reads the ?search_id= query param a Research Project Workspace's
// Conversation Search Source Performance card navigates here with — isolated in
// its own leaf so only this needs the useSearchParams() Suspense boundary.
function SearchScopeReader({ onSearchId }: { onSearchId: (id: string | null) => void }) {
  const searchParams = useSearchParams();
  const searchId = searchParams.get("search_id");
  useEffect(() => { onSearchId(searchId); }, [searchId, onSearchId]);
  return null;
}

export default function SLDashboardPage() {
  // undefined = not read from the URL yet, null = confirmed unscoped
  const [scopeSearchId, setScopeSearchId] = useState<string | null | undefined>(undefined);
  const [stats,   setStats]   = useState<ConversationStats | null>(null);
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

        <ConversationStatsView
          stats={stats}
          loading={loading}
          emptyState={
            <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
              <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-3" style={{ color: SL_GOLD }}>No data yet</p>
              <h2 className="text-xl font-bold text-white mb-3">Start by importing mentions</h2>
              <p className="text-sm text-white/60 max-w-md mx-auto leading-relaxed mb-5">
                Create a search, then import a CSV of fan conversations from Reddit, news sites, or any source.
                AI will classify each mention automatically.
              </p>
              <a href="/social-listening/mentions"
                className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl"
                style={{ background: SL_GOLD, color: "#0B1929" }}>
                Import Mentions →
              </a>
            </div>
          }
        />
      </div>
    </AdminShell>
  );
}
