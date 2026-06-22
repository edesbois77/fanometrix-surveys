"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { FOOTBALL_TOPICS, SENTIMENTS } from "@/lib/social-taxonomy";

type Dist = { label: string; count: number; pct: number };
type Mention = {
  id: string; platform: string; market: string | null; content: string;
  sentiment: string | null; topic: string | null; subtopic: string | null;
  ai_summary: string | null; import_source: string; created_at: string;
};
type ValidationData = {
  total: number; synthetic_count: number;
  distributions: { sentiment: Dist[]; topic: Dist[]; subtopic: Dist[]; platform: Dist[]; market: Dist[] };
  mentions: Mention[];
};
type Search = { id: string; name: string };

const SENT_COLOURS: Record<string, string> = {
  Positive: "#22C55E", Neutral: "#9CA3AF", Negative: "#EF4444", Unknown: "#D1D5DB",
};

function DistChart({ title, data, color }: { title: string; data: Dist[]; color: string }) {
  if (!data.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={Math.min(data.length * 28, 240)}>
        <BarChart data={data.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 40 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={110} />
          <Tooltip formatter={(v) => [`${Number(v)} (${data.find(d => d.count === Number(v))?.pct ?? 0}%)`, "count"]} />
          <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ValidationPage() {
  const [data,     setData]     = useState<ValidationData | null>(null);
  const [searches, setSearches] = useState<Search[]>([]);
  const [selected, setSelected] = useState("");
  const [loading,  setLoading]  = useState(true);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editVals, setEditVals] = useState<{ sentiment: string; topic: string; subtopic: string; ai_summary: string }>({
    sentiment: "", topic: "", subtopic: "", ai_summary: "",
  });
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState<string | null>(null);

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500); }

  const load = useCallback(async () => {
    setLoading(true);
    const url = `/api/social/validation${selected ? `?search_id=${selected}&limit=300` : "?limit=300"}`;
    const res = await fetch(url);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, [selected]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/social/searches").then(r => r.json()).then(j => setSearches(j.data ?? []));
  }, []);

  function startEdit(m: Mention) {
    setEditId(m.id);
    setEditVals({ sentiment: m.sentiment ?? "Unknown", topic: m.topic ?? "", subtopic: m.subtopic ?? "", ai_summary: m.ai_summary ?? "" });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    const res = await fetch(`/api/social/mentions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editVals),
    });
    setSaving(false);
    if (res.ok) { setEditId(null); showToast("Classification updated."); load(); }
    else showToast("Failed to save.");
  }

  async function clearSynthetic() {
    if (!confirm(`Delete all ${data?.synthetic_count} synthetic mentions?`)) return;
    const ids = (data?.mentions ?? []).filter(m => m.import_source === "synthetic").map(m => m.id);
    await fetch("/api/social/mentions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    showToast("Synthetic data cleared.");
    load();
  }

  const INP = "w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-[#D7B87A]";

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Validation</h1>
            <p className="text-sm text-gray-400 mt-0.5">Review classification accuracy and distribution quality</p>
            <p className="text-sm text-gray-500 mt-1 max-w-lg">
              Use "Seed Test Data" to create the three Phase 7 validation searches, then generate synthetic mentions on each.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const res  = await fetch("/api/social/seed", { method: "POST" });
                const json = await res.json();
                alert(json.message ?? "Done.");
                if (json.created?.length) window.location.href = "/social-listening/searches";
              }}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8] transition-colors">
              ✦ Seed Test Data
            </button>
            {(data?.synthetic_count ?? 0) > 0 && (
              <button onClick={clearSynthetic}
                className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-3 py-1.5 rounded-lg transition-colors">
                Delete {data?.synthetic_count} synthetic
              </button>
            )}
            <select value={selected} onChange={e => setSelected(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#D7B87A]">
              <option value="">All Searches</option>
              {searches.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Mentions",    value: data?.total ?? "—" },
            { label: "Synthetic",         value: data?.synthetic_count ?? "—" },
            { label: "Unique Topics",     value: data?.distributions.topic.length ?? "—" },
            { label: "Unique Markets",    value: data?.distributions.market.length ?? "—" },
          ].map(k => (
            <div key={k.label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-2xl font-bold text-gray-900">{loading ? "—" : k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Distribution charts */}
        {!loading && data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sentiment Distribution</h3>
              <div className="space-y-3">
                {(data.distributions.sentiment ?? []).map(s => (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{s.label}</span><span>{s.count} ({s.pct}%)</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: SENT_COLOURS[s.label] ?? "#9CA3AF" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DistChart title="Platform Distribution" data={data.distributions.platform} color="#4FA3A5" />
            <DistChart title="Top Topics"            data={data.distributions.topic}    color="#D7B87A" />
            <DistChart title="Market Distribution"   data={data.distributions.market}   color="#5B6CFA" />
            {data.distributions.subtopic.length > 0 && (
              <DistChart title="Top Subtopics" data={data.distributions.subtopic} color="#4FAF7B" />
            )}
          </div>
        )}

        {/* Classification review table */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Classification Accuracy Review
            </h3>
            <p className="text-xs text-gray-400">Click a row to override classification</p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : (data?.mentions ?? []).length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">No mentions to review.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wide bg-gray-50">
                    <th className="text-left px-4 py-2.5">Content</th>
                    <th className="text-left px-4 py-2.5">Sentiment</th>
                    <th className="text-left px-4 py-2.5">Topic</th>
                    <th className="text-left px-4 py-2.5">Subtopic</th>
                    <th className="text-left px-4 py-2.5">AI Summary</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.mentions ?? []).slice(0, 100).map(m => (
                    editId === m.id ? (
                      <tr key={m.id} className="border-b border-amber-50 bg-amber-50/40">
                        <td className="px-4 py-2 max-w-xs">
                          <p className="text-gray-600 line-clamp-2">{m.content}</p>
                        </td>
                        <td className="px-4 py-2">
                          <select value={editVals.sentiment} onChange={e => setEditVals(v => ({ ...v, sentiment: e.target.value }))} className={INP}>
                            {SENTIMENTS.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select value={editVals.topic} onChange={e => setEditVals(v => ({ ...v, topic: e.target.value }))} className={INP}>
                            <option value="">—</option>
                            {FOOTBALL_TOPICS.map(t => <option key={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input value={editVals.subtopic} onChange={e => setEditVals(v => ({ ...v, subtopic: e.target.value }))}
                            className={INP} placeholder="subtopic" />
                        </td>
                        <td className="px-4 py-2">
                          <input value={editVals.ai_summary} onChange={e => setEditVals(v => ({ ...v, ai_summary: e.target.value }))}
                            className={INP} placeholder="summary" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => saveEdit(m.id)} disabled={saving}
                              className="text-green-600 hover:text-green-800 font-semibold disabled:opacity-50">
                              {saving ? "…" : "Save"}
                            </button>
                            <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 ml-1">✕</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => startEdit(m)}>
                        <td className="px-4 py-2.5 max-w-xs">
                          <p className="text-gray-700 line-clamp-2">{m.content}</p>
                          <p className="text-gray-300 mt-0.5">{m.platform} · {m.market}</p>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {m.sentiment && (
                            <span className="px-2 py-0.5 rounded-full font-medium"
                              style={{ background: (SENT_COLOURS[m.sentiment] ?? "#9CA3AF") + "20", color: SENT_COLOURS[m.sentiment] ?? "#9CA3AF" }}>
                              {m.sentiment}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{m.topic ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-400">{m.subtopic ?? "—"}</td>
                        <td className="px-4 py-2.5 max-w-xs">
                          <p className="text-gray-400 italic line-clamp-1">{m.ai_summary ?? "—"}</p>
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 hover:text-gray-500">Edit</td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium">
          ✓ {toast}
        </div>
      )}
    </AdminShell>
  );
}
