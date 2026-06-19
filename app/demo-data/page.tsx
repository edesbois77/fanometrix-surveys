"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type Stats = { demo_count: number; real_count: number };

const PRESETS = [
  { label: "100",    count: 100,   note: "Quick test"    },
  { label: "1,000",  count: 1000,  note: "Small dataset" },
  { label: "5,000",  count: 5000,  note: "Medium dataset"},
  { label: "10,000", count: 10000, note: "Large dataset" },
];

const DISTRIBUTIONS = [
  {
    title: "Countries",
    rows: [
      { label: "United Kingdom", pct: 40 },
      { label: "Germany",        pct: 20 },
      { label: "Spain",          pct: 15 },
      { label: "Italy",          pct: 10 },
      { label: "France",         pct: 10 },
      { label: "Other",          pct:  5 },
    ],
  },
  {
    title: "Publishers",
    rows: [
      { label: "FotMob",       pct: 35 },
      { label: "LiveScore",    pct: 35 },
      { label: "Forza Football", pct: 20 },
      { label: "Football365",  pct: 10 },
    ],
  },
  {
    title: "Devices",
    rows: [
      { label: "Mobile",  pct: 75 },
      { label: "Desktop", pct: 20 },
      { label: "Tablet",  pct:  5 },
    ],
  },
  {
    title: "Q1 · Attendance",
    rows: [
      { label: "Never",          pct: 25 },
      { label: "1-2 times/year", pct: 35 },
      { label: "3-5 times/year", pct: 25 },
      { label: "5+/year",        pct: 15 },
    ],
  },
  {
    title: "Q2 · Experience",
    rows: [
      { label: "Excellent", pct: 30 },
      { label: "Good",      pct: 45 },
      { label: "Average",   pct: 20 },
      { label: "Poor",      pct:  5 },
    ],
  },
  {
    title: "Q3 · Recommend",
    rows: [
      { label: "Very likely",     pct: 35 },
      { label: "Likely",          pct: 40 },
      { label: "Somewhat likely", pct: 20 },
      { label: "Not likely",      pct:  5 },
    ],
  },
];

const BATCH = 500; // rows per API call

export default function DemoDataPage() {
  const [stats,        setStats]        = useState<Stats | null>(null);
  const [generating,   setGenerating]   = useState(false);
  const [progress,     setProgress]     = useState({ done: 0, total: 0 });
  const [deleting,     setDeleting]     = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [confirmReady, setConfirmReady] = useState(false);
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null);

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/demo/stats");
    const json = await res.json();
    setStats(json);
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function generate(total: number) {
    setGenerating(true);
    setProgress({ done: 0, total });
    const batches = Math.ceil(total / BATCH);

    for (let i = 0; i < batches; i++) {
      const count = Math.min(BATCH, total - i * BATCH);
      const res = await fetch("/api/demo/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ count }),
      });
      if (!res.ok) { showToast("Generation failed — check console.", false); break; }
      setProgress({ done: Math.min((i + 1) * BATCH, total), total });
    }

    setGenerating(false);
    setProgress({ done: 0, total: 0 });
    await loadStats();
    showToast(`${total.toLocaleString()} demo responses generated.`);
  }

  async function handleDelete() {
    setDeleting(true);
    setShowConfirm(false);
    setConfirmReady(false);
    const res  = await fetch("/api/demo/delete", { method: "DELETE" });
    const json = await res.json();
    setDeleting(false);
    await loadStats();
    showToast(`${(json.deleted ?? 0).toLocaleString()} demo responses deleted.`);
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <AdminShell>
      <div className="p-6 max-w-4xl mx-auto">

        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Demo Data Generator</h1>
        <p className="text-sm text-gray-400 mb-6">
          Generate realistic football fan survey data for testing and demos.
          Real survey responses are never affected.
        </p>

        {/* Status card */}
        <div className={`rounded-xl border p-5 shadow-sm mb-4 ${
          stats?.demo_count ? "bg-amber-50 border-amber-100" : "bg-white border-gray-100"
        }`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Demo Responses in Database
              </p>
              <p className={`text-4xl font-bold ${stats?.demo_count ? "text-amber-600" : "text-gray-300"}`}>
                {stats ? stats.demo_count.toLocaleString() : "—"}
              </p>
              {stats && (
                <p className="text-xs text-gray-400 mt-1">
                  + {stats.real_count.toLocaleString()} real responses (never touched)
                </p>
              )}
            </div>

            {(stats?.demo_count ?? 0) > 0 && (
              <button
                onClick={() => { setShowConfirm(true); setConfirmReady(false); }}
                disabled={deleting}
                className="flex-shrink-0 text-xs border border-red-200 text-red-600 hover:bg-red-50 font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete Demo Data"}
              </button>
            )}
          </div>
        </div>

        {/* Generate buttons */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Generate Responses
          </p>

          {generating ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 font-medium">
                  Generating… {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
                </span>
                <span className="font-bold text-[#D7B87A]">{pct}%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">Inserting in batches of 500 — please wait…</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {PRESETS.map(({ label, count, note }) => (
                <button
                  key={count}
                  onClick={() => generate(count)}
                  className="flex flex-col items-center gap-1 border border-[#E0E1DD] hover:border-[#0B1929] hover:bg-gray-50 rounded-xl p-4 transition-colors group"
                >
                  <span className="text-2xl font-bold text-[#0B1929]">
                    {label}
                  </span>
                  <span className="text-xs text-gray-400">{note}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Distribution preview */}
        <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Distribution Preview
          </p>
          <div className="grid grid-cols-3 gap-6">
            {DISTRIBUTIONS.map(({ title, rows }) => (
              <div key={title}>
                <p className="text-xs font-semibold text-gray-700 mb-2">{title}</p>
                <div className="space-y-1.5">
                  {rows.map(({ label, pct: p }) => (
                    <div key={label}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-600">{label}</span>
                        <span className="text-gray-400">{p}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#0B1929] opacity-60 rounded-full"
                          style={{ width: `${p}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-3 gap-4 text-xs text-gray-500">
            <div>
              <span className="font-semibold text-gray-700">Clubs: </span>
              Arsenal, Liverpool, Barcelona, Real Madrid, Bayern Munich + 13 others
            </div>
            <div>
              <span className="font-semibold text-gray-700">Fan segments: </span>
              season-ticket-holder, casual-viewer, digital-fan, vip-member, matchday-fan
            </div>
            <div>
              <span className="font-semibold text-gray-700">Dates: </span>
              Spread over the last 90 days, skewed towards more recent
            </div>
          </div>
        </div>

        {/* Safety note */}
        <div className="mt-4 bg-green-50 border border-green-100 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-green-500 text-lg mt-0.5">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-800">Real data is always safe</p>
            <p className="text-xs text-green-600 mt-0.5">
              Every demo response is tagged <code className="bg-green-100 px-1 rounded">is_demo = true</code>.
              The delete function only ever removes rows with this flag.
              Real survey responses cannot be deleted from this page.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Demo Data</h2>
            <p className="text-sm text-gray-500 mb-4">
              This will permanently delete{" "}
              <span className="font-semibold text-red-600">
                {stats?.demo_count.toLocaleString()} demo responses
              </span>
              . This cannot be undone.
            </p>

            <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-5 text-xs text-green-700">
              ✓ Your {stats?.real_count.toLocaleString()} real responses will not be affected.
            </div>

            <label className="flex items-start gap-3 cursor-pointer mb-5">
              <input
                type="checkbox"
                checked={confirmReady}
                onChange={e => setConfirmReady(e.target.checked)}
                className="mt-0.5 accent-red-600 w-4 h-4 flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                I understand this will delete all demo responses and cannot be undone.
              </span>
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowConfirm(false); setConfirmReady(false); }}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={!confirmReady}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete {stats?.demo_count.toLocaleString()} Responses
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}
