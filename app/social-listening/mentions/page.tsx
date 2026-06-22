"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Papa from "papaparse";
import { AdminShell } from "@/app/components/AdminShell";
import { FOOTBALL_TOPICS, SENTIMENTS } from "@/lib/social-taxonomy";

type Mention = {
  id: string; platform: string; market: string | null; author: string | null;
  content: string; sentiment: string | null; topic: string | null;
  subtopic: string | null; ai_summary: string | null;
  published_at: string | null; created_at: string; import_source: string;
};
type Search = { id: string; name: string };

const SENTIMENT_COLOURS: Record<string, string> = {
  Positive: "bg-green-100 text-green-700", Neutral: "bg-gray-100 text-gray-600",
  Negative: "bg-red-100 text-red-600",     Unknown: "bg-gray-50 text-gray-400",
};

export default function MentionsPage() {
  const [mentions,    setMentions]    = useState<Mention[]>([]);
  const [searches,    setSearches]    = useState<Search[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [importing,   setImporting]   = useState(false);
  const [importMsg,   setImportMsg]   = useState("");
  const [filterSearch,setFilterSearch]= useState("");
  const [filterSent,  setFilterSent]  = useState("");
  const [filterTopic, setFilterTopic] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, sRes] = await Promise.all([
      fetch("/api/social/mentions?limit=200"),
      fetch("/api/social/searches"),
    ]);
    const mJson = await mRes.json();
    const sJson = await sRes.json();
    setMentions(mJson.data ?? []);
    setSearches(sJson.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg("Parsing CSV…");

    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        if (!rows.length) { setImportMsg("No rows found in CSV."); setImporting(false); return; }

        setImportMsg(`Classifying ${rows.length} mention${rows.length !== 1 ? "s" : ""} with AI…`);

        const res = await fetch("/api/social/mentions/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: rows.map(r => ({
              platform:     r.platform     || "Unknown",
              market:       r.market       || null,
              author:       r.author       || null,
              source_url:   r.source_url   || null,
              content:      r.content      || "",
              published_at: r.published_at || null,
            })),
            search_id: filterSearch || null,
          }),
        });
        const json = await res.json();
        setImportMsg(`Imported ${json.saved} mention${json.saved !== 1 ? "s" : ""}${json.failed ? ` (${json.failed} failed)` : ""}.`);
        setImporting(false);
        if (fileRef.current) fileRef.current.value = "";
        load();
      },
      error: () => { setImportMsg("Failed to parse CSV."); setImporting(false); },
    });
  }

  const displayed = mentions.filter(m =>
    (!filterSent  || m.sentiment === filterSent) &&
    (!filterTopic || m.topic     === filterTopic)
  );

  const syntheticCount = mentions.filter(m => m.import_source === "synthetic").length;

  async function clearSynthetic() {
    if (!confirm(`Delete all ${syntheticCount} synthetic mentions? This cannot be undone.`)) return;
    const ids = mentions.filter(m => m.import_source === "synthetic").map(m => m.id);
    await fetch("/api/social/mentions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    load();
  }

  const SEL = "text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#D7B87A]";

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mentions</h1>
            <p className="text-sm text-gray-400 mt-0.5">{mentions.length} mention{mentions.length !== 1 ? "s" : ""} collected</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {importMsg && <p className="text-xs text-gray-500">{importMsg}</p>}
            {syntheticCount > 0 && (
              <button onClick={clearSynthetic}
                className="text-xs text-red-400 hover:text-red-600 border border-red-100 px-3 py-1.5 rounded-lg transition-colors">
                Clear {syntheticCount} synthetic
              </button>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 flex-shrink-0"
              style={{ background: "#D7B87A", color: "#0B1929" }}>
              {importing ? "Importing…" : "Import CSV"}
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSV} />
          </div>
        </div>

        {/* CSV template hint */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700 leading-relaxed">
          <strong>CSV columns:</strong> platform, market, author, source_url, content, published_at
          — each mention is AI-classified for sentiment, topic and subtopic on import.
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <select value={filterSent} onChange={e => setFilterSent(e.target.value)} className={SEL}>
            <option value="">All Sentiments</option>
            {SENTIMENTS.map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)} className={SEL}>
            <option value="">All Topics</option>
            {FOOTBALL_TOPICS.map(t => <option key={t}>{t}</option>)}
          </select>
          <select value={filterSearch} onChange={e => setFilterSearch(e.target.value)} className={SEL}>
            <option value="">All Searches</option>
            {searches.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : displayed.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-gray-400 text-sm mb-2">No mentions yet.</p>
              <p className="text-gray-300 text-xs">Import a CSV file to start classifying football fan conversations.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3">Platform</th>
                    <th className="text-left px-4 py-3">Content</th>
                    <th className="text-left px-4 py-3">Sentiment</th>
                    <th className="text-left px-4 py-3">Topic</th>
                    <th className="text-left px-4 py-3">AI Summary</th>
                    <th className="text-left px-4 py-3">Market</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(m => (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-600">{m.platform}</p>
                        {m.import_source === "synthetic" && (
                          <span className="text-[10px] text-purple-400 font-medium">synthetic</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs text-gray-700 line-clamp-2">{m.content}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {m.sentiment && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SENTIMENT_COLOURS[m.sentiment] ?? "bg-gray-50 text-gray-400"}`}>
                            {m.sentiment}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {m.topic && <span>{m.topic}{m.subtopic ? ` · ${m.subtopic}` : ""}</span>}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs text-gray-400 italic line-clamp-2">{m.ai_summary}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{m.market ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
