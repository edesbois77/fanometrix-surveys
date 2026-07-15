"use client";

import { useState, useMemo, useCallback } from "react";
import Papa from "papaparse";
import { ACTION_LABELS, type CampaignAction, type CampaignStatus } from "@/lib/campaign-status";
import { studyTypeLabel } from "@/lib/naming";
import { CampaignCard } from "./CampaignCard";
import { CampaignFilterBar, type UsageFilter, type DateFilter, type SortBy } from "./CampaignFilterBar";
import { CampaignPreviewModal } from "./CampaignPreviewModal";
import { useCampaignSelection } from "./useCampaignSelection";
import { useCampaignBulkActions } from "./useCampaignBulkActions";
import type { Campaign } from "./types";

type Org = { id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" };

const STATUS_ORDER: Record<CampaignStatus, number> = {
  live: 0, paused: 1, scheduled: 2, draft: 3, closed: 4, archived: 5,
};

const PAGE_SIZE = 25;

function generateDuplicateSlug(topic: string, name: string): string {
  const year = new Date().getFullYear();
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${topic}_${name}_copy_${year}_${rnd}`
    .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")
    .replace(/__+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

// The full card list + filters + bulk toolbar, shared between the
// standalone Campaigns page and the Research Project Workspace's embedded
// "Campaigns" section — same behaviour everywhere a user manages
// campaigns, whether that's every campaign in the platform or just the
// ones under one project.
export function CampaignsManager({
  campaigns, deletedCampaigns, orgs, loading, loadingDeleted,
  isLockedByAdminFor, onLoadDeletedRequested, onReload, onEditCampaign,
  researchProjectId, paginate, showExportButton, hideSummaryLine,
}: {
  campaigns: Campaign[];
  deletedCampaigns: Campaign[];
  orgs: Org[];
  loading: boolean;
  loadingDeleted: boolean;
  isLockedByAdminFor: (c: Campaign) => boolean;
  onLoadDeletedRequested: () => void;
  onReload: () => void;
  onEditCampaign: (c: Campaign) => void;
  researchProjectId?: string | null;
  paginate?: boolean;
  showExportButton?: boolean;
  // The Research Project Workspace shows its own "N Campaigns · N Live"
  // line at the top of the Campaigns card — this suppresses the manager's
  // own copy of the same count so it isn't shown twice.
  hideSummaryLine?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"active" | "closed" | "archived" | "deleted">("active");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [typeFilter, setTypeFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [publisherFilter, setPublisherFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [agencyFilter, setAgencyFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const { selectedIds, toggleSelect, toggleSelectAll, clearSelection } = useCampaignSelection();
  const { bulkWorking, handleBulkDelete, handleBulkAction, handleBulkRestore } = useCampaignBulkActions({
    selectedIds, clearSelection, load: onReload, showToast, researchProjectId,
  });

  const orgById = useMemo(() => new Map(orgs.map(o => [o.id, o])), [orgs]);
  const orgName = useCallback((id: string | null) => (id ? orgById.get(id)?.name ?? "" : ""), [orgById]);

  const activeCampaigns = useMemo(() => campaigns.filter(c => !["closed", "archived"].includes(c.effective_status)), [campaigns]);
  const closedCampaigns = useMemo(() => campaigns.filter(c => c.effective_status === "closed"), [campaigns]);
  const archivedCampaigns = useMemo(() => campaigns.filter(c => c.effective_status === "archived"), [campaigns]);

  const countryOptions = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const c of campaigns) {
      if (c.country_code && !byCode.has(c.country_code)) byCode.set(c.country_code, c.market || c.country_code);
    }
    return Array.from(byCode.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [campaigns]);

  const publisherOptions = useMemo(() => {
    const ids = new Set(campaigns.map(c => c.publisher_org_id).filter((id): id is string => !!id));
    return Array.from(ids).map(id => ({ id, name: orgName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [campaigns, orgName]);

  const brandOptions = useMemo(() => {
    const ids = new Set(campaigns.map(c => c.brand_org_id).filter((id): id is string => !!id));
    return Array.from(ids).map(id => ({ id, name: orgName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [campaigns, orgName]);

  const agencyOptions = useMemo(() => {
    const ids = new Set(campaigns.map(c => c.agency_org_id).filter((id): id is string => !!id));
    return Array.from(ids).map(id => ({ id, name: orgName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [campaigns, orgName]);

  const displayed = useMemo(() => {
    let list: Campaign[] =
      activeTab === "active"   ? activeCampaigns   :
      activeTab === "closed"   ? closedCampaigns   :
      activeTab === "archived" ? archivedCampaigns :
      deletedCampaigns;

    if (activeTab === "active" && statusFilter !== "all") {
      list = list.filter(c => c.effective_status === statusFilter);
    }

    if (usageFilter === "no_responses")   list = list.filter(c => c.response_count === 0);
    if (usageFilter === "has_responses")  list = list.filter(c => c.response_count > 0);
    if (usageFilter === "target_reached") list = list.filter(c =>
      c.target_responses !== null && c.response_count >= c.target_responses);
    if (usageFilter === "end_reached") {
      const now = new Date();
      list = list.filter(c => c.end_date && new Date(c.end_date) < now);
    }

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

    if (typeFilter !== "all")      list = list.filter(c => c.study_type === typeFilter);
    if (countryFilter !== "all")   list = list.filter(c => c.country_code === countryFilter);
    if (publisherFilter !== "all") list = list.filter(c => c.publisher_org_id === publisherFilter);
    if (brandFilter !== "all")     list = list.filter(c => c.brand_org_id === brandFilter);
    if (agencyFilter !== "all")    list = list.filter(c => c.agency_org_id === agencyFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.campaign_name.toLowerCase().includes(q) ||
        c.campaign_id.toLowerCase().includes(q) ||
        orgName(c.brand_org_id).toLowerCase().includes(q) ||
        (c.topic ?? "").toLowerCase().includes(q) ||
        orgName(c.publisher_org_id).toLowerCase().includes(q) ||
        (c.surveys?.name ?? "").toLowerCase().includes(q) ||
        c.effective_status.includes(q)
      );
    }

    switch (sortBy) {
      case "recent":  return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "oldest":  return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "az":      return [...list].sort((a, b) => a.campaign_name.localeCompare(b.campaign_name));
      case "status":  return [...list].sort((a, b) => STATUS_ORDER[a.effective_status] - STATUS_ORDER[b.effective_status]);
      default:        return list;
    }
  }, [deletedCampaigns, activeTab, statusFilter, usageFilter, dateFilter, typeFilter, countryFilter, publisherFilter, brandFilter, agencyFilter, sortBy, search, activeCampaigns, closedCampaigns, archivedCampaigns, orgName]);

  const visible = paginate ? displayed.slice(0, visibleCount) : displayed;

  async function handleAction(c: Campaign, action: CampaignAction) {
    setActioning(c.id + action);
    const res = await fetch(`/api/campaigns/${c.id}/actions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    setActioning(null);
    if (!res.ok) { showToast(json.error ?? "Action failed.", false); }
    else { showToast(`Campaign ${ACTION_LABELS[action].toLowerCase()}d.`); onReload(); }
  }

  async function handleDelete(c: Campaign) {
    const hasResponses = c.response_count > 0;
    const msg = hasResponses
      ? `⚠️ "${c.campaign_name}" has ${c.response_count.toLocaleString()} response${c.response_count !== 1 ? "s" : ""} collected.\n\nThe response data will be preserved in the database, but this campaign will no longer appear in your active view.\n\nMove to deleted items?`
      : `Move "${c.campaign_name}" to deleted items? It can be restored later.`;
    if (!confirm(msg)) return;
    const res = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? "Could not delete campaign.", false); }
    else { showToast("Campaign deleted."); onReload(); }
  }

  async function handleUndelete(c: Campaign) {
    const res = await fetch(`/api/campaigns/${c.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "undelete" }),
    });
    if (!res.ok) { showToast("Could not restore campaign.", false); return; }
    showToast("Campaign restored to Draft.");
    onReload();
  }

  async function handleDuplicate(c: Campaign) {
    const slug = generateDuplicateSlug(c.topic ?? "", c.campaign_name);
    const payload = {
      campaign_name: `${c.campaign_name} (Copy)`,
      campaign_id: slug,
      campaign_description: c.campaign_description,
      start_date: null, end_date: null,
      survey_id: c.survey_id,
      publisher_org_id: c.publisher_org_id,
      brand_org_id: c.brand_org_id,
      agency_org_id: c.agency_org_id,
      topic: c.topic,
      study_type: c.study_type,
      status: "draft",
      target_responses: c.target_responses,
      archive_after_days: c.archive_after_days,
      research_project_id: c.research_project_id,
    };
    const res = await fetch("/api/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) { showToast(json.error ?? "Failed to duplicate campaign.", false); return; }
    showToast("Campaign duplicated.");
    setActiveTab("active");
    onReload();
  }

  function exportCSV() {
    const d = (s: string | null | undefined) => s ? new Date(s).toISOString().slice(0, 10) : "";
    const rows = displayed.map(c => {
      const pct = c.target_responses
        ? Math.round((c.response_count / c.target_responses) * 100)
        : "";
      return {
        "Campaign Name": c.campaign_name,
        "Slug": c.campaign_id,
        "Topic": c.topic ?? "",
        "Brand": orgName(c.brand_org_id),
        "Agency": orgName(c.agency_org_id),
        "Type": studyTypeLabel(c.study_type),
        "Country": c.country_code ?? "",
        "Market": c.market ?? "",
        "Publisher": orgName(c.publisher_org_id),
        "Survey": c.surveys?.name ?? "",
        "Status (Stored)": c.status,
        "Status (Effective)": c.effective_status ?? c.status,
        "Status Reason": c.status_reason ?? "",
        "Start Date": d(c.start_date),
        "End Date": d(c.end_date),
        "Target Responses": c.target_responses ?? "",
        "Responses": c.response_count,
        "Progress %": pct,
        "Created": d(c.created_at),
        "Deleted Date": d(c.deleted_at),
        "Deleted By": c.deleted_by ?? "",
      };
    });
    const csv = Papa.unparse(rows);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `fanometrix-campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  const totalActive = activeCampaigns.length + closedCampaigns.length + archivedCampaigns.length;

  return (
    <div>
      {(!hideSummaryLine || showExportButton) && (
        <div className="flex items-center justify-between gap-3 mb-3">
          {!hideSummaryLine && (
            <p className="text-sm text-gray-400">
              {totalActive} campaign{totalActive !== 1 ? "s" : ""} · {activeCampaigns.filter(c => c.effective_status === "live").length} live
            </p>
          )}
          {showExportButton && (
            <button
              onClick={exportCSV}
              disabled={displayed.length === 0}
              className="text-xs border border-gray-200 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
          )}
        </div>
      )}

      <div className="mb-4">
        <CampaignFilterBar
          search={search} onSearchChange={setSearch}
          showStatusFilter={activeTab === "active"} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
          usageFilter={usageFilter} onUsageFilterChange={setUsageFilter}
          dateFilter={dateFilter} onDateFilterChange={setDateFilter}
          typeFilter={typeFilter} onTypeFilterChange={setTypeFilter}
          countryFilter={countryFilter} onCountryFilterChange={setCountryFilter} countryOptions={countryOptions}
          publisherFilter={publisherFilter} onPublisherFilterChange={setPublisherFilter} publisherOptions={publisherOptions}
          brandFilter={brandFilter} onBrandFilterChange={setBrandFilter} brandOptions={brandOptions}
          agencyFilter={agencyFilter} onAgencyFilterChange={setAgencyFilter} agencyOptions={agencyOptions}
          sortBy={sortBy} onSortByChange={setSortBy}
        />
      </div>

      <div className="flex gap-0 mb-4 border-b border-gray-200">
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
              setTypeFilter("all");
              setCountryFilter("all"); setPublisherFilter("all"); setBrandFilter("all"); setAgencyFilter("all");
              setVisibleCount(PAGE_SIZE);
              clearSelection();
              if (key === "deleted") onLoadDeletedRequested();
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

      {!loading && displayed.length > 0 && (() => {
        const selectableIds = displayed.filter(c => !isLockedByAdminFor(c)).map(c => c.id);
        if (selectableIds.length === 0) return null;
        return (
          <div className="flex items-center justify-between mb-3 text-sm">
            <label className="flex items-center gap-2 text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectableIds.every(id => selectedIds.has(id))}
                onChange={() => toggleSelectAll(selectableIds)}
                className="w-4 h-4 accent-[#0B1929]"
              />
              Select all {selectableIds.length}
            </label>
          </div>
        );
      })()}

      {selectedIds.size > 0 && (
        <div className="sticky top-2 z-10 bg-[#0B1929] text-white rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-2 shadow-lg">
          <span className="text-sm font-medium mr-2">{selectedIds.size} selected</span>
          {activeTab === "deleted" ? (
            <button onClick={() => handleBulkRestore(deletedCampaigns, onLoadDeletedRequested)} disabled={bulkWorking}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors">
              {bulkWorking ? "Working…" : "Restore"}
            </button>
          ) : (
            <>
              {(["publish", "go_live", "pause", "resume", "close", "archive"] as CampaignAction[]).map(action => (
                <button key={action} onClick={() => handleBulkAction(action, displayed)} disabled={bulkWorking}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors">
                  {bulkWorking ? "…" : ACTION_LABELS[action]}
                </button>
              ))}
              <button onClick={() => handleBulkDelete(displayed)} disabled={bulkWorking}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/20 text-red-200 hover:bg-red-500/30 disabled:opacity-50 transition-colors">
                {bulkWorking ? "…" : "Delete"}
              </button>
            </>
          )}
          <button onClick={clearSelection} className="ml-auto text-xs text-white/60 hover:text-white transition-colors">
            Clear
          </button>
        </div>
      )}

      {(loading || (activeTab === "deleted" && loadingDeleted)) && (
        <p className="text-gray-400 text-sm">Loading…</p>
      )}

      {!loading && !(activeTab === "deleted" && loadingDeleted) && displayed.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">◎</p>
          <p className="font-medium">
            {activeTab === "active"   ? "No active campaigns"   :
             activeTab === "closed"   ? "No closed campaigns"   :
             activeTab === "archived" ? "No archived campaigns" :
                                        "No deleted campaigns"}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map(c => (
          <CampaignCard
            key={c.id}
            campaign={c}
            orgName={orgName}
            isLockedByAdmin={isLockedByAdminFor(c)}
            selected={selectedIds.has(c.id)}
            onToggleSelect={() => toggleSelect(c.id)}
            actioning={actioning}
            onAction={action => handleAction(c, action)}
            onEdit={() => onEditCampaign(c)}
            onPreview={() => setPreviewCampaign(c)}
            onDuplicate={() => handleDuplicate(c)}
            onDelete={() => handleDelete(c)}
            onRestore={() => handleUndelete(c)}
          />
        ))}
      </div>

      {paginate && displayed.length > visibleCount && (
        <button
          onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
          className="mt-3 text-xs text-[#0B1929] font-medium underline"
        >
          Load more ({displayed.length - visibleCount} remaining)
        </button>
      )}

      {previewCampaign && (
        <CampaignPreviewModal campaign={previewCampaign} onClose={() => setPreviewCampaign(null)} />
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </div>
  );
}
