"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";

type Survey = { id: string; name: string };
type Campaign = {
  id: string;
  campaign_id: string;
  brand_name: string;
  campaign_name: string;
  campaign_description: string | null;
  start_date: string | null;
  end_date: string | null;
  survey_id: string | null;
  surveys?: { name: string } | null;
  publishers: string[];
  status: "draft" | "live" | "completed" | "archived";
  created_at: string;
};

const STATUS_COLOURS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  live:      "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
  archived:  "bg-amber-100 text-amber-700",
};

function generateCampaignId(brand: string, name: string): string {
  const year = new Date().getFullYear();
  return `${brand}_${name}_${year}`
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/__+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

const BLANK: Partial<Campaign> = {
  campaign_id: "", brand_name: "", campaign_name: "",
  campaign_description: "", start_date: null, end_date: null,
  survey_id: null, publishers: [], status: "draft",
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [surveys,   setSurveys]   = useState<Survey[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing,   setEditing]   = useState<Partial<Campaign>>(BLANK);
  const [pubInput,  setPubInput]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [camRes, surRes] = await Promise.all([
      fetch("/api/campaigns"),
      fetch("/api/surveys"),
    ]);
    setCampaigns((await camRes.json()).data ?? []);
    setSurveys((await surRes.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing({ ...BLANK, publishers: [] });
    setPubInput("");
    setDrawerOpen(true);
  }

  function openEdit(c: Campaign) {
    setEditing({ ...c });
    setPubInput("");
    setDrawerOpen(true);
  }

  function autoId() {
    const id = generateCampaignId(editing.brand_name ?? "", editing.campaign_name ?? "");
    setEditing(e => ({ ...e, campaign_id: id }));
  }

  function addPublisher() {
    const val = pubInput.trim();
    if (!val) return;
    setEditing(e => ({ ...e, publishers: [...(e.publishers ?? []), val] }));
    setPubInput("");
  }

  function removePublisher(idx: number) {
    setEditing(e => ({ ...e, publishers: (e.publishers ?? []).filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!editing.brand_name?.trim())   { setError("Brand name is required.");   return; }
    if (!editing.campaign_name?.trim()) { setError("Campaign name is required."); return; }
    if (!editing.campaign_id?.trim())  { setError("Campaign ID is required.");   return; }
    setError(""); setSaving(true);

    // Strip the joined `surveys` object — only send actual column values
    const { surveys: _surveys, ...payload } = editing as Campaign;
    if (editing.id) {
      await fetch(`/api/campaigns/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setSaving(false);
    setDrawerOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this campaign?")) return;
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    load();
  }

  async function changeStatus(c: Campaign, status: string) {
    await fetch(`/api/campaigns/${c.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...c, status }) });
    load();
  }

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
            <p className="text-sm text-gray-400 mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={openCreate}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            style={{ background: "#D7B87A", color: "#0B1929" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#D7B87A"; }}>
            + Create Campaign
          </button>
        </div>

        {loading && <p className="text-gray-400">Loading…</p>}

        {!loading && campaigns.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">◎</p>
            <p className="font-medium">No campaigns yet</p>
            <p className="text-sm mt-1">Create your first campaign to generate embed codes.</p>
          </div>
        )}

        <div className="space-y-3">
          {campaigns.map(c => (
            <div key={c.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:border-gray-300 transition-colors">
              <div className="flex items-start gap-4">
                <Link href={`/campaigns/${c.id}`} className="flex-1 min-w-0 block group">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="font-semibold text-gray-900 group-hover:text-[#0B1929] transition-colors">{c.brand_name}</p>
                    <span className="text-gray-300">·</span>
                    <p className="text-gray-700 group-hover:text-gray-900 transition-colors">{c.campaign_name}</p>
                  </div>
                  <p className="text-xs font-mono text-[#0B1929] mt-0.5">{c.campaign_id}</p>
                  {c.campaign_description && <p className="text-xs text-gray-400 mt-0.5">{c.campaign_description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {c.surveys?.name && (
                      <span className="text-xs bg-gray-100 text-[#0B1929] px-2 py-0.5 rounded-full">
                        Survey: {c.surveys.name}
                      </span>
                    )}
                    {c.publishers.map(p => (
                      <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p}</span>
                    ))}
                    {c.start_date && <span className="text-xs text-gray-400">{c.start_date} → {c.end_date ?? "ongoing"}</span>}
                  </div>
                </Link>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <select value={c.status} onChange={e => changeStatus(c, e.target.value)}
                    className={`text-xs font-semibold px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none ${STATUS_COLOURS[c.status]}`}>
                    {["draft","live","completed","archived"].map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>
                    ))}
                  </select>
                  <button onClick={() => openEdit(c)}
                    className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg">Edit</button>
                  <button onClick={() => handleDelete(c.id)}
                    className="text-xs border border-red-100 text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing.id ? "Edit Campaign" : "Create Campaign"}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Brand Name *</label>
                  <input value={editing.brand_name ?? ""} onChange={e => setEditing(x => ({ ...x, brand_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]" placeholder="e.g. Carlsberg" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Campaign Name *</label>
                  <input value={editing.campaign_name ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]" placeholder="e.g. UCL 2026" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Campaign ID *</label>
                <div className="flex gap-2">
                  <input value={editing.campaign_id ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_id: e.target.value }))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#D7B87A]" placeholder="carlsberg_ucl_2026" />
                  <button onClick={autoId} className="text-xs border border-[#E0E1DD] text-[#0B1929] hover:bg-gray-50 px-3 rounded-lg">Auto</button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Used in embed URLs. Lowercase, underscores only.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
                <input value={editing.campaign_description ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]" placeholder="Optional" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Start Date</label>
                  <input type="date" value={editing.start_date ?? ""} onChange={e => setEditing(x => ({ ...x, start_date: e.target.value || null }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">End Date</label>
                  <input type="date" value={editing.end_date ?? ""} onChange={e => setEditing(x => ({ ...x, end_date: e.target.value || null }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Survey</label>
                  <select value={editing.survey_id ?? ""} onChange={e => setEditing(x => ({ ...x, survey_id: e.target.value || null }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]">
                    <option value="">None selected</option>
                    {surveys.filter(s => !s.name.includes("(copy)") || true).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Status</label>
                  <select value={editing.status ?? "draft"} onChange={e => setEditing(x => ({ ...x, status: e.target.value as Campaign["status"] }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]">
                    {["draft","live","completed","archived"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Publishers</label>
                <div className="flex gap-2 mb-2">
                  <input value={pubInput} onChange={e => setPubInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addPublisher()}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]" placeholder="e.g. sky-sports" />
                  <button onClick={addPublisher} className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 rounded-lg">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(editing.publishers ?? []).map((p, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-gray-100 text-[#0B1929] px-2 py-1 rounded-full">
                      {p}
                      <button onClick={() => removePublisher(i)} className="text-gray-400 hover:text-red-400 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60"
                style={{ background: "#D7B87A", color: "#0B1929" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#D7B87A"; }}>
                {saving ? "Saving…" : "Save Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
