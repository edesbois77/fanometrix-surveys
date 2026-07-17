"use client";

// The Surveys operation workspace — /research-projects/[id]/execution/survey.
// The focused list of every attached survey (the Execution homepage also
// surfaces these; this is the breadcrumb-anchored dedicated view). Each survey
// renders through the shared SurveyExecutionCard, so the homepage and this page
// are visually identical, and each card is the entry point into the survey's
// campaign workflow.
//
// Surveys are CHOSEN in Research; this page never adds one. Chromeless: the
// (workspace) shell layout provides AdminShell, the ProjectProvider data layer
// and the project header + navigation.
import { useRouter } from "next/navigation";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { SurveyExecutionCard } from "@/app/components/research-projects/SurveyExecutionCard";
import { PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, EmptyState, Button } from "@/app/components/workspace-ui";

export function SurveysExecutionBody() {
  const router = useRouter();
  const { projectId, project, campaigns, loading, error } = useResearchProject();

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project's surveys."} />
    </PageContainer>
  );

  const surveyEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey
  );

  return (
    <PageContainer>
      <WorkspaceHeader
        back={{ href: `/research-projects/${projectId}/execution`, label: "Back to Execution" }}
        title="Surveys"
        description="Deploy and manage each survey's campaigns, and monitor the responses they collect."
      />

      {surveyEvidence.length === 0 ? (
        <EmptyState
          icon="＋"
          title="No surveys attached yet"
          description="Surveys are chosen in Research. Add one there, then return here to deploy and run it."
          action={<Button variant="secondary" onClick={() => router.push(`/research-projects/${projectId}/research/survey`)}>Go to Survey Research →</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {surveyEvidence.map(item => (
            <SurveyExecutionCard key={item.id} projectId={projectId} item={item} campaigns={campaigns} />
          ))}
        </div>
      )}

      <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
        Surveys are chosen in{" "}
        <button onClick={() => router.push(`/research-projects/${projectId}/research/survey`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Research →</button>
        {" "}and their live performance is monitored in{" "}
        <button onClick={() => router.push(`/research-projects/${projectId}/dashboard`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Dashboard →</button>
      </p>
    </PageContainer>
  );
}
