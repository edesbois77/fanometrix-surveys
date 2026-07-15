"use client";

// Product Walkthrough's single-page body — the linear, scroll-through
// presentation experience shown at /product-walkthrough/[id]. Structurally
// independent of the real Research Project Workspace (WorkspaceBody): the
// two share the data layer (ProjectProvider / useResearchProject), the
// section components, and the mode-agnostic modals/constants in
// workspace-shared.tsx, but neither renders the other. This separation
// (Step 1 of the Research Project Shell migration) is what lets the real
// workspace be restructured into a multi-page shell without disturbing the
// walkthrough, and vice versa.
//
// The walkthrough deliberately stays a single scrolling column with every
// section present at once — a linear story suits walking a prospect through
// the product better than tabbed navigation. All of its report links stay
// inside its own /product-walkthrough tree (the report pages derive their
// back-links from the current path), so a walkthrough never navigates the
// user out into /research-projects. There is no cross-route mode-redirect:
// a Product Walkthrough opens here and only here.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { ResearchProjectEditDrawer, type ResearchProjectBriefFields } from "@/app/components/research-projects/ResearchProjectEditDrawer";
import { AttachExistingSurveyModal } from "@/app/components/research-projects/AttachExistingSurveyModal";
import { AttachExistingConversationSearchModal } from "@/app/components/research-projects/AttachExistingConversationSearchModal";
import { AttachExistingDocumentModal } from "@/app/components/research-projects/AttachExistingDocumentModal";
import type { Campaign } from "@/app/components/campaigns/types";
import { studyTypeLabel } from "@/lib/naming";
import { researchSubjectLabel } from "@/lib/research-subjects";
import { formatRelativeTime, formatRelativeDay } from "@/lib/format-relative-time";
import { computeLifecycleStages, computeResearchProgress } from "@/lib/research-project-lifecycle";
import { computeReportReadiness } from "@/lib/report-readiness";
import { computeProjectStatus, PROJECT_STATUS_META } from "@/lib/research-project-status";
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { SimulationInformationPanel } from "@/app/components/simulation/SimulationInformationPanel";
import { SectionCard, EmptyState, CollapsedSummary, InfoContent } from "@/app/components/research-projects/Shell";
import { ConclusionSection } from "@/app/components/research-projects/ConclusionSection";
import { KnowledgeSection } from "@/app/components/research-projects/KnowledgeSection";
import { ReportsSection } from "@/app/components/research-projects/ReportsSection";
import { DashboardSection } from "@/app/components/research-projects/DashboardSection";
import { IntelligenceSection } from "@/app/components/research-projects/IntelligenceSection";
import { ResearchSourcesSection } from "@/app/components/research-projects/ResearchSourcesSection";
import { CampaignGroupsSection } from "@/app/components/research-projects/CampaignGroupsSection";
import { getWorkspaceScrollTarget, clearWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { ProjectProvider, useResearchProject, type EvidenceItem, type ActivityRow } from "@/app/components/research-projects/ProjectProvider";
import {
  SURVEY_STATUS_META, SOCIAL_SEARCH_STATUS_META, STAGE_STATE_META, EVIDENCE_TYPE_PLURAL,
  ProjectStatusBadge, AddEvidenceModal, DeploymentWizardModal,
} from "@/app/components/research-projects/workspace-shared";

// The exported component is a thin wrapper that mounts the shared data layer
// (ProjectProvider); WalkthroughBodyContent below reads that data through
// useResearchProject() and renders the walkthrough itself.
export function WalkthroughBody({ projectId }: { projectId: string }) {
  return (
    <ProjectProvider projectId={projectId}>
      <WalkthroughBodyContent />
    </ProjectProvider>
  );
}

function WalkthroughBodyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "publisher";
  const isLockedByAdminFor = useCallback((c: Campaign) => c.created_by_admin && !isAdmin, [isAdmin]);

  const {
    projectId: id, project, orgs, campaigns, campaignGroups, deletedCampaigns,
    loadingDeletedCampaigns, loading, error, load, loadDeletedCampaigns,
  } = useResearchProject();

  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [attachExistingOpen, setAttachExistingOpen] = useState(false);
  const [attachExistingSearchOpen, setAttachExistingSearchOpen] = useState(false);
  const [attachExistingDocumentOpen, setAttachExistingDocumentOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPresetSurveyId, setWizardPresetSurveyId] = useState<string | null>(null);
  const [editingBrief, setEditingBrief] = useState<Partial<ResearchProjectBriefFields> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Research Sources' expand/collapse — every source's own id, independently
  // managed (a Set, not a single accordion index) so expanding one never
  // collapses another. Starts empty: every card collapsed by default.
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(new Set());
  const toggleSourceExpanded = useCallback((evidenceId: string) => {
    setExpandedSourceIds(prev => {
      const next = new Set(prev);
      if (next.has(evidenceId)) next.delete(evidenceId); else next.add(evidenceId);
      return next;
    });
  }, []);

  // Project Information — edit mode for the settings subset (Confidentiality,
  // Version). Owner/Created/Last Updated/Status stay permanently read-only —
  // Status is derived, never a manual field.
  const [editingProjectInfo, setEditingProjectInfo] = useState(false);
  const [draftConfidentiality, setDraftConfidentiality] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState<string | null>(null);
  const [savingProjectInfo, setSavingProjectInfo] = useState(false);
  const [projectInfoError, setProjectInfoError] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // Evidence Orchestration: "Add Research Source" and "Add translations"
  // both redirect here with ?evidenceAdded=1 once Survey's specialist
  // workflow (creation or edit) has completed — this continues the journey
  // into the deployment wizard rather than stopping, since only Survey
  // evidence powers Campaigns/the Deployment Wizard. Conversation Search's
  // create-flow redirects with ?evidenceAdded=social_search instead — it has
  // no deployment concept, so it only needs a toast + reload, not the wizard.
  const evidenceAddedHandledRef = useRef(false);
  useEffect(() => {
    const added = searchParams.get("evidenceAdded");
    if (!added) return;
    if (!project || evidenceAddedHandledRef.current) return;
    evidenceAddedHandledRef.current = true;
    router.replace(`/product-walkthrough/${id}`);
    load();
    if (added === "1") {
      setToast("Survey saved, continuing deployment setup.");
      setWizardOpen(true);
    } else {
      setToast("Conversation search saved.");
    }
  }, [searchParams, id, project, router, load]);

  // Create Campaign — deep-linked to the Campaigns page, returns here with
  // ?campaignAdded=1. Nothing further to continue into (unlike Research
  // Sources), just a toast and a refreshed Campaigns list.
  const campaignAddedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("campaignAdded") !== "1") return;
    if (!project || campaignAddedHandledRef.current) return;
    campaignAddedHandledRef.current = true;
    setToast("Campaign created.");
    router.replace(`/product-walkthrough/${id}`);
    load();
  }, [searchParams, id, project, router, load]);

  // Plain "Open →" from a Research Source card — a simple return, no wizard.
  const returnedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("returned") !== "1") return;
    if (!project || returnedHandledRef.current) return;
    returnedHandledRef.current = true;
    setToast("Welcome back.");
    router.replace(`/product-walkthrough/${id}`);
    load();
  }, [searchParams, id, project, router, load]);

  // Scrolls back to a section once the real content exists to scroll to —
  // e.g. the "← Back to Workspace" link on a Survey/Conversation
  // Intelligence, Key Findings or Executive Report page. Reads
  // sessionStorage (set by that link, see lib/workspace-scroll.ts) first,
  // falling back to the URL's own #hash for a direct link/bookmark.
  //
  // Runs on every render (no dependency array) rather than once when
  // `project` first loads: if this walkthrough instance is one Next's router
  // cache already had mounted with `project` already loaded, a
  // `[project]`-keyed effect would never fire again since that dependency
  // never changes on this visit. `lastScrolledRef` still stops it from
  // re-scrolling on unrelated re-renders once it's handled the current
  // target, and it deliberately waits (tries again next render) rather than
  // giving up if the target element hasn't rendered yet.
  const lastScrolledRef = useRef<string | null>(null);
  useEffect(() => {
    const stored = getWorkspaceScrollTarget();
    const targetId = stored || window.location.hash.replace(/^#/, "");
    if (!targetId || targetId === lastScrolledRef.current) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    lastScrolledRef.current = targetId;
    if (stored) clearWorkspaceScrollTarget();
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  });

  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");
  const orgPublishers = orgs.filter(o => o.type === "publisher" && (user?.role !== "publisher" || o.id === user.organisationId));
  const orgBrands = orgs.filter(o => o.type === "brand");
  const orgAgencies = orgs.filter(o => o.type === "agency");

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Only the very first load (no project fetched yet) replaces the whole
  // page with this placeholder. A background refresh (e.g. load() called
  // after closing an Intelligence modal) keeps loading true against an
  // already-populated project — gating on loading alone would unmount the
  // entire page in favour of this ~256px placeholder and back again, which
  // collapses the document height and resets scroll to the top even though
  // nothing actually navigated.
  if (loading && !project) return (
    <AdminShell>
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading research project…</p>
      </div>
    </AdminShell>
  );

  if (error || !project) return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto text-center py-20">
        <p className="text-gray-400 mb-4">{error || "Research project not found."}</p>
        <Link href="/research-projects" className="text-[#D7B87A] hover:underline text-sm">← Back to Research Projects</Link>
      </div>
    </AdminShell>
  );

  // Product Walkthrough pages show just the Research Name (topic) as the
  // title — project_name is the classification-suffixed "Final Research
  // Name" (topic | study type | brand | subject | agency), useful for
  // disambiguating in a flat list of many projects, but redundant clutter
  // as a page title once you're already inside one project.
  const displayName = project.research_mode === "simulated" && project.topic?.trim()
    ? project.topic.trim()
    : project.project_name;

  const surveyEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey
  );
  const conversationSearchEvidence = project.evidence.filter(e => e.evidence_type === "social_search" && e.conversationSearch);
  const documentEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { document: NonNullable<EvidenceItem["document"]> } => e.evidence_type === "document" && !!e.document
  );
  const projectId = project.id;

  // Captured once (rather than read via `project.X` inside the nested
  // function declarations below) because TypeScript doesn't carry the
  // `project !== null` narrowing from the early-return guard above across
  // a nested function's own scope.
  const p = project;

  const hasActiveCampaign = campaigns.some(c => c.effective_status === "live" || c.effective_status === "paused");
  const projectStatus = computeProjectStatus(project, hasActiveCampaign);
  const reportReadiness = computeReportReadiness(project.evidence);

  const evidenceTypeCounts: Record<string, number> = {};
  for (const e of project.evidence) evidenceTypeCounts[e.evidence_type] = (evidenceTypeCounts[e.evidence_type] ?? 0) + 1;
  // Collapsed-card summary — grouped by evidence type (e.g. "Surveys: 2
  // Surveys, 1 Draft, 1 Ready"). Each wired-up evidence type carries its own
  // status breakdown; not-yet-real types just show their count.
  const surveyStatusCounts: Record<string, number> = {};
  for (const e of surveyEvidence) {
    const s = e.survey!.status;
    surveyStatusCounts[s] = (surveyStatusCounts[s] ?? 0) + 1;
  }
  const socialSearchStatusCounts: Record<string, number> = {};
  for (const e of conversationSearchEvidence) {
    const s = e.conversationSearch!.status;
    socialSearchStatusCounts[s] = (socialSearchStatusCounts[s] ?? 0) + 1;
  }
  const evidenceCollapsedGroups = Object.entries(evidenceTypeCounts).map(([type, count]) => {
    const [singular, plural] = EVIDENCE_TYPE_PLURAL[type] ?? [type, type];
    const parts = [`${count} ${count === 1 ? singular : plural}`];
    if (type === "survey") {
      parts.push(...Object.entries(surveyStatusCounts).map(([status, c]) => `${c} ${SURVEY_STATUS_META[status]?.label ?? status}`));
    }
    if (type === "social_search") {
      parts.push(...Object.entries(socialSearchStatusCounts).map(([status, c]) => `${c} ${SOCIAL_SEARCH_STATUS_META[status]?.label ?? status}`));
    }
    return { label: plural, parts };
  });

  const stages = computeLifecycleStages(project);
  const progress = computeResearchProgress(stages);

  async function handleRemoveEvidence(item: EvidenceItem) {
    const name = item.survey?.name ?? item.conversationSearch?.name ?? item.document?.name;
    if (!name) return;
    if (!confirm(`Remove "${name}" from this project? The underlying research source itself won't be deleted.`)) return;
    const res = await fetch(`/api/research-projects/${projectId}/evidence?evidence_type=${item.evidence_type}&evidence_id=${item.evidence_id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to remove research source.");
      return;
    }
    showToast("Research source removed from project.");
    load();
  }

  async function handleAttachExisting(surveyId: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: "survey", evidence_id: surveyId, source: "existing" }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to attach survey.");
      return;
    }
    setAttachExistingOpen(false);
    showToast("Survey attached.");
    load();
  }

  async function handleAttachExistingSearch(searchId: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: "social_search", evidence_id: searchId, source: "existing" }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to attach conversation search.");
      return;
    }
    setAttachExistingSearchOpen(false);
    showToast("Conversation search attached.");
    load();
  }

  async function handleAttachExistingDocument(documentId: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: "document", evidence_id: documentId, source: "existing" }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to attach document.");
      return;
    }
    setAttachExistingDocumentOpen(false);
    showToast("Document attached.");
    load();
  }

  // "Run Research" — server resolves the source's type/id from
  // evidenceRowId itself (research_project_evidence.id) and does the
  // actual generation; this just fires it and refreshes. A 409 ("already
  // running") is expected if the poll effect hasn't caught up yet —
  // treated as a no-op, not an error, since load() will converge either way.
  async function handleRunResearch(evidenceRowId: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ research_project_evidence_id: evidenceRowId }),
    });
    if (!res.ok && res.status !== 409) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to run research.");
    }
    load();
  }

  // Scoped to a specific survey — each Survey card's own "+ Create
  // Campaign" already knows exactly which survey it's for, so there's no
  // longer a "which survey?" picker to show here.
  function handleCreateCampaignClick(evidenceId: string) {
    router.push(`/campaigns?createForProject=${projectId}&surveyId=${evidenceId}`);
  }

  function handleCreateMultipleCampaignsClick(evidenceId: string) {
    setWizardPresetSurveyId(evidenceId);
    setWizardOpen(true);
  }

  function openEditBrief() {
    setEditingBrief({
      id: p.id, project_id: p.project_id,
      topic: p.topic, research_question: p.research_question, research_subject: p.research_subject,
      brand_org_id: p.brand_org_id, agency_org_id: p.agency_org_id, study_type: p.study_type,
      objective: p.objective, tags: p.tags,
    });
  }

  function openProjectInfoEdit() {
    setDraftConfidentiality(p.confidentiality);
    setDraftVersion(p.version);
    setProjectInfoError("");
    setEditingProjectInfo(true);
  }

  async function handleSaveProjectInfo() {
    setSavingProjectInfo(true); setProjectInfoError("");
    const res = await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confidentiality: draftConfidentiality, version: draftVersion }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingProjectInfo(false);
    if (!res.ok) { setProjectInfoError(json.error ?? "Failed to save."); return; }
    setEditingProjectInfo(false);
    showToast("Project Information updated.");
    load();
  }

  async function handleCloseResearch() {
    if (!confirm("Close this research? You can reopen it later if more research sources are needed.")) return;
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: new Date().toISOString() }),
    });
    showToast("Research closed.");
    load();
  }

  async function handleReopenResearch() {
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: null }),
    });
    showToast("Research reopened.");
    load();
  }

  async function handleArchiveProject() {
    if (!confirm("Archive this project? It'll be hidden from the default list but never deleted.")) return;
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived_at: new Date().toISOString() }),
    });
    showToast("Project archived.");
    load();
  }

  async function handleRestoreProject() {
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived_at: null }),
    });
    showToast("Project restored.");
    load();
  }

  const groupedActivity: [string, ActivityRow[]][] = [];
  for (const a of project.activity) {
    const day = formatRelativeDay(a.created_at);
    const group = groupedActivity.find(([d]) => d === day);
    if (group) group[1].push(a);
    else groupedActivity.push([day, [a]]);
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

        {/* Permanent — no dismiss, no collapse. See Platform Contract §02/§03. */}
        {project.research_mode === "simulated" && <SimulatedBanner />}

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Link href="/research-projects" className="hover:text-[#D7B87A]">Research Projects</Link>
          <span>›</span>
          <span className="text-gray-700">{displayName}</span>
        </div>

        {/* ── Hero: Research Brief ─────────────────────────────────────────── */}
        {/* The main card on the page, so its navy header gets a bit more
            room (bigger padding, bigger title) than every other section's. */}
        <div id="hero" className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden scroll-mt-4">
          <div className="flex items-start justify-between gap-4 px-6 py-6" style={{ background: "#0B1929" }}>
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-2xl font-bold text-white truncate">{displayName}</h1>
              {project.research_mode === "simulated" && <SimulatedBadge />}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canManage && (
                <button onClick={openEditBrief}
                  className="text-xs font-semibold border border-white/20 text-white/80 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
                  Edit Research Brief
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Research Question</p>
              {project.research_question ? (
                <p className="text-base font-medium text-gray-900 leading-relaxed">{project.research_question}</p>
              ) : (
                <p className="text-sm text-gray-400">No research question set, edit the project to add one.</p>
              )}
            </div>

            {project.objective && (
              <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Objective</p>
                <p className="text-base font-medium text-gray-900 leading-relaxed">{project.objective}</p>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
              <span><span className="text-gray-400">Research Sources </span>{project.evidence.length}</span>
              <span><span className="text-gray-400">Research Progress </span>{progress.label}</span>
              <span><span className="text-gray-400">Research Type </span>{studyTypeLabel(project.study_type)}</span>
              <span><span className="text-gray-400">Research Category </span>{researchSubjectLabel(project.research_subject)}</span>
            </div>
          </div>
        </div>

        {/* ── Research Lifecycle — progress tracker + page nav ───────────────── */}
        {/* Sticky against <main>'s own scroll container (see AdminShell) so
            it stays visible while scrolling the rest of the walkthrough —
            what's done and what's left should never require scrolling
            back up to check. */}
        <div className="sticky top-0 z-20 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-center flex-wrap gap-1.5">
            {stages.map((stage, i) => {
              const meta = STAGE_STATE_META[stage.state];
              const pill = (
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border inline-flex items-center gap-1 whitespace-nowrap ${meta.className}`}>
                  <span className="text-[9px]">{meta.icon}</span>{stage.label}
                </span>
              );
              return (
                <div key={stage.key} className="flex items-center gap-1">
                  {stage.sectionId ? (
                    <button onClick={() => scrollToSection(stage.sectionId!)} className="transition-transform hover:scale-105">
                      {pill}
                    </button>
                  ) : pill}
                  {i < stages.length - 1 && <span className="text-gray-300 text-xs">→</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Project Information — the home for every project-level fact and
            setting: metadata, and Status (always derived, never manual).
            The Research Target lives in the Campaigns section instead —
            it's a campaign-collection setting, not project metadata. */}
        <SectionCard
          id="project-info"
          title="Project Information"
          info={
            <InfoContent title="Project-level facts, all in one place.">
              <p>Owner, Status, Created/Updated dates, Confidentiality and Version for this project.</p>
              <p className="mt-1.5">Status updates automatically from what&apos;s happening in Campaigns below, it&apos;s never set manually here. The Research Target lives in Campaigns too, since it&apos;s a campaign-collection setting rather than project metadata.</p>
            </InfoContent>
          }
          cta={canManage && !editingProjectInfo && (
            <button onClick={openProjectInfoEdit} className="text-xs font-semibold border border-white/20 text-white/80 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
              Edit
            </button>
          )}
          summary={
            <CollapsedSummary groups={[
              { label: "Status", parts: [PROJECT_STATUS_META[projectStatus].label] },
              { label: "Owner", parts: [project.owner_name ?? "—"] },
            ]} />
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Owner</p>
              <p className="text-gray-700">{project.owner_name ?? "—"}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Set automatically from whoever created this project.</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Status</p>
              <ProjectStatusBadge status={projectStatus} />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Created</p>
              <p className="text-gray-700">{formatRelativeTime(project.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Last Updated</p>
              <p className="text-gray-700">{formatRelativeTime(project.last_response_at ?? project.updated_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Confidentiality</p>
              {editingProjectInfo ? (
                <select value={draftConfidentiality ?? ""} onChange={e => setDraftConfidentiality(e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]">
                  <option value="">Not set</option>
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                </select>
              ) : (
                <p className="text-gray-700 capitalize">{project.confidentiality ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Version</p>
              {editingProjectInfo ? (
                <input value={draftVersion ?? ""} onChange={e => setDraftVersion(e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" placeholder="e.g. v1" />
              ) : (
                <p className="text-gray-700">{project.version ?? "—"}</p>
              )}
            </div>
          </div>

          {editingProjectInfo && (
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              {projectInfoError && <p className="text-xs text-red-500 mr-auto self-center">{projectInfoError}</p>}
              <button onClick={() => setEditingProjectInfo(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancel</button>
              <button onClick={handleSaveProjectInfo} disabled={savingProjectInfo}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                {savingProjectInfo ? "Saving…" : "Save"}
              </button>
            </div>
          )}

          {canManage && !editingProjectInfo && (
            <div className="border-t border-gray-100 pt-3 mt-4 flex gap-4">
              {projectStatus !== "archived" && (
                <button
                  onClick={projectStatus === "complete" ? handleReopenResearch : handleCloseResearch}
                  className="text-xs text-gray-500 hover:underline"
                >
                  {projectStatus === "complete" ? "Reopen Research" : "Close Research"}
                </button>
              )}
              <button
                onClick={projectStatus === "archived" ? handleRestoreProject : handleArchiveProject}
                className={`text-xs hover:underline ${projectStatus === "archived" ? "text-gray-500" : "text-red-400"}`}
              >
                {projectStatus === "archived" ? "Restore Project" : "Archive Project"}
              </button>
            </div>
          )}

          {project.research_mode === "simulated" && project.simulation_info && (
            <SimulationInformationPanel info={project.simulation_info} />
          )}
        </SectionCard>

        <ResearchSourcesSection
          projectId={projectId}
          isSimulated={project.research_mode === "simulated"}
          isProductWalkthrough={true}
          canManage={canManage}
          hasAnyEvidence={project.evidence.length > 0}
          evidenceSummary={<CollapsedSummary groups={evidenceCollapsedGroups.length > 0 ? evidenceCollapsedGroups : [{ parts: ["No research sources yet"] }]} />}
          surveys={surveyEvidence.map(item => ({
            evidence_row_id: item.id,
            evidence_id: item.evidence_id,
            name: item.survey.name,
            question_count: item.survey.question_count,
            completed_languages: item.survey.completed_languages,
            brand_name: item.survey.brand_name,
            agency_name: item.survey.agency_name,
            response_count: item.survey.response_count,
            target_responses: item.survey.target_responses,
            creative_design: item.survey.creative_design,
            target_reached_action: item.survey.target_reached_action,
            run_status: item.run_status,
            run_error: item.run_error,
          }))}
          conversationSearches={conversationSearchEvidence.map(item => ({
            id: item.id,
            evidence_row_id: item.id,
            evidence_id: item.evidence_id,
            name: item.conversationSearch!.name,
            status: item.conversationSearch!.status,
            markets: item.conversationSearch!.markets,
            platforms: item.conversationSearch!.platforms,
            mention_count: item.conversationSearch!.mention_count,
            positive_pct: item.conversationSearch!.positive_pct,
            neutral_pct: item.conversationSearch!.neutral_pct,
            negative_pct: item.conversationSearch!.negative_pct,
            reddit_last_collected_at: item.conversationSearch!.reddit_last_collected_at,
            run_status: item.run_status,
            run_error: item.run_error,
          }))}
          mentionTarget={project.simulation_info?.mentionTarget ?? null}
          documents={documentEvidence.map(item => ({
            evidence_row_id: item.id,
            evidence_id: item.evidence_id,
            name: item.document.name,
            document_type: item.document.document_type,
            library_status: item.document.library_status,
            page_count: item.document.page_count,
          }))}
          campaigns={campaigns}
          deletedCampaigns={deletedCampaigns}
          orgs={orgs}
          loading={loading}
          loadingDeletedCampaigns={loadingDeletedCampaigns}
          isLockedByAdminFor={isLockedByAdminFor}
          expandedIds={expandedSourceIds}
          onToggleExpand={toggleSourceExpanded}
          onAddResearchSource={() => setEvidenceModalOpen(true)}
          onLoadDeletedCampaigns={loadDeletedCampaigns}
          onReloadCampaigns={load}
          onEditCampaign={c => router.push(`/campaigns?editCampaignId=${c.id}&returnTo=${projectId}`)}
          onCreateCampaign={handleCreateCampaignClick}
          onCreateMultipleCampaigns={handleCreateMultipleCampaignsClick}
          onRunResearch={handleRunResearch}
          onRemoveSurveyEvidence={evidenceId => {
            const item = surveyEvidence.find(e => e.evidence_id === evidenceId);
            if (item) handleRemoveEvidence(item);
          }}
          onRemoveConversationSearchEvidence={evidenceId => {
            const item = conversationSearchEvidence.find(e => e.evidence_id === evidenceId);
            if (item) handleRemoveEvidence(item);
          }}
          onRemoveDocumentEvidence={evidenceId => {
            const item = documentEvidence.find(e => e.evidence_id === evidenceId);
            if (item) handleRemoveEvidence(item);
          }}
          onSaveResearchTarget={async (evidenceId, targetResponses, targetReachedAction) => {
            const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ evidence_id: evidenceId, target_responses: targetResponses, target_reached_action: targetReachedAction }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return { ok: false, error: json.error ?? "Failed to save." };
            showToast("Research Target updated.");
            load();
            return { ok: true };
          }}
          onSaveCreativeDesign={async (evidenceId, creativeDesign) => {
            const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ evidence_id: evidenceId, creative_design: creativeDesign }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return { ok: false, error: json.error ?? "Failed to save." };
            showToast("Creative Design updated.");
            load();
            return { ok: true };
          }}
          formatRelativeTime={formatRelativeTime}
        />

        <CampaignGroupsSection
          projectId={project.id}
          groups={campaignGroups}
          canManage={canManage}
          campaigns={campaigns}
          orgs={orgs}
          surveyNameById={new Map(surveyEvidence.map(e => [e.evidence_id, e.survey.name]))}
          returnTo={`/product-walkthrough/${project.id}`}
        />

        <DashboardSection
          projectId={project.id}
          isSimulated={project.research_mode === "simulated"}
          hasEvidence={project.evidence.length > 0}
          onScrollToResearchSources={() => scrollToSection("evidence")}
          surveys={surveyEvidence.map(item => ({
            evidence_id: item.evidence_id, name: item.survey.name, response_count: item.survey.response_count,
            target_responses: item.survey.target_responses ?? project.simulation_info?.surveyResponseTarget ?? null,
            run_status: item.run_status,
          }))}
          conversationSearches={conversationSearchEvidence.map(item => ({
            evidence_id: item.evidence_id, name: item.conversationSearch!.name, mention_count: item.conversationSearch!.mention_count,
            run_status: item.run_status,
            markets: item.conversationSearch!.markets, platforms: item.conversationSearch!.platforms,
            positive_pct: item.conversationSearch!.positive_pct, neutral_pct: item.conversationSearch!.neutral_pct, negative_pct: item.conversationSearch!.negative_pct,
          }))}
          mentionTarget={project.simulation_info?.mentionTarget ?? null}
          campaigns={campaigns}
        />

        <IntelligenceSection
          isSimulated={project.research_mode === "simulated"}
          surveys={surveyEvidence.map(item => ({
            evidence_id: item.evidence_id,
            name: item.survey.name,
            response_count: item.survey.response_count,
            summary_status: item.survey.summary_status,
          }))}
          conversationSearches={conversationSearchEvidence.map(item => ({
            evidence_id: item.evidence_id,
            name: item.conversationSearch!.name,
            mention_count: item.conversationSearch!.mention_count,
            summary_status: item.conversationSearch!.summary_status,
          }))}
          documents={documentEvidence.map(item => ({
            evidence_row_id: item.id,
            name: item.document.name,
            document_type: item.document.document_type,
            library_status: item.document.library_status,
            summary_status: item.document.summary_status,
          }))}
          keyFindingsStatus={project.key_findings_status}
          keyFindingsCount={project.key_findings_count}
          onOpenKeyFindings={() => router.push(`/product-walkthrough/${projectId}/reports/key-findings`)}
          onOpenSurveyIntelligence={evidenceId => router.push(`/product-walkthrough/${projectId}/reports/survey/${evidenceId}`)}
          onOpenConversationIntelligence={evidenceId => router.push(`/product-walkthrough/${projectId}/reports/conversation/${evidenceId}`)}
          onOpenDocumentIntelligence={evidenceRowId => router.push(`/product-walkthrough/${projectId}/reports/document/${evidenceRowId}`)}
        />

        <ReportsSection
          projectId={projectId}
          basePath={`/product-walkthrough/${projectId}`}
          isSimulated={project.research_mode === "simulated"}
          reportStatus={project.report_status}
          reportStale={project.report_stale}
          reportReadiness={reportReadiness}
          fullResearchReportStatus={project.full_research_report_status}
          articleStatus={project.article_status}
        />

        <ConclusionSection
          projectId={project.id}
          projectName={displayName}
          researchQuestion={project.research_question ?? ""}
          reportApproved={project.report_status === "approved" || project.report_status === "published"}
          isSimulated={project.research_mode === "simulated"}
        />

        <KnowledgeSection publishedConclusion={project.published_conclusion} />

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        <SectionCard
          id="activity"
          title="Activity"
          badge={project.research_mode === "simulated" && <SimulatedBadge />}
          info={
            <InfoContent title="Everything that's happened on this project.">
              <p>A chronological log, research sources attached, targets changed, publishers/countries updated, campaigns generated, grouped by day.</p>
              <p className="mt-1.5">Use it to see what changed and when, without reconstructing it from memory.</p>
            </InfoContent>
          }
          summary={
            <p className="text-xs text-gray-500 line-clamp-2">
              {project.activity.length === 0 ? "No activity yet." : `Latest: ${project.activity[0].description}`}
            </p>
          }
        >
          {project.activity.length === 0 ? (
            <EmptyState>No activity yet.</EmptyState>
          ) : (
            <div className="space-y-4">
              {groupedActivity.map(([day, items]) => (
                <div key={day}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{day}</p>
                  <div className="space-y-1.5">
                    {items.map(a => (
                      <div key={a.id} className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-gray-700">{a.description}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(a.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {evidenceModalOpen && (
        <AddEvidenceModal
          projectId={project.id}
          onClose={() => setEvidenceModalOpen(false)}
          onAttachExisting={type => {
            if (type === "survey") setAttachExistingOpen(true);
            if (type === "social_search") setAttachExistingSearchOpen(true);
            if (type === "document") setAttachExistingDocumentOpen(true);
          }}
        />
      )}

      {attachExistingOpen && (
        <AttachExistingSurveyModal
          excludeSurveyIds={surveyEvidence.map(e => e.evidence_id)}
          orgName={orgName}
          orgBrands={orgBrands}
          isSimulated={project.research_mode === "simulated"}
          onClose={() => setAttachExistingOpen(false)}
          onAttach={handleAttachExisting}
        />
      )}

      {attachExistingSearchOpen && (
        <AttachExistingConversationSearchModal
          excludeSearchIds={conversationSearchEvidence.map(e => e.evidence_id)}
          isSimulated={project.research_mode === "simulated"}
          onClose={() => setAttachExistingSearchOpen(false)}
          onAttach={handleAttachExistingSearch}
        />
      )}

      {attachExistingDocumentOpen && (
        <AttachExistingDocumentModal
          excludeDocumentIds={project.evidence.filter(e => e.evidence_type === "document").map(e => e.evidence_id)}
          onClose={() => setAttachExistingDocumentOpen(false)}
          onAttach={handleAttachExistingDocument}
        />
      )}

      {editingBrief && (
        <ResearchProjectEditDrawer
          initial={editingBrief}
          orgBrands={orgBrands}
          orgAgencies={orgAgencies}
          orgName={orgName}
          onClose={() => setEditingBrief(null)}
          onSaved={() => { setEditingBrief(null); showToast("Research Brief updated."); load(); }}
        />
      )}

      {wizardOpen && (
        <DeploymentWizardModal
          project={project}
          presetSurveyId={wizardPresetSurveyId ?? undefined}
          orgPublishers={orgPublishers}
          orgName={orgName}
          publishersDisabled={user?.role === "publisher"}
          publishersHelperText={user?.role === "publisher" ? "Locked to your organisation." : undefined}
          onClose={() => { setWizardOpen(false); setWizardPresetSurveyId(null); }}
          onNeedEvidence={() => { setWizardOpen(false); setEvidenceModalOpen(true); }}
          onComplete={result => {
            const parts = [`${result.created.length} created`];
            if (result.restored.length > 0) parts.push(`${result.restored.length} restored`);
            if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
            showToast(`Deployments generated: ${parts.join(", ")}.`);
            load();
            // Keep the wizard open when anything failed — GenerateDeploymentsCard
            // renders result.failed with per-combo reasons inline; closing here
            // would discard that detail behind a toast that only has counts.
            if (result.failed.length === 0) setWizardOpen(false);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
          ✓ {toast}
        </div>
      )}

    </AdminShell>
  );
}
