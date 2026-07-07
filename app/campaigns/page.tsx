"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { countryCodeWarning, languageCodeWarning, MARKET_REFERENCE_PAIRS, isValidCountryCode, expectedSurveyLanguage } from "@/lib/locales";
import { SUPPORTED_LANGUAGES } from "@/lib/survey-locale";
import Link from "next/link";
import Papa from "papaparse";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { CreativeDesignPicker } from "@/app/components/CreativeDesignPicker";
import { CreativeDesignPreview } from "@/app/components/CreativeDesignPreview";
import { DrawerSection } from "@/app/components/DrawerSection";
import { isSurveyValidForReady } from "@/lib/survey-validation";
import {
  availableActions,
  ACTION_LABELS,
  STATUS_META,
  type CampaignStatus,
  type CampaignAction,
} from "@/lib/campaign-status";

// ─── Types ────────────────────────────────────────────────────────────────────
type Survey = {
  id: string;
  name: string;
  status: string;
  // Needed to run MPU validation before showing in campaign dropdown
  questions?:       Array<{ text: string; options: string[] }>;
  thank_you_title?: string | Record<string, string>;
  thank_you_body?:  string | Record<string, string>;
};

type Campaign = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_description: string | null;
  start_date: string | null;
  end_date: string | null;
  survey_id: string | null;
  surveys?: { name: string } | null;
  publisher_org_id: string | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
  topic: string | null;
  research_theme: string | null;
  year: string | null;
  country_code: string | null;
  market: string | null;
  survey_language: string;
  status: string;
  effective_status: CampaignStatus;
  status_reason: string | null;
  is_auto_transition: boolean;
  response_count: number;
  target_responses: number | null;
  archive_after_days: number | null;
  manual_status_override: string | null;
  created_at: string;
  // Soft delete
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  // Creative design (optional — null = inherit from project, or the
  // classic default creative if neither is set)
  creative_design: string | null;
  // Research Project link — NULL fields below mean "inherited from project"
  research_project_id: string | null;
  tags: string[] | null;
  created_by_admin: boolean;
  // API-only enrichment (resolved inheritance) — never real columns, must
  // never be sent back on save. See the strip list in openEdit() below.
  effective_survey_id?: string | null;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
  effective_target_responses?: number | null;
  effective_archive_after_days?: number | null;
  effective_tags?: string[];
  effective_creative_design?: string | null;
  inherited?: {
    survey_id: boolean;
    start_date: boolean;
    end_date: boolean;
    target_responses: boolean;
    archive_after_days: boolean;
    tags: boolean;
    creative_design: boolean;
  } | null;
};

type ResearchProjectSummary = {
  id: string;
  project_id: string;
  project_name: string;
  survey_id: string | null;
  start_date: string | null;
  end_date: string | null;
  target_responses: number | null;
  archive_after_days: number | null;
  tags: string[];
  creative_design: string | null;
};

// ─── Utilities ────────────────────────────────────────────────────────────────
import { generateCampaignName, generateCampaignSlug } from "@/lib/naming";
import { useCreativeDesignNames } from "@/lib/creative-designs";

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
  campaign_id: "", campaign_name: "",
  campaign_description: "", start_date: null, end_date: null,
  survey_id: null, publisher_org_id: null, brand_org_id: null, agency_org_id: null, topic: null, research_theme: null, year: String(new Date().getFullYear()), country_code: null, market: null, survey_language: "en", status: "draft",
  target_responses: null, archive_after_days: 90, creative_design: null,
  research_project_id: null, tags: null,
};

// ─── Campaign preview modal ───────────────────────────────────────────────────
function CampaignPreviewModal({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }
  const designNames = useCreativeDesignNames();
  const themeName = designNames[(campaign.effective_creative_design ?? campaign.creative_design) ?? ""];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onBackdrop}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Badge */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-center shadow">
          <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">◆ Preview Mode</p>
          <p className="text-xs text-amber-600 mt-0.5">No responses are recorded.</p>
          <p className="text-xs text-amber-500 mt-0.5 font-medium">{campaign.campaign_name}</p>
          {themeName && (
            <p className="text-xs font-semibold mt-1" style={{ color: "#0B1929" }}>
              Creative: <span style={{ color: "#D7B87A" }}>{themeName}</span>
            </p>
          )}
        </div>

        {/* Embed iframe — shows real questions + correct theme */}
        <iframe
          src={`/embed?campaign=${campaign.campaign_id}&preview=1`}
          width={300}
          height={250}
          style={{ border: "none", borderRadius: 12, display: "block",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
          title="Campaign creative preview"
        />

        <button
          onClick={onClose}
          className="text-sm text-white/60 hover:text-white transition-colors px-4 py-2"
        >
          ✕ Close preview
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const isLockedByAdminFor = useCallback(
    (c: Campaign) => c.created_by_admin && !isAdmin,
    [isAdmin]
  );
  const designNames = useCreativeDesignNames();

  // Data
  const [campaigns,        setCampaigns]        = useState<Campaign[]>([]);
  const [deletedCampaigns, setDeletedCampaigns] = useState<Campaign[]>([]);
  const [surveys,          setSurveys]          = useState<Survey[]>([]);
  const [orgs,             setOrgs]              = useState<{ id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" }[]>([]);
  const [researchProjects, setResearchProjects] = useState<ResearchProjectSummary[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [loadingDeleted,   setLoadingDeleted]   = useState(false);

  // Toolbar
  const [activeTab,    setActiveTab]    = useState<"active" | "closed" | "archived" | "deleted">("active");
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CampaignStatus>("all");
  const [usageFilter,  setUsageFilter]  = useState<"all" | "no_responses" | "has_responses" | "target_reached" | "end_reached">("all");
  const [dateFilter,   setDateFilter]   = useState<"all" | "today" | "7days" | "30days">("all");
  const [sortBy,       setSortBy]       = useState<"recent" | "oldest" | "az" | "status">("recent");
  const [countryFilter,   setCountryFilter]   = useState<string>("all");
  const [publisherFilter, setPublisherFilter] = useState<string>("all");
  const [brandFilter,     setBrandFilter]     = useState<string>("all");

  // Preview modal
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);

  // Edit drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing,    setEditing]    = useState<Partial<Campaign>>(BLANK);
  const [saving,     setSaving]     = useState(false);
  const [actioning,  setActioning]  = useState<string | null>(null);
  const [error,      setError]      = useState("");
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkWorking,  setBulkWorking] = useState(false);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [camRes, surRes, projRes, orgRes] = await Promise.all([
      fetch("/api/campaigns"),
      fetch("/api/surveys"),
      fetch("/api/research-projects"),
      fetch("/api/organisations"),
    ]);
    setCampaigns((await camRes.json()).data ?? []);
    setSurveys((await surRes.json()).data ?? []);
    setResearchProjects((await projRes.json()).data ?? []);
    setOrgs((await orgRes.json()).data ?? []);
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

  // Option lists for the Country/Publisher/Brand filters — derived from all
  // non-deleted campaigns so the dropdowns stay stable across tab switches.
  const countryOptions = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const c of campaigns) {
      if (c.country_code && !byCode.has(c.country_code)) byCode.set(c.country_code, c.market || c.country_code);
    }
    return Array.from(byCode.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [campaigns]);

  // Organisations are the single source of truth for publisher/brand/agency
  // display names now — this resolves an id to its name anywhere a campaign
  // needs to show, filter, search, or generate a name/slug with one.
  const orgById = useMemo(() => new Map(orgs.map(o => [o.id, o])), [orgs]);
  const orgName = useCallback((id: string | null) => (id ? orgById.get(id)?.name ?? "" : ""), [orgById]);
  // Brand is optional — a campaign with no real brand (e.g. "Women's World
  // Cup") names itself from Topic instead, same pattern as Research Projects.
  const brandOrTopic = useCallback(
    (brandOrgId: string | null, topic: string | null) => orgName(brandOrgId) || (topic ?? ""),
    [orgName]
  );

  const publisherOptions = useMemo(() => {
    const ids = new Set(campaigns.map(c => c.publisher_org_id).filter((id): id is string => !!id));
    return Array.from(ids).map(id => ({ id, name: orgName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [campaigns, orgName]);

  const brandOptions = useMemo(() => {
    const ids = new Set(campaigns.map(c => c.brand_org_id).filter((id): id is string => !!id));
    return Array.from(ids).map(id => ({ id, name: orgName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [campaigns, orgName]);

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

    // Country / Publisher / Brand filters
    if (countryFilter !== "all")   list = list.filter(c => c.country_code === countryFilter);
    if (publisherFilter !== "all") list = list.filter(c => c.publisher_org_id === publisherFilter);
    if (brandFilter !== "all")     list = list.filter(c => c.brand_org_id === brandFilter);

    // Search
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

    // Sort
    switch (sortBy) {
      case "recent":  return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "oldest":  return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "az":      return [...list].sort((a, b) => a.campaign_name.localeCompare(b.campaign_name));
      case "status":  return [...list].sort((a, b) => STATUS_ORDER[a.effective_status] - STATUS_ORDER[b.effective_status]);
      default:        return list;
    }
  }, [campaigns, deletedCampaigns, activeTab, statusFilter, usageFilter, dateFilter, countryFilter, publisherFilter, brandFilter, sortBy, search, activeCampaigns, closedCampaigns, archivedCampaigns, orgName]);

  const publisherOrgs = useMemo(() => {
    const all = orgs.filter(o => o.type === "publisher");
    return user?.role === "publisher" ? all.filter(o => o.id === user.organisationId) : all;
  }, [orgs, user?.role, user?.organisationId]);
  const brandOrgs      = useMemo(() => orgs.filter(o => o.type === "brand"), [orgs]);
  const agencyOrgs      = useMemo(() => orgs.filter(o => o.type === "agency"), [orgs]);

  const selectedProject = useMemo(
    () => researchProjects.find(p => p.id === editing.research_project_id) ?? null,
    [researchProjects, editing.research_project_id]
  );

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    const isPublisher = user?.role === "publisher";
    setEditing({
      ...BLANK,
      publisher_org_id: isPublisher ? (user?.organisationId ?? null) : null,
    });
    setError("");
    setDrawerOpen(true);
  }

  function openEdit(c: Campaign) {
    const { surveys: _s, effective_status: _es, status_reason: _sr,
            is_auto_transition: _iat, response_count: _rc,
            deleted_at: _da, deleted_by: _db, delete_reason: _dr,
            // API-only resolved-inheritance fields — never real columns,
            // must never round-trip back into a save payload.
            effective_survey_id: _esi, effective_start_date: _esd, effective_end_date: _eed,
            effective_target_responses: _etr, effective_archive_after_days: _ead,
            effective_tags: _et, effective_creative_design: _ecd, inherited: _inh,
            ...rest } = c;
    setEditing({ ...rest });
    setError("");
    setDrawerOpen(true);
  }

  // Auto-update name + slug whenever any of the 5 builder fields change.
  // Runs only while the drawer is open. The Campaign Name and Campaign ID
  // fields remain editable — any manual edit simply becomes the new value.
  useEffect(() => {
    if (!drawerOpen) return;
    const brand = brandOrTopic(editing.brand_org_id ?? null, editing.topic ?? null);
    const name = generateCampaignName(
      brand, editing.research_theme ?? "",
      editing.country_code ?? "", orgName(editing.publisher_org_id ?? null), editing.year ?? ""
    );
    const slug = generateCampaignSlug(
      brand, editing.research_theme ?? "",
      editing.country_code ?? "", orgName(editing.publisher_org_id ?? null), editing.year ?? ""
    );
    if (name || slug) {
      setEditing(e => ({
        ...e,
        campaign_name: name || e.campaign_name,
        campaign_id:   slug || e.campaign_id,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.brand_org_id, editing.topic, editing.research_theme, editing.country_code, editing.publisher_org_id, editing.year, drawerOpen, orgName, brandOrTopic]);

  // Auto-select Survey Language to match Country Code — but only when the
  // user actually changes Country Code during this drawer session, never
  // silently overwriting a language an existing campaign already has when
  // the drawer is first opened (survey_language is deliberately independent
  // of country_code — see lib/locales.ts — so it must stay editable).
  const countryLangBaseline = useRef<string | null>(null);
  useEffect(() => {
    if (drawerOpen) countryLangBaseline.current = editing.id ? (editing.country_code ?? null) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen, editing.id]);
  useEffect(() => {
    if (!drawerOpen) return;
    if (editing.country_code === countryLangBaseline.current) return;
    countryLangBaseline.current = editing.country_code ?? null;
    if (!editing.country_code) return;
    setEditing(e => ({ ...e, survey_language: expectedSurveyLanguage(e.country_code!) }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.country_code, drawerOpen]);

  function autoId() {
    setEditing(e => {
      const brandName = brandOrTopic(e.brand_org_id ?? null, e.topic ?? null);
      const publisherName = orgName(e.publisher_org_id ?? null);
      const name = generateCampaignName(
        brandName, e.research_theme ?? "", e.country_code ?? "", publisherName, e.year ?? ""
      );
      const slug = generateCampaignSlug(
        brandName, e.research_theme ?? "", e.country_code ?? "", publisherName, e.year ?? ""
      );
      return {
        ...e,
        campaign_name: name || e.campaign_name,
        campaign_id:   slug || generateCampaignId(brandName, e.campaign_name ?? ""),
      };
    });
  }

  async function handleSave() {
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
    const hasResponses = c.response_count > 0;
    const msg = hasResponses
      ? `⚠️ "${c.campaign_name}" has ${c.response_count.toLocaleString()} response${c.response_count !== 1 ? "s" : ""} collected.\n\nThe response data will be preserved in the database, but this campaign will no longer appear in your active view.\n\nMove to deleted items?`
      : `Move "${c.campaign_name}" to deleted items? It can be restored later.`;
    if (!confirm(msg)) return;
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

  // ── Bulk selection ──────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds(prev => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const targets = displayed.filter(c => selectedIds.has(c.id));
    if (!targets.length) return;
    const blocked = targets.filter(c => c.effective_status === "live" || c.effective_status === "paused" || c.status === "live" || c.status === "paused");
    const eligible = targets.filter(c => !blocked.includes(c));
    if (!eligible.length) {
      showToast("None of the selected campaigns can be deleted — live and paused campaigns must be paused or closed first.", false);
      return;
    }
    const msg = blocked.length > 0
      ? `Move ${eligible.length} campaign(s) to deleted items? ${blocked.length} live/paused campaign(s) in your selection will be skipped.`
      : `Move ${eligible.length} campaign(s) to deleted items? They can be restored later.`;
    if (!confirm(msg)) return;

    setBulkWorking(true);
    let succeeded = 0, failed = 0;
    for (const c of eligible) {
      const res = await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
      if (res.ok) succeeded++; else failed++;
    }
    setBulkWorking(false);

    const parts = [`${succeeded} deleted`];
    if (blocked.length > 0) parts.push(`${blocked.length} skipped (live/paused)`);
    if (failed > 0) parts.push(`${failed} failed`);
    showToast(parts.join(", "), failed === 0);
    clearSelection();
    load();
  }

  async function handleBulkAction(action: CampaignAction) {
    const targets = displayed.filter(c => selectedIds.has(c.id) && availableActions(c.effective_status ?? c.status as CampaignStatus).includes(action));
    if (!targets.length) {
      showToast(`No selected campaigns can be ${ACTION_LABELS[action].toLowerCase()}d right now.`, false);
      return;
    }
    const skipped = selectedIds.size - targets.length;

    setBulkWorking(true);
    let succeeded = 0, failed = 0;
    for (const c of targets) {
      const res = await fetch(`/api/campaigns/${c.id}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) succeeded++; else failed++;
    }
    setBulkWorking(false);

    const parts = [`${succeeded} ${ACTION_LABELS[action].toLowerCase()}d`];
    if (skipped > 0) parts.push(`${skipped} skipped (not eligible)`);
    if (failed > 0) parts.push(`${failed} failed`);
    showToast(parts.join(", "), failed === 0);
    clearSelection();
    load();
  }

  async function handleBulkRestore() {
    const targets = deletedCampaigns.filter(c => selectedIds.has(c.id));
    if (!targets.length) return;
    if (!confirm(`Restore ${targets.length} campaign(s) to Draft?`)) return;

    setBulkWorking(true);
    let succeeded = 0, failed = 0;
    for (const c of targets) {
      const res = await fetch(`/api/campaigns/${c.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _action: "undelete" }),
      });
      if (res.ok) succeeded++; else failed++;
    }
    setBulkWorking(false);

    showToast(failed > 0 ? `${succeeded} restored, ${failed} failed` : `${succeeded} campaign(s) restored to Draft.`, failed === 0);
    clearSelection();
    load();
    loadDeleted();
  }

  async function handleDuplicate(c: Campaign) {
    const slug = generateDuplicateSlug(brandOrTopic(c.brand_org_id, c.topic), c.campaign_name);
    const payload = {
      campaign_name:     `${c.campaign_name} (Copy)`,
      campaign_id:       slug,
      campaign_description: c.campaign_description,
      start_date:        null,
      end_date:          null,
      survey_id:         c.survey_id,
      publisher_org_id:  c.publisher_org_id,
      brand_org_id:      c.brand_org_id,
      agency_org_id:     c.agency_org_id,
      topic:             c.topic,
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

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const d = (s: string | null | undefined) => s ? new Date(s).toISOString().slice(0, 10) : "";
    const rows = displayed.map(c => {
      const pct = c.target_responses
        ? Math.round((c.response_count / c.target_responses) * 100)
        : "";
      return {
        "Campaign Name":    c.campaign_name,
        "Slug":             c.campaign_id,
        "Brand":            orgName(c.brand_org_id),
        "Topic":            c.topic ?? "",
        "Research Theme":   c.research_theme ?? "",
        "Country":          c.country_code ?? "",
        "Market":           c.market ?? "",
        "Publisher":        orgName(c.publisher_org_id),
        "Year":             c.year ?? "",
        "Survey":           c.surveys?.name ?? "",
        "Status (Stored)":  c.status,
        "Status (Effective)": c.effective_status ?? c.status,
        "Status Reason":    c.status_reason ?? "",
        "Start Date":       d(c.start_date),
        "End Date":         d(c.end_date),
        "Target Responses": c.target_responses ?? "",
        "Responses":        c.response_count,
        "Progress %":       pct,
        "Created":          d(c.created_at),
        "Deleted Date":     d(c.deleted_at),
        "Deleted By":       c.deleted_by ?? "",
      };
    });
    const csv  = Papa.unparse(rows);
    const link = document.createElement("a");
    link.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `fanometrix-campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const totalActive = activeCampaigns.length + closedCampaigns.length + archivedCampaigns.length;

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {totalActive} campaign{totalActive !== 1 ? "s" : ""} · {activeCampaigns.filter(c => c.effective_status === "live").length} live
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
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                + Create Campaign
              </button>
            </div>
          </div>
          <details className="group bg-gray-50 w-full">
            <summary className="cursor-pointer select-none list-none py-3">
              <p className="text-sm text-gray-500 leading-relaxed">
                Each campaign connects a survey to a publisher, placement and date range.
                Campaign status determines whether responses are accepted.{" "}
                <span className="font-semibold inline-flex items-center gap-1" style={{ color: "#D7B87A" }}>
                  Expand to find out more
                  <span className="inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </p>
            </summary>
            <div className="pb-4 pt-3 mt-1 border-t border-gray-200 text-sm text-gray-600 leading-relaxed space-y-4">
              <div>
                <p className="font-semibold text-gray-700 mb-1">Campaign lifecycle</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Draft</strong>: being set up, not yet deployed</li>
                  <li><strong>Scheduled</strong>: ready to go, waiting for its start date</li>
                  <li><strong>Live</strong>: actively collecting responses</li>
                  <li><strong>Paused</strong>: temporarily stopped, can be resumed</li>
                  <li><strong>Closed</strong>: permanently finished</li>
                  <li><strong>Archived</strong>: hidden from the default view, kept as a historical record</li>
                </ul>
                <p className="mt-1 text-gray-500">Fanometrix automatically moves a campaign from Scheduled to Live on its start date, and from Live to Closed when the end date passes or the target response count is reached.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">What you can do with a campaign</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Publish</strong>: from Draft, sets it to Scheduled and waiting for the start date</li>
                  <li><strong>Go live now</strong>: from Draft or Scheduled, makes it Live immediately</li>
                  <li><strong>Pause</strong>: from Live or Scheduled, temporarily stops it collecting responses</li>
                  <li><strong>Resume</strong>: from Paused, starts collecting responses again</li>
                  <li><strong>Close</strong>: from Live or Paused, ends it permanently</li>
                  <li><strong>Archive</strong>: from Closed, moves it out of the main list</li>
                  <li><strong>Duplicate</strong>: available any time, creates a Draft copy with dates cleared and responses reset to zero</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Creating a campaign</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Click + Create Campaign, enter a Brand Name and Campaign Name, then use Auto to generate the Campaign ID</li>
                  <li>Set a Start Date and End Date, these drive the automatic status changes above</li>
                  <li>Optionally set a Target Responses number, the campaign closes automatically once it&apos;s reached</li>
                  <li>Choose the Survey and enter the Publisher</li>
                  <li>Save as Draft, then Go Live Now or Publish when it&apos;s ready</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Deleting a campaign</p>
                <p>Campaigns can only be deleted while they&apos;re Draft or Scheduled and have zero responses. Once a campaign has any responses it can never be hard deleted, archive it instead. This keeps reporting and historical records intact.</p>
              </div>
              <a href="/fanometrix-guide" target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#0B1929" }}>
                Read the full Fanometrix Guide
                <span className="text-[10px] opacity-60">↗</span>
              </a>
            </div>
          </details>
        </div>

        {/* Search + Filters */}
        <div className="mb-5 space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="search"
              placeholder="Search campaigns…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
            />
          </div>

          <div className="flex flex-wrap gap-3">
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

          <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
            <option value="all">All Countries</option>
            {countryOptions.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>

          <select value={publisherFilter} onChange={e => setPublisherFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
            <option value="all">All Publishers</option>
            {publisherOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
            <option value="all">All Brands</option>
            {brandOptions.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest first</option>
            <option value="az">A–Z</option>
            <option value="status">By status</option>
          </select>
          </div>
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
                setCountryFilter("all"); setPublisherFilter("all"); setBrandFilter("all");
                clearSelection();
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

        {/* Select all + bulk action bar */}
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
              <button onClick={handleBulkRestore} disabled={bulkWorking}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors">
                {bulkWorking ? "Working…" : "Restore"}
              </button>
            ) : (
              <>
                {(["publish", "go_live", "pause", "resume", "close", "archive"] as CampaignAction[]).map(action => (
                  <button key={action} onClick={() => handleBulkAction(action)} disabled={bulkWorking}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-colors">
                    {bulkWorking ? "…" : ACTION_LABELS[action]}
                  </button>
                ))}
                <button onClick={handleBulkDelete} disabled={bulkWorking}
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
            const isLockedByAdmin = isLockedByAdminFor(c);
            const actions   = isDeleted || isLockedByAdmin ? [] : availableActions(c.effective_status ?? c.status as CampaignStatus);
            // Live/paused campaigns cannot be deleted to prevent accidental loss of active data.
            // All other statuses can be deleted; responses are preserved in the DB.
            const isLiveOrPaused = c.effective_status === "live" || c.effective_status === "paused"
              || c.status === "live" || c.status === "paused";
            const canDelete  = !isDeleted && !isLiveOrPaused && !isLockedByAdmin;
            const hasResponses = c.response_count > 0;
            const deleteTitle = isLockedByAdmin
              ? "Set up by the Fanometrix team — can't be deleted."
              : isLiveOrPaused
              ? "Live and paused campaigns cannot be deleted. Pause or close it first."
              : "Move to deleted items";

            return (
              <div key={c.id} className={`bg-white border rounded-xl p-5 shadow-sm transition-colors flex gap-3 ${
                isDeleted ? "border-gray-100 opacity-75" : "border-gray-100 hover:border-gray-200"
              }`}>
                {isLockedByAdmin ? (
                  <div className="w-4 h-4 mt-1 flex-shrink-0" title="Set up by the Fanometrix team — can't be selected for bulk actions." />
                ) : (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="w-4 h-4 mt-1 accent-[#0B1929] flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                {isDeleted ? (
                  /* ── Deleted card ── */
                  <>
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div>
                        <p className="font-semibold text-gray-400 line-through">{brandOrTopic(c.brand_org_id, c.topic)} · {c.campaign_name}</p>
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
                              {brandOrTopic(c.brand_org_id, c.topic)} · {c.campaign_name}
                            </p>
                            {c.campaign_description ? (
                              <p className="text-xs text-gray-400 mt-0.5 truncate">{c.campaign_description}</p>
                            ) : (
                              <p className="text-xs font-mono text-gray-400 mt-0.5">{c.campaign_id}</p>
                            )}
                          </div>
                          <StatusBadge status={c.effective_status ?? c.status as CampaignStatus} />
                        </div>

                        {/* Metadata chips */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {isLockedByAdmin && (
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full" title="Set up by the Fanometrix team — read-only.">
                              Set up by Fanometrix
                            </span>
                          )}
                          {c.surveys?.name && (
                            <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                              Survey: {c.surveys.name}
                            </span>
                          )}
                          {orgName(c.publisher_org_id) && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{orgName(c.publisher_org_id)}</span>
                          )}
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
                        {isLockedByAdmin ? (
                          <button disabled title="Set up by the Fanometrix team — can't be edited."
                            className="text-xs border border-gray-100 text-gray-300 px-3 py-1.5 rounded-lg cursor-not-allowed">
                            Edit
                          </button>
                        ) : c.effective_status !== "archived" ? (
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

                        <button
                          onClick={() => setPreviewCampaign(c)}
                          title="Preview the survey creative"
                          className="text-xs border px-3 py-1.5 rounded-lg transition-colors font-medium"
                          style={{ borderColor: "#D7B87A", color: "#0B1929", background: "#D7B87A" }}
                        >
                          Preview
                        </button>

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
              </div>
            );
          })}
        </div>

      </div>

      {/* ── Edit / Create Drawer ──────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="w-full sm:w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing.id ? "Edit Campaign" : "Create Campaign"}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              <DrawerSection step={1} title="Campaign Identity" subtitle="Naming, description, and optional parent research project.">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name Builder</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Brand (optional)">
                      <select
                        value={editing.brand_org_id ?? ""}
                        onChange={e => setEditing(x => ({ ...x, brand_org_id: e.target.value || null }))}
                        className={INP}
                      >
                        <option value="">— None —</option>
                        {brandOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">
                        Not listed? Add it in <Link href="/organisations" className="underline hover:text-[#0B1929]">Organisations</Link> first.
                      </p>
                    </Field>
                    <Field label="Topic">
                      <input value={editing.topic ?? ""} onChange={e => setEditing(x => ({ ...x, topic: e.target.value }))}
                        className={INP} placeholder="Women's World Cup" />
                      <p className="text-xs text-gray-400 mt-1">Used to name this campaign when there's no real brand.</p>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Research Theme *">
                      <input value={editing.research_theme ?? ""} onChange={e => setEditing(x => ({ ...x, research_theme: e.target.value }))}
                        className={INP} placeholder="Fan Understanding" />
                    </Field>
                    <Field label="Year">
                      <input value={editing.year ?? ""} onChange={e => setEditing(x => ({ ...x, year: e.target.value }))}
                        className={INP} placeholder={String(new Date().getFullYear())} maxLength={9} />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={autoId}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-lg border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8] transition-colors"
                  >
                    Auto Generate Name &amp; Slug
                  </button>
                  {/* Live preview */}
                  {(editing.brand_org_id || editing.topic || editing.research_theme) && (() => {
                    const preview = generateCampaignName(
                      brandOrTopic(editing.brand_org_id ?? null, editing.topic ?? null), editing.research_theme ?? "",
                      editing.country_code ?? "", orgName(editing.publisher_org_id ?? null), editing.year ?? ""
                    );
                    return preview ? (
                      <p className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2 font-mono">
                        {preview}
                      </p>
                    ) : null;
                  })()}
                </div>

                <Field label="Campaign Name *">
                  <input value={editing.campaign_name ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_name: e.target.value }))}
                    className={INP} placeholder="Carlsberg | Fan Understanding | UK | Football365 | 2026" />
                </Field>

                <Field label="Campaign ID *">
                  <input value={editing.campaign_id ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_id: e.target.value }))}
                    className={`${INP} font-mono`} placeholder="carlsberg_fan_understanding_uk_football365_2026" />
                  <p className="text-xs text-gray-400 mt-1">Used in embed URLs. Lowercase, underscores only.</p>
                </Field>

                <Field label="Description">
                  <input value={editing.campaign_description ?? ""} onChange={e => setEditing(x => ({ ...x, campaign_description: e.target.value }))}
                    className={INP} placeholder="Optional" />
                </Field>

                <Field label="Research Project">
                  <select value={editing.research_project_id ?? ""} onChange={e => setEditing(x => ({ ...x, research_project_id: e.target.value || null }))}
                    className={INP}>
                    <option value="">No project — standalone campaign</option>
                    {researchProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.project_name}</option>
                    ))}
                  </select>
                  {selectedProject && (
                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                      Survey, dates, target responses, archive settings and tags left blank below are inherited from this project.
                    </p>
                  )}
                </Field>
              </DrawerSection>

              <DrawerSection step={2} title="Market Targeting" subtitle="Publisher, country and language for this specific deployment — always stored independently." prominent>
                <Field label="Publisher">
                  <select
                    value={editing.publisher_org_id ?? ""}
                    onChange={e => setEditing(x => ({ ...x, publisher_org_id: e.target.value || null }))}
                    disabled={user?.role === "publisher"}
                    className={`${INP} ${user?.role === "publisher" ? "bg-gray-50 text-gray-500" : ""}`}
                  >
                    <option value="">— Select publisher —</option>
                    {publisherOrgs.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  {user?.role === "publisher" && (
                    <p className="text-xs text-gray-400 mt-1">Locked to your organisation.</p>
                  )}
                </Field>

                <Field label="Agency">
                  <select
                    value={editing.agency_org_id ?? ""}
                    onChange={e => setEditing(x => ({ ...x, agency_org_id: e.target.value || null }))}
                    className={INP}
                  >
                    <option value="">— None —</option>
                    {agencyOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </Field>

                {/* Country Code */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Country Code <span className="font-normal text-gray-400">(ISO 3166-1 alpha-2)</span>
                  </label>
                  <input
                    value={editing.country_code ?? ""}
                    onChange={e => setEditing(x => ({ ...x, country_code: e.target.value.toUpperCase().slice(0, 2) || null }))}
                    className={`${INP} font-mono uppercase ${
                      editing.country_code && !isValidCountryCode(editing.country_code) ? "border-amber-400" : ""
                    }`}
                    placeholder="GB"
                    maxLength={2}
                  />
                  {(() => {
                    const warn = countryCodeWarning(editing.country_code ?? "");
                    return warn ? <p className="text-xs text-amber-600 mt-1">⚠ {warn}</p> : null;
                  })()}
                  <p className="text-xs text-gray-400 mt-1">
                    Used for embed routing <code className="text-xs">?country=GB</code> and reporting. Always uppercase.
                  </p>
                </div>

                {/* Market name */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">Market Name</label>
                  <input
                    value={editing.market ?? ""}
                    onChange={e => setEditing(x => ({ ...x, market: e.target.value || null }))}
                    className={INP}
                    placeholder="United Kingdom"
                  />
                  <p className="text-xs text-gray-400 mt-1">Human-readable market label for display and reporting.</p>
                </div>

                {/* Survey Language */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">
                    Survey Language <span className="font-normal text-gray-400">(ISO 639-1)</span>
                  </label>
                  <select
                    value={editing.survey_language ?? "en"}
                    onChange={e => setEditing(x => ({ ...x, survey_language: e.target.value }))}
                    className={INP}
                  >
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.label} / {lang.nativeLabel} ({lang.code})</option>
                    ))}
                  </select>
                  {(() => {
                    const warn = languageCodeWarning(editing.survey_language ?? "");
                    return warn ? <p className="text-xs text-amber-600 mt-1">⚠ {warn}</p> : null;
                  })()}
                  <p className="text-xs text-gray-400 mt-1">
                    Controls which translation the survey creative renders. Independent of country code.
                  </p>
                </div>

                {/* Reference pairs */}
                <details className="group">
                  <summary className="text-xs text-[#D7B87A] cursor-pointer select-none hover:opacity-75">
                    Show common country → language pairs
                  </summary>
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-400 uppercase tracking-wide text-[10px]">
                          <th className="text-left px-3 py-2">Market</th>
                          <th className="text-left px-3 py-2">country_code</th>
                          <th className="text-left px-3 py-2">survey_language</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MARKET_REFERENCE_PAIRS.map(p => (
                          <tr key={p.country_code} className="border-t border-gray-50">
                            <td className="px-3 py-1.5 text-gray-600">{p.market}</td>
                            <td className="px-3 py-1.5 font-mono font-semibold text-[#0B1929]">{p.country_code}</td>
                            <td className="px-3 py-1.5 font-mono text-[#D7B87A]">{p.survey_language}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </DrawerSection>

              <DrawerSection step={3} title="Survey" subtitle="The survey this campaign serves." prominent>
                {selectedProject ? (
                  <InheritableField
                    label="Survey"
                    inherited={editing.survey_id == null}
                    resolvedDisplay={surveys.find(s => s.id === selectedProject.survey_id)?.name ?? "—"}
                    onOverride={() => setEditing(x => ({ ...x, survey_id: selectedProject.survey_id ?? null }))}
                    onRevert={() => setEditing(x => ({ ...x, survey_id: null }))}
                  >
                    <select value={editing.survey_id ?? ""} onChange={e => setEditing(x => ({ ...x, survey_id: e.target.value || null }))}
                      className={INP}>
                      <option value="">None selected</option>
                      {surveys
                        .filter(s => {
                          if (s.status === "draft") return true;
                          if (s.status === "ready") return isSurveyValidForReady(s);
                          return false;
                        })
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.status === "draft" ? " (Draft)" : ""}
                          </option>
                        ))}
                    </select>
                  </InheritableField>
                ) : (
                  <Field label="Survey">
                    <select value={editing.survey_id ?? ""} onChange={e => setEditing(x => ({ ...x, survey_id: e.target.value || null }))}
                      className={INP}>
                      <option value="">None selected</option>
                      {surveys
                        .filter(s => {
                          // Draft surveys: always show (for setup workflow)
                          if (s.status === "draft") return true;
                          // Ready surveys: only show if they pass MPU validation
                          if (s.status === "ready") return isSurveyValidForReady(s);
                          return false;
                        })
                        .map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.status === "draft" ? " (Draft)" : ""}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
              </DrawerSection>

              <DrawerSection step={4} title="Campaign Settings" subtitle="Dates, response targets, archive timing, and status — each can inherit from the linked project.">
                <div className="grid grid-cols-2 gap-3">
                  {selectedProject ? (
                    <InheritableField
                      label="Start Date"
                      inherited={editing.start_date == null}
                      resolvedDisplay={formatDate(selectedProject.start_date)}
                      onOverride={() => setEditing(x => ({ ...x, start_date: selectedProject.start_date ?? "" }))}
                      onRevert={() => setEditing(x => ({ ...x, start_date: null }))}
                    >
                      <input type="date" value={editing.start_date ?? ""} onChange={e => setEditing(x => ({ ...x, start_date: e.target.value || null }))}
                        className={INP} />
                    </InheritableField>
                  ) : (
                    <Field label="Start Date">
                      <input type="date" value={editing.start_date ?? ""} onChange={e => setEditing(x => ({ ...x, start_date: e.target.value || null }))}
                        className={INP} />
                    </Field>
                  )}
                  {selectedProject ? (
                    <InheritableField
                      label="End Date"
                      inherited={editing.end_date == null}
                      resolvedDisplay={formatDate(selectedProject.end_date)}
                      onOverride={() => setEditing(x => ({ ...x, end_date: selectedProject.end_date ?? "" }))}
                      onRevert={() => setEditing(x => ({ ...x, end_date: null }))}
                    >
                      <input type="date" value={editing.end_date ?? ""} min={editing.start_date ?? undefined}
                        onChange={e => setEditing(x => ({ ...x, end_date: e.target.value || null }))}
                        className={INP} />
                    </InheritableField>
                  ) : (
                    <Field label="End Date">
                      <input type="date" value={editing.end_date ?? ""} min={editing.start_date ?? undefined}
                        onChange={e => setEditing(x => ({ ...x, end_date: e.target.value || null }))}
                        className={INP} />
                    </Field>
                  )}
                </div>
                {editing.start_date && editing.end_date && editing.start_date > editing.end_date && (
                  <p className="text-xs text-red-500 -mt-2">End date must be on or after the start date.</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {selectedProject ? (
                    <InheritableField
                      label="Target Responses"
                      inherited={editing.target_responses == null}
                      resolvedDisplay={selectedProject.target_responses?.toLocaleString() ?? "—"}
                      onOverride={() => setEditing(x => ({ ...x, target_responses: selectedProject.target_responses ?? null }))}
                      onRevert={() => setEditing(x => ({ ...x, target_responses: null }))}
                    >
                      <input type="number" min={1}
                        value={editing.target_responses ?? ""}
                        onChange={e => setEditing(x => ({ ...x, target_responses: e.target.value ? Number(e.target.value) : null }))}
                        className={INP} placeholder="e.g. 10000" />
                    </InheritableField>
                  ) : (
                    <Field label="Target Responses">
                      <input type="number" min={1}
                        value={editing.target_responses ?? ""}
                        onChange={e => setEditing(x => ({ ...x, target_responses: e.target.value ? Number(e.target.value) : null }))}
                        className={INP} placeholder="e.g. 10000 (optional)" />
                    </Field>
                  )}
                  {selectedProject ? (
                    <InheritableField
                      label="Archive After (days)"
                      inherited={editing.archive_after_days == null}
                      resolvedDisplay={selectedProject.archive_after_days != null ? String(selectedProject.archive_after_days) : "—"}
                      onOverride={() => setEditing(x => ({ ...x, archive_after_days: selectedProject.archive_after_days ?? 90 }))}
                      onRevert={() => setEditing(x => ({ ...x, archive_after_days: null }))}
                    >
                      <input type="number" min={1}
                        value={editing.archive_after_days ?? ""}
                        onChange={e => setEditing(x => ({ ...x, archive_after_days: e.target.value ? Number(e.target.value) : null }))}
                        className={INP} placeholder="90" />
                    </InheritableField>
                  ) : (
                    <Field label="Archive After (days)">
                      <input type="number" min={1}
                        value={editing.archive_after_days ?? 90}
                        onChange={e => setEditing(x => ({ ...x, archive_after_days: Number(e.target.value) || 90 }))}
                        className={INP} placeholder="90" />
                    </Field>
                  )}
                </div>

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
              </DrawerSection>

              {isAdmin && (
                <DrawerSection step={5} title="Creative Design" subtitle="Visual design applied to this campaign's survey MPU.">
                  <p className="text-right -mt-1">
                    <a href="/creative-lab/designs" target="_blank" rel="noopener"
                      className="text-xs font-medium underline"
                      style={{ color: "#D7B87A" }}>
                      Browse all designs →
                    </a>
                  </p>

                  {selectedProject ? (
                    <InheritableField
                      label="Design"
                      inherited={editing.creative_design == null}
                      resolvedDisplay={designNames[selectedProject.creative_design ?? ""] ?? "Fanometrix Default"}
                      onOverride={() => setEditing(x => ({ ...x, creative_design: selectedProject.creative_design ?? null }))}
                      onRevert={() => setEditing(x => ({ ...x, creative_design: null }))}
                    >
                      <CreativeDesignPicker
                        value={editing.creative_design ?? null}
                        onChange={v => setEditing(x => ({ ...x, creative_design: v }))}
                      />
                    </InheritableField>
                  ) : (
                    <>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Select a design for this campaign&apos;s survey MPU. Leave unset to use the standard production creative.
                      </p>
                      <CreativeDesignPicker
                        value={editing.creative_design ?? null}
                        onChange={v => setEditing(x => ({ ...x, creative_design: v }))}
                      />
                    </>
                  )}

                  <CreativeDesignPreview designId={editing.creative_design} />
                </DrawerSection>
              )}

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

      {/* Campaign preview modal */}
      {previewCampaign && (
        <CampaignPreviewModal campaign={previewCampaign} onClose={() => setPreviewCampaign(null)} />
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

/** A field that can be inherited (null) from a linked Research Project, or overridden (non-null). */
function InheritableField({
  label, inherited, resolvedDisplay, onOverride, onRevert, children,
}: {
  label: string;
  inherited: boolean;
  resolvedDisplay: string;
  onOverride: () => void;
  onRevert: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
        {inherited ? (
          <button type="button" onClick={onOverride} className="text-xs text-[#0B1929] underline">Override</button>
        ) : (
          <button type="button" onClick={onRevert} className="text-xs text-gray-400 underline">Revert to inherited</button>
        )}
      </div>
      {inherited ? (
        <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          Inherited: {resolvedDisplay}
        </p>
      ) : children}
    </div>
  );
}
