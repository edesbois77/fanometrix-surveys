"use client";

// The Sources area body — the real Research Project's source-management and
// collection surface, at /research-projects/[id]/sources. Everything about a
// project's evidence lives here: Research Sources (Surveys, Conversation
// Searches, Documents), each survey's own Research Target, Creative Design and
// nested Campaigns / Create Campaign / Create Multiple / deployment
// generation, the project-level read-only Campaign Groups view, and the
// Collection (Dashboard) monitoring rollup.
//
// This is a relocation, not a rebuild: the section components
// (ResearchSourcesSection, CampaignGroupsSection, DashboardSection), the
// modals (AddEvidenceModal, DeploymentWizardModal, AttachExisting*Modal) and
// the CampaignsManager / GenerateDeploymentsCard they nest are all reused
// unchanged. The handlers, expand/collapse state, deleted-campaigns loading,
// toasts and the specialist-tool return journeys (evidenceAdded / campaignAdded
// / returned) were moved here from the single-page workspace body verbatim, so
// external round trips (survey create/edit, search create, campaign create,
// "Open →") continue to land on Sources.
//
// Ownership model preserved: campaigns, Research Target and Creative Design
// stay attached to their individual survey source (no separate Fieldwork
// area); Campaign Groups stays a project-level read-only view that deep-links
// to the standalone editor; Collection lives here in Sources, not Analysis.
//
// Chromeless: AdminShell, the ProjectProvider data layer and the project
// header + navigation are provided by the (workspace) shell layout. Product
// Walkthrough is unaffected — it keeps its own single-page WalkthroughBody
// with its own copy of these sections and handlers.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/app/components/SessionProvider";
import { AttachExistingSurveyModal } from "@/app/components/research-projects/AttachExistingSurveyModal";
import { AttachExistingConversationSearchModal } from "@/app/components/research-projects/AttachExistingConversationSearchModal";
import { AttachExistingDocumentModal } from "@/app/components/research-projects/AttachExistingDocumentModal";
import type { Campaign } from "@/app/components/campaigns/types";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { CollapsedSummary } from "@/app/components/research-projects/Shell";
import { DashboardSection } from "@/app/components/research-projects/DashboardSection";
import { ResearchSourcesSection } from "@/app/components/research-projects/ResearchSourcesSection";
import { CampaignGroupsSection } from "@/app/components/research-projects/CampaignGroupsSection";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import {
  SURVEY_STATUS_META, SOCIAL_SEARCH_STATUS_META, EVIDENCE_TYPE_PLURAL,
  AddEvidenceModal, DeploymentWizardModal,
} from "@/app/components/research-projects/workspace-shared";

export function SourcesBody() {
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // Evidence Orchestration: "Add Research Source" and "Add translations" both
  // redirect back here with ?evidenceAdded=1 once Survey's specialist workflow
  // (creation or edit) has completed — this continues the journey into the
  // deployment wizard rather than stopping, since only Survey evidence powers
  // Campaigns/the Deployment Wizard. Conversation Search's create-flow
  // redirects with ?evidenceAdded=social_search instead — it has no deployment
  // concept, so it only needs a toast + reload, not the wizard. (The bare
  // project URL forwards these params to /sources, see [id]/page.tsx.)
  const evidenceAddedHandledRef = useRef(false);
  useEffect(() => {
    const added = searchParams.get("evidenceAdded");
    if (!added) return;
    if (!project || evidenceAddedHandledRef.current) return;
    evidenceAddedHandledRef.current = true;
    router.replace(`/research-projects/${id}/sources`);
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
    router.replace(`/research-projects/${id}/sources`);
    load();
  }, [searchParams, id, project, router, load]);

  // Plain "Open →" from a Research Source card — a simple return, no wizard.
  const returnedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("returned") !== "1") return;
    if (!project || returnedHandledRef.current) return;
    returnedHandledRef.current = true;
    setToast("Welcome back.");
    router.replace(`/research-projects/${id}/sources`);
    load();
  }, [searchParams, id, project, router, load]);

  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");
  const orgPublishers = orgs.filter(o => o.type === "publisher" && (user?.role !== "publisher" || o.id === user.organisationId));
  const orgBrands = orgs.filter(o => o.type === "brand");

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading && !project) return (
    <div className="p-6 flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">Loading research project…</p>
    </div>
  );

  if (error || !project) return (
    <div className="p-6 max-w-5xl mx-auto text-center py-20">
      <p className="text-gray-400 mb-4">{error || "Research project not found."}</p>
      <Link href="/research-projects" className="text-[#D7B87A] hover:underline text-sm">← Back to Research Projects</Link>
    </div>
  );

  const surveyEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey
  );
  const conversationSearchEvidence = project.evidence.filter(e => e.evidence_type === "social_search" && e.conversationSearch);
  const documentEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { document: NonNullable<EvidenceItem["document"]> } => e.evidence_type === "document" && !!e.document
  );
  const projectId = project.id;

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

  // "Run Research" — server resolves the source's type/id from evidenceRowId
  // itself (research_project_evidence.id) and does the actual generation; this
  // just fires it and refreshes. A 409 ("already running") is expected if the
  // poll effect hasn't caught up yet — treated as a no-op, not an error, since
  // load() will converge either way.
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

  // Scoped to a specific survey — each Survey card's own "+ Create Campaign"
  // already knows exactly which survey it's for, so there's no longer a "which
  // survey?" picker to show here.
  function handleCreateCampaignClick(evidenceId: string) {
    router.push(`/campaigns?createForProject=${projectId}&surveyId=${evidenceId}`);
  }

  function handleCreateMultipleCampaignsClick(evidenceId: string) {
    setWizardPresetSurveyId(evidenceId);
    setWizardOpen(true);
  }

  return (
    <>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

        <ResearchSourcesSection
          projectId={projectId}
          isSimulated={project.research_mode === "simulated"}
          isProductWalkthrough={false}
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
          returnTo={`/research-projects/${project.id}/sources`}
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
    </>
  );
}
