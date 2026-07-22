"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { ResearchProjectEditDrawer, type ResearchProjectBriefFields } from "@/app/components/research-projects/ResearchProjectEditDrawer";
import { STATUS_META, type CampaignStatus } from "@/lib/campaign-status";
import { computeProjectStatus, PROJECT_STATUS_META, type ProjectStatus } from "@/lib/research-project-status";
import { studyTypeLabel } from "@/lib/naming";
import { countryByCode } from "@/lib/countries";
import { getCompletedLanguages, type LocalisedQuestion, type LocalisedText, type LangCode } from "@/lib/survey-locale";
import { expectedSurveyLanguage, LANGUAGE_DISPLAY_NAMES } from "@/lib/locales";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { researchSubjectLabel } from "@/lib/research-subjects";

// ─── Types ────────────────────────────────────────────────────────────────────
type ResearchProject = {
  id: string;
  project_id: string;
  project_name: string;
  research_question: string | null;
  objective: string | null;
  research_subject: string | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
  study_type: string;
  topic: string | null;
  tags: string[];
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  survey_id: string | null;
  target_responses: number | null;
  archive_after_days: number | null;
  creative_design: string | null;
  status: string;
  publisher_org_ids: string[];
  country_codes: string[];
  confidentiality: string | null;
  version: string | null;
  completed_at: string | null;
  archived_at: string | null;
  target_reached_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  deployment_count: number;
  total_responses: number;
  completion_pct: number | null;
  last_response_at: string | null;
  has_active_campaign: boolean;
};

type Survey = {
  id: string;
  name: string;
  status: string;
  is_template: boolean;
  created_at: string;
  questions?: LocalisedQuestion[];
  thank_you_title?: LocalisedText;
  thank_you_body?: LocalisedText;
};

type Deployment = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  publisher_org_id: string | null;
  country_code: string | null;
  market: string | null;
  status: string;
  effective_status: CampaignStatus;
  response_count: number;
  effective_target_responses: number | null;
  effective_survey_id: string | null;
};

const PAGE_SIZE = 25;

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const m = PROJECT_STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${m.bg} ${m.text}`}>
      <span className="text-[9px]">{m.dot}</span>{m.label}
    </span>
  );
}

function DeploymentStatusBadge({ status }: { status: CampaignStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${m.bg} ${m.text}`}>
      <span className="text-[9px]">{m.dot}</span>{m.label}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="text-xs text-gray-500">
      {label}: <span className="font-semibold text-gray-800">{value}</span>
    </span>
  );
}

/** Null when the deployment's effective survey fully covers its country's expected language. */
function deploymentLanguageWarning(d: Deployment, surveys: Survey[]): string | null {
  if (!d.effective_survey_id || !d.country_code) return null;
  const survey = surveys.find(s => s.id === d.effective_survey_id);
  if (!survey) return null;
  const lang = expectedSurveyLanguage(d.country_code);
  const completed = getCompletedLanguages({ questions: survey.questions ?? [], thank_you_title: survey.thank_you_title, thank_you_body: survey.thank_you_body });
  if (completed.includes(lang as LangCode)) return null;
  const label = LANGUAGE_DISPLAY_NAMES[lang] ?? lang;
  return `Missing ${label} survey localisation for ${d.country_code}`;
}

// ─── Read-only deployments list (expand panel) ─────────────────────────────────
function DeploymentsList({ project, surveys, refreshToken, orgName }: { project: ResearchProject; surveys: Survey[]; refreshToken: number; orgName: (id: string | null) => string }) {
  const [deployments, setDeployments] = useState<Deployment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/campaigns?research_project_id=${project.id}`);
    const json = await res.json();
    setDeployments(json.data ?? []);
    setLoading(false);
  }, [project.id]);

  useEffect(() => { load(); }, [load, refreshToken]);

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Deployments {deployments ? `(${deployments.length})` : ""}
      </p>
      {loading && <p className="text-xs text-gray-400">Loading…</p>}
      {!loading && deployments && deployments.length === 0 && (
        <p className="text-xs text-gray-400">No deployments yet, generate them from this project&apos;s Workspace.</p>
      )}
      {!loading && deployments && deployments.length > 0 && (
        <div className="space-y-2">
          {deployments.slice(0, visibleCount).map(d => {
            const languageWarning = deploymentLanguageWarning(d, surveys);
            return (
              <div key={d.id} className="bg-white border border-gray-100 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{d.campaign_name}</p>
                  <p className="text-xs font-mono text-gray-400">{d.campaign_id}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {d.country_code && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{d.country_code}</span>}
                    {orgName(d.publisher_org_id) && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{orgName(d.publisher_org_id)}</span>}
                  </div>
                  {languageWarning && (
                    <p className="text-xs text-amber-600 mt-1" title="Add the missing translation to the survey in Surveys, or override this deployment's survey in Campaigns.">
                      ⚠ {languageWarning}
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <DeploymentStatusBadge status={(d.effective_status ?? d.status) as CampaignStatus} />
                  <p className="text-xs text-gray-400 mt-1">
                    {d.response_count.toLocaleString()}{d.effective_target_responses ? ` / ${d.effective_target_responses.toLocaleString()}` : ""} responses
                  </p>
                  {languageWarning && (
                    <Link href="/campaigns" className="text-xs underline text-amber-700 block mt-1">
                      Override survey →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          {deployments.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
              className="text-xs text-[#0B1929] font-medium underline"
            >
              Load more ({deployments.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ResearchProjectsPage() {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  // Publishers can create and manage their own Research Projects — anything
  // an admin sets up is already fully hidden from them (see lib/access.ts),
  // so any project a publisher can see here is guaranteed to be their own.
  const canManage = isAdmin || user?.role === "publisher";

  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [orgs, setOrgs] = useState<{ id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter,    setStatusFilter]    = useState<"all" | ProjectStatus>("all");
  const [usageFilter,     setUsageFilter]     = useState<"all" | "no_responses" | "has_responses" | "target_reached" | "end_reached">("all");
  const [dateFilter,      setDateFilter]      = useState<"all" | "today" | "7days" | "30days">("all");
  const [countryFilter,   setCountryFilter]   = useState<string>("all");
  const [publisherFilter, setPublisherFilter] = useState<string>("all");
  const [brandFilter,     setBrandFilter]     = useState<string>("all");
  const [sortBy,          setSortBy]          = useState<"recent" | "oldest" | "az">("recent");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [editingProject, setEditingProject] = useState<Partial<ResearchProjectBriefFields> | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [projRes, surRes, orgRes] = await Promise.all([
      // Demo Projects live in their own area, never mixed into the real
      // Research Projects list — explicit filter, not a default that
      // could silently start including simulated rows.
      fetch("/api/research-projects?research_mode=real"),
      fetch("/api/surveys"),
      fetch("/api/organisations"),
    ]);
    setProjects((await projRes.json()).data ?? []);
    setSurveys((await surRes.json()).data ?? []);
    setOrgs((await orgRes.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const orgBrands      = useMemo(() => orgs.filter(o => o.type === "brand"), [orgs]);
  const orgAgencies      = useMemo(() => orgs.filter(o => o.type === "agency"), [orgs]);
  const orgById = useMemo(() => new Map(orgs.map(o => [o.id, o])), [orgs]);
  const orgName = useCallback((id: string | null) => (id ? orgById.get(id)?.name ?? "" : ""), [orgById]);

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) for (const t of p.tags ?? []) set.add(t);
    return Array.from(set).sort();
  }, [projects]);

  // Most-reused tags across all projects — surfaced as one-click suggestions so
  // similar studies converge on the same tag instead of near-duplicate variants
  // (e.g. "wwc" / "womens world cup" / "Women's World Cup").
  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of projects) for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [projects]);

  // Option lists for the Country/Publisher/Brand filters — derived from all
  // loaded projects so the dropdowns stay stable across filter changes.
  const countryFilterOptions = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const p of projects) {
      for (const code of p.country_codes ?? []) {
        if (!byCode.has(code)) byCode.set(code, countryByCode(code)?.name ?? code);
      }
    }
    return Array.from(byCode.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [projects]);

  const publisherFilterOptions = useMemo(() =>
    Array.from(new Set(projects.flatMap(p => p.publisher_org_ids ?? [])))
      .map(id => ({ id, name: orgName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projects, orgName]);

  const brandFilterOptions = useMemo(() =>
    Array.from(new Set(projects.map(p => p.brand_org_id).filter((b): b is string => !!b)))
      .map(id => ({ id, name: orgName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projects, orgName]);

  const displayed = useMemo(() => {
    let list = projects;

    if (statusFilter !== "all") list = list.filter(p => computeProjectStatus(p, p.has_active_campaign) === statusFilter);

    if (usageFilter === "no_responses")   list = list.filter(p => p.total_responses === 0);
    if (usageFilter === "has_responses")  list = list.filter(p => p.total_responses > 0);
    if (usageFilter === "target_reached") list = list.filter(p =>
      p.target_responses !== null && p.total_responses >= p.target_responses);
    if (usageFilter === "end_reached") {
      const now = new Date();
      list = list.filter(p => p.end_date && new Date(p.end_date) < now);
    }

    const now = new Date();
    if (dateFilter === "today") {
      list = list.filter(p => new Date(p.created_at).toDateString() === now.toDateString());
    } else if (dateFilter === "7days") {
      const cut = new Date(now); cut.setDate(cut.getDate() - 7);
      list = list.filter(p => new Date(p.created_at) >= cut);
    } else if (dateFilter === "30days") {
      const cut = new Date(now); cut.setDate(cut.getDate() - 30);
      list = list.filter(p => new Date(p.created_at) >= cut);
    }

    if (countryFilter !== "all")   list = list.filter(p => (p.country_codes ?? []).includes(countryFilter));
    if (publisherFilter !== "all") list = list.filter(p => (p.publisher_org_ids ?? []).includes(publisherFilter));
    if (brandFilter !== "all")     list = list.filter(p => p.brand_org_id === brandFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.project_name.toLowerCase().includes(q) ||
        orgName(p.brand_org_id).toLowerCase().includes(q) ||
        (p.topic ?? "").toLowerCase().includes(q) ||
        studyTypeLabel(p.study_type).toLowerCase().includes(q)
      );
    }

    switch (sortBy) {
      case "recent": return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "oldest": return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "az":     return [...list].sort((a, b) => a.project_name.localeCompare(b.project_name));
      default:       return list;
    }
  }, [projects, search, statusFilter, usageFilter, dateFilter, countryFilter, publisherFilter, brandFilter, sortBy, orgName]);

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  function openEdit(p: ResearchProject) {
    setEditingProject({
      id: p.id, project_id: p.project_id,
      topic: p.topic, research_question: p.research_question, research_subject: p.research_subject,
      brand_org_id: p.brand_org_id, agency_org_id: p.agency_org_id, study_type: p.study_type,
      objective: p.objective, tags: p.tags,
    });
  }

  function handleSaved(wasNew: boolean) {
    setEditingProject(null);
    showToast(wasNew ? "Research project created." : "Research project updated.");
    load();
  }

  async function handleDelete(p: ResearchProject, force = false) {
    if (!force && !confirm(`Move "${p.project_name}" to deleted items?`)) return;
    const res = await fetch(`/api/research-projects/${p.id}${force ? "?force=true" : ""}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      // A live-survey block is a HARD restriction — never offer "delete anyway".
      // Only the soft deployment-confirm 409 may be forced.
      if (res.status === 409 && json.code !== "live_surveys" && confirm(`${json.error} Delete anyway?`)) {
        handleDelete(p, true);
      } else {
        showToast(json.error ?? "Could not delete project.", false);
      }
      return;
    }
    showToast("Research project deleted.");
    load();
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Research Projects</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
              </p>
            </div>
            {canManage && (
              <Link href="/research-projects/new"
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                New Engagement
              </Link>
            )}
          </div>
          <details className="group bg-gray-50 w-full">
            <summary className="cursor-pointer select-none list-none py-3">
              <p className="text-sm text-gray-500 leading-relaxed">
                Start with the research question you&apos;re trying to answer, everything else, from evidence to deployment, happens inside the project&apos;s Workspace.{" "}
                <span className="font-semibold inline-flex items-center gap-1" style={{ color: "#D7B87A" }}>
                  Expand to find out more
                  <span className="inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </p>
            </summary>
            <div className="pb-4 pt-3 mt-1 border-t border-gray-200 text-sm text-gray-600 leading-relaxed space-y-4">
              <div>
                <p className="font-semibold text-gray-700 mb-1">What a Research Project is</p>
                <p>It&apos;s the container for a piece of research, a research question, who it&apos;s for, and what &quot;done&quot; looks like. Evidence (surveys and, eventually, other sources), AI Intelligence, Reports and Knowledge all build up inside it over time.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Setting one up</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Click + Create Research Project and write the research question this project exists to answer</li>
                  <li>Classify it, Research Category, Research Type, Brand and Agency</li>
                  <li>Optionally add an Objective and Tags</li>
                  <li>Open the project&apos;s Workspace to add Evidence and set Project Information, that&apos;s where surveys, publishers, countries, the Research Target, and deployment generation all happen now</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Edit vs. the Workspace</p>
                <p><strong>Edit</strong> here changes the project&apos;s own research brief only, it never creates, deletes, or rewrites a campaign. Publishers, countries, survey selection, the Research Target and <strong>Generate Deployments</strong> all live inside <strong>Open Project</strong> now, alongside the evidence they belong to. A project&apos;s Status is never set manually, it reflects whether it has active campaigns, has reached its Research Target, or has been closed/archived.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Deleting a project</p>
                <p>Deleting a Research Project never deletes its campaigns, they carry on running exactly as they were. If any campaigns are still active, you&apos;ll be asked to confirm before the project is deleted.</p>
              </div>
              <a href="/fanometrix-guide" target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#0B1929" }}>
                Read the full Fanometrix Guide
                <span className="text-[10px] opacity-60">↗</span>
              </a>
            </div>
          </details>
        </div>

        <div className="mb-5 space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="search"
              placeholder="Search projects…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600">
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="complete">Complete</option>
              <option value="archived">Archived</option>
            </select>

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
              {countryFilterOptions.map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
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

        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && displayed.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">◎</p>
            <p className="font-medium">No research projects</p>
            {canManage && <p className="text-sm mt-1">Start a <Link href="/research-projects/new" className="font-semibold" style={{ color: "#B8935A" }}>New Engagement</Link> to get going.</p>}
          </div>
        )}

        <div className="space-y-3">
          {displayed.map(p => {
            const expanded = expandedId === p.id;
            const status = computeProjectStatus(p, p.has_active_campaign);

            return (
              <div key={p.id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                  className="w-full text-left p-5 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 truncate">{p.project_name}</p>
                      {p.research_question && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{p.research_question}</p>
                      )}
                    </div>
                    <ProjectStatusBadge status={status} />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {p.research_subject && (
                      <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{researchSubjectLabel(p.research_subject)}</span>
                    )}
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{studyTypeLabel(p.study_type)}</span>
                    {p.tags.length > 0 && (
                      <>
                        <span className="text-xs text-gray-400 ml-2">Tags:</span>
                        {p.tags.map(t => (
                          <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                    <Stat label="Evidence" value={p.survey_id ? 1 : 0} />
                    <Stat label="Last Updated" value={formatRelativeTime(p.last_response_at ?? p.updated_at)} />
                  </div>
                </button>

                <div className="px-5 pb-4 flex flex-wrap items-center gap-2 -mt-1">
                  <Link
                    href={`/research-projects/${p.id}`}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "#0B1929", color: "#D7B87A" }}
                  >
                    Open Project →
                  </Link>
                  {canManage && (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(p)}
                          className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                          Edit
                        </button>
                        <InfoTooltip text="Changes this project's own research brief only. It never creates, deletes, or renames campaigns, Evidence, Publishers, Countries, the Research Target, and Generate Deployments all live inside Open Project now." />
                      </span>
                      <button onClick={() => handleDelete(p)}
                        className="text-xs border border-red-100 text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                        Delete
                      </button>
                    </>
                  )}
                </div>

                {expanded && (
                  <DeploymentsList project={p} surveys={surveys} refreshToken={0} orgName={orgName} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editingProject && (
        <ResearchProjectEditDrawer
          initial={editingProject}
          orgBrands={orgBrands}
          orgAgencies={orgAgencies}
          orgName={orgName}
          existingTags={existingTags}
          popularTags={popularTags}
          onClose={() => setEditingProject(null)}
          onSaved={() => handleSaved(!editingProject.id)}
        />
      )}

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
