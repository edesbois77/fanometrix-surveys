"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { MultiSelect } from "@/app/components/MultiSelect";
import { STATUS_META, type CampaignStatus } from "@/lib/campaign-status";
import {
  STUDY_TYPES, STUDY_TYPE_LABELS, studyTypeLabel,
  generateProjectName, generateProjectSlug,
} from "@/lib/naming";
import { countryOptions, countryByCode } from "@/lib/countries";
import { isSurveyValidForReady } from "@/lib/survey-validation";
import { getCompletedLanguages, SUPPORTED_LANGUAGES, type LocalisedQuestion, type LangCode } from "@/lib/survey-locale";
import { expectedSurveyLanguage } from "@/lib/locales";

// ─── Types ────────────────────────────────────────────────────────────────────
type ResearchProject = {
  id: string;
  project_id: string;
  project_name: string;
  brand_name: string | null;
  study_type: string;
  topic: string | null;
  tags: string[];
  description: string | null;
  year: string | null;
  start_date: string | null;
  end_date: string | null;
  survey_id: string | null;
  target_responses: number | null;
  archive_after_days: number | null;
  status: string;
  publishers: string[];
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
  thank_you_title?: string;
  thank_you_body?: string;
};

type Deployment = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  publisher: string | null;
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
  skipped_existing: Array<{ publisher: string; country: string }>;
  failed: Array<{ publisher: string; country: string; reason: string }>;
};

const PAGE_SIZE = 25;

const BLANK: Partial<ResearchProject> = {
  project_id: "", project_name: "", brand_name: "", study_type: "fan_understanding",
  topic: "", tags: [], description: "", year: String(new Date().getFullYear()),
  start_date: null, end_date: null, survey_id: null,
  target_responses: null, archive_after_days: null, status: "draft",
  publishers: [], country_codes: [],
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
  const lang = expectedSurveyLanguage(d.country_code) as LangCode;
  const completed = getCompletedLanguages(survey.questions ?? []);
  if (completed.includes(lang)) return null;
  const label = SUPPORTED_LANGUAGES.find(l => l.code === lang)?.label ?? lang;
  return `Missing ${label} survey localisation for ${d.country_code}`;
}

// ─── Read-only deployments list (expand panel) ─────────────────────────────────
function DeploymentsList({ project, surveys, refreshToken }: { project: ResearchProject; surveys: Survey[]; refreshToken: number }) {
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
                    {d.publisher && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{d.publisher}</span>}
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

  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [publisherOptions, setPublisherOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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
    const [projRes, surRes, pubRes] = await Promise.all([
      fetch("/api/research-projects"),
      fetch("/api/surveys"),
      isAdmin ? fetch("/api/publishers") : Promise.resolve(null),
    ]);
    setProjects((await projRes.json()).data ?? []);
    setSurveys((await surRes.json()).data ?? []);
    if (pubRes) {
      const pubData = (await pubRes.json()).data ?? [];
      setPublisherOptions(pubData.map((p: { name: string }) => ({ value: p.name, label: p.name })));
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) for (const t of p.tags ?? []) set.add(t);
    return Array.from(set).sort();
  }, [projects]);
  const tagOptions = useMemo(() => existingTags.map(t => ({ value: t, label: t })), [existingTags]);

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
  function missingLanguageCountries(surveyId: string | null | undefined, countryCodes: string[] | undefined) {
    const survey = surveys.find(s => s.id === surveyId);
    if (!survey || !countryCodes?.length) return [];
    const completed = getCompletedLanguages(survey.questions ?? []);
    return countryCodes
      .map(code => ({ code, lang: expectedSurveyLanguage(code) as LangCode }))
      .filter(({ lang }) => !completed.includes(lang));
  }

  function languageLabel(code: LangCode) {
    return SUPPORTED_LANGUAGES.find(l => l.code === code)?.label ?? code;
  }

  const editingMismatches = useMemo(
    () => missingLanguageCountries(editing.survey_id, editing.country_codes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing.survey_id, editing.country_codes, surveys]
  );

  const displayed = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(p =>
      p.project_name.toLowerCase().includes(q) ||
      (p.brand_name ?? "").toLowerCase().includes(q) ||
      (p.topic ?? "").toLowerCase().includes(q) ||
      studyTypeLabel(p.study_type).toLowerCase().includes(q)
    );
  }, [projects, search]);

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setEditing({ ...BLANK });
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

  // Auto-update name + slug from Brand/Topic/Study Type/Year while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const brandOrTopic = editing.brand_name || editing.topic || "";
    const label = studyTypeLabel(editing.study_type ?? "");
    const name = generateProjectName(brandOrTopic, label, editing.year ?? "");
    const slug = generateProjectSlug(brandOrTopic, label, editing.year ?? "");
    if (name || slug) {
      setEditing(e => ({
        ...e,
        project_name: name || e.project_name,
        project_id: slug || e.project_id,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.brand_name, editing.topic, editing.study_type, editing.year, drawerOpen]);

  function autoId() {
    setEditing(e => {
      const brandOrTopic = e.brand_name || e.topic || "";
      const label = studyTypeLabel(e.study_type ?? "");
      const name = generateProjectName(brandOrTopic, label, e.year ?? "");
      const slug = generateProjectSlug(brandOrTopic, label, e.year ?? "");
      return { ...e, project_name: name || e.project_name, project_id: slug || e.project_id };
    });
  }

  async function handleSave() {
    if (!editing.project_name?.trim()) { setError("Project name is required."); return; }
    if (!editing.project_id?.trim()) { setError("Project ID is required."); return; }
    if (!editing.study_type) { setError("Study type is required."); return; }
    if (editing.start_date && editing.end_date && editing.start_date > editing.end_date) {
      setError("Start date cannot be after end date."); return;
    }
    setError(""); setSaving(true);

    const url = editing.id ? `/api/research-projects/${editing.id}` : "/api/research-projects";
    const method = editing.id ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }
    setDrawerOpen(false);
    showToast(editing.id ? "Research project updated." : "Research project created.");
    load();
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
    const mismatches = missingLanguageCountries(p.survey_id, p.country_codes);
    if (mismatches.length > 0) {
      const lines = mismatches.map(({ code, lang }) => `${code} → ${languageLabel(lang)} version required`).join("\n");
      const confirmed = confirm(
        `Survey language mismatch detected.\n\nThe project survey does not contain language versions for all selected deployment countries:\n\n${lines}\n\nDeployments will still be generated using the project survey (falling back to English where translations are missing). Continue anyway?`
      );
      if (!confirmed) return;
    }

    setGenerating(g => ({ ...g, [p.id]: true }));
    setGenerateResults(r => { const n = { ...r }; delete n[p.id]; return n; });
    const res = await fetch(`/api/research-projects/${p.id}/generate-deployments`, { method: "POST" });
    const json = await res.json();
    setGenerating(g => ({ ...g, [p.id]: false }));
    if (!res.ok) { showToast(json.error ?? "Failed to generate deployments.", false); return; }
    setGenerateResults(r => ({ ...r, [p.id]: json.data }));
    showToast(`${json.data.created.length} deployment(s) created.`);
    setRefreshTokens(t => ({ ...t, [p.id]: (t[p.id] ?? 0) + 1 }));
    if (expandedId !== p.id) setExpandedId(p.id);
    load();
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Research Projects</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
              </p>
            </div>
            {isAdmin && (
              <button onClick={openCreate}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                + Create Research Project
              </button>
            )}
          </div>
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex gap-2.5 items-start">
            <span className="text-gray-400 flex-shrink-0 text-sm mt-0.5">ℹ</span>
            <p className="text-sm text-gray-500 leading-relaxed">
              Select the publishers and countries for a study, then click <strong>Generate Deployments</strong> to create every publisher × country campaign automatically — instead of creating each one by hand.
            </p>
          </div>
        </div>

        <div className="mb-5 relative sm:max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
          <input
            type="search"
            placeholder="Search projects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
          />
        </div>

        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && displayed.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">◎</p>
            <p className="font-medium">No research projects</p>
            {isAdmin && <p className="text-sm mt-1">Create your first research project to get started.</p>}
          </div>
        )}

        <div className="space-y-3">
          {displayed.map(p => {
            const expanded = expandedId === p.id;
            const possibleCombos = p.publishers.length * p.country_codes.length;
            const canGenerate = p.publishers.length > 0 && p.country_codes.length > 0 && !!p.survey_id;
            const generateBlockedReasons = [
              p.publishers.length === 0 && "add publishers",
              p.country_codes.length === 0 && "add countries",
              !p.survey_id && "select a survey",
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
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{p.project_id}</p>
                    </div>
                    <StatusBadge status={p.status as CampaignStatus} />
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{studyTypeLabel(p.study_type)}</span>
                    {p.tags.map(t => (
                      <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                    <Stat label="Publishers" value={p.publishers.length} />
                    <Stat label="Countries" value={p.country_codes.length} />
                    <Stat label="Deployments" value={possibleCombos > 0 ? `${p.deployment_count} / ${possibleCombos}` : p.deployment_count} />
                    <Stat label="Responses" value={p.target_responses ? `${p.total_responses.toLocaleString()} / ${p.target_responses.toLocaleString()}` : p.total_responses.toLocaleString()} />
                  </div>

                  {!p.survey_id && (
                    <p className="text-xs font-semibold text-red-600 mt-2 flex items-center gap-1">
                      🚩 No survey selected — deployments cannot be generated until one is set.
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

                {isAdmin && (
                  <div className="px-5 pb-4 space-y-3">
                    <div className="flex flex-wrap gap-1.5 items-center">
                      <button
                        onClick={() => handleGenerate(p)}
                        disabled={!canGenerate || isGenerating}
                        title={canGenerate ? "" : `In Edit: ${generateBlockedReasons.join(", ")}`}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: "#0B1929", color: "#D7B87A" }}
                      >
                        {isGenerating ? "Generating…" : "Generate Deployments"}
                      </button>
                      <button onClick={() => openEdit(p)}
                        className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                        Edit
                      </button>
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
                  <DeploymentsList project={p} surveys={surveys} refreshToken={refreshTokens[p.id] ?? 0} />
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

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Name Builder</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Brand (optional)">
                    <input value={editing.brand_name ?? ""} onChange={e => setEditing(x => ({ ...x, brand_name: e.target.value }))}
                      className={INP} placeholder="Carlsberg" />
                  </Field>
                  <Field label="Topic">
                    <input value={editing.topic ?? ""} onChange={e => setEditing(x => ({ ...x, topic: e.target.value }))}
                      className={INP} placeholder="Women's World Cup" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Year">
                    <input value={editing.year ?? ""} onChange={e => setEditing(x => ({ ...x, year: e.target.value }))}
                      className={INP} placeholder={String(new Date().getFullYear())} maxLength={9} />
                  </Field>
                  <div className="flex items-end">
                    <button type="button" onClick={autoId}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-lg border-2 border-[#D7B87A] text-[#0B1929] hover:bg-[#FBF5E8] transition-colors">
                      Auto Generate Name &amp; Slug
                    </button>
                  </div>
                </div>
              </div>

              <Field label="Project Name *">
                <input value={editing.project_name ?? ""} onChange={e => setEditing(x => ({ ...x, project_name: e.target.value }))}
                  className={INP} placeholder="Carlsberg | Fan Understanding | 2026" />
              </Field>

              <Field label="Project ID *">
                <input value={editing.project_id ?? ""} onChange={e => setEditing(x => ({ ...x, project_id: e.target.value }))}
                  className={`${INP} font-mono`} placeholder="carlsberg_fan_understanding_2026" />
              </Field>

              <Field label="Study Type *">
                <select value={editing.study_type ?? "fan_understanding"} onChange={e => setEditing(x => ({ ...x, study_type: e.target.value }))}
                  className={INP}>
                  {STUDY_TYPES.map(t => (
                    <option key={t} value={t}>{STUDY_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </Field>

              <Field label="Tags">
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

              {/* ── Deployment matrix: the core of Research Projects ── */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Deployment Matrix</p>
                <p className="text-xs text-gray-400 -mt-1">
                  Every publisher × country combination becomes one deployment campaign when you click "Generate Deployments".
                </p>
                <Field label="Publishers">
                  <MultiSelect
                    options={publisherOptions}
                    selected={editing.publishers ?? []}
                    onChange={v => setEditing(x => ({ ...x, publishers: v }))}
                    placeholder="Select publishers…"
                    strict
                    unmatchedMessage={s => `"${s}" is not a recognised publisher — add it in Administration → Publishers first.`}
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
                {(editing.publishers?.length ?? 0) > 0 && (editing.country_codes?.length ?? 0) > 0 && (
                  <p className="text-xs text-gray-500">
                    {editing.publishers!.length} publisher{editing.publishers!.length !== 1 ? "s" : ""} × {editing.country_codes!.length} countr{editing.country_codes!.length === 1 ? "y" : "ies"} = up to {editing.publishers!.length * editing.country_codes!.length} deployments once generated.
                  </p>
                )}
              </div>

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

              <Field label="Select A Survey">
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
                {editingMismatches.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-2 space-y-1">
                    <p className="text-xs font-semibold text-amber-800">⚠ Survey language mismatch detected</p>
                    <p className="text-xs text-amber-700">
                      The selected survey does not contain language versions for all selected deployment countries.
                    </p>
                    <ul className="text-xs text-amber-700 list-disc list-inside">
                      {editingMismatches.map(({ code, lang }) => (
                        <li key={code}>{code} → {languageLabel(lang)} version required</li>
                      ))}
                    </ul>
                    <p className="text-xs text-amber-600">
                      You can still save this project. Add the missing translation to the survey, or override the survey for the affected deployments after generating them.
                    </p>
                  </div>
                )}
              </Field>

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

              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setDrawerOpen(false)} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-60"
                style={{ background: "#D7B87A", color: "#0B1929" }}>
                {saving ? "Saving…" : "Save Project"}
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
