"use client";

// Review Evidence — the in-project qualitative evidence view for a conversation
// search, at /research-projects/[id]/execution/conversation/[recordId]/evidence.
// Replaces the legacy Social Listening mentions table as the "see the
// conversations" destination.
import { useParams } from "next/navigation";
import { ConversationEvidenceBody } from "@/app/components/research-projects/ConversationEvidenceBody";
import { PageContainer, ErrorState } from "@/app/components/workspace-ui";

export default function EvidencePage() {
  const params = useParams();
  const projectId = params.id as string;
  const operation = params.operation as string;
  const recordId = params.recordId as string;

  if (operation === "conversation") {
    return <ConversationEvidenceBody searchEvidenceId={recordId} />;
  }

  return (
    <PageContainer>
      <ErrorState
        title="Not available"
        description="Evidence review is only available for conversation searches."
        backHref={`/research-projects/${projectId}/execution`}
        backLabel="Back to Execution"
      />
    </PageContainer>
  );
}
