"use client";

// The in-project Campaign editor page — mounts the shared CampaignEditor as a
// full embedded page inside the Research Project workspace, at
// /research-projects/[id]/execution/survey/[surveyEvidenceId]/campaign/[campaignId]
// (campaignId === "new" to create). The user never leaves the workspace: the
// shell nav, breadcrumb and header wrap the same editor the global drawer uses,
// and Save returns to the survey's Campaigns page.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { useWorkspaceRecord } from "@/app/components/research-projects/WorkspaceRecordContext";
import { CampaignEditor } from "@/app/components/campaigns/CampaignEditor";
import { PageContainer, WorkspaceHeader, PageLoadingState, ErrorState } from "@/app/components/workspace-ui";
import type { Campaign } from "@/app/components/campaigns/types";

export function CampaignEditorBody({ surveyEvidenceId, campaignId }: { surveyEvidenceId: string; campaignId: string }) {
  const router = useRouter();
  const { projectId, project, loading, error } = useResearchProject();
  const { setRecordLabel } = useWorkspaceRecord();
  const isNew = campaignId === "new";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loadingCampaign, setLoadingCampaign] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (cancelled) return;
      if (!res.ok) { setNotFound(true); setLoadingCampaign(false); return; }
      const json = await res.json().catch(() => ({}));
      setCampaign(json.data ?? null);
      setLoadingCampaign(false);
    })();
    return () => { cancelled = true; };
  }, [campaignId, isNew]);

  const surveyItem = project?.evidence.find(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } =>
      e.evidence_type === "survey" && e.evidence_id === surveyEvidenceId && !!e.survey
  );

  // Breadcrumb tail = the survey name (the Campaigns page this returns to).
  useEffect(() => {
    setRecordLabel(surveyItem?.survey.name ?? null);
    return () => setRecordLabel(null);
  }, [surveyItem?.survey.name, setRecordLabel]);

  const campaignsPath = `/research-projects/${projectId}/execution/survey/${surveyEvidenceId}`;

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer><ErrorState title="Research project not found" description={error || "We couldn't load this project."} /></PageContainer>
  );
  if (!surveyItem) return (
    <PageContainer>
      <ErrorState title="Survey not found" description="This survey isn't attached to the project." backHref={`/research-projects/${projectId}/execution/survey`} backLabel="Back to Surveys" />
    </PageContainer>
  );
  if (!isNew && loadingCampaign) return <PageContainer><PageLoadingState /></PageContainer>;
  if (!isNew && (notFound || !campaign)) return (
    <PageContainer>
      <ErrorState title="Campaign not found" description="This campaign may have been deleted." backHref={campaignsPath} backLabel="Back to Campaigns" />
    </PageContainer>
  );

  return (
    <PageContainer>
      <WorkspaceHeader
        back={isNew
          ? { href: campaignsPath, label: "Back to Campaigns" }
          : { href: `${campaignsPath}/campaign/${campaignId}`, label: "Back to Campaign Dashboard" }}
        title={isNew ? "Create Campaign" : "Edit Campaign"}
        description={`Deploy “${surveyItem.survey.name}” to a publisher and market. Fields left blank inherit from the project.`}
      />
      {/* No wrapping card — each section is its own workspace card, so they sit
          directly on the page (not cards-in-a-card). */}
      <CampaignEditor
        campaign={isNew ? null : campaign}
        presetProjectId={isNew ? project.id : null}
        presetSurveyId={isNew ? surveyEvidenceId : null}
        presetResearchMode={project.research_mode}
        variant="page"
        onCancel={() => router.push(campaignsPath)}
        onSaved={({ created }) => router.push(`${campaignsPath}?${created ? "campaignAdded" : "returned"}=1`)}
      />
    </PageContainer>
  );
}
