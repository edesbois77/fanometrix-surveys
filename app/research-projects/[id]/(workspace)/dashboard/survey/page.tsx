"use client";

// Dashboard › Survey Intelligence — the project's operational survey dashboard.
// It reuses the EXISTING survey dashboard (SurveyDashboardBody) in full — KPIs,
// response funnel, charts, filters, publisher/country/campaign performance,
// question results, AI insights and CSV export — automatically scoped to this
// project's campaigns. No calculations are re-implemented; the only difference
// from the global dashboard is the fixed project scope.
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { SurveyDashboardBody } from "@/app/dashboard/SurveyDashboardBody";
import { PageLoadingState, ErrorState } from "@/app/components/workspace-ui";

export default function DashboardSurveyPage() {
  const { projectId, project, loading, error } = useResearchProject();

  if (loading && !project) return <PageLoadingState />;
  if (error || !project) return (
    <ErrorState title="Research project not found" description={error || "We couldn't load this project's survey dashboard."} />
  );

  return <SurveyDashboardBody projectId={projectId} />;
}
