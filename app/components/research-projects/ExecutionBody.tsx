"use client";

// The Execution area body — the operational workspace, at
// /research-projects/[id]/execution. This is "how are we collecting the
// research?": the per-source cards with everything needed to launch and manage
// collection — each survey's Research Target, Creative Design and nested
// Campaigns / Create Campaign / Create Multiple / deployment generation / Run
// Research — plus the project-level read-only Campaign Groups view.
//
// This is a relocation of today's Sources operational surface, not a rebuild:
// ResearchSourcesSection, CampaignGroupsSection, the DeploymentWizardModal and
// the CampaignsManager / GenerateDeploymentsCard they nest are reused unchanged,
// as are the handlers, expand/collapse state, deleted-campaigns loading and the
// campaignAdded / returned / evidenceAdded(survey→wizard) return journeys.
//
// Choosing WHICH research methods to use — attaching or creating sources — is
// the Research area's job, not this one. So there is no "add source" modal
// here: the "Add Research Source" affordance routes to /research, and the
// deployment wizard's "need evidence" fallback does the same.
//
// Chromeless: AdminShell, the ProjectProvider data layer and the project
// header + navigation are provided by the (workspace) shell layout. Product
// Walkthrough is unaffected — it keeps its own single-page WalkthroughBody.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/app/components/SessionProvider";
import type { Campaign } from "@/app/components/campaigns/types";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { CollapsedSummary } from "@/app/components/research-projects/Shell";
import { PageIntro } from "@/app/components/research-projects/PageIntro";
import { ResearchSourcesSection } from "@/app/components/research-projects/ResearchSourcesSection";
import { CampaignGroupsSection } from "@/app/components/research-projects/CampaignGroupsSection";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import {
  SURVEY_STATUS_META, SOCIAL_SEARCH_STATUS_META, EVIDENCE_TYPE_PLURAL,
  DeploymentWizardModal,
} from "@/app/components/research-projects/workspace-shared";

export function ExecutionBody() {
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

  // A newly created survey (from Research's specialist workflow) returns with
  // ?evidenceAdded=1 and continues here into the deployment wizard, since only
  // survey evidence powers Campaigns/deployment. (The bare project URL forwards
  // ?evidenceAdded=1 to /execution; ?evidenceAdded=social_search goes to
  // /research instead — see [id]/page.tsx.)
  const evidenceAddedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("evidenceAdded") !== "1") return;
    if (!project || evidenceAddedHandledRef.current) return;
    evidenceAddedHandledRef.current = true;
    router.replace(`/research-projects/${id}/execution`);
    load();
    setToast("Survey saved, continuing deployment setup.");
    setWizardOpen(true);
  }, [searchParams, id, project, router, load]);

  // Create Campaign — deep-linked to the Campaigns page, returns here with
  // ?campaignAdded=1. Just a toast and a refreshed Campaigns list.
  const campaignAddedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("campaignAdded") !== "1") return;
    if (!project || campaignAddedHandledRef.current) return;
    campaignAddedHandledRef.current = true;
    setToast("Campaign created.");
    router.replace(`/research-projects/${id}/execution`);
    load();
  }, [searchParams, id, project, router, load]);

  // Plain "Open →" from a Research Source card / campaign editor — a simple
  // return, no wizard.
  const returnedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("returned") !== "1") return;
    if (!project || returnedHandledRef.current) return;
    returnedHandledRef.current = true;
    setToast("Welcome back.");
    router.replace(`/research-projects/${id}/execution`);
    load();
  }, [searchParams, id, project, router, load]);

  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");
  const orgPublishers = orgs.filter(o => o.type === "publisher" && (user?.role !== "publisher" || o.id === user.organisationId));

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

  // "Run Research" — server resolves the source's type/id from evidenceRowId
  // itself and does the actual generation; this just fires it and refreshes. A
  // 409 ("already running") is expected if the poll effect hasn't caught up yet
  // — treated as a no-op, not an error, since load() will converge either way.
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
        <PageIntro>Configure, deploy and run your research across all selected evidence sources.</PageIntro>

        <ResearchSourcesSection
          projectId={projectId}
          groupByType
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
          onAddResearchSource={() => router.push(`/research-projects/${projectId}/research`)}
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
          returnTo={`/research-projects/${project.id}/execution`}
        />
      </div>

      {wizardOpen && (
        <DeploymentWizardModal
          project={project}
          presetSurveyId={wizardPresetSurveyId ?? undefined}
          orgPublishers={orgPublishers}
          orgName={orgName}
          publishersDisabled={user?.role === "publisher"}
          publishersHelperText={user?.role === "publisher" ? "Locked to your organisation." : undefined}
          onClose={() => { setWizardOpen(false); setWizardPresetSurveyId(null); }}
          onNeedEvidence={() => { setWizardOpen(false); router.push(`/research-projects/${projectId}/research`); }}
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
