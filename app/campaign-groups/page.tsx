"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Papa from "papaparse";
import { AdminShell } from "@/app/components/AdminShell";
import { generateGroupName, generateGroupSlug } from "@/lib/naming";

// ─── Types ────────────────────────────────────────────────────────────────────
type CampaignGroup = {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  publisher: string | null;
  brand_name: string | null;
  research_theme: string | null;
  year: string | null;
  status: "draft" | "live" | "paused" | "closed" | "archived";
  rotation: "equal" | "weighted" | "priority";
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  member_count: number;
  total_responses: number;
  campaign_ids: string[];
};

type CampaignOption = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  brand_name: string;
  status: string;
  effective_status: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const GOLD = "#D7B87A";
const NAVY = "#0B1929";
const BASE_URL = typeof window !== "undefined" ? window.location.origin : "";

const STATUS_COLOURS: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  live:     "bg-green-100 text-green-700",
  paused:   "bg-orange-100 text-orange-700",
  closed:   "bg-gray-100 text-gray-500",
  archived: "bg-amber-100 text-amber-700",
};

const ROTATION_LABELS: Record<string, string> = {
  equal:    "Equal rotation",
  weighted: "Weighted rotation",
  priority: "Priority rotation",
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function generateGroupId(name: string, publisher: string): string {
  return `${name}_${publisher}`
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
    .replace(/__+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Campaign multi-select ────────────────────────────────────────────────────
function CampaignSelector({
  options,
  selected,
  onChange,
}: {
  options: CampaignOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch]   = useState("");
  const [open,   setOpen]     = useState(false);
  const inputRef              = useRef<HTMLInputElement>(null);
  const dropRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        dropRef.current  && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const remaining = options.filter(o =>
    !selected.includes(o.id) &&
    (`${o.campaign_name} ${o.brand_name}`).toLowerCase().includes(search.toLowerCase())
  );

  const selectedOptions = selected.map(id => options.find(o => o.id === id)).filter(Boolean) as CampaignOption[];

  function add(id: string) {
    onChange([...selected, id]);
    setSearch("");
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(selected.filter(x => x !== id));
  }

  return (
    <div>
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedOptions.map(o => (
            <span key={o.id} className="inline-flex items-center gap-1 text-xs bg-[#0B1929]/8 text-[#0B1929] border border-[#0B1929]/15 px-2.5 py-1 rounded-full">
              {o.campaign_name} — {o.brand_name}
              <button type="button" onClick={() => remove(o.id)} className="text-gray-400 hover:text-gray-700 leading-none ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? "Search campaigns to add…" : "Add another campaign…"}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
          autoComplete="off"
        />
        {open && (
          <div ref={dropRef} className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
            {remaining.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-gray-400">{search ? "No matches" : "All campaigns selected"}</p>
            ) : (
              remaining.map(o => (
                <button key={o.id} type="button"
                  onMouseDown={e => { e.preventDefault(); add(o.id); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                  <span className="text-gray-900">{o.campaign_name}</span>
                  <span className="text-gray-400 ml-1">— {o.brand_name}</span>
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full capitalize ${STATUS_COLOURS[o.effective_status ?? o.status] ?? "bg-gray-100 text-gray-500"}`}>
                    {o.effective_status ?? o.status}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Blank form ───────────────────────────────────────────────────────────────
type GroupForm = {
  group_id:       string;
  name:           string;
  description:    string;
  publisher:      string;
  brand_name:     string;
  research_theme: string;
  year:           string;
  status:         CampaignGroup["status"];
  rotation:       CampaignGroup["rotation"];
  start_date:     string;
  end_date:       string;
  campaign_ids:   string[];
};

const BLANK_FORM: GroupForm = {
  group_id: "", name: "", description: "", publisher: "",
  brand_name: "", research_theme: "", year: String(new Date().getFullYear()),
  status: "draft", rotation: "equal",
  start_date: "", end_date: "", campaign_ids: [],
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CampaignGroupsPage() {
  const [groups,   setGroups]   = useState<CampaignGroup[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [activeTab, setActiveTab] = useState<"active" | "closed" | "archived">("active");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [form,       setForm]       = useState<GroupForm>(BLANK_FORM);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);
  const [copied,     setCopied]     = useState<string | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [grpRes, camRes] = await Promise.all([
      fetch("/api/campaign-groups"),
      fetch("/api/campaigns"),
    ]);
    setGroups((await grpRes.json()).data ?? []);
    setCampaigns((await camRes.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Tab buckets
  const activeGroups   = useMemo(() => groups.filter(g => !["closed", "archived"].includes(g.status)), [groups]);
  const closedGroups   = useMemo(() => groups.filter(g => g.status === "closed"),   [groups]);
  const archivedGroups = useMemo(() => groups.filter(g => g.status === "archived"), [groups]);

  const displayed =
    activeTab === "active"   ? activeGroups   :
    activeTab === "closed"   ? closedGroups   :
    archivedGroups;

  // Eligible campaigns for the selector (not deleted, not archived/closed)
  const selectableCampaigns = useMemo(() =>
    campaigns.filter(c => !["archived", "closed"].includes(c.effective_status ?? c.status)),
  [campaigns]);

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    setForm({ ...BLANK_FORM });
    setError("");
    setDrawerOpen(true);
  }

  async function openEdit(g: CampaignGroup) {
    setEditingId(g.id);
    setForm({
      group_id:       g.group_id,
      name:           g.name,
      description:    g.description ?? "",
      publisher:      g.publisher ?? "",
      brand_name:     g.brand_name ?? "",
      research_theme: g.research_theme ?? "",
      year:           g.year ?? String(new Date().getFullYear()),
      status:         g.status,
      rotation:       g.rotation,
      start_date:     g.start_date ?? "",
      end_date:       g.end_date ?? "",
      campaign_ids:   g.campaign_ids,
    });
    setError("");
    setDrawerOpen(true);
  }

  function autoSlug() {
    setForm(f => {
      const name = generateGroupName(f.brand_name, f.research_theme, f.year);
      const slug = generateGroupSlug(f.brand_name, f.research_theme, f.year);
      return {
        ...f,
        name:     name || f.name,
        group_id: slug || generateGroupId(f.name, f.publisher),
      };
    });
  }

  async function handleSave() {
    if (!form.name.trim())     { setError("Group name is required.");   return; }
    if (!form.group_id.trim()) { setError("Group slug is required.");   return; }
    if (!form.publisher.trim()) { setError("Publisher is required.");   return; }
    setError(""); setSaving(true);

    const payload = {
      group_id:     form.group_id.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
      name:         form.name,
      description:  form.description || null,
      publisher:    form.publisher,
      status:       form.status,
      rotation:     form.rotation,
      start_date:   form.start_date || null,
      end_date:     form.end_date   || null,
      campaign_ids: form.campaign_ids,
    };

    const url    = editingId ? `/api/campaign-groups/${editingId}` : "/api/campaign-groups";
    const method = editingId ? "PUT" : "POST";
    const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json   = await res.json();
    setSaving(false);

    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
    setDrawerOpen(false);
    showToast(editingId ? "Group updated." : "Group created.");
    load();
  }

  async function handleDelete(g: CampaignGroup) {
    if (!confirm(`Delete "${g.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/campaign-groups/${g.id}`, { method: "DELETE" });
    if (!res.ok) { showToast("Could not delete group.", false); return; }
    showToast("Group deleted.");
    load();
  }

  async function handleStatusChange(g: CampaignGroup, newStatus: CampaignGroup["status"]) {
    await fetch(`/api/campaign-groups/${g.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  }

  function copyEmbed(g: CampaignGroup) {
    const url = `${BASE_URL}/embed?group=${g.group_id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(g.id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const d = (s: string | null | undefined) => s ? new Date(s).toISOString().slice(0, 10) : "";
    const rows = displayed.map(g => {
      const campaignNames = g.campaign_ids
        .map(id => campaigns.find(c => c.id === id))
        .filter(Boolean)
        .map(c => `${c!.campaign_name} (${c!.brand_name})`)
        .join("; ");
      return {
        "Group Name":       g.name,
        "Slug":             g.group_id,
        "Description":      g.description ?? "",
        "Publisher":        g.publisher ?? "",
        "Status":           g.status,
        "Rotation":         g.rotation,
        "Start Date":       d(g.start_date),
        "End Date":         d(g.end_date),
        "Campaigns":        g.member_count,
        "Campaign Names":   campaignNames,
        "Total Responses":  g.total_responses,
        "Created":          d(g.created_at),
      };
    });
    const csv  = Papa.unparse(rows);
    const link = document.createElement("a");
    link.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `fanometrix-campaign-groups-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Campaign Groups</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {activeGroups.length} Active · {closedGroups.length} Closed · {archivedGroups.length} Archived
              </p>
            </div>
            <div className="flex gap-2 sm:flex-shrink-0">
              <button
                onClick={exportCSV}
                disabled={displayed.length === 0}
                className="text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export CSV
              </button>
              <button onClick={openCreate}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: GOLD, color: NAVY }}>
                + Create Group
              </button>
            </div>
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex gap-2.5 items-start">
            <span className="text-gray-400 flex-shrink-0 text-sm mt-0.5">ℹ</span>
            <p className="text-sm text-gray-500 leading-relaxed">
              Bundle multiple campaigns into one embed code. Useful when several surveys or campaign
              variants need to rotate across the same publisher placement.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-5 border-b border-gray-200">
          {(
            [
              { key: "active",   label: `Active (${activeGroups.length})`   },
              { key: "closed",   label: `Closed (${closedGroups.length})`   },
              { key: "archived", label: `Archived (${archivedGroups.length})` },
            ] as const
          ).map(({ key, label }) => (
            <button key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-[#D7B87A] text-[#0B1929]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && displayed.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">⬡</p>
            <p className="font-medium">No campaign groups yet</p>
            {activeTab === "active" && <p className="text-sm mt-1">Create a group to bundle campaigns into one embed code.</p>}
          </div>
        )}

        <div className="space-y-3">
          {displayed.map(g => (
            <div key={g.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm hover:border-gray-200 transition-colors">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{g.name}</p>
                  </div>
                  {g.description && <p className="text-sm text-gray-500 mt-0.5">{g.description}</p>}
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 capitalize whitespace-nowrap ${STATUS_COLOURS[g.status]}`}>
                  {g.status}
                </span>
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                {g.publisher && (
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{g.publisher}</span>
                )}
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{ROTATION_LABELS[g.rotation]}</span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mb-3">
                <span>{g.member_count} campaign{g.member_count !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{g.total_responses.toLocaleString()} responses</span>
                {(g.start_date || g.end_date) && (
                  <>
                    <span>·</span>
                    <span>{formatDate(g.start_date)} → {g.end_date ? formatDate(g.end_date) : "ongoing"}</span>
                  </>
                )}
              </div>

              {/* Embed code */}
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
                <span className="text-xs font-mono text-gray-600 flex-1 truncate">
                  /embed?group={g.group_id}
                </span>
                <button
                  onClick={() => copyEmbed(g)}
                  className="text-xs text-gray-500 hover:text-[#0B1929] font-medium flex-shrink-0 transition-colors"
                >
                  {copied === g.id ? "✓ Copied" : "Copy"}
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button onClick={() => openEdit(g)}
                  className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                  Edit
                </button>

                {g.status === "draft" && (
                  <button onClick={() => handleStatusChange(g, "live")}
                    className="text-xs border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors">
                    Go Live
                  </button>
                )}
                {g.status === "live" && (
                  <>
                    <button onClick={() => handleStatusChange(g, "paused")}
                      className="text-xs border border-orange-200 text-orange-700 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors">
                      Pause
                    </button>
                    <button onClick={() => handleStatusChange(g, "closed")}
                      className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                      Close
                    </button>
                  </>
                )}
                {g.status === "paused" && (
                  <button onClick={() => handleStatusChange(g, "live")}
                    className="text-xs border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors">
                    Resume
                  </button>
                )}
                {g.status === "closed" && (
                  <button onClick={() => handleStatusChange(g, "archived")}
                    className="text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                    Archive
                  </button>
                )}
                {g.status === "archived" && (
                  <button onClick={() => handleStatusChange(g, "closed")}
                    className="text-xs border border-blue-200 text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors">
                    Restore
                  </button>
                )}

                {(g.status === "draft" || g.status === "archived") && g.total_responses === 0 && (
                  <button onClick={() => handleDelete(g)}
                    className="text-xs border border-red-100 text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* ── Create / Edit Drawer ──────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-full sm:w-[520px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editingId ? "Edit Group" : "Create Group"}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* ── Name Builder ── */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name Builder</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LBL}>Brand</label>
                    <input value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
                      className={INP} placeholder="Carlsberg" />
                  </div>
                  <div>
                    <label className={LBL}>Research Theme</label>
                    <input value={form.research_theme} onChange={e => setForm(f => ({ ...f, research_theme: e.target.value }))}
                      className={INP} placeholder="Fan Understanding" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LBL}>Year</label>
                    <input value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
                      className={INP} placeholder={String(new Date().getFullYear())} maxLength={9} />
                  </div>
                  <div className="flex items-end">
                    <button type="button" onClick={autoSlug}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-lg border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8] transition-colors">
                      Auto Generate Name &amp; Slug
                    </button>
                  </div>
                </div>
                {/* Live preview */}
                {(form.brand_name || form.research_theme) && (() => {
                  const preview = generateGroupName(form.brand_name, form.research_theme, form.year);
                  return preview ? (
                    <p className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 font-mono">
                      {preview}
                    </p>
                  ) : null;
                })()}
              </div>

              <div>
                <label className={LBL}>Group Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className={INP} placeholder="Carlsberg | Fan Understanding | Global | 2026" />
              </div>

              <div>
                <label className={LBL}>Group Slug *</label>
                <div className="flex gap-2">
                  <input value={form.group_id}
                    onChange={e => setForm(f => ({ ...f, group_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                    className={`flex-1 ${INP} font-mono`} placeholder="carlsberg_wave1_fotmob" />
                  <button onClick={autoSlug} className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 rounded-lg">Auto</button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Used in embed URLs: /embed?group=<em>slug</em></p>
              </div>

              <div>
                <label className={LBL}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className={INP} placeholder="Optional" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Publisher *</label>
                  <input value={form.publisher} onChange={e => setForm(f => ({ ...f, publisher: e.target.value }))}
                    className={INP} placeholder="e.g. FotMob" />
                </div>
                <div>
                  <label className={LBL}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as CampaignGroup["status"] }))}
                    className={INP}>
                    {(["draft","live","paused","closed","archived"] as const).map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LBL}>Start Date</label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className={INP} />
                </div>
                <div>
                  <label className={LBL}>End Date</label>
                  <input type="date" value={form.end_date}
                    min={form.start_date || undefined}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className={INP} />
                </div>
              </div>

              <div>
                <label className={LBL}>Rotation Type</label>
                <select value={form.rotation} onChange={e => setForm(f => ({ ...f, rotation: e.target.value as CampaignGroup["rotation"] }))}
                  className={INP}>
                  <option value="equal">Equal — random from eligible campaigns</option>
                  <option value="weighted">Weighted — random proportional to weight</option>
                  <option value="priority">Priority — highest-priority eligible campaign</option>
                </select>
              </div>

              <div>
                <label className={LBL}>Campaigns in Group</label>
                <CampaignSelector
                  options={selectableCampaigns}
                  selected={form.campaign_ids}
                  onChange={ids => setForm(f => ({ ...f, campaign_ids: ids }))}
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Only live campaigns within their date range and below target will be served. Others are skipped at embed time.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60"
                style={{ background: GOLD, color: NAVY }}>
                {saving ? "Saving…" : "Save Group"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}

const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]";
const LBL = "text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5";
