"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Papa from "papaparse";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { DrawerSection } from "@/app/components/DrawerSection";
import { generateStudyName, generateStudySlug, studyTypeLabel } from "@/lib/naming";
import { NameBuilder } from "@/app/components/NameBuilder";

// ─── Types ────────────────────────────────────────────────────────────────────
type CampaignGroup = {
  id: string;
  group_id: string;
  name: string;
  description: string | null;
  publisher_org_id: string | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
  topic: string | null;
  study_type: string;
  status: "draft" | "live" | "paused" | "closed" | "archived";
  rotation: "equal" | "weighted" | "priority";
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  member_count: number;
  total_responses: number;
  campaign_ids: string[];
  survey_count: number;
  research_project_id: string | null;
  research_project_name: string | null;
};

type ResearchProjectOption = {
  id: string;
  project_name: string;
  topic: string | null;
  research_mode: "real" | "simulated";
};

type CampaignOption = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  brand_org_id: string | null;
  publisher_org_id: string | null;
  research_project_id: string | null;
  market: string | null;
  country_code: string | null;
  surveys?: { name: string } | null;
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
// context() renders each option's Survey / publisher / market — the same
// three facts an admin needs to tell campaigns apart once the picker is
// narrowed to a single Research Project (migration 096's whole point:
// several Surveys' campaigns can share a group, so which Survey a
// candidate belongs to stops being obvious from the name alone).
function campaignContext(o: CampaignOption, orgName: (id: string | null) => string): string {
  const parts = [
    o.surveys?.name ? `Survey: ${o.surveys.name}` : null,
    o.publisher_org_id ? orgName(o.publisher_org_id) : null,
    o.market || o.country_code || null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function CampaignSelector({
  options,
  selected,
  onChange,
  orgName,
  disabledHint,
}: {
  options: CampaignOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  orgName: (id: string | null) => string;
  disabledHint?: string;
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
    (`${o.campaign_name} ${orgName(o.brand_org_id)} ${campaignContext(o, orgName)}`).toLowerCase().includes(search.toLowerCase())
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

  if (disabledHint) {
    return <p className="text-xs text-gray-400 italic border border-dashed border-gray-200 rounded-lg px-3 py-2.5">{disabledHint}</p>;
  }

  return (
    <div>
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedOptions.map(o => (
            <span key={o.id} className="inline-flex items-center gap-1 text-xs bg-[#0B1929]/8 text-[#0B1929] border border-[#0B1929]/15 px-2.5 py-1 rounded-full">
              {o.campaign_name}, {orgName(o.brand_org_id)}
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
          <div ref={dropRef} className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {remaining.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-gray-400">{search ? "No matches" : "All eligible campaigns selected"}</p>
            ) : (
              remaining.map(o => (
                <button key={o.id} type="button"
                  onMouseDown={e => { e.preventDefault(); add(o.id); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors">
                  <div>
                    <span className="text-gray-900">{o.campaign_name},</span>
                    <span className="text-gray-400 ml-1">{orgName(o.brand_org_id)}</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full capitalize ${STATUS_COLOURS[o.effective_status ?? o.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {o.effective_status ?? o.status}
                    </span>
                  </div>
                  {campaignContext(o, orgName) && (
                    <p className="text-xs text-gray-400 mt-0.5">{campaignContext(o, orgName)}</p>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Priority order editor ────────────────────────────────────────────────────
// Only shown for rotation === "priority" — makes serve order an explicit,
// editable list instead of the invisible array-insertion-order the API has
// always derived it from (member_count campaigns, position 1 served first
// whenever it's eligible).
function PriorityOrderEditor({
  campaignIds,
  options,
  onChange,
  orgName,
}: {
  campaignIds: string[];
  options: CampaignOption[];
  onChange: (ids: string[]) => void;
  orgName: (id: string | null) => string;
}) {
  function move(index: number, dir: -1 | 1) {
    const next = [...campaignIds];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  if (campaignIds.length === 0) return null;

  return (
    <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100">
      {campaignIds.map((id, i) => {
        const o = options.find(x => x.id === id);
        return (
          <div key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="text-xs font-semibold text-gray-400 w-5 flex-shrink-0">{i + 1}</span>
            <span className="flex-1 min-w-0 truncate text-gray-800">{o ? `${o.campaign_name}, ${orgName(o.brand_org_id)}` : id}</span>
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed px-1">↑</button>
            <button type="button" disabled={i === campaignIds.length - 1} onClick={() => move(i, 1)}
              className="text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:cursor-not-allowed px-1">↓</button>
          </div>
        );
      })}
      <p className="text-xs text-gray-400 px-3 py-1.5 bg-gray-50 rounded-b-lg">Position 1 serves first whenever it&apos;s eligible; others only step in as backups.</p>
    </div>
  );
}

// ─── Blank form ───────────────────────────────────────────────────────────────
type GroupForm = {
  group_id:       string;
  name:           string;
  description:    string;
  publisher_org_id: string;
  brand_org_id:   string;
  agency_org_id:  string;
  topic:          string;
  study_type:     string;
  status:         CampaignGroup["status"];
  rotation:       CampaignGroup["rotation"];
  start_date:     string;
  end_date:       string;
  campaign_ids:   string[];
  research_project_id: string;
};

const BLANK_FORM: GroupForm = {
  group_id: "", name: "", description: "", publisher_org_id: "",
  brand_org_id: "", agency_org_id: "", topic: "", study_type: "custom",
  status: "draft", rotation: "equal",
  start_date: "", end_date: "", campaign_ids: [],
  research_project_id: "",
};

// Reads the ?project=&create=1&edit=&search=&returnTo= deep link a
// Research Project / Product Walkthrough's Campaign Groups card navigates
// here with — isolated in its own component so only this leaf needs the
// useSearchParams() Suspense boundary, not the whole page (same pattern as
// app/campaigns/page.tsx's CampaignLinkReader). returnTo carries the
// Workspace URL to send the admin back to once they're done in the
// drawer, so Save/Cancel don't strand them on this standalone page.
// search seeds the existing search box — "Get Tags" on a group card has
// nowhere else to point (the embed code lives in each group's own list
// row, not a per-group route), so without this a project with many
// groups just dumps the admin on the full unfiltered list.
function CampaignGroupLinkReader({
  onProject, onAutoCreate, onEditGroupId, onReturnTo, onSearchTerm,
}: {
  onProject: (projectId: string | null) => void;
  onAutoCreate: (autoCreate: boolean) => void;
  onEditGroupId: (groupId: string | null) => void;
  onReturnTo: (returnTo: string | null) => void;
  onSearchTerm: (search: string | null) => void;
}) {
  const searchParams = useSearchParams();
  const project = searchParams.get("project");
  const autoCreate = searchParams.get("create") === "1";
  const editGroupId = searchParams.get("edit");
  const returnTo = searchParams.get("returnTo");
  const searchTerm = searchParams.get("search");
  useEffect(() => { onProject(project); }, [project, onProject]);
  useEffect(() => { onAutoCreate(autoCreate); }, [autoCreate, onAutoCreate]);
  useEffect(() => { onEditGroupId(editGroupId); }, [editGroupId, onEditGroupId]);
  useEffect(() => { onReturnTo(returnTo); }, [returnTo, onReturnTo]);
  useEffect(() => { onSearchTerm(searchTerm); }, [searchTerm, onSearchTerm]);
  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CampaignGroupsPage() {
  const { user } = useSession();
  const router = useRouter();
  // Read-only visitors (brand/agency, via the project access cascade —
  // migration 096) can reach this page now that GET allows their roles;
  // create/edit/delete stay admin/publisher only, matching the API.
  const canManage = user?.role === "admin" || user?.role === "publisher";
  const [deepLinkProjectId, setDeepLinkProjectId] = useState<string | null>(null);
  const [autoCreate, setAutoCreate] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [deepLinkSearchTerm, setDeepLinkSearchTerm] = useState<string | null>(null);
  const editGroupFired = useRef(false);
  const searchTermApplied = useRef(false);

  const [groups,   setGroups]   = useState<CampaignGroup[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [researchProjects, setResearchProjects] = useState<ResearchProjectOption[]>([]);
  const [orgs,     setOrgs]     = useState<{ id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" }[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [activeTab, setActiveTab] = useState<"active" | "closed" | "archived">("active");

  const [search,          setSearch]          = useState("");
  const [statusFilter,    setStatusFilter]    = useState<"all" | CampaignGroup["status"]>("all");
  const [usageFilter,     setUsageFilter]     = useState<"all" | "no_responses" | "has_responses" | "end_reached">("all");
  const [dateFilter,      setDateFilter]      = useState<"all" | "today" | "7days" | "30days">("all");
  const [publisherFilter, setPublisherFilter] = useState<string>("all");
  const [brandFilter,     setBrandFilter]     = useState<string>("all");
  const [sortBy,          setSortBy]          = useState<"recent" | "oldest" | "az">("recent");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [form,       setForm]       = useState<GroupForm>(BLANK_FORM);
  const [lockProject, setLockProject] = useState(false);
  const [wasUnscopedAtOpen, setWasUnscopedAtOpen] = useState(false);
  const [wasWeightedAtOpen, setWasWeightedAtOpen] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);
  const [copied,     setCopied]     = useState<string | null>(null);

  // Campaigns eligible for the picker, fetched per Research Project the
  // moment it's selected in the form — a project-scoped group's picker
  // must only ever offer that project's own campaigns (migration 096), not
  // the platform-wide list every other lookup on this page still uses.
  const [projectCampaignsCache, setProjectCampaignsCache] = useState<Record<string, CampaignOption[]>>({});
  const fetchedProjectIds = useRef(new Set<string>());

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [grpRes, camRes, orgRes, projRes] = await Promise.all([
      fetch("/api/campaign-groups"),
      fetch("/api/campaigns"),
      fetch("/api/organisations"),
      fetch("/api/research-projects"),
    ]);
    setGroups((await grpRes.json()).data ?? []);
    setCampaigns((await camRes.json()).data ?? []);
    setOrgs((await orgRes.json()).data ?? []);
    setResearchProjects((await projRes.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const pid = form.research_project_id;
    if (!pid || fetchedProjectIds.current.has(pid)) return;
    fetchedProjectIds.current.add(pid);
    fetch(`/api/campaigns?research_project_id=${pid}`)
      .then(r => r.json())
      .then(json => setProjectCampaignsCache(prev => ({ ...prev, [pid]: json.data ?? [] })));
  }, [form.research_project_id]);

  const autoCreateFired = useRef(false);

  const publisherOrgs = useMemo(() => {
    const all = orgs.filter(o => o.type === "publisher");
    return user?.role === "publisher" ? all.filter(o => o.id === user.organisationId) : all;
  }, [orgs, user?.role, user?.organisationId]);
  const brandOrgs      = useMemo(() => orgs.filter(o => o.type === "brand"), [orgs]);
  const agencyOrgs      = useMemo(() => orgs.filter(o => o.type === "agency"), [orgs]);
  const orgById = useMemo(() => new Map(orgs.map(o => [o.id, o])), [orgs]);
  const orgName = useCallback((id: string | null) => (id ? orgById.get(id)?.name ?? "" : ""), [orgById]);

  // Tab buckets
  const activeGroups   = useMemo(() => groups.filter(g => !["closed", "archived"].includes(g.status)), [groups]);
  const closedGroups   = useMemo(() => groups.filter(g => g.status === "closed"),   [groups]);
  const archivedGroups = useMemo(() => groups.filter(g => g.status === "archived"), [groups]);

  // Option lists for the Publisher/Brand filters — derived from all loaded groups.
  const publisherFilterOptions = useMemo(() =>
    Array.from(new Set(groups.map(g => g.publisher_org_id).filter((p): p is string => !!p)))
      .map(id => ({ id, name: orgName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [groups, orgName]);

  const brandFilterOptions = useMemo(() =>
    Array.from(new Set(groups.map(g => g.brand_org_id).filter((b): b is string => !!b)))
      .map(id => ({ id, name: orgName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [groups, orgName]);

  const displayed = useMemo(() => {
    let list =
      activeTab === "active"   ? activeGroups   :
      activeTab === "closed"   ? closedGroups   :
      archivedGroups;

    if (activeTab === "active" && statusFilter !== "all") {
      list = list.filter(g => g.status === statusFilter);
    }

    if (usageFilter === "no_responses")  list = list.filter(g => g.total_responses === 0);
    if (usageFilter === "has_responses") list = list.filter(g => g.total_responses > 0);
    if (usageFilter === "end_reached") {
      const now = new Date();
      list = list.filter(g => g.end_date && new Date(g.end_date) < now);
    }

    const now = new Date();
    if (dateFilter === "today") {
      list = list.filter(g => new Date(g.created_at).toDateString() === now.toDateString());
    } else if (dateFilter === "7days") {
      const cut = new Date(now); cut.setDate(cut.getDate() - 7);
      list = list.filter(g => new Date(g.created_at) >= cut);
    } else if (dateFilter === "30days") {
      const cut = new Date(now); cut.setDate(cut.getDate() - 30);
      list = list.filter(g => new Date(g.created_at) >= cut);
    }

    if (publisherFilter !== "all") list = list.filter(g => g.publisher_org_id === publisherFilter);
    if (brandFilter !== "all")     list = list.filter(g => g.brand_org_id === brandFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.group_id.toLowerCase().includes(q) ||
        (g.description ?? "").toLowerCase().includes(q) ||
        orgName(g.brand_org_id).toLowerCase().includes(q) ||
        (g.topic ?? "").toLowerCase().includes(q) ||
        orgName(g.publisher_org_id).toLowerCase().includes(q)
      );
    }

    switch (sortBy) {
      case "recent": return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "oldest": return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "az":     return [...list].sort((a, b) => a.name.localeCompare(b.name));
      default:       return list;
    }
  }, [activeGroups, closedGroups, archivedGroups, activeTab, statusFilter, usageFilter, dateFilter, publisherFilter, brandFilter, sortBy, search, orgName]);

  // Eligible campaigns for the selector (not deleted, not archived/closed).
  // Platform-wide fallback — only ever used while editing a genuinely
  // legacy, still-unscoped group (research_project_id null); every
  // project-scoped group's picker uses projectCampaignsCache instead.
  const selectableCampaigns = useMemo(() =>
    campaigns.filter(c => !["archived", "closed"].includes(c.effective_status ?? c.status)),
  [campaigns]);

  const pickerOptions = useMemo(() => {
    const pid = form.research_project_id;
    const source = pid ? (projectCampaignsCache[pid] ?? []) : selectableCampaigns;
    return source.filter(c => !["archived", "closed"].includes(c.effective_status ?? c.status));
  }, [form.research_project_id, projectCampaignsCache, selectableCampaigns]);

  // Merges the platform-wide list with every project-scoped fetch this
  // session has made — so CSV export and any other name lookup can still
  // resolve a campaign that only ever appeared in a project-scoped fetch
  // (e.g. a Product Walkthrough's simulated campaigns, which the
  // unfiltered /api/campaigns call excludes by design).
  const campaignById = useMemo(() => {
    const map = new Map<string, CampaignOption>(campaigns.map(c => [c.id, c]));
    for (const list of Object.values(projectCampaignsCache)) {
      for (const c of list) map.set(c.id, c);
    }
    return map;
  }, [campaigns, projectCampaignsCache]);

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    const isPublisher = user?.role === "publisher";
    setForm({
      ...BLANK_FORM,
      publisher_org_id: isPublisher ? (user?.organisationId ?? "") : "",
      research_project_id: deepLinkProjectId ?? "",
    });
    setLockProject(!!deepLinkProjectId);
    setWasUnscopedAtOpen(false);
    setWasWeightedAtOpen(false);
    setError("");
    setDrawerOpen(true);
  }

  async function openEdit(g: CampaignGroup) {
    setEditingId(g.id);
    setForm({
      group_id:       g.group_id,
      name:           g.name,
      description:    g.description ?? "",
      publisher_org_id: g.publisher_org_id ?? "",
      brand_org_id:   g.brand_org_id ?? "",
      agency_org_id:  g.agency_org_id ?? "",
      topic:          g.topic ?? "",
      study_type:     g.study_type ?? "custom",
      status:         g.status,
      rotation:       g.rotation,
      start_date:     g.start_date ?? "",
      end_date:       g.end_date ?? "",
      campaign_ids:   g.campaign_ids,
      research_project_id: g.research_project_id ?? "",
    });
    setLockProject(false);
    setWasUnscopedAtOpen(!g.research_project_id);
    setWasWeightedAtOpen(g.rotation === "weighted");
    setError("");
    setDrawerOpen(true);
  }

  useEffect(() => {
    if (autoCreate && canManage && !loading && !autoCreateFired.current) {
      autoCreateFired.current = true;
      openCreate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate, loading]);

  useEffect(() => {
    if (editGroupId && canManage && !loading && !editGroupFired.current) {
      const g = groups.find(x => x.id === editGroupId);
      if (g) {
        editGroupFired.current = true;
        openEdit(g);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editGroupId, loading, groups]);

  // Seeds the search box from a "Get Tags" deep link — applied once, same
  // "don't fight a later manual change" guard as autoCreate/editGroupId
  // above. Without this, a project with many groups (or a platform with
  // many projects' groups mixed in) lands the admin on the full unfiltered
  // list with no way to tell which card is theirs.
  useEffect(() => {
    if (deepLinkSearchTerm && !searchTermApplied.current) {
      searchTermApplied.current = true;
      setSearch(deepLinkSearchTerm);
    }
  }, [deepLinkSearchTerm]);

  // Sends the admin back to the Research Project / Product Walkthrough
  // Workspace they deep-linked in from, instead of stranding them on this
  // standalone page — only when returnTo is present (i.e. they arrived via
  // the Workspace's Campaign Groups card), never for a normal page visit.
  function closeDrawer() {
    setDrawerOpen(false);
    if (returnTo) router.push(`${returnTo}#campaign-groups`);
  }

  function autoSlug() {
    setForm(f => {
      const studyType = studyTypeLabel(f.study_type);
      const brandName = orgName(f.brand_org_id || null);
      const agencyName = orgName(f.agency_org_id || null);
      const name = generateStudyName(f.topic, studyType, brandName, agencyName);
      const slug = generateStudySlug(f.topic, studyType, brandName, agencyName);
      return {
        ...f,
        name:     name || f.name,
        group_id: slug || generateGroupId(f.name, orgName(f.publisher_org_id || null)),
      };
    });
  }

  async function handleSave() {
    if (!form.name.trim())     { setError("Group name is required.");   return; }
    if (!form.group_id.trim()) { setError("Group slug is required.");   return; }
    if (!form.publisher_org_id) { setError("Publisher is required.");   return; }
    // Every new group must be project-scoped; an existing group that was
    // already scoped can't be reverted to unscoped either — only a group
    // that was genuinely unscoped when this drawer opened may stay that way.
    if (!form.research_project_id && !wasUnscopedAtOpen) { setError("Research Project is required."); return; }
    setError(""); setSaving(true);

    const payload = {
      group_id:     form.group_id.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
      name:         form.name,
      description:  form.description || null,
      publisher_org_id: form.publisher_org_id || null,
      brand_org_id: form.brand_org_id || null,
      agency_org_id: form.agency_org_id || null,
      topic:        form.topic || null,
      study_type:   form.study_type,
      status:       form.status,
      rotation:     form.rotation,
      start_date:   form.start_date || null,
      end_date:     form.end_date   || null,
      campaign_ids: form.campaign_ids,
      research_project_id: form.research_project_id || null,
    };

    const url    = editingId ? `/api/campaign-groups/${editingId}` : "/api/campaign-groups";
    const method = editingId ? "PUT" : "POST";
    const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json   = await res.json();
    setSaving(false);

    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
    setDrawerOpen(false);
    if (returnTo) { router.push(`${returnTo}#campaign-groups`); return; }
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
        .map(id => campaignById.get(id))
        .filter(Boolean)
        .map(c => `${c!.campaign_name} (${orgName(c!.brand_org_id)})`)
        .join("; ");
      return {
        "Group Name":       g.name,
        "Research Project": g.research_project_name ?? "Unscoped",
        "Slug":             g.group_id,
        "Description":      g.description ?? "",
        "Topic":            g.topic ?? "",
        "Brand":            orgName(g.brand_org_id),
        "Agency":           orgName(g.agency_org_id),
        "Type":             studyTypeLabel(g.study_type),
        "Publisher":        orgName(g.publisher_org_id),
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
      <Suspense fallback={null}>
        <CampaignGroupLinkReader
          onProject={setDeepLinkProjectId}
          onAutoCreate={setAutoCreate}
          onEditGroupId={setEditGroupId}
          onReturnTo={setReturnTo}
          onSearchTerm={setDeepLinkSearchTerm}
        />
      </Suspense>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

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
              {canManage && (
                <button onClick={openCreate}
                  className="text-sm font-semibold px-4 py-2 rounded-lg"
                  style={{ background: GOLD, color: NAVY }}>
                  + Create Group
                </button>
              )}
            </div>
          </div>
          <details className="group bg-gray-50 w-full">
            <summary className="cursor-pointer select-none list-none py-3">
              <p className="text-sm text-gray-500 leading-relaxed">
                Bundle multiple campaigns into one embed code. Useful when several surveys or campaign
                variants need to rotate across the same publisher placement.{" "}
                <span className="font-semibold inline-flex items-center gap-1" style={{ color: GOLD }}>
                  Expand to find out more
                  <span className="inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </p>
            </summary>
            <div className="pb-4 pt-3 mt-1 border-t border-gray-200 text-sm text-gray-600 leading-relaxed space-y-4">
              <div>
                <p className="font-semibold text-gray-700 mb-1">When to use a Campaign Group</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>You want to run multiple surveys on the same publisher placement at the same time</li>
                  <li>You want to rotate between surveys without asking the publisher to update their embed code</li>
                  <li>You want a fallback ready if one campaign pauses or closes mid-flight</li>
                  <li>You want to run one survey across multiple publishers, one campaign per publisher, grouped together</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">How rotation works</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Equal</strong>: every eligible campaign has the same chance each time the embed loads. The default, and right for most cases.</li>
                  <li><strong>Weighted</strong>: campaigns with a higher weight value get served more often.</li>
                  <li><strong>Priority</strong>: the eligible campaign with the lowest priority number always serves first, others only kick in as backups.</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">What makes a campaign eligible to serve</p>
                <p className="mb-1">Every time the embed loads, Fanometrix checks each campaign in the group:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>The group itself must be Live and within its date range</li>
                  <li>The campaign must be Live and within its own start/end dates</li>
                  <li>The campaign must not have already reached its target response count</li>
                  <li>The campaign&apos;s survey must exist, not be deleted, and pass validation</li>
                </ul>
                <p className="mt-1 text-gray-500">If nothing in the group is eligible, the embed just renders blank, publishers see an empty ad slot, not an error.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Getting the most from it</p>
                <p>Copy the embed code directly from the group card, the publisher only needs to add it once. From there, you can add or remove campaigns, change the rotation type, weights, or priority, or pause the whole group at any time, without asking the publisher to touch anything.</p>
              </div>
              <a href="/fanometrix-guide" target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: NAVY }}>
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
              placeholder="Search groups…"
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
                <option value="live">Live</option>
                <option value="paused">Paused</option>
              </select>
            )}

            <select value={usageFilter} onChange={e => setUsageFilter(e.target.value as typeof usageFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Usage</option>
              <option value="no_responses">No responses</option>
              <option value="has_responses">Has responses</option>
              <option value="end_reached">End date reached</option>
            </select>

            <select value={dateFilter} onChange={e => setDateFilter(e.target.value as typeof dateFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">Any time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 days</option>
              <option value="30days">Last 30 days</option>
            </select>

            <select value={publisherFilter} onChange={e => setPublisherFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Publishers</option>
              {publisherFilterOptions.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Brands</option>
              {brandFilterOptions.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest first</option>
              <option value="az">A–Z</option>
            </select>
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
                {g.research_project_name ? (
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{g.research_project_name}</span>
                ) : (
                  <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Unscoped — needs review</span>
                )}
                {orgName(g.publisher_org_id) && (
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{orgName(g.publisher_org_id)}</span>
                )}
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{ROTATION_LABELS[g.rotation]}</span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-400 mb-3">
                <span>{g.member_count} campaign{g.member_count !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{g.survey_count} survey{g.survey_count !== 1 ? "s" : ""}</span>
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

              {/* Actions — brand/agency can see groups belonging to a project
                  they have access to (migration 096's visibility cascade),
                  but editing stays admin/publisher only, same as before. */}
              {canManage && (
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
              )}
            </div>
          ))}
        </div>

      </div>

      {/* ── Create / Edit Drawer ──────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} />
          <div className="w-full sm:w-[520px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editingId ? "Edit Group" : "Create Group"}</h2>
              <button onClick={closeDrawer} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              <DrawerSection step={1} title="Campaign Group Identity" subtitle="Name, slug, and description for this group.">
                <NameBuilder
                  topic={form.topic}
                  onTopicChange={v => setForm(f => ({ ...f, topic: v }))}
                  brandOrgId={form.brand_org_id}
                  onBrandChange={v => setForm(f => ({ ...f, brand_org_id: v }))}
                  brandOptions={brandOrgs}
                  agencyOrgId={form.agency_org_id}
                  onAgencyChange={v => setForm(f => ({ ...f, agency_org_id: v }))}
                  agencyOptions={agencyOrgs}
                  studyType={form.study_type}
                  onStudyTypeChange={v => setForm(f => ({ ...f, study_type: v }))}
                  onAutoGenerate={autoSlug}
                  preview={generateStudyName(
                    form.topic, studyTypeLabel(form.study_type),
                    orgName(form.brand_org_id || null), orgName(form.agency_org_id || null)
                  )}
                />

                <Field label="Group Name *">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className={INP} placeholder="Carlsberg | Fan Understanding | Global | 2026" />
                </Field>

                <Field label="Group Slug *">
                  <div className="flex gap-2">
                    <input value={form.group_id}
                      onChange={e => setForm(f => ({ ...f, group_id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
                      className={`flex-1 ${INP} font-mono`} placeholder="carlsberg_wave1_fotmob" />
                    <button onClick={autoSlug} className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 rounded-lg">Auto</button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Used in embed URLs: /embed?group=<em>slug</em></p>
                </Field>

                <Field label="Description">
                  <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    className={INP} placeholder="Optional" />
                </Field>
              </DrawerSection>

              <DrawerSection step={2} title="Publisher &amp; Schedule" subtitle="Who this group serves, and when.">
                <Field label="Research Project *">
                  <select
                    value={form.research_project_id}
                    onChange={e => {
                      const value = e.target.value;
                      setForm(f => ({ ...f, research_project_id: value, campaign_ids: value === f.research_project_id ? f.campaign_ids : [] }));
                    }}
                    disabled={lockProject}
                    className={`${INP} ${lockProject ? "bg-gray-50 text-gray-500" : ""}`}
                  >
                    <option value="">{wasUnscopedAtOpen ? "Unscoped (legacy) — leave as-is or assign one" : "Select Research Project"}</option>
                    {researchProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {(p.topic || p.project_name)}{p.research_mode === "simulated" ? " (Product Walkthrough)" : ""}
                      </option>
                    ))}
                  </select>
                  {lockProject && (
                    <p className="text-xs text-gray-400 mt-1">Locked — opened from within this Research Project.</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Every campaign added below must belong to this same Research Project — campaigns from other projects or clients can&apos;t be mixed in.
                  </p>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Publisher *">
                    <select
                      value={form.publisher_org_id}
                      onChange={e => setForm(f => ({ ...f, publisher_org_id: e.target.value }))}
                      disabled={user?.role === "publisher"}
                      className={`${INP} ${user?.role === "publisher" ? "bg-gray-50 text-gray-500" : ""}`}
                    >
                      <option value="">Select publisher</option>
                      {publisherOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    {user?.role === "publisher" && (
                      <p className="text-xs text-gray-400 mt-1">Locked to your organisation.</p>
                    )}
                  </Field>
                  <Field label="Status">
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as CampaignGroup["status"] }))}
                      className={INP}>
                      {(["draft","live","paused","closed","archived"] as const).map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Date">
                    <input type="date" value={form.start_date}
                      onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                      className={INP} />
                  </Field>
                  <Field label="End Date">
                    <input type="date" value={form.end_date}
                      min={form.start_date || undefined}
                      onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                      className={INP} />
                  </Field>
                </div>
              </DrawerSection>

              <DrawerSection step={3} title="Rotation &amp; Campaigns" subtitle="How campaigns are chosen, and which ones are in this group." prominent>
                <Field label="Rotation Type">
                  <select value={form.rotation} onChange={e => setForm(f => ({ ...f, rotation: e.target.value as CampaignGroup["rotation"] }))}
                    className={INP}>
                    <option value="equal">Equal, random from eligible campaigns</option>
                    {wasWeightedAtOpen && <option value="weighted">Weighted, random proportional to weight</option>}
                    <option value="priority">Priority, highest-priority eligible campaign first</option>
                  </select>
                  {form.rotation === "weighted" ? (
                    <p className="text-xs text-amber-600 mt-1">
                      Per-campaign weight editing doesn&apos;t exist yet — every member currently rotates as if equally weighted. Kept as-is since this group already used it; switch to Equal or Priority for predictable behaviour.
                    </p>
                  ) : (
                    !wasWeightedAtOpen && (
                      <p className="text-xs text-gray-400 mt-1">Weighted is hidden until real per-campaign weight controls exist.</p>
                    )
                  )}
                </Field>

                <Field label={form.rotation === "priority" ? "Campaigns in Group, in serve order" : "Campaigns in Group"}>
                  <CampaignSelector
                    options={pickerOptions}
                    selected={form.campaign_ids}
                    onChange={ids => setForm(f => ({ ...f, campaign_ids: ids }))}
                    orgName={orgName}
                    disabledHint={!form.research_project_id ? "Select a Research Project above first." : undefined}
                  />
                  {form.rotation === "priority" && (
                    <PriorityOrderEditor
                      campaignIds={form.campaign_ids}
                      options={pickerOptions}
                      onChange={ids => setForm(f => ({ ...f, campaign_ids: ids }))}
                      orgName={orgName}
                    />
                  )}
                  <p className="text-xs text-gray-400 mt-1.5">
                    Only live campaigns within their date range and below target will be served. Others are skipped at embed time.
                  </p>
                </Field>
              </DrawerSection>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeDrawer} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={LBL}>{label}</label>
      {children}
    </div>
  );
}
