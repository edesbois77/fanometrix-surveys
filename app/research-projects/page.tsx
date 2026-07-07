"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { MultiSelect } from "@/app/components/MultiSelect";
import { CreativeDesignPicker } from "@/app/components/CreativeDesignPicker";
import { CreativeDesignPreview } from "@/app/components/CreativeDesignPreview";
import { DrawerSection } from "@/app/components/DrawerSection";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { STATUS_META, type CampaignStatus } from "@/lib/campaign-status";
import {
  studyTypeLabel,
  generateStudyName, generateStudySlug,
} from "@/lib/naming";
import { NameBuilder } from "@/app/components/NameBuilder";
import { countryOptions, countryByCode } from "@/lib/countries";
import { isSurveyValidForReady } from "@/lib/survey-validation";
import { getCompletedLanguages, type LocalisedQuestion, type LocalisedText, type LangCode } from "@/lib/survey-locale";
import { expectedSurveyLanguage, LANGUAGE_DISPLAY_NAMES } from "@/lib/locales";

// ─── Types ────────────────────────────────────────────────────────────────────
type ResearchProject = {
  id: string;
  project_id: string;
  project_name: string;
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
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  deployment_count: number;
  total_responses: number;
  completion_pct: number | null;
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

type GenerateResult = {
  created: Array<{ publisher: string; country: string; campaign_id: string }>;
  restored: Array<{ publisher: string; country: string; campaign_id: string }>;
  skipped_existing: Array<{ publisher: string; country: string }>;
  failed: Array<{ publisher: string; country: string; reason: string }>;
};

const PAGE_SIZE = 25;

const BLANK: Partial<ResearchProject> = {
  project_id: "", project_name: "", brand_org_id: null, agency_org_id: null, study_type: "fan_understanding",
  topic: "", tags: [], description: "",
  start_date: null, end_date: null, survey_id: null,
  target_responses: null, archive_after_days: null, creative_design: null, status: "draft",
  publisher_org_ids: [], country_codes: [],
};

function StatusBadge({ status }: { status: CampaignStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${m.bg} ${m.text}`}>
      <span className="text-[9px]">{m.dot}</span>{m.label}
    </span>
  );
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
        <p className="text-xs text-gray-400">No deployments yet. Use "Generate Deployments" above to create them.</p>
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
                  <StatusBadge status={(d.effective_status ?? d.status) as CampaignStatus} />
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
  const [statusFilter,    setStatusFilter]    = useState<"all" | CampaignStatus>("all");
  const [usageFilter,     setUsageFilter]     = useState<"all" | "no_responses" | "has_responses" | "target_reached" | "end_reached">("all");
  const [dateFilter,      setDateFilter]      = useState<"all" | "today" | "7days" | "30days">("all");
  const [countryFilter,   setCountryFilter]   = useState<string>("all");
  const [publisherFilter, setPublisherFilter] = useState<string>("all");
  const [brandFilter,     setBrandFilter]     = useState<string>("all");
  const [sortBy,          setSortBy]          = useState<"recent" | "oldest" | "az">("recent");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [generateResults, setGenerateResults] = useState<Record<string, GenerateResult>>({});
  const [refreshTokens, setRefreshTokens] = useState<Record<string, number>>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<ResearchProject>>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const [projRes, surRes, orgRes] = await Promise.all([
      fetch("/api/research-projects"),
      fetch("/api/surveys"),
      fetch("/api/organisations"),
    ]);
    setProjects((await projRes.json()).data ?? []);
    setSurveys((await surRes.json()).data ?? []);
    setOrgs((await orgRes.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const orgPublishers = useMemo(() => {
    const all = orgs.filter(o => o.type === "publisher");
    return user?.role === "publisher" ? all.filter(o => o.id === user.organisationId) : all;
  }, [orgs, user?.role, user?.organisationId]);
  const orgBrands      = useMemo(() => orgs.filter(o => o.type === "brand"), [orgs]);
  const orgAgencies      = useMemo(() => orgs.filter(o => o.type === "agency"), [orgs]);
  const orgById = useMemo(() => new Map(orgs.map(o => [o.id, o])), [orgs]);
  const orgName = useCallback((id: string | null) => (id ? orgById.get(id)?.name ?? "" : ""), [orgById]);

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) for (const t of p.tags ?? []) set.add(t);
    return Array.from(set).sort();
  }, [projects]);
  const tagOptions = useMemo(() => existingTags.map(t => ({ value: t, label: t })), [existingTags]);

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

  // Surveys selectable as a project's inherited survey — same readiness gate as the Campaigns drawer.
  // Most recently created first, so the newest survey is always easiest to find.
  const selectableSurveys = useMemo(() => surveys
    .filter(s => {
      if (s.status === "draft") return true;
      if (s.status === "ready") return isSurveyValidForReady(s);
      return false;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [surveys]);

  // Countries whose expected survey language isn't fully translated in the selected survey.
  // A country whose expected language isn't one Fanometrix can even author surveys in yet
  // (e.g. Italian) is always reported as missing — there's no way it could be complete.
  function missingLanguageCountries(surveyId: string | null | undefined, countryCodes: string[] | undefined) {
    const survey = surveys.find(s => s.id === surveyId);
    if (!survey || !countryCodes?.length) return [];
    const completed = getCompletedLanguages({ questions: survey.questions ?? [], thank_you_title: survey.thank_you_title, thank_you_body: survey.thank_you_body });
    return countryCodes
      .map(code => ({ code, lang: expectedSurveyLanguage(code) }))
      .filter(({ lang }) => !completed.includes(lang as LangCode));
  }

  function languageLabel(code: string) {
    return LANGUAGE_DISPLAY_NAMES[code] ?? code;
  }

  const editingMismatches = useMemo(
    () => missingLanguageCountries(editing.survey_id, editing.country_codes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing.survey_id, editing.country_codes, surveys]
  );

  const editingCanGenerate =
    (editing.publisher_org_ids?.length ?? 0) > 0 && (editing.country_codes?.length ?? 0) > 0 &&
    !!editing.survey_id && editingMismatches.length === 0;
  const editingBlockedReasons = [
    (editing.publisher_org_ids?.length ?? 0) === 0 && "add publishers",
    (editing.country_codes?.length ?? 0) === 0 && "add countries",
    !editing.survey_id && "select a survey",
    editing.survey_id && editingMismatches.length > 0 &&
      `fix survey language mismatch (${editingMismatches.map(({ code, lang }) => `${code} → ${languageLabel(lang)}`).join(", ")})`,
  ].filter(Boolean) as string[];

  const displayed = useMemo(() => {
    let list = projects;

    if (statusFilter !== "all") list = list.filter(p => p.status === statusFilter);

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
  function openCreate() {
    const isPublisher = user?.role === "publisher";
    setEditing({
      ...BLANK,
      publisher_org_ids: isPublisher && user?.organisationId ? [user.organisationId] : [],
    });
    setError("");
    setDrawerOpen(true);
  }

  function openEdit(p: ResearchProject) {
    const { deployment_count: _dc, total_responses: _tr, completion_pct: _cp,
            deleted_at: _da, deleted_by: _db,
            ...rest } = p;
    setEditing({ ...rest });
    setError("");
    setDrawerOpen(true);
  }

  // Auto-update name + slug from Topic/Brand/Agency/Type while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const label = studyTypeLabel(editing.study_type ?? "");
    const brand = orgName(editing.brand_org_id ?? null);
    const agency = orgName(editing.agency_org_id ?? null);
    const name = generateStudyName(editing.topic ?? "", label, brand, agency);
    const slug = generateStudySlug(editing.topic ?? "", label, brand, agency);
    if (name || slug) {
      setEditing(e => ({
        ...e,
        project_name: name || e.project_name,
        project_id: slug || e.project_id,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.brand_org_id, editing.agency_org_id, editing.topic, editing.study_type, drawerOpen, orgName]);

  function autoId() {
    setEditing(e => {
      const label = studyTypeLabel(e.study_type ?? "");
      const brand = orgName(e.brand_org_id ?? null);
      const agency = orgName(e.agency_org_id ?? null);
      const name = generateStudyName(e.topic ?? "", label, brand, agency);
      const slug = generateStudySlug(e.topic ?? "", label, brand, agency);
      return { ...e, project_name: name || e.project_name, project_id: slug || e.project_id };
    });
  }

  /** Validates and persists the drawer's current state. Returns the saved row, or null on failure (with `error` set). */
  async function saveProject(): Promise<ResearchProject | null> {
    if (!editing.project_name?.trim()) { setError("Project name is required."); return null; }
    if (!editing.project_id?.trim()) { setError("Project ID is required."); return null; }
    if (!editing.study_type) { setError("Study type is required."); return null; }
    if (editing.start_date && editing.end_date && editing.start_date > editing.end_date) {
      setError("Start date cannot be after end date."); return null;
    }
    setError(""); setSaving(true);

    const url = editing.id ? `/api/research-projects/${editing.id}` : "/api/research-projects";
    const method = editing.id ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setError(json.error ?? "Failed to save."); return null; }
    return json.data as ResearchProject;
  }

  async function handleSave() {
    const wasNew = !editing.id;
    const saved = await saveProject();
    if (!saved) return;
    setDrawerOpen(false);
    showToast(wasNew ? "Research project created." : "Research project updated.");
    load();
  }

  async function handleSaveAndGenerate() {
    const saved = await saveProject();
    if (!saved) return;
    setDrawerOpen(false);
    load();
    await handleGenerate(saved);
  }

  async function handleDelete(p: ResearchProject, force = false) {
    if (!force && !confirm(`Move "${p.project_name}" to deleted items?`)) return;
    const res = await fetch(`/api/research-projects/${p.id}${force ? "?force=true" : ""}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      if (res.status === 409 && confirm(`${json.error} Delete anyway?`)) {
        handleDelete(p, true);
      } else {
        showToast(json.error ?? "Could not delete project.", false);
      }
      return;
    }
    showToast("Research project deleted.");
    load();
  }

  async function handleGenerate(p: ResearchProject) {
    // Hard block — mirrors the server-side check in generate-deployments.
    // The button is disabled in this state too; this only matters if the
    // underlying data changed since the card last rendered.
    const mismatches = missingLanguageCountries(p.survey_id, p.country_codes);
    if (mismatches.length > 0) {
      const lines = mismatches.map(({ code, lang }) => `${code} → ${languageLabel(lang)} version required`).join(", ");
      showToast(`Cannot generate — survey language mismatch (${lines}). Fix in Edit first.`, false);
      return;
    }

    setGenerating(g => ({ ...g, [p.id]: true }));
    setGenerateResults(r => { const n = { ...r }; delete n[p.id]; return n; });
    const res = await fetch(`/api/research-projects/${p.id}/generate-deployments`, { method: "POST" });
    const json = await res.json();
    setGenerating(g => ({ ...g, [p.id]: false }));
    if (!res.ok) { showToast(json.error ?? "Failed to generate deployments.", false); return; }
    setGenerateResults(r => ({ ...r, [p.id]: json.data }));
    const parts = [`${json.data.created.length} created`];
    if (json.data.restored.length > 0) parts.push(`${json.data.restored.length} restored`);
    showToast(parts.join(", ") + ".");
    setRefreshTokens(t => ({ ...t, [p.id]: (t[p.id] ?? 0) + 1 }));
    if (expandedId !== p.id) setExpandedId(p.id);
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
              <button onClick={openCreate}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                + Create Research Project
              </button>
            )}
          </div>
          <details className="group bg-gray-50 w-full">
            <summary className="cursor-pointer select-none list-none py-3">
              <p className="text-sm text-gray-500 leading-relaxed">
                Select the publishers and countries for a study, then click <strong>Generate Deployments</strong> to create every publisher × country campaign automatically, instead of creating each one by hand.{" "}
                <span className="font-semibold inline-flex items-center gap-1" style={{ color: "#D7B87A" }}>
                  Expand to find out more
                  <span className="inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </p>
            </summary>
            <div className="pb-4 pt-3 mt-1 border-t border-gray-200 text-sm text-gray-600 leading-relaxed space-y-4">
              <div>
                <p className="font-semibold text-gray-700 mb-1">What a Research Project is</p>
                <p>It&apos;s the easy way to set up a whole batch of campaigns at once instead of one at a time. Pick the publishers, countries, survey, dates, and target responses for a study, and a Research Project builds the full grid of campaigns for every publisher × country combination automatically.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Setting one up</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Click + Create Research Project and fill in the brand/topic, theme, and year, the project name and ID generate automatically</li>
                  <li>Choose the Publishers and Countries the study should run in</li>
                  <li>Pick a Survey, and optionally set default dates and a target response count</li>
                  <li>Click Generate Deployments to create a campaign for every publisher × country combination</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Edit vs. Generate Deployments</p>
                <p><strong>Edit</strong> changes the project&apos;s own settings only, it never creates, deletes, or rewrites a campaign. <strong>Generate Deployments</strong> is the action that actually creates the campaigns, based on whichever publishers and countries are set at the time you click it.</p>
                <p className="mt-1 text-gray-500">It&apos;s safe to click Generate Deployments again later: campaigns that already exist are left untouched, only newly added combinations are created. If you remove a publisher or country afterward, its campaign keeps running and needs to be archived or deleted by hand, it isn&apos;t removed automatically.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Defaults vs. overrides</p>
                <p>Survey, dates, target responses, and tags set on the project act as defaults for every campaign generated from it. A campaign only follows the project&apos;s value while its own field is left blank, the moment someone sets that field directly on a campaign, it locks to that value and stops following the project.</p>
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
              <option value="scheduled">Scheduled</option>
              <option value="live">Live</option>
              <option value="paused">Paused</option>
              <option value="closed">Closed</option>
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
            {canManage && <p className="text-sm mt-1">Create your first research project to get started.</p>}
          </div>
        )}

        <div className="space-y-3">
          {displayed.map(p => {
            const expanded = expandedId === p.id;
            const possibleCombos = p.publisher_org_ids.length * p.country_codes.length;
            const projectMismatches = missingLanguageCountries(p.survey_id, p.country_codes);
            const canGenerate = p.publisher_org_ids.length > 0 && p.country_codes.length > 0 && !!p.survey_id && projectMismatches.length === 0;
            const generateBlockedReasons = [
              p.publisher_org_ids.length === 0 && "add publishers",
              p.country_codes.length === 0 && "add countries",
              !p.survey_id && "select a survey",
              p.survey_id && projectMismatches.length > 0 &&
                `fix survey language mismatch (${projectMismatches.map(({ code, lang }) => `${code} → ${languageLabel(lang)}`).join(", ")})`,
            ].filter(Boolean) as string[];
            const result = generateResults[p.id];
            const isGenerating = generating[p.id] ?? false;

            return (
              <div key={p.id} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : p.id)}
                  className="w-full text-left p-5 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 truncate">{p.project_name}</p>
                      {p.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{p.description}</p>
                      )}
                    </div>
                    <StatusBadge status={p.status as CampaignStatus} />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className="text-xs text-gray-400">Study Type:</span>
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
                    <Stat label="Publishers" value={p.publisher_org_ids.length} />
                    <Stat label="Countries" value={p.country_codes.length} />
                    <Stat label="Deployments" value={possibleCombos > 0 ? `${p.deployment_count} / ${possibleCombos}` : p.deployment_count} />
                    <Stat label="Responses" value={p.target_responses ? `${p.total_responses.toLocaleString()} / ${p.target_responses.toLocaleString()}` : p.total_responses.toLocaleString()} />
                  </div>

                  {!p.survey_id && (
                    <p className="text-xs font-semibold text-red-600 mt-2 flex items-center gap-1">
                      🚩 No survey selected — deployments cannot be generated until one is set.
                    </p>
                  )}

                  {p.survey_id && projectMismatches.length > 0 && (
                    <p className="text-xs font-semibold text-red-600 mt-2 flex items-center gap-1">
                      🚩 Survey language mismatch ({projectMismatches.map(({ code, lang }) => `${code} → ${languageLabel(lang)}`).join(", ")}) — deployments cannot be generated until fixed.
                    </p>
                  )}

                  {(p.start_date || p.end_date) && (
                    <p className="text-xs text-gray-400 mt-1.5">{formatDate(p.start_date)} → {p.end_date ? formatDate(p.end_date) : "ongoing"}</p>
                  )}

                  {p.target_responses !== null && (
                    <div className="mt-2.5 space-y-1.5 max-w-sm">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">completion</span>
                        <span className="font-semibold text-gray-700">{p.completion_pct ?? 0}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, p.completion_pct ?? 0)}%`, background: (p.completion_pct ?? 0) >= 100 ? "#10b981" : (p.completion_pct ?? 0) >= 75 ? "#D7B87A" : "#0B1929" }} />
                      </div>
                    </div>
                  )}
                </button>

                {canManage && (
                  <div className="px-5 pb-4 space-y-3">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleGenerate(p)}
                          disabled={!canGenerate || isGenerating}
                          title={canGenerate ? "" : `In Edit: ${generateBlockedReasons.join(", ")}`}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: "#0B1929", color: "#D7B87A" }}
                        >
                          {isGenerating ? "Generating…" : "Generate Deployments"}
                        </button>
                        <InfoTooltip text="Creates a campaign for each Publisher × Country combination on this project. Safe to click again later — existing campaigns are skipped, only new or removed-then-re-added combinations are created or restored. It never deletes campaigns for publishers/countries you've since removed." />
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <button onClick={() => openEdit(p)}
                          className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                          Edit
                        </button>
                        <InfoTooltip text="Changes this project's own settings (publishers, countries, dates, survey, etc.). It never creates, deletes, or renames campaigns — click Generate Deployments afterward to actually create campaigns for any new publisher/country combinations." />
                      </span>
                      <button onClick={() => handleDelete(p)}
                        className="text-xs border border-red-100 text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                        Delete
                      </button>
                      {canGenerate && p.deployment_count < possibleCombos && (
                        <span className="text-xs text-amber-600">
                          {possibleCombos - p.deployment_count} deployment{possibleCombos - p.deployment_count !== 1 ? "s" : ""} pending
                        </span>
                      )}
                    </div>

                    {result && (
                      <div className="text-xs space-y-1 bg-gray-50 border border-gray-100 rounded-lg p-3">
                        <p className="text-green-700">✓ {result.created.length} created</p>
                        {result.restored.length > 0 && (
                          <p className="text-green-700">↺ {result.restored.length} restored (previously deleted)</p>
                        )}
                        {result.skipped_existing.length > 0 && (
                          <p className="text-gray-400">– {result.skipped_existing.length} already existed</p>
                        )}
                        {result.failed.length > 0 && (
                          <div className="text-red-500">
                            <p>✕ {result.failed.length} failed:</p>
                            <ul className="list-disc list-inside">
                              {result.failed.map((f, i) => (
                                <li key={i}>{f.publisher} / {f.country}: {f.reason}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {expanded && (
                  <DeploymentsList project={p} surveys={surveys} refreshToken={refreshTokens[p.id] ?? 0} orgName={orgName} />
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
          <div className="w-full sm:w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing.id ? "Edit Research Project" : "Create Research Project"}</h2>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              <DrawerSection step={1} title="Research Project Identity" subtitle="What this project is and how it's classified.">
                <NameBuilder
                  topic={editing.topic ?? ""}
                  onTopicChange={v => setEditing(x => ({ ...x, topic: v }))}
                  brandOrgId={editing.brand_org_id ?? ""}
                  onBrandChange={v => setEditing(x => ({ ...x, brand_org_id: v || null }))}
                  brandOptions={orgBrands}
                  agencyOrgId={editing.agency_org_id ?? ""}
                  onAgencyChange={v => setEditing(x => ({ ...x, agency_org_id: v || null }))}
                  agencyOptions={orgAgencies}
                  studyType={editing.study_type ?? "fan_understanding"}
                  onStudyTypeChange={v => setEditing(x => ({ ...x, study_type: v }))}
                  onAutoGenerate={autoId}
                  preview={generateStudyName(
                    editing.topic ?? "", studyTypeLabel(editing.study_type ?? ""),
                    orgName(editing.brand_org_id ?? null), orgName(editing.agency_org_id ?? null)
                  )}
                />

                <Field label="Project Name *">
                  <input value={editing.project_name ?? ""} onChange={e => setEditing(x => ({ ...x, project_name: e.target.value }))}
                    className={INP} placeholder="Women's World Cup | Fan Understanding | Carlsberg" />
                </Field>

                <Field label="Project ID *">
                  <input value={editing.project_id ?? ""} onChange={e => setEditing(x => ({ ...x, project_id: e.target.value }))}
                    className={`${INP} font-mono`} placeholder="womens_world_cup_fan_understanding_carlsberg" />
                </Field>

                <Field label="Tags">
                  {popularTags.filter(t => !(editing.tags ?? []).includes(t)).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="text-xs text-gray-400 mr-0.5 mt-1">Reuse:</span>
                      {popularTags.filter(t => !(editing.tags ?? []).includes(t)).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setEditing(x => ({ ...x, tags: [...(x.tags ?? []), t] }))}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2.5 py-1 rounded-full transition-colors"
                        >
                          + {t}
                        </button>
                      ))}
                    </div>
                  )}
                  <MultiSelect
                    options={tagOptions}
                    selected={editing.tags ?? []}
                    onChange={v => setEditing(x => ({ ...x, tags: v }))}
                    placeholder="Search or create a tag…"
                    helperText="Type to see matching tags used on other projects, or create a new one. Tags become available to every future project once created."
                    allowCreate
                    createLabel={t => `+ Create tag: "${t}"`}
                  />
                </Field>

                <Field label="Description">
                  <input value={editing.description ?? ""} onChange={e => setEditing(x => ({ ...x, description: e.target.value }))}
                    className={INP} placeholder="Optional" />
                </Field>
              </DrawerSection>

              <DrawerSection
                step={2}
                title="Deployment Matrix"
                subtitle={'Every publisher × country combination becomes one deployment campaign when you click "Generate Deployments".'}
                prominent
              >
                <Field label="Publishers">
                  <MultiSelect
                    options={orgPublishers.map(o => ({ value: o.id, label: o.name }))}
                    selected={editing.publisher_org_ids ?? []}
                    onChange={ids => setEditing(x => ({ ...x, publisher_org_ids: ids }))}
                    placeholder="Select publishers…"
                    strict
                    disabled={user?.role === "publisher"}
                    helperText={user?.role === "publisher" ? "Locked to your organisation." : undefined}
                    unmatchedMessage={s => `"${s}" is not a recognised publisher — add it in Organisations first.`}
                  />
                </Field>
                <Field label="Countries">
                  <MultiSelect
                    options={countryOptions()}
                    selected={editing.country_codes ?? []}
                    onChange={v => setEditing(x => ({ ...x, country_codes: v }))}
                    placeholder="Select countries…"
                    strict
                    unmatchedMessage={s => `"${s}" is not a recognised country.`}
                  />
                </Field>
                {(editing.publisher_org_ids?.length ?? 0) > 0 && (editing.country_codes?.length ?? 0) > 0 && (
                  <>
                    <div className="bg-white border border-[#D7B87A] rounded-lg px-3 py-3 flex items-center justify-center gap-3">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-[#0B1929]">{editing.publisher_org_ids!.length}</p>
                        <p className="text-xs text-gray-500">Publisher{editing.publisher_org_ids!.length !== 1 ? "s" : ""}</p>
                      </div>
                      <span className="text-xl text-gray-300">×</span>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-[#0B1929]">{editing.country_codes!.length}</p>
                        <p className="text-xs text-gray-500">Countr{editing.country_codes!.length === 1 ? "y" : "ies"}</p>
                      </div>
                      <span className="text-xl text-gray-300">=</span>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-[#0B1929]">{editing.publisher_org_ids!.length * editing.country_codes!.length}</p>
                        <p className="text-xs font-semibold text-[#0B1929]">Deployments</p>
                      </div>
                    </div>

                    <details className="group">
                      <summary className="cursor-pointer select-none list-none text-xs font-semibold text-[#0B1929] flex items-center gap-1.5">
                        <span className="transition-transform group-open:rotate-90">›</span>
                        Preview deployment matrix
                      </summary>
                      <div className="mt-2 overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">Publisher</th>
                              {editing.country_codes!.map(code => (
                                <th key={code} className="px-2 py-2 font-semibold text-gray-500 whitespace-nowrap">{code}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {editing.publisher_org_ids!.map(id => (
                              <tr key={id} className="border-t border-gray-100">
                                <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">{orgName(id)}</td>
                                {editing.country_codes!.map(code => (
                                  <td key={code} className="text-center text-[#0B1929]">✓</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </>
                )}
              </DrawerSection>

              <DrawerSection
                step={3}
                title="Survey Configuration"
                subtitle="The survey inherited by every generated deployment, validated against the countries selected above."
                prominent
              >
                <Field label="Project Survey">
                  {selectableSurveys.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                      <p className="text-xs text-amber-700">
                        No surveys are available to select yet.
                      </p>
                      <Link href="/survey-templates" target="_blank" className="text-xs font-medium underline text-amber-800">
                        Create one in Surveys →
                      </Link>
                    </div>
                  ) : (
                    <select value={editing.survey_id ?? ""} onChange={e => setEditing(x => ({ ...x, survey_id: e.target.value || null }))}
                      className={INP}>
                      <option value="">None selected</option>
                      {selectableSurveys.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                    This is the primary survey inherited by every generated deployment, unless an individual deployment overrides it.
                  </p>
                </Field>

                {editingMismatches.length > 0 ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 space-y-1">
                    <p className="text-xs font-semibold text-red-700">🚩 Survey language mismatch detected</p>
                    <p className="text-xs text-red-700">
                      The selected survey does not contain language versions for all selected deployment countries.
                    </p>
                    <ul className="text-xs text-red-700 list-disc list-inside">
                      {editingMismatches.map(({ code, lang }) => (
                        <li key={code}>{code} → {languageLabel(lang)} version required</li>
                      ))}
                    </ul>
                    <p className="text-xs text-red-600">
                      You can still save this project, but Generate Deployments will be blocked until this is fixed — either add the missing translation to the survey, or remove the affected countries.
                    </p>
                  </div>
                ) : editing.survey_id && (editing.country_codes?.length ?? 0) > 0 ? (
                  <p className="text-xs font-semibold text-green-700 bg-white border border-green-200 rounded-lg px-3 py-2">
                    ✓ This survey covers every selected country's expected language.
                  </p>
                ) : null}
              </DrawerSection>

              <DrawerSection step={4} title="Campaign Settings" subtitle="Defaults applied to every generated deployment — each can still be overridden individually afterward.">
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
                  <p className="text-xs text-red-500 -mt-1">End date must be on or after the start date.</p>
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
                      value={editing.archive_after_days ?? ""}
                      onChange={e => setEditing(x => ({ ...x, archive_after_days: e.target.value ? Number(e.target.value) : null }))}
                      className={INP} placeholder="90 (optional)" />
                  </Field>
                </div>

                <Field label="Status">
                  <select value={editing.status ?? "draft"} onChange={e => setEditing(x => ({ ...x, status: e.target.value }))}
                    className={INP}>
                    {(["draft", "scheduled", "live", "paused", "closed", "archived"] as const).map(s => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                    New deployments start in this status when generated. Existing deployments manage their own status independently afterward.
                  </p>
                </Field>
              </DrawerSection>

              {isAdmin && (
                <DrawerSection
                  step={5}
                  title="Creative Configuration"
                  subtitle="Default design applied to every generated deployment — each can still override individually."
                >
                  <CreativeDesignPicker
                    value={editing.creative_design ?? null}
                    onChange={v => setEditing(x => ({ ...x, creative_design: v }))}
                  />
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Leave unset to use the standard production creative.
                  </p>
                  <CreativeDesignPreview designId={editing.creative_design} />
                </DrawerSection>
              )}

              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-60 transition-colors">
                {saving ? "Saving…" : "Save Project"}
              </button>
              <button onClick={handleSaveAndGenerate} disabled={saving || !editingCanGenerate}
                title={editingCanGenerate ? "" : `First: ${editingBlockedReasons.join(", ")}`}
                className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                {saving ? "Saving…" : "Save & Generate Deployments"}
              </button>
            </div>
          </div>
        </div>
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
