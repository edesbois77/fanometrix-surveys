"use client";

// Survey configuration inside a Research Project (Research context). Mounts the
// canonical SurveyEditor — the SAME component the standalone Surveys area uses,
// editing the SAME /api/surveys record — inside the project shell. Research is
// where a survey is created and configured; deploying it (campaigns, campaign
// groups, fieldwork) is a deliberate later step in Execution.
//
// Option A (confirmed): creating a survey here → save → attach to this project →
// return to the Survey Research mini-workspace. It NEVER auto-redirects into
// Execution. Editing → save → stay. Same record, no duplication.
import { useRouter } from "next/navigation";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { useWorkspaceRecord } from "@/app/components/research-projects/WorkspaceRecordContext";
import { SurveyEditor, type SurveyEditorSaved } from "@/app/components/survey-editor/SurveyEditor";
import { PageContainer, WorkspaceHeader, BackLink } from "@/app/components/workspace-ui";

export function SurveyConfigBody({ surveyId, backHref, backLabel }: {
  /** Edit an existing survey; omit (or "new") to create one. */
  surveyId?: string;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
  const { projectId, project, load } = useResearchProject();
  const { setRecordLabel } = useWorkspaceRecord();

  const isCreate = !surveyId;
  const isSimulated = project?.research_mode === "simulated";

  async function handleSaved({ survey, isCreate: created }: SurveyEditorSaved) {
    if (created) {
      // Save the global survey, attach it to THIS project, and return to the
      // Survey Research mini-workspace — deliberately NOT Execution.
      await fetch(`/api/research-projects/${projectId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence_type: "survey", evidence_id: survey.id }),
      }).catch(() => {});
      load();
      router.push(`/research-projects/${projectId}/research/survey`);
      return;
    }
    // Edit — stay on the survey; refresh the project so its evidence card updates.
    load();
  }

  return (
    <PageContainer>
      {/* Centred between the breadcrumb and the title: equal space above and
          below (pt-6 above from the container + this pb below). */}
      <BackLink href={backHref} label={backLabel} className="mb-2" />

      <WorkspaceHeader
        title={isCreate ? "New survey" : "Configure survey"}
        description="Define this survey's questions, answers, languages and thank-you screen. Deploying it, through campaigns, campaign groups and fieldwork, is a deliberate next step in Execution."
      />

      <SurveyEditor
        surveyId={surveyId}
        layout="page"
        isSimulated={isCreate ? isSimulated : undefined}
        onRecordLabel={setRecordLabel}
        onSaved={handleSaved}
        onCancel={() => router.push(`/research-projects/${projectId}/research/survey`)}
      />
    </PageContainer>
  );
}
