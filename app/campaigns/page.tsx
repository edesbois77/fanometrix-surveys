"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { countryCodeWarning, languageCodeWarning, MARKET_REFERENCE_PAIRS, isValidCountryCode, expectedSurveyLanguage } from "@/lib/locales";
import { SUPPORTED_LANGUAGES } from "@/lib/survey-locale";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { CreativeDesignPicker } from "@/app/components/CreativeDesignPicker";
import { CreativeDesignPreview } from "@/app/components/CreativeDesignPreview";
import { DrawerSection } from "@/app/components/DrawerSection";
import { isSurveyValidForReady } from "@/lib/survey-validation";
import { CampaignsManager } from "@/app/components/campaigns/CampaignsManager";
import type { Campaign } from "@/app/components/campaigns/types";

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
import Link from "next/link";
import { STUDY_TYPES, STUDY_TYPE_LABELS } from "@/lib/naming";
import { useCreativeDesignNames } from "@/lib/creative-designs";

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Blank form ───────────────────────────────────────────────────────────────
const BLANK: Partial<Campaign> = {
  campaign_id: "", campaign_name: "",
  campaign_description: "", start_date: null, end_date: null,
  survey_id: null, publisher_org_id: null, brand_org_id: null, agency_org_id: null, topic: null, study_type: "custom", country_code: null, market: null, survey_language: "en", status: "draft",
  target_responses: null, archive_after_days: 90, creative_design: null,
  research_project_id: null, tags: null,
};

// Reads the ?createForProject=&surveyId= query params a Research Project's
// "+ Create Campaign" action navigates here with — isolated in its own
// component so only this leaf needs the useSearchParams() Suspense boundary,
// not the whole (otherwise statically-rendered) page.
function CampaignLinkReader({
  onCreateForProject, onEditCampaignId, onReturnTo,
}: {
  onCreateForProject: (projectId: string | null, surveyId: string | null) => void;
  onEditCampaignId: (campaignId: string | null) => void;
  onReturnTo: (projectId: string | null) => void;
}) {
  const searchParams = useSearchParams();
  const createForProject = searchParams.get("createForProject");
  const surveyId = searchParams.get("surveyId");
  const editCampaignId = searchParams.get("editCampaignId");
  const returnTo = searchParams.get("returnTo");
  useEffect(() => { onCreateForProject(createForProject, surveyId); }, [createForProject, surveyId, onCreateForProject]);
  useEffect(() => { onEditCampaignId(editCampaignId); }, [editCampaignId, onEditCampaignId]);
  useEffect(() => { onReturnTo(returnTo); }, [returnTo, onReturnTo]);
  return null;
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

  // Edit drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing,    setEditing]    = useState<Partial<Campaign>>(BLANK);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState("");
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Research Project deep-link ("+ Create Campaign") ────────────────────────
  // Auto-opens the create drawer pre-filled from the linked project, then, on
  // save, returns to that project's Workspace instead of the normal
  // stay-on-page save — the same pattern proven for Surveys' "+ Add Evidence".
  const router = useRouter();
  const [linkedProjectId, setLinkedProjectId] = useState<string | null>(null);
  const [linkedSurveyId,  setLinkedSurveyId]  = useState<string | null>(null);
  const [autoLinkActive,  setAutoLinkActive]  = useState(false);
  const [linkedProjectResearchMode, setLinkedProjectResearchMode] = useState<"real" | "simulated">("real");
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (!linkedProjectId || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    (async () => {
      const res = await fetch(`/api/research-projects/${linkedProjectId}`);
      if (!res.ok) return;
      const { data: proj } = await res.json();
      setLinkedProjectResearchMode(proj.research_mode === "simulated" ? "simulated" : "real");
      setEditing({
        ...BLANK,
        research_project_id: linkedProjectId,
        survey_id: linkedSurveyId,
        topic: proj.topic ?? "",
        study_type: proj.study_type ?? "custom",
        brand_org_id: proj.brand_org_id ?? null,
        agency_org_id: proj.agency_org_id ?? null,
      });
      setError("");
      setAutoLinkActive(true);
      setDrawerOpen(true);
    })();
  }, [linkedProjectId, linkedSurveyId]);

  // The Research Project Workspace's embedded Campaigns manager deep-links
  // "Edit" here (?editCampaignId=) rather than duplicating this page's full
  // edit drawer — opens the same drawer once the campaign list has loaded.
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);
  const autoEditCampaignRef = useRef(false);

  useEffect(() => {
    if (!editCampaignId || autoEditCampaignRef.current) return;

    const found = campaigns.find(c => c.id === editCampaignId);
    if (found) {
      autoEditCampaignRef.current = true;
      openEdit(found);
      return;
    }

    // Not in the loaded list. Simulated (Product Walkthrough) campaigns are
    // deliberately excluded from the default /api/campaigns response, so they
    // never appear in `campaigns` here — once the initial load has settled,
    // fetch the campaign being edited directly by id (that route returns it
    // regardless of its is_simulated flag) so the Edit drawer still opens
    // instead of silently doing nothing.
    if (loading) return;
    autoEditCampaignRef.current = true;
    fetch(`/api/campaigns/${editCampaignId}`)
      .then(res => (res.ok ? res.json() : null))
      .then(json => { if (json?.data) openEdit(json.data); else autoEditCampaignRef.current = false; })
      .catch(() => { autoEditCampaignRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCampaignId, campaigns, loading]);

  // A campaign opened from a Research Project always returns there on close
  // *or* save — mirrors the Survey editor's returnTo behaviour, so the user
  // is never left stranded on the standalone Campaigns page.
  const [returnToProjectId, setReturnToProjectId] = useState<string | null>(null);

  function closeDrawer() {
    if (returnToProjectId) {
      router.push(`/research-projects/${returnToProjectId}?returned=1`);
      return;
    }
    setDrawerOpen(false);
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

  const onLoadDeletedRequested = useCallback(() => {
    if (deletedCampaigns.length === 0 && !loadingDeleted) loadDeleted();
  }, [deletedCampaigns.length, loadingDeleted, loadDeleted]);

  // Organisations are the single source of truth for publisher/brand/agency
  // display names now — this resolves an id to its name anywhere a campaign
  // needs to show, filter, search, or generate a name/slug with one.
  const orgById = useMemo(() => new Map(orgs.map(o => [o.id, o])), [orgs]);
  const orgName = useCallback((id: string | null) => (id ? orgById.get(id)?.name ?? "" : ""), [orgById]);

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

  // Research Target / Creative Design (migration 094) — survey-scoped, not
  // project-level, so the drawer's "Inherited: X" display for these two
  // fields can't come from the lightweight researchProjects list (which only
  // has the deprecated project-level columns) — it needs the specific
  // survey's own research_project_evidence row. Archive After (days) is
  // unaffected — that one is still genuinely project-level, still resolved
  // from selectedProject directly below.
  const [surveyEvidenceDefaults, setSurveyEvidenceDefaults] = useState<{ target_responses: number | null; creative_design: string | null } | null>(null);
  useEffect(() => {
    const projectId = editing.research_project_id;
    const effectiveSurveyId = editing.survey_id ?? selectedProject?.survey_id ?? null;
    if (!projectId || !effectiveSurveyId) { setSurveyEvidenceDefaults(null); return; }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/research-projects/${projectId}`);
      if (!res.ok || cancelled) return;
      const { data: proj } = await res.json();
      const item = (proj.evidence ?? []).find(
        (e: { evidence_type: string; evidence_id: string }) => e.evidence_type === "survey" && e.evidence_id === effectiveSurveyId
      );
      if (!cancelled) {
        setSurveyEvidenceDefaults(item?.survey ? {
          target_responses: item.survey.target_responses ?? null,
          creative_design: item.survey.creative_design ?? null,
        } : null);
      }
    })();
    return () => { cancelled = true; };
  }, [editing.research_project_id, editing.survey_id, selectedProject?.survey_id]);

  // ── Drawer helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    const isPublisher = user?.role === "publisher";
    setEditing({
      ...BLANK,
      publisher_org_id: isPublisher ? (user?.organisationId ?? null) : null,
    });
    setError("");
    setAutoLinkActive(false);
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
    setAutoLinkActive(false);
    setDrawerOpen(true);
  }

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
    const body   = {
      ...editing,
      ...(!editing.id && autoLinkActive ? { is_simulated: linkedProjectResearchMode === "simulated" } : {}),
    };

    const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setError(json.error ?? "Failed to save."); return; }

    if (autoLinkActive && linkedProjectId) {
      const workspaceHref = linkedProjectResearchMode === "simulated"
        ? `/product-walkthrough/${linkedProjectId}`
        : `/research-projects/${linkedProjectId}`;
      router.push(`${workspaceHref}?campaignAdded=1`);
      return;
    }

    // Opened from a Research Project (Edit Campaign) — return there instead
    // of the normal stay-on-page save, mirroring the Survey editor.
    if (returnToProjectId) {
      router.push(`/research-projects/${returnToProjectId}?returned=1`);
      return;
    }

    setDrawerOpen(false);
    showToast(editing.id ? "Campaign updated." : "Campaign created.");
    load();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <CampaignLinkReader
          onCreateForProject={(projectId, surveyId) => { setLinkedProjectId(projectId); setLinkedSurveyId(surveyId); }}
          onEditCampaignId={setEditCampaignId}
          onReturnTo={setReturnToProjectId}
        />
      </Suspense>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        {/* Header */}
        <div className="mb-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
              <p className="text-sm text-gray-400 mt-0.5">Every campaign across every research project.</p>
            </div>
            <div className="flex gap-2 sm:flex-shrink-0">
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

        <CampaignsManager
          campaigns={campaigns}
          deletedCampaigns={deletedCampaigns}
          orgs={orgs}
          loading={loading}
          loadingDeleted={loadingDeleted}
          isLockedByAdminFor={isLockedByAdminFor}
          onLoadDeletedRequested={onLoadDeletedRequested}
          onReload={load}
          onEditCampaign={openEdit}
          showExportButton
        />
      </div>

      {/* ── Edit / Create Drawer ──────────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} />
          <div className="w-full sm:w-[480px] bg-white flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing.id ? "Edit Campaign" : "Create Campaign"}</h2>
              <button onClick={closeDrawer} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              <DrawerSection step={1} title="Campaign Identity" subtitle="Naming, description, and optional parent research project.">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Campaign Name *">
                    <input value={editing.campaign_name ?? ""}
                      onChange={e => setEditing(x => ({ ...x, campaign_name: e.target.value }))}
                      className={INP} placeholder="e.g. Summer Brand Awareness Push" />
                  </Field>
                  <Field label="Type *">
                    <select value={editing.study_type ?? "custom"} onChange={e => setEditing(x => ({ ...x, study_type: e.target.value }))}
                      className={INP}>
                      {STUDY_TYPES.map(t => (
                        <option key={t} value={t}>{STUDY_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Brand (optional)">
                    <select value={editing.brand_org_id ?? ""} onChange={e => setEditing(x => ({ ...x, brand_org_id: e.target.value || null }))}
                      className={INP}>
                      <option value="">None</option>
                      {brandOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Agency (optional)">
                    <select value={editing.agency_org_id ?? ""} onChange={e => setEditing(x => ({ ...x, agency_org_id: e.target.value || null }))}
                      className={INP}>
                      <option value="">None</option>
                      {agencyOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </Field>
                </div>
                {isAdmin && (
                  <p className="text-right -mt-2">
                    <Link href="/organisations?type=brand" className="text-xs text-gray-400 hover:text-[#0B1929] underline">
                      Manage Brands &amp; Agencies →
                    </Link>
                  </p>
                )}

                <Field label="Campaign ID *">
                  <input value={editing.campaign_id ?? ""}
                    onChange={e => setEditing(x => ({ ...x, campaign_id: e.target.value }))}
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
                    <option value="">No project, standalone campaign</option>
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

              <DrawerSection step={2} title="Market Targeting" subtitle="Publisher, country and language for this specific deployment, always stored independently." prominent>
                <Field label="Publisher">
                  <select
                    value={editing.publisher_org_id ?? ""}
                    onChange={e => setEditing(x => ({ ...x, publisher_org_id: e.target.value || null }))}
                    disabled={user?.role === "publisher"}
                    className={`${INP} ${user?.role === "publisher" ? "bg-gray-50 text-gray-500" : ""}`}
                  >
                    <option value="">Select publisher</option>
                    {publisherOrgs.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  {user?.role === "publisher" && (
                    <p className="text-xs text-gray-400 mt-1">Locked to your organisation.</p>
                  )}
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

              <DrawerSection step={4} title="Campaign Settings" subtitle="Dates, response targets, archive timing, and status, each can inherit from the linked project.">
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
                      resolvedDisplay={surveyEvidenceDefaults?.target_responses?.toLocaleString() ?? "—"}
                      onOverride={() => setEditing(x => ({ ...x, target_responses: surveyEvidenceDefaults?.target_responses ?? null }))}
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

              <DrawerSection step={5} title="Creative Design" subtitle="Visual design applied to this campaign's survey MPU.">
                  {isAdmin && (
                    <p className="text-right -mt-1">
                      <a href="/creative-lab/designs" target="_blank" rel="noopener"
                        className="text-xs font-medium underline"
                        style={{ color: "#D7B87A" }}>
                        Browse all designs →
                      </a>
                    </p>
                  )}

                  {selectedProject ? (
                    <InheritableField
                      label="Design"
                      inherited={editing.creative_design == null}
                      resolvedDisplay={designNames[surveyEvidenceDefaults?.creative_design ?? ""] ?? "Fanometrix Default"}
                      onOverride={() => setEditing(x => ({ ...x, creative_design: surveyEvidenceDefaults?.creative_design ?? null }))}
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

              {error && <p className="text-red-500 text-xs">{error}</p>}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={closeDrawer} className="text-sm text-gray-500 px-4 py-2">Cancel</button>
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
