"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import {
  availableActions,
  ACTION_LABELS,
  STATUS_META,
  type CampaignStatus,
  type CampaignAction,
} from "@/lib/campaign-status";

// ─── Types ────────────────────────────────────────────────────────────────────
type Survey = { id: string; name: string; status: string };

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
  status: string;
  effective_status: CampaignStatus;
  status_reason: string | null;
  is_auto_transition: boolean;
  response_count: number;
  target_responses: number | null;
  archive_after_days: number;
  manual_status_override: string | null;
  created_at: string;
  // Soft delete
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function generateCampaignId(brand: string, name: string): string {
  const year = new Date().getFullYear();
  return `${brand}_${name}_${year}`
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
    .replace(/__+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

function generateDuplicateSlug(brand: string, name: string): string {
  const year = new Date().getFullYear();
  const rnd  = Math.random().toString(36).slice(2, 6);
  return `${brand}_${name}_copy_${year}_${rnd}`
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
    .replace(/__+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_ORDER: Record<CampaignStatus, number> = {
  live: 0, paused: 1, scheduled: 2, draft: 3, closed: 4, archived: 5,
};

// ─── Subcomponents ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: CampaignStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${m.bg} ${m.text}`}>
      <span className="text-[9px]">{m.dot}</span>{m.label}
    </span>
  );
}

const ACTION_STYLE: Record<string, string> = {
  publish: "border-blue-200 text-blue-700 hover:bg-blue-50",
  go_live: "border-green-200 text-green-700 hover:bg-green-50",
  pause:   "border-orange-200 text-orange-700 hover:bg-orange-50",
  resume:  "border-green-200 text-green-700 hover:bg-green-50",
  close:   "border-gray-200 text-gray-600 hover:bg-gray-50",
  archive: "border-gray-200 text-gray-500 hover:bg-gray-50",
  restore: "border-blue-200 text-blue-700 hover:bg-blue-50",
};

function CampaignProgress({ c }: { c: Campaign }) {
  const hasTarget = c.target_responses !== null && c.target_responses > 0;
  const pct = hasTarget ? Math.min(100, Math.round((c.response_count / c.target_responses!) * 100)) : null;
  const daysLeft = c.end_date
    ? Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86_400_000)
    : null;

  if (!hasTarget && !c.end_date && !c.is_auto_transition) return null;

  return (
    <div className="mt-2.5 space-y-1.5">
      {hasTarget && (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">{c.response_count.toLocaleString()} / {c.target_responses!.toLocaleString()} responses</span>
            <span className="font-semibold text-gray-700">{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: pct! >= 100 ? "#10b981" : pct! >= 75 ? "#D7B87A" : "#0B1929" }} />
          </div>
        </>
      )}
      {!hasTarget && c.response_count > 0 && (
        <p className="text-xs text-gray-400">{c.response_count.toLocaleString()} responses collected</p>
      )}
      {daysLeft !== null && c.effective_status === "live" && (
        <p className="text-xs text-gray-400">
          {daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining` : "Ending today"}
        </p>
      )}
      {c.is_auto_transition && c.status_reason && (
        <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
          <span>⚠</span><span>{c.status_reason}</span>
        </p>
      )}
    </div>
  );
}

// ─── Blank form ───────────────────────────────────────────────────────────────
const BLANK: Partial<Campaign> = {
  campaign_id: "", brand_name: "", campaign_name: "",
  campaign_description: "", start_date: null, end_date: null,
  survey_id: null, publishers: [], status: "draft",
  target_responses: null, archive_after_days: 90,
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  // Data
  const [campaigns,        setCampaigns]        = useState<Campaign[]>([]);
  const [deletedCampaigns, setDeletedCampaigns] = useState<Campaign[]>([]);
  const [surveys,          setSurveys]          = useState<Survey[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [loadingDeleted,   setLoadingDeleted]   = useState(false);

  // Toolbar
  const [activeTab,    setActiveTab]    = useState<"active" | "closed" | "archived" | "deleted">("active");
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [usageFilter,  setUsageFilter]  = useState<"all" | "no_responses" | "has_responses" | "target_reached" | "end_reached">("all");
  const [dateFilter,   setDateFilter]   = useState<"all" | "today" | "7days" | "30days">("all");
  const [sortBy,       setSortBy]       = useState<"recent" | "oldest" | "az" | "status">("recent");

  // Edit drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing,    setEditing]    = useState<Partial<Campaign>>(BLANK);
  const [pubInput,   setPubInput]   = useState("");
  const [saving,     setSaving]     = useState(false);
  const [actioning,  setActioning]  = useState<string | null>(null);
  const [error,      setError]      = useState("");
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Load ──────────────────────────────────────────────────────────────────
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

  const loadDeleted = useCallback(async () => {
    setLoadingDeleted(true);
    const res = await fetch("/api/campaigns?view=deleted");
    setDeletedCampaigns((await res.json()).data ?? []);
    setLoadingDeleted(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activeTab === "deleted" && deletedCampaigns.length === 0 && !loadingDeleted) {
      loadDeleted();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const activeCampaigns   = useMemo(() =>
    campaigns.filter(c => !["closed", "archived"].includes(c.effective_status)), [campaigns]);
  const closedCampaigns   = useMemo(() =>
    campaigns.filter(c => c.effective_status === "closed"), [campaigns]);
  const archivedCampaigns = useMemo(() =>
    campaigns.filter(c => c.effective_status === "archived"), [campaigns]);

  const displayed = useMemo(() => {
    let list: Campaign[] =
      activeTab === "active"   ? activeCampaigns   :
      activeTab === "closed"   ? closedCampaigns   :
      activeTab === "archived" ? archivedCampaigns :
      deletedCampaigns;

    // Status sub-filter (active tab only)
    if (activeTab === "active" && statusFilter !== "all") {
      list = list.filter(c => c.effective_status === statusFilter);
    }

    // Usage filter
    if (usageFilter === "no_responses")   list = list.filter(c => c.response_count === 0);
    if (usageFilter === "has_responses")  list = list.filter(c => c.response_count > 0);
    if (usageFilter === "target_reached") list = list.filter(c =>
      c.target_responses !== null && c.response_count >= c.target_responses);
    if (usageFilter === "end_reached") {
      const now = new Date();
      list = list.filter(c => c.end_date && new Date(c.end_date) < now);
    }

    // Date filter (created_at)
    const now = new Date();
    if (dateFilter === "today") {
      list = list.filter(c => new Date(c.created_at).toDateString() === now.toDateString());
    } else if (dateFilter === "7days") {
      const cut = new Date(now); cut.setDate(cut.getDate() - 7);
      list = list.filter(c => new Date(c.created_at) >= cut);
    } else if (dateFilter === "30days") {
      const cut = new Date(now); cut.setDate(cut.getDate() - 30);
      list = list.filter(c => new Date(c.created_at) >= cut);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.campaign_name.toLowerCase().includes(q) ||
        c.campaign_id.toLowerCase().includes(q) ||
        c.brand_name.toLowerCase().includes(q) ||
        (c.publishers ?? []).some(p => p.toLowerCase().includes(q)) ||
        (c.surveys?.name ?? "").toLowerCase().includes(q) ||
        c.effective_status.includes(q)
      );
    }

    // Sort
    switch (sortBy) {
      case "recent":  return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "oldest":  return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "az":      return [...list].sort((a, b) => a.campaign_name.localeCompare(b.campaign_name));
      case "status":  return [...list].sort((a, b) => STATUS_ORDER[a.effective_status] - STATUS_ORDER[b.effective_status]);
      default:        return list;
    }
  }, [campaigns, deletedCampaigns, activeTab, statusFilter, usageFilter, dateFilter, sortBy, search, activeCampaigns, closedCampaigns, archivedCampaigns]);

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditing({ ...BLANK, publishers: [] });
    setPubInput(""); setError("");
    setDrawerOpen(true);
  }

  function openEdit(c: Campaign) {
    const { surveys: _s, effective_status: _es, status_reason: _sr,
            is_auto_transition: _iat, response_count: _rc,
            deleted_at: _da, deleted_by: _db, delete_reason: _dr,
            ...rest } = c;
    setEditing({ ...rest });
    setPubInput(""); setError("");
    setDrawerOpen(true);
  }

  function autoId() {
    setEditing(e => ({ ...e, campaign_id: generateCampaignId(e.brand_name ?? "", e.campaign_name ?? "") }));
  }

  function addPublisher() {
    const val = pubInput.trim(); if (!val) return;
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
    if (editing.start_date && editing.end_date && editing.start_date > editing.end_date) {
      setError("Start date cannot be after end date."); return;
    }
    if (editing.target_responses !== null && editing.target_responses !== undefined && editing.target_responses < 1) {
      setError("Target responses must be at least 1."); return;
    }
    setError(""); setSaving(true);

    const url    = editing.id ? `/api/campaigns/${editing.id}` : "/api/campaigns";
    const method = editing.id ? "PUT" : "POST";

    const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
    setDrawerOpen(false);
    showToast(editing.id ? "Campaign updated." : "Campaign created.");
    load();
  }

  // ── Campaign actions ───────────────────────────────────────────────────────
  async function handleAction(campaignId: string, action: CampaignAction) {
    setActioning(campaignId + action);
    const res  = await fetch(`/api/campaigns/${campaignId}/actions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    setActioning(null);
    if (!res.ok) { showToast(json.error ?? "Action failed.", false); }
    else { showToast(`Campaign ${ACTION_LABELS[action].toLowerCase()}d.`); load(); }
  }

  async function handleDelete(c: Campaign) {
    if (!confirm(`Move "${c.campaign_name}" to deleted items? It can be restored later.`)) return;
    const res  = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? "Could not delete campaign.", false); }
    else { showToast("Campaign deleted."); load(); }
  }

  async function handleUndelete(c: Campaign) {
    const res = await fetch(`/api/campaigns/${c.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "undelete" }),
    });
    if (!res.ok) { showToast("Could not restore campaign.", false); return; }
    showToast("Campaign restored to Draft.");
    setDeletedCampaigns(prev => prev.filter(x => x.id !== c.id));
    load();
  }

  async function handleDuplicate(c: Campaign) {
    const slug = generateDuplicateSlug(c.brand_name, c.campaign_name);
    const payload = {
      brand_name:        c.brand_name,
      campaign_name:     `${c.campaign_name} (Copy)`,
      campaign_id:       slug,
      campaign_description: c.campaign_description,
      start_date:        null,
      end_date:          null,
      survey_id:         c.survey_id,
      publishers:        c.publishers,
      status:            "draft",
      target_responses:  c.target_responses,
      archive_after_days: c.archive_after_days,
    };
    const res = await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? "Failed to duplicate campaign.", false); return; }
    showToast("Campaign duplicated.");
    setActiveTab("active");
    load();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const totalActive = activeCampaigns.length + closedCampaigns.length + archivedCampaigns.length;

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {totalActive} campaign{totalActive !== 1 ? "s" : ""} · {activeCampaigns.filter(c => c.effective_status === "live").length} live
            </p>
          </div>
          <button onClick={openCreate}
            className="text-sm font-semibold px-4 py-2 rounded-lg"
            style={{ background: "#D7B87A", color: "#0B1929" }}>
            + Create Campaign
          </button>
        </div>

        {/* Search + Filters */}
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="search"
              placeholder="Search campaigns…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
            />
          </div>

          {activeTab === "active" && (
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="live">Live</option>
              <option value="paused">Paused</option>
            </select>
          )}

          <select value={usageFilter} onChange={e => setUsageFilter(e.target.value as typeof usageFilter)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
            <option value="all">All Usage</option>
            <option value="no_responses">No responses</option>
            <option value="has_responses">Has responses</option>
            <option value="target_reached">Target reached</option>
            <option value="end_reached">End date reached</option>
          </select>

          <select value={dateFilter} onChange={e => setDateFilter(e.target.value as typeof dateFilter)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
            <option value="all">Any time</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
          </select>

          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest first</option>
            <option value="az">A–Z</option>
            <option value="status">By status</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mb-5 border-b border-gray-200">
          {(
            [
              { key: "active",   label: `Active (${activeCampaigns.length})`   },
              { key: "closed",   label: `Closed (${closedCampaigns.length})`   },
              { key: "archived", label: `Archived (${archivedCampaigns.length})` },
              { key: "deleted",  label: "Deleted"                              },
            ] as const
          ).map(({ key, label }) => (
            <button key={key}
              onClick={() => {
                setActiveTab(key);
                setStatusFilter("all"); setUsageFilter("all");
                setDateFilter("all"); setSearch("");
              }}
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
        {(loading || (activeTab === "deleted" && loadingDeleted)) && (
          <p className="text-gray-400 text-sm">Loading…</p>
        )}

        {!loading && !(activeTab === "deleted" && loadingDeleted) && displayed.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">◎</p>
            <p className="font-medium">
              {activeTab === "active"   ? "No active campaigns"   :
               activeTab === "closed"   ? "No closed campaigns"   :
               activeTab === "archived" ? "No archived campaigns" :
                                          "No deleted campaigns"}
            </p>
            {activeTab === "active" && <p className="text-sm mt-1">Create your first campaign to get started.</p>}
          </div>
        )}

        <div className="space-y-3">
          {displayed.map(c => {
            const isDeleted = !!c.deleted_at;
            const actions   = isDeleted ? [] : availableActions(c.effective_status ?? c.status as CampaignStatus);
            const canDelete = (c.status === "draft" || c.status === "scheduled") && c.response_count === 0;
            const deleteTitle =
              c.response_count > 0
                ? "This campaign has collected responses and cannot be deleted. Archive it instead."
                : !["draft", "scheduled"].includes(c.status)
                ? "Only draft or scheduled campaigns with zero responses can be deleted."
                : "Move to deleted items";

            return (
              <div key={c.id} className={`bg-white border rounded-xl p-5 shadow-sm transition-colors ${
                isDeleted ? "border-gray-100 opacity-75" : "border-gray-100 hover:border-gray-200"
              }`}>

                {isDeleted ? (
                  /* ── Deleted card ── */
                  <>
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div>
                        <p className="font-semibold text-gray-400 line-through">{c.brand_name} · {c.campaign_name}</p>
                        <p className="text-xs font-mono text-gray-300 mt-0.5">{c.campaign_id}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-400">
                          {c.deleted_by && <span>Deleted by: <span className="font-medium text-gray-500">{c.deleted_by}</span></span>}
                          {c.deleted_at && <span>· {formatDate(c.deleted_at)}</span>}
                        </div>
                      </div>
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-500 flex-shrink-0">Deleted</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleUndelete(c)}
                        className="text-xs border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors">
                        Restore
                      </button>
                      <button onClick={() => handleDuplicate(c)}
                        className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                        Duplicate
                      </button>
                    </div>
                  </>
                ) : (
                  /* ── Active / Closed / Archived card ── */
                  <>
                    <div className="flex items-start gap-4">
                      <Link href={`/campaigns/${c.id}`} className="flex-1 min-w-0 block group">

                        {/* Title row */}
                        <div className="flex items-start justify-between gap-3 mb-0.5">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 group-hover:text-[#0B1929] truncate">
                              {c.brand_name} · {c.campaign_name}
                            </p>
                            <p className="text-xs font-mono text-gray-400 mt-0.5">{c.campaign_id}</p>
                          </div>
                          <StatusBadge status={c.effective_status ?? c.status as CampaignStatus} />
                        </div>

                        {/* Metadata chips */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {c.surveys?.name && (
                            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                              Survey: {c.surveys.name}
                            </span>
                          )}
                          {(c.publishers ?? []).map(p => (
                            <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{p}</span>
                          ))}
                        </div>

                        {/* Dates */}
                        {(c.start_date || c.end_date) && (
                          <p className="text-xs text-gray-400 mt-1.5">
                            {formatDate(c.start_date)} → {c.end_date ? formatDate(c.end_date) : "ongoing"}
                          </p>
                        )}

                        <CampaignProgress c={c} />
                      </Link>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
                      {/* Lifecycle actions */}
                      <div className="flex gap-1.5 flex-wrap">
                        {actions.map(action => (
                          <button key={action}
                            onClick={() => handleAction(c.id, action)}
                            disabled={actioning === c.id + action}
                            className={`text-xs border px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${ACTION_STYLE[action] ?? "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                            {actioning === c.id + action ? "…" : ACTION_LABELS[action]}
                          </button>
                        ))}
                      </div>

                      {/* Card management buttons */}
                      <div className="flex gap-1.5 ml-auto">
                        {c.effective_status !== "archived" ? (
                          <button onClick={() => openEdit(c)}
                            className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                            Edit
                          </button>
                        ) : (
                          <button disabled title="Restore this campaign to edit it"
                            className="text-xs border border-gray-100 text-gray-300 px-3 py-1.5 rounded-lg cursor-not-allowed">
                            Edit
                          </button>
                        )}

                        <button onClick={() => handleDuplicate(c)}
                          className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                          Duplicate
                        </button>

                        <button
                          onClick={canDelete ? () => handleDelete(c) : undefined}
                          disabled={!canDelete}
                          title={deleteTitle}
                          className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${
                            canDelete
                              ? "border-red-100 text-red-400 hover:bg-red-50"
                              : "border-gray-100 text-gray-300 cursor-not-allowed"
                          }`}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

      </div>

      {/* ── Edit / Create Drawer ──────────────────────────────────────────────── */}
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
                <Field label="Brand Name *">
                  <input value={editing.brand_name ?? ""} onChange={e => setEditing(x => ({ ...x, brand_name: e.target.value }))}
                    className={INP} placeholder="e.g. Carlsberg" />
                </Field>
                <Field label="Campaign Name *">
                  <input value={editing.campaign_name ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_name: e.target.value }))}
                    className={INP} placeholder="e.g. UCL 2026" />
                </Field>
              </div>

              <Field label="Campaign ID *">
                <div className="flex gap-2">
                  <input value={editing.campaign_id ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_id: e.target.value }))}
                    className={`flex-1 ${INP} font-mono`} placeholder="carlsberg_ucl_2026" />
                  <button onClick={autoId} className="text-xs border border-[#E0E1DD] text-[#0B1929] hover:bg-gray-50 px-3 rounded-lg">Auto</button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Used in embed URLs. Lowercase, underscores only.</p>
              </Field>

              <Field label="Description">
                <input value={editing.campaign_description ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_description: e.target.value }))}
                  className={INP} placeholder="Optional" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date">
                  <input type="date" value={editing.start_date ?? ""} onChange={e => setEditing(x => ({ ...x, start_date: e.target.value || null }))}
                    className={INP} />
                </Field>
                <Field label="End Date">
                  <input type="date" value={editing.end_date ?? ""} min={editing.start_date ?? undefined}
                    onChange={e => setEditing(x => ({ ...x, end_date: e.target.value || null }))}
                    className={INP} />
                </Field>
              </div>
              {editing.start_date && editing.end_date && editing.start_date > editing.end_date && (
                <p className="text-xs text-red-500 -mt-2">End date must be on or after the start date.</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Target Responses">
                  <input type="number" min={1}
                    value={editing.target_responses ?? ""}
                    onChange={e => setEditing(x => ({ ...x, target_responses: e.target.value ? Number(e.target.value) : null }))}
                    className={INP} placeholder="e.g. 10000 (optional)" />
                </Field>
                <Field label="Archive After (days)">
                  <input type="number" min={1}
                    value={editing.archive_after_days ?? 90}
                    onChange={e => setEditing(x => ({ ...x, archive_after_days: Number(e.target.value) || 90 }))}
                    className={INP} placeholder="90" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Survey">
                  <select value={editing.survey_id ?? ""} onChange={e => setEditing(x => ({ ...x, survey_id: e.target.value || null }))}
                    className={INP}>
                    <option value="">None selected</option>
                    {surveys
                      .filter(s => s.status === "draft" || s.status === "ready")
                      .map(s => <option key={s.id} value={s.id}>{s.name}{s.status === "draft" ? " (Draft)" : ""}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={editing.status ?? "draft"} onChange={e => setEditing(x => ({ ...x, status: e.target.value }))}
                    className={INP}>
                    {(["draft","scheduled","live","paused","closed","archived"] as const).map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                    Status controls whether the survey can accept responses. Certain statuses update automatically based on campaign dates and response targets.
                  </p>
                </Field>
              </div>

              <Field label="Publishers">
                <div className="flex gap-2 mb-2">
                  <input value={pubInput} onChange={e => setPubInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addPublisher()}
                    className={INP} placeholder="e.g. FotMob" />
                  <button onClick={addPublisher} className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 rounded-lg">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(editing.publishers ?? []).map((p, i) => (
                    <span key={i} className="flex items-center gap-1 text-xs bg-gray-100 text-[#0B1929] px-2 py-1 rounded-full">
                      {p}<button onClick={() => removePublisher(i)} className="text-gray-400 hover:text-red-400 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              </Field>

              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60"
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                {saving ? "Saving…" : "Save Campaign"}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
