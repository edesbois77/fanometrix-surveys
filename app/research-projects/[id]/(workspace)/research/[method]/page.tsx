"use client";

// A Research Source mini-workspace route — /research-projects/[id]/research/[method].
// Each research method (survey · conversation · library) manages its own
// evidence here, drilled into from the Research area's method cards. The
// (workspace) layout provides the shell nav + project page header; this route
// only resolves the method and renders its body. An unknown method falls back
// to the Research area rather than 404-ing.
import { useParams } from "next/navigation";
import { ResearchMethodBody, type ResearchMethod } from "@/app/components/research-projects/ResearchMethodBody";
import { PageContainer, ErrorState } from "@/app/components/workspace-ui";

const VALID: ResearchMethod[] = ["survey", "conversation", "news", "library"];

export default function ResearchMethodPage() {
  const params = useParams();
  const id = params.id as string;
  const method = params.method as string;

  if (!VALID.includes(method as ResearchMethod)) {
    return (
      <PageContainer>
        <ErrorState
          title="Unknown research source"
          description="That research source type doesn't exist."
          backHref={`/research-projects/${id}/research`}
          backLabel="Back to Research"
        />
      </PageContainer>
    );
  }

  return <ResearchMethodBody method={method as ResearchMethod} />;
}
