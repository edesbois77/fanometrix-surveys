"use client";

// The deployment-level Campaign Groups page —
// /research-projects/[id]/execution/campaign-groups. A Campaign Group is a
// DEPLOYMENT construct, not a child of any one survey: it gives a publisher a
// single embed while Fanometrix rotates campaigns (and therefore surveys)
// behind it without the publisher changing anything. So it lives here, at the
// deployment level, after campaigns have been created — never inside an
// individual survey's Campaigns page.
//
// Reuses the project-level CampaignGroupsSection (which already spans every
// survey's campaigns); membership, rotation and the embed code are managed on
// the standalone Campaign Groups module, reached with a returnTo back here.
// Chromeless: the (workspace) shell provides the project header + navigation.
import { useSession } from "@/app/components/SessionProvider";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { CampaignGroupsSection } from "@/app/components/research-projects/CampaignGroupsSection";
import { PageContainer, WorkspaceHeader, PageLoadingState, ErrorState } from "@/app/components/workspace-ui";

export function CampaignGroupsExecutionBody() {
  const { user } = useSession();
  const canManage = user?.role === "admin" || user?.role === "publisher";
  const { project, campaignGroups, campaigns, orgs, loading, error } = useResearchProject();

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project's campaign groups."} />
    </PageContainer>
  );

  const surveyNameById = new Map(
    project.evidence
      .filter((e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey)
      .map(e => [e.evidence_id, e.survey.name])
  );

  return (
    <PageContainer>
      <WorkspaceHeader
        back={{ href: `/research-projects/${project.id}/execution`, label: "Back to Execution" }}
        title="Campaign Groups"
        description="Deployment bundles that rotate campaigns — from any survey in this project — behind a single publisher embed."
      />
      <CampaignGroupsSection
        projectId={project.id}
        groups={campaignGroups}
        canManage={canManage}
        campaigns={campaigns}
        orgs={orgs}
        surveyNameById={surveyNameById}
        returnTo={`/research-projects/${project.id}/execution/campaign-groups`}
      />
    </PageContainer>
  );
}
