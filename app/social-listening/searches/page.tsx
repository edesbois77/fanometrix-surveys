"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import {
  ENTITY_TYPES, RESEARCH_GOALS, FREQUENCIES, SEARCH_STATUSES,
  KEYWORD_TYPES, PLATFORMS, MARKETS,
} from "@/lib/social-taxonomy";

type Keyword = { keyword: string; keyword_type: string };
type Search = {
  id: string; name: string; description: string | null;
  entity_type: string; research_goal: string; markets: string[];
  platforms: string[]; frequency: string; status: string;
  social_keywords: Keyword[];
  created_at: string;
};

const BLANK = {
  name: "", description: "", entity_type: "Brand", research_goal: "Fan Sentiment",
  markets: ["GB"] as string[], platforms: PLATFORMS.filter(p => p.defaultOn).map(p => p.id) as string[],
  frequency: "Manual", status: "Draft",
};

const STATUS_COLOURS: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-600", Active: "bg-green-100 text-green-700",
  Paused: "bg-amber-100 text-amber-700", Archived: "bg-red-100 text-red-500",
};

export default function SearchesPage() {
  const [searches,    setSearches]    = useState<Search[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [form,        setForm]        = useState(BLANK);
  const [keywords,    setKeywords]    = useState<Keyword[]>([]);
  const [kwInput,     setKwInput]     = useState("");
  const [kwType,      setKwType]      = useState<string>(KEYWORD_TYPES[0]);
  const [saving,       setSaving]       = useState(false);
  const [generating,    setGenerating]    = useState<string | null>(null);
  const [genCount,      setGenCount]      = useState(200);
  const [genTarget,     setGenTarget]     = useState<Search | null>(null);
  const [genPlatforms,  setGenPlatforms]  = useState<Record<string, number>>({});
  const [toast,        setToast]        = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/social/searches");
    const json = await res.json();
    setSearches(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditId(null); setForm(BLANK); setKeywords([]); setShowForm(true);
  }

  function openEdit(s: Search) {
    setEditId(s.id);
    setForm({ name: s.name, description: s.description ?? "", entity_type: s.entity_type,
      research_goal: s.research_goal, markets: s.markets, platforms: s.platforms,
      frequency: s.frequency, status: s.status });
    setKeywords(s.social_keywords ?? []);
    setShowForm(true);
  }

  function addKeyword() {
    const k = kwInput.trim();
    if (!k || keywords.some(kw => kw.keyword.toLowerCase() === k.toLowerCase())) return;
    setKeywords(prev => [...prev, { keyword: k, keyword_type: kwType }]);
    setKwInput("");
  }

  function toggleMarket(code: string) {
    setForm(f => ({ ...f, markets: f.markets.includes(code) ? f.markets.filter(m => m !== code) : [...f.markets, code] }));
  }

  function togglePlatform(id: string) {
    setForm(f => ({ ...f, platforms: f.platforms.includes(id) ? f.platforms.filter(p => p !== id) : [...f.platforms, id] }));
  }

  async function handleSave() {
    if (!form.name.trim()) { showToast("Search name is required.", false); return; }
    setSaving(true);
    const url    = editId ? `/api/social/searches/${editId}` : "/api/social/searches";
    const method = editId ? "PUT" : "POST";
    const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, keywords }) });
    setSaving(false);
    if (res.ok) {
      showToast(editId ? "Search updated." : "Search created.");
      setShowForm(false); load();
    } else {
      const j = await res.json();
      showToast(j.error ?? "Failed to save.", false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    const res = await fetch(`/api/social/searches/${id}`, { method: "DELETE" });
    if (res.ok) { showToast("Deleted."); load(); }
  }

  function getDefaultDist(entityType: string): Record<string, number> {
    if (entityType === "Club")        return { Reddit: 60, YouTube: 30, News: 10 };
    if (entityType === "Brand")       return { Reddit: 40, News: 40, YouTube: 20 };
    if (entityType === "Competition") return { Reddit: 35, News: 45, YouTube: 20 };
    return { Reddit: 40, YouTube: 30, News: 30 };
  }

  function openGenerate(s: Search) {
    setGenTarget(s);
    setGenCount(200);
    setGenPlatforms(getDefaultDist(s.entity_type));
  }

  function adjustPlatform(platform: string, enabled: boolean) {
    setGenPlatforms(prev => {
      if (!enabled) {
        const next = { ...prev }; delete next[platform]; return next;
      }
      return { ...prev, [platform]: 20 };
    });
  }

  function setPlatformPct(platform: string, pct: number) {
    setGenPlatforms(prev => ({ ...prev, [platform]: pct }));
  }

  const GEN_BATCH_SIZE = 25;
  const genBatches      = Math.ceil(genCount / GEN_BATCH_SIZE);
  const classifyBatches = Math.ceil(genCount / 5);
  const totalAPICalls   = genBatches + classifyBatches;
  const estSecs         = Math.ceil(totalAPICalls * 3);  // ~3s per call with concurrency

  async function handleGenerate() {
    if (!genTarget) return;
    const target = genTarget;
    setGenerating(target.id);
    setGenTarget(null);
    showToast(`Generating ${genCount} raw mentions then classifying… ~${estSecs}s`);
    const res = await fetch("/api/social/generate-sample", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        search_id:              target.id,
        count:                  genCount,
        platform_distribution:  genPlatforms,
      }),
    });
    const json = await res.json();
    setGenerating(null);
    if (res.ok) {
      showToast(`✓ Generated ${json.raw_generated} raw → ${json.classified} classified. View in Mentions.`);
    } else {
      showToast(json.error ?? "Generation failed.", false);
    }
  }

  const INP = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]";

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Searches</h1>
            <p className="text-sm text-gray-400 mt-0.5">{searches.length} search{searches.length !== 1 ? "es" : ""}</p>
            <p className="text-sm text-gray-500 mt-2 max-w-lg leading-relaxed">
              Define what to listen for — keywords, markets and platforms.
              Mentions are imported and classified against each search.
            </p>
          </div>
          <button onClick={openCreate}
            className="text-sm font-semibold px-4 py-2 rounded-lg flex-shrink-0"
            style={{ background: "#D7B87A", color: "#0B1929" }}>
            + New Search
          </button>
        </div>

        {/* Search list */}
        {loading ? (
          <div className="space-y-3">{[0,1,2].map(i => (
            <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse">
              <div className="h-4 w-48 bg-gray-100 rounded mb-2" /><div className="h-3 w-72 bg-gray-100 rounded" />
            </div>
          ))}</div>
        ) : searches.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center shadow-sm">
            <p className="text-gray-400">No searches yet. Create one to start building your listening strategy.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {searches.map(s => (
              <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900">{s.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOURS[s.status]}`}>{s.status}</span>
                      <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{s.entity_type}</span>
                      <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{s.research_goal}</span>
                    </div>
                    {s.description && <p className="text-xs text-gray-400 mt-1">{s.description}</p>}
                    <div className="flex gap-3 mt-2 text-xs text-gray-400 flex-wrap">
                      <span>{s.social_keywords?.length ?? 0} keywords</span>
                      <span>{s.markets.join(", ") || "All markets"}</span>
                      <span>{s.platforms.join(", ")}</span>
                      <span>{s.frequency}</span>
                    </div>
                    {(s.social_keywords ?? []).length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {(s.social_keywords ?? []).slice(0, 8).map((k, i) => (
                          <span key={i} className="text-xs bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">
                            {k.keyword}
                          </span>
                        ))}
                        {(s.social_keywords ?? []).length > 8 && (
                          <span className="text-xs text-gray-400">+{(s.social_keywords ?? []).length - 8} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => openGenerate(s)}
                      disabled={generating === s.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8] disabled:opacity-40 transition-colors"
                      title="Generate synthetic mentions using AI"
                    >
                      {generating === s.id ? "Generating…" : "✦ Generate Sample"}
                    </button>
                    <a href={`/social-listening/searches/${s.id}`} className="text-xs text-blue-500 hover:text-blue-700 font-medium">View</a>
                    <button onClick={() => openEdit(s)} className="text-xs text-gray-500 hover:text-gray-800">Edit</button>
                    <button onClick={() => handleDelete(s.id, s.name)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate Sample modal — enhanced */}
      {genTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md overflow-y-auto max-h-[90vh]">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Generate Sample Dataset</h2>
            <p className="text-sm text-gray-500 mb-5">
              <strong>{genTarget.name}</strong> · {genTarget.entity_type} · {genTarget.research_goal}
              <br /><span className="text-xs text-gray-400 mt-0.5 block">
                Raw mentions generated first, then classified through the Fanometrix engine.
              </span>
            </p>

            {/* Count picker */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Number of mentions</p>
              <div className="grid grid-cols-5 gap-1.5">
                {[100, 200, 300, 500, 1000].map(n => (
                  <button key={n} onClick={() => setGenCount(n)}
                    className={`py-2 rounded-xl border-2 text-xs font-semibold transition-colors ${
                      genCount === n ? "bg-[#0B1929] text-[#D7B87A] border-[#0B1929]" : "bg-white text-gray-500 border-gray-200 hover:border-[#D7B87A]"
                    }`}>
                    {n === 1000 ? "1000 ★" : n}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform distribution */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Platform distribution</p>
              <div className="space-y-2">
                {["Reddit", "YouTube", "News"].map(p => {
                  const enabled = p in genPlatforms;
                  const pct     = genPlatforms[p] ?? 0;
                  return (
                    <div key={p} className="flex items-center gap-3">
                      <label className="flex items-center gap-2 w-24 cursor-pointer text-sm text-gray-700">
                        <input type="checkbox" checked={enabled}
                          onChange={e => adjustPlatform(p, e.target.checked)} />
                        {p}
                      </label>
                      {enabled && (
                        <>
                          <input type="range" min={10} max={80} value={pct}
                            onChange={e => setPlatformPct(p, parseInt(e.target.value))}
                            className="flex-1" />
                          <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                          <span className="text-xs text-gray-400 w-12 text-right">
                            ~{Math.round((pct / Math.max(Object.values(genPlatforms).reduce((a,b)=>a+b,0),1)) * genCount)}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Estimates */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-5 text-xs text-gray-500 space-y-1">
              <div className="flex justify-between"><span>Generation API calls</span><span className="font-semibold">{genBatches}</span></div>
              <div className="flex justify-between"><span>Classification API calls</span><span className="font-semibold">{classifyBatches}</span></div>
              <div className="flex justify-between"><span>Total API calls</span><span className="font-semibold">{totalAPICalls}</span></div>
              <div className="flex justify-between border-t border-gray-200 pt-1"><span>Estimated time</span><span className="font-semibold">~{estSecs}s</span></div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-5">
              <p className="text-xs text-amber-700 leading-relaxed">
                Requires <code className="font-mono">OPENAI_API_KEY</code> · Marked <code className="font-mono">import_source = synthetic</code>
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setGenTarget(null)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl">
                Cancel
              </button>
              <button onClick={handleGenerate}
                disabled={Object.keys(genPlatforms).length === 0}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl disabled:opacity-40"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                Generate {genCount} Mentions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit drawer */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="w-full sm:w-[560px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editId ? "Edit Search" : "New Search"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Basic Info */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Basic Information</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Search Name *</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className={INP} placeholder="e.g. Carlsberg — Fan Sentiment" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className={INP} rows={2} placeholder="What are you trying to understand?" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Status</label>
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={INP}>
                        {SEARCH_STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 block mb-1">Frequency</label>
                      <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} className={INP}>
                        {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* Entity Type */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Entity Type</p>
                <div className="flex gap-3 flex-wrap">
                  {ENTITY_TYPES.map(e => (
                    <label key={e} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="radio" name="entity" value={e} checked={form.entity_type === e}
                        onChange={() => setForm(f => ({ ...f, entity_type: e }))} />
                      {e}
                    </label>
                  ))}
                </div>
              </section>

              {/* Research Goal */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Research Goal</p>
                <div className="flex flex-col gap-2">
                  {RESEARCH_GOALS.map(g => (
                    <label key={g} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="radio" name="goal" value={g} checked={form.research_goal === g}
                        onChange={() => setForm(f => ({ ...f, research_goal: g }))} />
                      {g}
                    </label>
                  ))}
                </div>
              </section>

              {/* Keywords */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Keywords</p>
                <div className="flex gap-2 mb-2">
                  <input value={kwInput} onChange={e => setKwInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); }}}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]"
                    placeholder="e.g. Liverpool, #LFC, YNWA" />
                  <select value={kwType} onChange={e => setKwType(e.target.value)}
                    className="border border-gray-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-[#D7B87A]">
                    {KEYWORD_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <button onClick={addKeyword}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8]">
                    Add
                  </button>
                </div>
                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {keywords.map((k, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                        {k.keyword}
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-400">{k.keyword_type}</span>
                        <button onClick={() => setKeywords(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-400 ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* Markets */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Markets</p>
                <div className="flex flex-wrap gap-2">
                  {MARKETS.map(m => (
                    <button key={m.code} type="button" onClick={() => toggleMarket(m.code)}
                      className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                        form.markets.includes(m.code)
                          ? "bg-[#0B1929] text-[#D7B87A] border-[#0B1929]"
                          : "bg-white text-gray-500 border-gray-200 hover:border-[#D7B87A]"
                      }`}>
                      {m.code} · {m.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Platforms */}
              <section>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Platforms</p>
                <div className="space-y-2">
                  {PLATFORMS.map(p => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={form.platforms.includes(p.id)}
                        onChange={() => togglePlatform(p.id)} />
                      {p.label}
                      {!p.defaultOn && <span className="text-xs text-gray-400">(coming soon)</span>}
                    </label>
                  ))}
                </div>
              </section>

            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl disabled:opacity-60"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                {saving ? "Saving…" : editId ? "Save Changes" : "Create Search"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}
