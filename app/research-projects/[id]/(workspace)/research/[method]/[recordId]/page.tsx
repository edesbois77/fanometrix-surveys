"use client";

// A research source opened INSIDE the Research Project workspace —
// /research-projects/[id]/research/[method]/[recordId]. Research is the
// configuration context, so this mounts the CONFIGURATION editor for the source
// (definition fields), not its operational/results view — those belong to
// Execution / Dashboard / Analysis. The same underlying record and APIs are
// used; only the standalone module keeps the full operational experience.
//
// recordId === "new" opens the create experience inside the project (saves the
// global record, associates it with this project, returns to the mini-workspace
// — never into Execution).
//
// Phase 1 wires Conversation Intelligence. Survey and Research Library land here
// in later phases.
import { useParams } from "next/navigation";
import { SearchConfigForm } from "@/app/components/research-projects/SearchConfigForm";
import { ConversationAdvisorBody } from "@/app/components/research-projects/ConversationAdvisorBody";
import { LibraryDocConfigBody } from "@/app/components/research-projects/LibraryDocConfigBody";
import { SurveyConfigBody } from "@/app/components/research-projects/SurveyConfigBody";
import { PageContainer, ErrorState } from "@/app/components/workspace-ui";

// One consistent back-nav wording per source type: "← Back to <Source>".
const BACK_LABEL: Record<string, string> = {
  conversation: "← Back to Conversation Intelligence",
  survey: "← Back to Survey Research",
  library: "← Back to Research Library",
};

export default function ResearchRecordPage() {
  const params = useParams();
  const projectId = params.id as string;
  const method = params.method as string;
  const recordId = params.recordId as string;

  if (method === "conversation") {
    const backHref = `/research-projects/${projectId}/research/conversation`;
    // Create = the Conversation Advisor briefing (commission research);
    // Edit = the full config surface.
    return recordId === "new" ? (
      <ConversationAdvisorBody backHref={backHref} backLabel={BACK_LABEL.conversation} />
    ) : (
      <SearchConfigForm mode="edit" searchId={recordId} backHref={backHref} backLabel={BACK_LABEL.conversation} />
    );
  }

  if (method === "library") {
    return (
      <LibraryDocConfigBody
        documentId={recordId}
        backHref={`/research-projects/${projectId}/research/library`}
        backLabel={BACK_LABEL.library}
      />
    );
  }

  if (method === "survey") {
    return (
      <SurveyConfigBody
        surveyId={recordId === "new" ? undefined : recordId}
        backHref={`/research-projects/${projectId}/research/survey`}
        backLabel={BACK_LABEL.survey}
      />
    );
  }

  return (
    <PageContainer>
      <ErrorState
        title="Not available in the project workspace yet"
        description="This research source type will open inside the project in a later step."
        backHref={`/research-projects/${projectId}/research`}
        backLabel="Back to Research"
      />
    </PageContainer>
  );
}
