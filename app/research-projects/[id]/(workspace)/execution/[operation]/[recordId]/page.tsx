"use client";

// A source opened inside its Execution operation —
// /research-projects/[id]/execution/[operation]/[recordId]. The operational
// counterpart to /research/[method]/[recordId]: Research opens the record's
// CONFIG editor; Execution opens its operational home.
//
//   survey       → Campaigns page (deploy & run the survey)
//   conversation → run + monitor collection      (Phase 4)
//   document     → processing pipeline → Ready    (Phase 5)
//
// The (workspace) shell provides the nav + project header; this route resolves
// the operation and mounts the right body. Unknown operations fall back to the
// Execution home rather than 404-ing.
import { useParams } from "next/navigation";
import { CampaignsExecutionBody } from "@/app/components/research-projects/CampaignsExecutionBody";
import { ConversationSearchExecutionBody } from "@/app/components/research-projects/ConversationSearchExecutionBody";
import { DocumentExecutionBody } from "@/app/components/research-projects/DocumentExecutionBody";
import { PageContainer, ErrorState } from "@/app/components/workspace-ui";

export default function ExecutionRecordPage() {
  const params = useParams();
  const projectId = params.id as string;
  const operation = params.operation as string;
  const recordId = params.recordId as string;

  if (operation === "survey") {
    return <CampaignsExecutionBody surveyEvidenceId={recordId} />;
  }
  if (operation === "conversation") {
    return <ConversationSearchExecutionBody searchEvidenceId={recordId} />;
  }
  if (operation === "document") {
    return <DocumentExecutionBody documentEvidenceId={recordId} />;
  }

  return (
    <PageContainer>
      <ErrorState
        title="Unknown operation"
        description="That operation doesn't exist."
        backHref={`/research-projects/${projectId}/execution`}
        backLabel="Back to Execution"
      />
    </PageContainer>
  );
}
