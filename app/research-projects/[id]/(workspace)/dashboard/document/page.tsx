"use client";

// Dashboard › Document Intelligence — a MONITORING page only: pipeline status,
// extracted metadata, document readiness, and a direct entry into each
// document's Analysis page (View / Generate). It never becomes an analytics
// report — the interpreted analysis lives in Analysis › Document Analysis, and
// no analysis is generated here.
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { DocumentIntelligenceMonitor } from "@/app/components/research-projects/dashboard/DocumentIntelligenceMonitor";
import { PageLoadingState, ErrorState } from "@/app/components/workspace-ui";

export default function DashboardDocumentPage() {
  const { projectId, project, loading, error } = useResearchProject();

  if (loading && !project) return <PageLoadingState />;
  if (error || !project) return (
    <ErrorState title="Research project not found" description={error || "We couldn't load this project's document dashboard."} />
  );

  return <DocumentIntelligenceMonitor projectId={projectId} project={project} />;
}
