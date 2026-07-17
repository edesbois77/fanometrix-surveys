"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import { AdminShell } from "@/app/components/AdminShell";
import { validateSurvey, SURVEY_LIMITS } from "@/lib/survey-validation";
import {
  SUPPORTED_LANGUAGES, getCompletedLanguages,
  type LocalisedQuestion, type LocalisedText,
} from "@/lib/survey-locale";
import { studyTypeLabel } from "@/lib/naming";
import { SurveyIntelligenceModal } from "@/app/components/SurveyIntelligenceModal";
import { SurveyPreviewModal } from "@/app/components/SurveyPreviewModal";
import { SurveyEditor, type EditFields } from "@/app/components/survey-editor/SurveyEditor";

// MPU content limits (shared) — used by the list's per-survey completion display.
const { MAX_QUESTIONS, MAX_OPTIONS, MAX_Q_CHARS, MAX_OPT_CHARS, MAX_TY_TITLE, MAX_TY_BODY } = SURVEY_LIMITS;

const GOLD = "#D7B87A";

// ─── Types ────────────────────────────────────────────────────────────────────
type Question = LocalisedQuestion;   // re-export alias used throughout this file

type Survey = {
  id: string;
  name: string;
  description: string | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
  topic: string | null;
  study_type: string;
  questions: Question[];
  thank_you_title: LocalisedText;
  thank_you_body: LocalisedText;
  enabled_languages: string[];
  status: "draft" | "ready" | "archived" | "deleted";
  is_template: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  campaign_count: number;
  live_campaign_count: number;
  response_count: number;
  last_used_at: string | null;
  last_response_at: string | null;
};

// EditFields (the survey's editable shape) now lives with the canonical
// SurveyEditor and is imported above — the list uses it only for openDuplicate.

// Campaigns linked to a survey (for the usage modal)
type ModalCampaign = {
  id: string;
  campaign_id: string;
  brand_name: string;
  campaign_name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  publisher: string | null;
  response_count: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(isoStr: string | null | undefined): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatRelativeTime(isoStr: string | null | undefined): string | null {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  const diffMs = Date.now() - d.getTime();
  const mins  = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);
  if (mins  <  1) return "just now";
  if (mins  < 60) return `${mins} min${mins  !== 1 ? "s" : ""} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  if (days  <  7) return `${days} day${days  !== 1 ? "s" : ""} ago`;
  return formatDate(isoStr);
}

function formatDatetime(isoStr: string): string {
  const d = new Date(isoStr);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    " at " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

const STATUS_COLOURS: Record<string, string> = {
  draft:       "bg-gray-100 text-gray-600",
  ready:       "bg-green-100 text-green-700",
  "needs-fix": "bg-orange-100 text-orange-700",
  archived:    "bg-amber-100 text-amber-700",
  deleted:     "bg-red-100 text-red-600",
};

// A survey stored as "ready" but failing MPU validation shows as "Needs Fix".
function effectiveSurveyStatus(s: Survey): string {
  if (s.status === "ready" && validateSurvey(s).length > 0) return "needs-fix";
  return s.status;
}

function statusLabel(eff: string): string {
  if (eff === "needs-fix") return "Needs Fix";
  return eff.charAt(0).toUpperCase() + eff.slice(1);
}

const CAMPAIGN_STATUS_COLOURS: Record<string, string> = {
  draft:     "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  live:      "bg-green-100 text-green-700",
  paused:    "bg-yellow-100 text-yellow-700",
  closed:    "bg-gray-100 text-gray-500",
  archived:  "bg-amber-100 text-amber-700",
};

// ─── Survey Usage Modal ───────────────────────────────────────────────────────
function SurveyUsageModal({ survey, campaigns, loading, onClose }: {
  survey: Survey;
  campaigns: ModalCampaign[] | null;
  loading: boolean;
  onClose: () => void;
}) {
  const liveCount = (campaigns ?? []).filter(c => c.status === "live").length;

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onBackdrop}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-gray-900 text-lg">Campaign Usage</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{survey.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4 flex-shrink-0">×</button>
        </div>

        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">
          {loading && (
            <p className="text-gray-400 text-sm text-center py-10">Loading campaigns…</p>
          )}

          {!loading && campaigns?.length === 0 && (
            <div className="text-center py-10 text-gray-400">
              <p className="text-3xl mb-2">◫</p>
              <p className="text-sm">No campaigns are using this survey yet.</p>
            </div>
          )}

          {!loading && campaigns && campaigns.length > 0 && (
            <>
              <p className="text-xs text-gray-400 mb-4">
                {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
                {liveCount > 0 && (
                  <> · <span className="text-green-600 font-medium">{liveCount} live</span></>
                )}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Campaign</th>
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Brand</th>
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Publisher</th>
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Status</th>
                      <th className="text-left pb-2.5 pr-4 font-semibold text-gray-500">Date Range</th>
                      <th className="text-right pb-2.5 font-semibold text-gray-500">Responses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {campaigns.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50/50">
                        <td className="py-3 pr-4 font-medium text-gray-900">{c.campaign_name}</td>
                        <td className="py-3 pr-4 text-gray-600">{c.brand_name}</td>
                        <td className="py-3 pr-4 text-gray-500">
                          {c.publisher || "—"}
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`font-semibold px-2 py-0.5 rounded-full capitalize ${CAMPAIGN_STATUS_COLOURS[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-gray-400">
                          {c.start_date ? `${c.start_date} → ${c.end_date ?? "ongoing"}` : "—"}
                        </td>
                        <td className="py-3 text-right font-medium text-gray-900">
                          {(c.response_count ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Close</button>
        </div>
      </div>
    </div>
  );
}

// Reads the ?createForProject= / ?editSurveyForProject= query params a
// Research Project's evidence journey (Phase 2, Steps 2–3) navigates here
// with — the former to create a new survey, the latter to fix an existing
// attached survey's translations from the Workspace's Deployment Readiness
// step. Isolated in its own component so only this leaf needs the
// useSearchParams() Suspense boundary, not the whole (otherwise
// statically-rendered) page.
function EvidenceLinkReader({
  onCreateForProject, onEditSurveyForProject, onOpenSurvey, onReturnTo,
}: {
  onCreateForProject: (projectId: string | null) => void;
  onEditSurveyForProject: (projectId: string | null) => void;
  onOpenSurvey: (surveyId: string | null) => void;
  onReturnTo: (projectId: string | null) => void;
}) {
  const searchParams = useSearchParams();
  const createForProject = searchParams.get("createForProject");
  const editSurveyForProject = searchParams.get("editSurveyForProject");
  const openSurvey = searchParams.get("openSurvey");
  const returnTo = searchParams.get("returnTo");
  useEffect(() => { onCreateForProject(createForProject); }, [createForProject, onCreateForProject]);
  useEffect(() => { onEditSurveyForProject(editSurveyForProject); }, [editSurveyForProject, onEditSurveyForProject]);
  useEffect(() => { onOpenSurvey(openSurvey); }, [openSurvey, onOpenSurvey]);
  useEffect(() => { onReturnTo(returnTo); }, [returnTo, onReturnTo]);
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SurveysPage() {
  // Data
  const [surveys,  setSurveys]  = useState<Survey[]>([]);
  const [orgs,     setOrgs]     = useState<{ id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" }[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Toolbar
  const [activeTab,     setActiveTab]     = useState<"active" | "archived" | "deleted">("active");
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState<"all" | "draft" | "ready">("all");
  const [usageFilter,   setUsageFilter]   = useState<"all" | "unused" | "used" | "live">("all");
  const [createdFilter, setCreatedFilter] = useState<"all" | "today" | "7days" | "30days">("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [sortBy,        setSortBy]        = useState<"recent" | "oldest" | "az" | "lastResponse">("recent");

  // Preview modal
  const [previewSurvey, setPreviewSurvey] = useState<Survey | null>(null);

  // Usage modal
  const [usageSurvey,    setUsageSurvey]    = useState<Survey | null>(null);
  const [modalCampaigns, setModalCampaigns] = useState<ModalCampaign[] | null>(null);
  const [loadingModal,   setLoadingModal]   = useState(false);

  // Intelligence modal
  const [intelligenceSurvey, setIntelligenceSurvey] = useState<Survey | null>(null);

  // Edit drawer — mounts the shared canonical SurveyEditor. The page owns only
  // which survey to edit (or create), the create-prefill, and post-save routing.
  const [drawerOpen,          setDrawerOpen]          = useState(false);
  const [editorSurveyId,      setEditorSurveyId]      = useState<string | null>(null);
  const [editorInitialFields, setEditorInitialFields] = useState<Partial<EditFields> | undefined>(undefined);
  const [editorIsSimulated,   setEditorIsSimulated]   = useState<boolean | undefined>(undefined);
  const [toast,               setToast]               = useState<{ msg: string; ok: boolean } | null>(null);

  // Evidence Orchestration (Phase 2, Step 2) — set when this create drawer
  // was auto-opened from a Research Project's "Create Evidence" flow, so
  // handleSave() knows to attach the new survey back to that project and
  // return there, instead of the normal stay-on-page save.
  const router = useRouter();
  const [linkedProjectId,   setLinkedProjectId]   = useState<string | null>(null);
  const [linkedProjectName, setLinkedProjectName] = useState<string | null>(null);
  // The linked project's research_mode — decides whether the survey this
  // creates should be marked is_simulated (so the attach that follows
  // doesn't get rejected by the provenance trigger) and which Workspace
  // it returns to (/product-walkthrough vs /research-projects).
  const [linkedProjectResearchMode, setLinkedProjectResearchMode] = useState<"real" | "simulated">("real");
  const [autoLinkActive,    setAutoLinkActive]     = useState(false);
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (!linkedProjectId || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    (async () => {
      const res = await fetch(`/api/research-projects/${linkedProjectId}`);
      if (!res.ok) return;
      const { data: proj } = await res.json();
      setLinkedProjectName(proj.project_name);
      setLinkedProjectResearchMode(proj.research_mode === "simulated" ? "simulated" : "real");
      // Pre-fill from the project so the new survey's name follows the same
      // Topic | Type | Brand | Agency convention the project itself uses.
      setEditorSurveyId(null);
      setEditorInitialFields({
        topic: proj.topic ?? "",
        study_type: proj.study_type ?? "custom",
        brand_org_id: proj.brand_org_id ?? "",
        agency_org_id: proj.agency_org_id ?? "",
      });
      setEditorIsSimulated(proj.research_mode === "simulated");
      setAutoLinkActive(true);
      setDrawerOpen(true);
    })();
  }, [linkedProjectId]);

  // Deployment Readiness (Phase 2, Step 3) "Add translations" remediation —
  // opens the project's already-attached survey for editing (not a new
  // create), and returns to the Workspace on save instead of the normal
  // stay-on-page save, so the wizard can re-check language coverage.
  const [editForProjectId,   setEditForProjectId]   = useState<string | null>(null);
  const [editForProjectName, setEditForProjectName] = useState<string | null>(null);
  const [editLinkActive,     setEditLinkActive]     = useState(false);
  const autoEditOpenedRef = useRef(false);

  useEffect(() => {
    if (!editForProjectId || autoEditOpenedRef.current) return;
    autoEditOpenedRef.current = true;
    (async () => {
      const projRes = await fetch(`/api/research-projects/${editForProjectId}`);
      if (!projRes.ok) return;
      const { data: proj } = await projRes.json();
      setEditForProjectName(proj.project_name);
      if (!proj.survey_id) return;
      setEditorSurveyId(proj.survey_id);
      setEditorInitialFields(undefined);
      setEditorIsSimulated(undefined);
      setEditLinkActive(true);
      setDrawerOpen(true);
    })();
  }, [editForProjectId]);

  // "Open" on a Research Project Workspace's Evidence card — jumps straight
  // to that specific survey's edit drawer instead of the bare surveys list.
  // Plain edit: no auto-attach, no forced redirect back afterward.
  const [openSurveyId, setOpenSurveyId] = useState<string | null>(null);
  const autoOpenSurveyRef = useRef(false);

  useEffect(() => {
    if (!openSurveyId || autoOpenSurveyRef.current) return;
    autoOpenSurveyRef.current = true;
    setEditorSurveyId(openSurveyId);
    setEditorInitialFields(undefined);
    setEditorIsSimulated(undefined);
    setDrawerOpen(true);
  }, [openSurveyId]);

  // A Research Project's Evidence card "Open →" link carries this so the
  // Workspace is always one click away again — on close *or* save, not just
  // save, unlike the create/edit-for-project flows above (which always
  // finish into a specific next step). This is a plain "you're back", no
  // wizard re-opening.
  const [returnToProjectId, setReturnToProjectId] = useState<string | null>(null);

  function closeDrawer() {
    if (returnToProjectId) {
      router.push(`/research-projects/${returnToProjectId}?returned=1`);
      return;
    }
    setDrawerOpen(false);
  }

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [sRes, oRes] = await Promise.all([
      fetch("/api/surveys"),
      fetch("/api/organisations"),
    ]);
    setSurveys((await sRes.json()).data ?? []);
    setOrgs((await oRes.json()).data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const orgById = useMemo(() => new Map(orgs.map(o => [o.id, o])), [orgs]);
  const orgName = useCallback((id: string | null) => (id ? orgById.get(id)?.name ?? "" : ""), [orgById]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const activeSurveys   = useMemo(() => surveys.filter(s => s.status === "draft" || s.status === "ready"), [surveys]);
  const archivedSurveys = useMemo(() => surveys.filter(s => s.status === "archived"), [surveys]);
  const deletedSurveys  = useMemo(() => surveys.filter(s => s.status === "deleted"),  [surveys]);

  // Option list for the Language filter — only languages actually enabled on
  // at least one loaded survey, so the dropdown stays short and relevant.
  const languageFilterOptions = useMemo(() => {
    const codes = new Set<string>();
    for (const s of surveys) for (const code of s.enabled_languages ?? ["en"]) codes.add(code);
    return SUPPORTED_LANGUAGES.filter(l => codes.has(l.code));
  }, [surveys]);

  const displayed = useMemo(() => {
    let list: Survey[];
    if (activeTab === "active")        list = activeSurveys;
    else if (activeTab === "archived") list = archivedSurveys;
    else                               list = deletedSurveys;

    if (activeTab === "active" && statusFilter !== "all") list = list.filter(s => s.status === statusFilter);
    if (usageFilter === "unused") list = list.filter(s => s.campaign_count === 0);
    if (usageFilter === "used")   list = list.filter(s => s.campaign_count > 0);
    if (usageFilter === "live")   list = list.filter(s => s.live_campaign_count > 0);

    const now = new Date();
    if (createdFilter === "today") {
      list = list.filter(s => new Date(s.created_at).toDateString() === now.toDateString());
    } else if (createdFilter === "7days") {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
      list = list.filter(s => new Date(s.created_at) >= cutoff);
    } else if (createdFilter === "30days") {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
      list = list.filter(s => new Date(s.created_at) >= cutoff);
    }

    if (languageFilter !== "all") {
      list = list.filter(s => (s.enabled_languages ?? ["en"]).includes(languageFilter));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q) ||
        (s.created_by ?? "").toLowerCase().includes(q)
      );
    }

    switch (sortBy) {
      case "recent": return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "oldest": return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case "az":     return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case "lastResponse":
        return [...list].sort((a, b) => {
          if (!a.last_response_at && !b.last_response_at) return 0;
          if (!a.last_response_at) return 1;   // surveys with no responses sink to the bottom
          if (!b.last_response_at) return -1;
          return new Date(b.last_response_at).getTime() - new Date(a.last_response_at).getTime();
        });
      default:       return list;
    }
  }, [surveys, activeTab, statusFilter, usageFilter, createdFilter, languageFilter, sortBy, search, activeSurveys, archivedSurveys, deletedSurveys]);

  // ── Usage modal ───────────────────────────────────────────────────────────
  async function openUsageModal(s: Survey) {
    setUsageSurvey(s);
    setModalCampaigns(null);
    setLoadingModal(true);
    const res = await fetch(`/api/surveys/${s.id}/campaigns`);
    const json = await res.json();
    setModalCampaigns(json.data ?? []);
    setLoadingModal(false);
  }

  // ── Drawer helpers — open the shared SurveyEditor for create / edit ──────────
  // The editor loads/prefills, validates and persists the survey itself; the
  // page only tracks which survey and the link/return context.
  function openCreate() {
    setEditorSurveyId(null);
    setEditorInitialFields(undefined);
    setEditorIsSimulated(undefined);
    setAutoLinkActive(false);
    setEditLinkActive(false);
    setDrawerOpen(true);
  }

  function openEdit(s: Survey) {
    setAutoLinkActive(false);
    setEditLinkActive(false);
    setEditorSurveyId(s.id);
    setEditorInitialFields(undefined);
    setEditorIsSimulated(undefined);
    setDrawerOpen(true);
  }

  // Post-save routing. The shared SurveyEditor persists the survey and shows
  // the success/error (and auto-downgrade) toast; the page only decides where
  // to go next. Behaviour is unchanged from the previous inline editor: a
  // survey created for a linked project attaches + returns to that Workspace;
  // an edit-for-project or plain Open→ returns; otherwise stay + refresh.
  async function handleEditorSaved({ survey, isCreate }: { survey: { id: string }; isCreate: boolean; autoDowngraded: boolean }) {
    setDrawerOpen(false);

    if (autoLinkActive && linkedProjectId && isCreate) {
      const workspaceHref = linkedProjectResearchMode === "simulated"
        ? `/product-walkthrough/${linkedProjectId}`
        : `/research-projects/${linkedProjectId}`;
      const attachRes = await fetch(`/api/research-projects/${linkedProjectId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence_type: "survey", evidence_id: survey.id }),
      });
      if (!attachRes.ok) {
        const attachJson = await attachRes.json().catch(() => ({}));
        showToast(attachJson.error ?? "Survey saved, but couldn't be attached to the project.", false);
        return;
      }
      router.push(`${workspaceHref}?evidenceAdded=1`);
      return;
    }

    if (editLinkActive && editForProjectId) {
      router.push(`/research-projects/${editForProjectId}?evidenceAdded=1`);
      return;
    }

    if (returnToProjectId) {
      router.push(`/research-projects/${returnToProjectId}?returned=1`);
      return;
    }

    load();
  }

  // ── Survey actions ─────────────────────────────────────────────────────────
  async function openDuplicate(s: Survey) {
    const payload: EditFields = {
      name:           `${s.name} (Copy)`,
      description:    s.description,
      brand_org_id:   s.brand_org_id ?? "",
      agency_org_id:  s.agency_org_id ?? "",
      topic:          s.topic ?? "",
      study_type:     s.study_type ?? "custom",
      questions:      s.questions,
      thank_you_title: s.thank_you_title ?? { en: "Thank you!" },
      thank_you_body:  s.thank_you_body ?? { en: "Your response has been recorded." },
      enabled_languages: s.enabled_languages?.length ? s.enabled_languages : ["en"],
      status:          "draft",
      is_template:     s.is_template,
    };
    await fetch("/api/surveys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    load();
  }

  async function handleArchive(id: string) {
    if (!confirm("Archive this survey? It will be hidden from the active list but can be restored at any time.")) return;
    await fetch(`/api/surveys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "archive" }),
    });
    load();
  }

  async function handleRestore(id: string) {
    await fetch(`/api/surveys/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _action: "restore" }),
    });
    load();
  }

  async function handleSoftDelete(s: Survey) {
    const msg = s.response_count > 0
      ? `⚠️ "${s.name}" has ${s.response_count.toLocaleString()} response${s.response_count !== 1 ? "s" : ""} collected.\n\nThe response data will be preserved in the database, but this survey will no longer appear in your active view.\n\nMove to deleted items?`
      : `Move "${s.name}" to deleted items? It can be restored later.`;
    if (!confirm(msg)) return;
    const res = await fetch(`/api/surveys/${s.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Could not delete survey.");
    }
    load();
  }

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const d = (s: string | null | undefined) => s ? new Date(s).toISOString().slice(0, 10) : "";
    const rows = displayed.map(s => ({
      "Name":             s.name,
      "Topic":            s.topic ?? "",
      "Brand":            orgName(s.brand_org_id),
      "Agency":           orgName(s.agency_org_id),
      "Type":             studyTypeLabel(s.study_type),
      "Description":      s.description ?? "",
      "Status":           effectiveSurveyStatus(s),
      "Questions":        s.questions.length,
      "Created By":       s.created_by ?? "",
      "Created":          d(s.created_at),
      "Updated":          d(s.updated_at),
      "Campaigns":        s.campaign_count,
      "Live Campaigns":   s.live_campaign_count,
      "Responses":        s.response_count,
      "Last Used":        d(s.last_used_at),
      "Last Response":    d(s.last_response_at),
      "Archived Date":    d(s.archived_at),
      "Deleted Date":     d(s.deleted_at),
    }));
    const csv  = Papa.unparse(rows);
    const link = document.createElement("a");
    link.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `fanometrix-surveys-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AdminShell>
      <Suspense fallback={null}>
        <EvidenceLinkReader onCreateForProject={setLinkedProjectId} onEditSurveyForProject={setEditForProjectId} onOpenSurvey={setOpenSurveyId} onReturnTo={setReturnToProjectId} />
      </Suspense>
      <div className="p-4 md:p-6 max-w-6xl mx-auto">

        {linkedProjectName && linkedProjectId && (
          <div className="mb-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: "#0B1929" }}>
            <p className="text-sm text-white">
              Creating a survey for <span className="font-semibold" style={{ color: "#D7B87A" }}>{linkedProjectName}</span>, it will be attached automatically once saved.
            </p>
            <div className="flex items-center gap-3 flex-shrink-0">
              {!drawerOpen && (
                <button onClick={() => setDrawerOpen(true)} className="text-xs font-semibold underline" style={{ color: "#D7B87A" }}>
                  Continue Creating Survey
                </button>
              )}
              <Link href={`/research-projects/${linkedProjectId}`} className="text-xs font-semibold underline" style={{ color: "#D7B87A" }}>
                Cancel and return
              </Link>
            </div>
          </div>
        )}

        {editForProjectName && editForProjectId && (
          <div className="mb-4 rounded-xl px-4 py-3 flex items-center justify-between gap-3" style={{ background: "#0B1929" }}>
            <p className="text-sm text-white">
              Editing the survey for <span className="font-semibold" style={{ color: "#D7B87A" }}>{editForProjectName}</span>, add the missing language, then save to continue.
            </p>
            <div className="flex items-center gap-3 flex-shrink-0">
              {!drawerOpen && (
                <button onClick={() => setDrawerOpen(true)} className="text-xs font-semibold underline" style={{ color: "#D7B87A" }}>
                  Reopen Survey Draft
                </button>
              )}
              <Link href={`/research-projects/${editForProjectId}`} className="text-xs font-semibold underline" style={{ color: "#D7B87A" }}>
                Cancel and return
              </Link>
            </div>
          </div>
        )}

        {/* ── Page header ── */}
        <div className="mb-5">
          {/* Title + counts + buttons — stacks on mobile, row on sm+ */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Surveys</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                {activeSurveys.length} Active · {archivedSurveys.length} Archived · {deletedSurveys.length} Deleted
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
              <button
                onClick={openCreate}
                className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                style={{ background: GOLD, color: "#0B1929" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = GOLD; }}
              >
                + Create Survey
              </button>
            </div>
          </div>
          <details className="group bg-gray-50 w-full">
            <summary className="cursor-pointer select-none list-none py-3">
              <p className="text-sm text-gray-500 leading-relaxed">
                Reusable questionnaires containing questions and a thank-you screen shown inside the
                300×250 MPU. Surveys must be attached to a campaign before going live.{" "}
                <span className="font-semibold inline-flex items-center gap-1" style={{ color: GOLD }}>
                  Expand to find out more
                  <span className="inline-block transition-transform group-open:rotate-90">›</span>
                </span>
              </p>
            </summary>
            <div className="pb-4 pt-3 mt-1 border-t border-gray-200 text-sm text-gray-600 leading-relaxed space-y-4">
              <div>
                <p className="font-semibold text-gray-700 mb-1">Survey statuses</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Draft</strong>: still being written, cannot be attached to a campaign yet</li>
                  <li><strong>Ready</strong>: complete and approved, can be attached to any campaign</li>
                  <li><strong>Archived</strong>: hidden from the default view but still searchable and reusable</li>
                  <li><strong>Deleted</strong>: soft deleted, not visible by default, can still be restored by an admin</li>
                </ul>
                <p className="mt-1 text-gray-500">A survey is never Live itself, campaigns control serving. The same survey can be used in a Live campaign, a Paused campaign, and a Closed campaign at the same time.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Creating a survey</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Click + Create Survey, give it a name and optional description, and leave the status as Draft</li>
                  <li>Add up to {MAX_QUESTIONS} questions, each with up to {MAX_OPTIONS} answer options</li>
                  <li>Customise the Thank You screen shown to fans after they finish</li>
                  <li>Use Preview to see how it looks in the 300×250 ad unit, previewing never records a response</li>
                  <li>Once approved, change the status to Ready so it can be attached to campaigns</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Content limits</p>
                <p>Questions and answers are capped so everything fits inside the 300×250 ad unit: {MAX_QUESTIONS} questions max, {MAX_OPTIONS} answers per question, {MAX_Q_CHARS} characters per question, {MAX_OPT_CHARS} characters per answer, {MAX_TY_TITLE} characters for the thank you title, and {MAX_TY_BODY} characters for the thank you message.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-1">Deleting a survey</p>
                <p>A survey can only be deleted once it has zero responses and isn&apos;t linked to any campaigns. If either is still true, the Delete button stays disabled, archive it instead. Archived surveys stay searchable and can be restored later.</p>
              </div>
              <a href="/fanometrix-guide" target="_blank" rel="noopener noreferrer"
                className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: "#0B1929" }}>
                Read the full Fanometrix Guide
                <span className="text-[10px] opacity-60">↗</span>
              </a>
            </div>
          </details>
        </div>

        {/* ── Search + Filters ── */}
        <div className="mb-5 space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">🔍</span>
            <input
              type="search"
              placeholder="Search surveys…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {activeTab === "active" && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
              </select>
            )}

            <select
              value={usageFilter}
              onChange={e => setUsageFilter(e.target.value as typeof usageFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600"
            >
              <option value="all">All Usage</option>
              <option value="unused">Unused</option>
              <option value="used">Used by campaigns</option>
              <option value="live">Serving live campaigns</option>
            </select>

            <select
              value={createdFilter}
              onChange={e => setCreatedFilter(e.target.value as typeof createdFilter)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600"
            >
              <option value="all">Any time (created)</option>
              <option value="today">Created today</option>
              <option value="7days">Created in last 7 days</option>
              <option value="30days">Created in last 30 days</option>
            </select>

            <select
              value={languageFilter}
              onChange={e => setLanguageFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600"
            >
              <option value="all">All Languages</option>
              {languageFilterOptions.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A] text-gray-600"
            >
              <optgroup label="Sort by created date">
                <option value="recent">Most recently created</option>
                <option value="oldest">Oldest created first</option>
              </optgroup>
              <optgroup label="Sort by usage">
                <option value="lastResponse">Most recent response</option>
              </optgroup>
              <option value="az">A–Z</option>
            </select>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-0 mb-5 border-b border-gray-200">
          {(
            [
              { key: "active",   label: `Active (${activeSurveys.length})`    },
              { key: "archived", label: `Archived (${archivedSurveys.length})` },
              { key: "deleted",  label: `Deleted (${deletedSurveys.length})`   },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setStatusFilter("all"); setUsageFilter("all"); setCreatedFilter("all"); setSearch(""); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? "border-[#D7B87A] text-[#0B1929]"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── List ── */}
        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && displayed.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">◫</p>
            <p className="font-medium">
              {activeTab === "active"   ? "No active surveys"   :
               activeTab === "archived" ? "No archived surveys" :
                                          "No deleted surveys"}
            </p>
            {activeTab === "active" && <p className="text-sm mt-1">Create your first survey to get started.</p>}
          </div>
        )}

        <div className="space-y-3">
          {displayed.map(s => (
            <div key={s.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">

              {/* ── Active / Archived card ── */}
              {s.status !== "deleted" && (
                <>
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{s.name}</p>
                        {s.is_template && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Template</span>
                        )}
                      </div>
                      {s.description && <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>}
                      {s.created_by && (
                        <p className="text-xs text-gray-400 mt-0.5">Created by {s.created_by}</p>
                      )}
                    </div>
                    {/* Lifecycle badge — top-right, subtle. Shows "Needs Fix" if stored
                        as Ready but failing MPU validation. */}
                    {(() => {
                      const eff = effectiveSurveyStatus(s);
                      return (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap ${STATUS_COLOURS[eff] ?? STATUS_COLOURS.draft}`}>
                          {statusLabel(eff)}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Row 1: structure + dates */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-400">
                    <span>{s.questions.length} question{s.questions.length !== 1 ? "s" : ""}</span>
                    <span className="text-gray-200">·</span>
                    <span>Created: {formatDate(s.created_at)}</span>
                    <span className="text-gray-200">·</span>
                    <span>Updated: {formatDate(s.updated_at)}</span>
                    {s.status === "archived" && s.archived_at && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-amber-600">Archived: {formatDate(s.archived_at)}</span>
                      </>
                    )}

                    {s.last_response_at && formatRelativeTime(s.last_response_at) && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span title={formatDatetime(s.last_response_at)}>
                          Last response: {formatRelativeTime(s.last_response_at)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Row 2: usage stats */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-400">
                    {s.campaign_count > 0 ? (
                      <button
                        onClick={() => openUsageModal(s)}
                        className="text-[#0B1929] font-medium hover:text-[#D7B87A] hover:underline transition-colors"
                      >
                        Used by: {s.campaign_count} campaign{s.campaign_count !== 1 ? "s" : ""}
                      </button>
                    ) : (
                      <span>Not yet used</span>
                    )}

                    {s.live_campaign_count > 0 && (
                      <>
                        <span className="text-gray-200">·</span>
                        <span className="text-green-600 font-medium">
                          Serving in: {s.live_campaign_count} live campaign{s.live_campaign_count !== 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Language coverage badges */}
                  {(() => {
                    const qs = s.questions as LocalisedQuestion[];
                    const enabled = SUPPORTED_LANGUAGES.filter(l => (s.enabled_languages ?? ["en"]).includes(l.code));
                    const completedLangs = getCompletedLanguages({ questions: qs, thank_you_title: s.thank_you_title, thank_you_body: s.thank_you_body });
                    return (
                      <div className="flex gap-1.5 mt-3 flex-wrap">
                        {enabled.map(lang => {
                          const isEN     = lang.code === "en";
                          const complete = qs.length > 0 && completedLangs.includes(lang.code);
                          const partial  = !isEN && !complete && qs.some(q =>
                            (q.text as Record<string, string>)[lang.code]?.trim()
                          );
                          if (!complete && !partial) return null;
                          return (
                            <span key={lang.code} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                              complete
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-amber-50 text-amber-600 border border-amber-200"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${complete ? "bg-green-500" : "bg-amber-400"}`} />
                              {lang.label}
                              {!complete && <span className="text-[10px]">partial</span>}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <button
                      onClick={() => setIntelligenceSurvey(s)}
                      className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Intelligence
                    </button>

                    <button
                      onClick={() => openEdit(s)}
                      className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => openDuplicate(s)}
                      className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Duplicate
                    </button>

                    {s.status !== "archived" ? (
                      <>
                        <button
                          onClick={() => handleArchive(s.id)}
                          className="text-xs border border-amber-200 text-amber-700 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Archive
                        </button>
                        <button
                          onClick={() => handleSoftDelete(s)}
                          disabled={s.campaign_count > 0}
                          title={
                            s.campaign_count > 0
                              ? "This survey is still linked to active campaigns. Remove it from all campaigns first."
                              : "Move to deleted items"
                          }
                          className="text-xs border border-red-100 text-red-400 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleRestore(s.id)}
                        className="text-xs border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* ── Deleted card ── */}
              {s.status === "deleted" && (
                <>
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-0.5">
                      <p className="font-semibold text-gray-400 line-through">{s.name}</p>
                      <span className="text-xs font-medium bg-red-100 text-red-600 px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap">Deleted</span>
                    </div>
                    {s.description && <p className="text-xs text-gray-400">{s.description}</p>}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-400">
                      {s.deleted_by && <span>Deleted by: <span className="font-medium text-gray-500">{s.deleted_by}</span></span>}
                      {s.deleted_at && <><span className="text-gray-200">·</span><span>Deleted: {formatDate(s.deleted_at)}</span></>}
                      {s.delete_reason && <><span className="text-gray-200">·</span><span>Reason: {s.delete_reason}</span></>}
                      <span className="text-gray-200">·</span>
                      <span>{s.questions.length} question{s.questions.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => openDuplicate(s)}
                      className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => handleRestore(s.id)}
                      className="text-xs border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Restore
                    </button>
                  </div>
                </>
              )}

            </div>
          ))}
        </div>

      </div>

      {/* ── MPU Preview Modal ── */}
      {previewSurvey && (
        <SurveyPreviewModal survey={previewSurvey} onClose={() => setPreviewSurvey(null)} />
      )}

      {/* ── Survey Usage Modal ── */}
      {usageSurvey && (
        <SurveyUsageModal
          survey={usageSurvey}
          campaigns={modalCampaigns}
          loading={loadingModal}
          onClose={() => { setUsageSurvey(null); setModalCampaigns(null); }}
        />
      )}

      {/* ── Survey Intelligence Modal ── */}
      {intelligenceSurvey && (
        <SurveyIntelligenceModal
          survey={intelligenceSurvey}
          onClose={() => setIntelligenceSurvey(null)}
        />
      )}

      {/* ── Edit / Create Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={closeDrawer} />
          <div className="w-full sm:w-[520px] flex flex-col shadow-2xl overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ background: "var(--surface)", borderColor: "var(--border-subtle)" }}>
              <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>{editorSurveyId ? "Edit survey" : "Create survey"}</h2>
              <button onClick={closeDrawer} className="text-xl leading-none hover:opacity-70" style={{ color: "var(--text-tertiary)" }}>×</button>
            </div>
            {/* The one canonical Survey editor — the same component mounted in a
                Research Project. It loads/prefills, validates, translates and
                persists; the page only routes on save (handleEditorSaved). */}
            <SurveyEditor
              surveyId={editorSurveyId ?? undefined}
              initialFields={editorInitialFields}
              isSimulated={editorIsSimulated}
              onSaved={handleEditorSaved}
              onCancel={closeDrawer}
            />
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.ok ? "bg-green-600 text-white" : "bg-orange-500 text-white"
        }`}>
          {toast.ok ? "✓" : "⚠"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}
