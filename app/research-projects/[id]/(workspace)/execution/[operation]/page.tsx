"use client";

// An Execution operation workspace — /research-projects/[id]/execution/[operation]
// (survey | conversation | document). Mirrors the Research method route
// (/research/[method]): the shell layout provides the nav + project header;
// this route only resolves the operation and renders its list body. An unknown
// operation falls back to the Execution home rather than 404-ing.
import { useParams } from "next/navigation";
import { PageContainer, ErrorState } from "@/app/components/workspace-ui";
import { SurveysExecutionBody } from "@/app/components/research-projects/SurveysExecutionBody";
import { ConversationExecutionBody } from "@/app/components/research-projects/ConversationExecutionBody";
import { DocumentsExecutionBody } from "@/app/components/research-projects/DocumentsExecutionBody";

export default function ExecutionOperationPage() {
  const params = useParams();
  const id = params.id as string;
  const operation = params.operation as string;

  if (operation === "survey") return <SurveysExecutionBody />;
  if (operation === "conversation") return <ConversationExecutionBody />;
  if (operation === "document") return <DocumentsExecutionBody />;

  return (
    <PageContainer>
      <ErrorState
        title="Unknown operation"
        description="That operation workspace doesn't exist."
        backHref={`/research-projects/${id}/execution`}
        backLabel="Back to Execution"
      />
    </PageContainer>
  );
}
