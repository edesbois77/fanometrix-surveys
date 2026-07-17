"use client";

// Create Campaign — a static sibling of campaign/[campaignId] (wins for the
// literal "new" path), rendering the embedded CampaignEditor. Saving returns to
// the survey's Campaigns page. See CampaignEditorBody.
import { useParams } from "next/navigation";
import { CampaignEditorBody } from "@/app/components/research-projects/CampaignEditorBody";
import { PageContainer, ErrorState } from "@/app/components/workspace-ui";

export default function ExecutionCampaignCreatePage() {
  const params = useParams();
  const projectId = params.id as string;
  const operation = params.operation as string;
  const recordId = params.recordId as string;

  if (operation !== "survey") {
    return (
      <PageContainer>
        <ErrorState title="Not available" description="Campaigns belong to surveys." backHref={`/research-projects/${projectId}/execution`} backLabel="Back to Execution" />
      </PageContainer>
    );
  }
  return <CampaignEditorBody surveyEvidenceId={recordId} campaignId="new" />;
}
