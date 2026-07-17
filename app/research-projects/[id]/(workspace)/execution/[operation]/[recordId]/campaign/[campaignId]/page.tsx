"use client";

// The Campaign Dashboard route — a campaign's operational home inside the
// project, at …/execution/survey/[surveyEvidenceId]/campaign/[campaignId]. This
// is the default destination when a campaign card is clicked. Create lives at
// the sibling `campaign/new` (static, wins over this dynamic segment) and Edit
// at `campaign/[campaignId]/edit`. Campaigns belong to surveys, so this only
// serves the survey operation. See CampaignWorkspace.
import { useParams } from "next/navigation";
import { CampaignWorkspace } from "@/app/components/research-projects/CampaignWorkspace";
import { PageContainer, ErrorState } from "@/app/components/workspace-ui";

export default function ExecutionCampaignDashboardPage() {
  const params = useParams();
  const projectId = params.id as string;
  const operation = params.operation as string;
  const recordId = params.recordId as string;
  const campaignId = params.campaignId as string;

  if (operation !== "survey") {
    return (
      <PageContainer>
        <ErrorState title="Not available" description="Campaigns belong to surveys." backHref={`/research-projects/${projectId}/execution`} backLabel="Back to Execution" />
      </PageContainer>
    );
  }
  return <CampaignWorkspace surveyEvidenceId={recordId} campaignId={campaignId} />;
}
