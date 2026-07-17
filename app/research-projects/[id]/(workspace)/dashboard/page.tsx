"use client";

// Dashboard › Overview — the operational command centre for the whole project.
// It answers three questions and nothing more: is the project healthy, is data
// still being collected, and where should I go next? The detailed analytics for
// each source live in the sibling sub-pages (Survey / Conversation / Document
// Intelligence). The section shell (header, sub-nav, shared responses) is
// provided by ./layout.
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { useProjectResponses } from "@/app/components/research-projects/dashboard/useProjectResponses";
import { DashboardOverviewTab } from "@/app/components/research-projects/dashboard/DashboardOverviewTab";
import { PageLoadingState, ErrorState } from "@/app/components/workspace-ui";

export default function DashboardOverviewPage() {
  const { projectId, project, campaigns, loading, error } = useResearchProject();
  const responses = useProjectResponses();

  if (loading && !project) return <PageLoadingState />;
  if (error || !project) return (
    <ErrorState title="Research project not found" description={error || "We couldn't load this project's dashboard."} />
  );

  return <DashboardOverviewTab projectId={projectId} project={project} campaigns={campaigns} responses={responses} />;
}
