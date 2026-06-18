"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Papa from "papaparse";
import type { SurveyResponse } from "@/lib/types";
import { AdminShell } from "@/app/components/AdminShell";
import { KpiCards } from "./components/KpiCards";
import { ResponseExplorer } from "./components/Explorer";

function tally(responses: SurveyResponse[], field: keyof SurveyResponse) {
  const counts: Record<string, number> = {};
  for (const r of responses) {
    const val = (r[field] as string) ?? "Not answered";
    counts[val] = (counts[val] ?? 0) + 1;
  }
  return counts;
}

function BarChart({ label, counts, total }: { label: string; counts: Record<string, number>; total: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
      <h2 className="font-semibold text-gray-800">{label}</h2>
      {Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([opt, count]) => {
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={opt} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">{opt}</span>
                <span className="text-gray-500">{count} ({pct}%)</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
    </div>
  );
}

export default function DashboardPage() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch("/api/responses");
    if (!res.ok) { setError("Failed to load responses."); setLoading(false); return; }
    const json = await res.json();
    setResponses(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function exportCSV() {
    const csv = Papa.unparse(
      responses.map(r => ({
        id: r.id,
        submitted_at: r.created_at,
        campaign_id: r.campaign_id,
        survey_id: r.survey_id,
        question_set_id: r.question_set_id,
        publisher: r.publisher,
        placement: r.placement,
        club: r.club,
        competition: r.competition,
        q1: r.q1, q2: r.q2, q3: r.q3,
        country: r.country,
        fan_segment: r.fan_segment,
        device: r.device,
        browser: r.browser,
        response_duration_seconds: r.response_duration_seconds,
      }))
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `fanometrix-responses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = responses.length;

  return (
    <AdminShell>
    <div className="p-6 max-w-5xl mx-auto">

      {/* ── Dashboard header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-indigo-700">Fanometrix Pulse</h1>
          <p className="text-gray-500 text-sm mt-1">Dashboard</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Refresh
          </button>
          <button onClick={exportCSV} disabled={total === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
            Export CSV
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-400">Loading responses…</p>}
      {error   && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <>
          {/* ── KPI cards ── */}
          <KpiCards responses={responses} />

          {/* ── Response count hero ── */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 mb-6 text-center">
            <p className="text-5xl font-bold text-indigo-700">{total}</p>
            <p className="text-gray-500 mt-1 text-sm">total responses</p>
          </div>

          {total === 0 ? (
            <p className="text-gray-400 text-center mt-10">
              No responses yet. Share the survey link to get started!
            </p>
          ) : (
            <>
              {/* ── Existing question charts (unchanged) ── */}
              <div className="space-y-4">
                <BarChart label="Q1 · How often do you attend live events?"
                  counts={tally(responses, "q1")} total={total} />
                <BarChart label="Q2 · How would you rate your overall fan experience?"
                  counts={tally(responses, "q2")} total={total} />
                <BarChart label="Q3 · How likely are you to recommend us to a friend?"
                  counts={tally(responses, "q3")} total={total} />
                <BarChart label="Responses by country"
                  counts={tally(responses, "country")} total={total} />
              </div>

              {/* ── Response Explorer ── */}
              <ResponseExplorer responses={responses} />
            </>
          )}
        </>
      )}

      <footer className="mt-12 pt-6 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-400">
        <span>Fanometrix Pulse</span>
        <Link href="/privacy" className="hover:text-indigo-500 transition-colors">ⓘ Privacy Policy</Link>
        <Link href="/publisher-guide" className="hover:text-indigo-500 transition-colors">☰ Publisher Guide</Link>
      </footer>
    </div>
    </AdminShell>
  );
}
