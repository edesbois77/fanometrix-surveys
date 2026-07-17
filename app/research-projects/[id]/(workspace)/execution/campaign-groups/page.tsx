"use client";

// The deployment-level Campaign Groups page —
// /research-projects/[id]/execution/campaign-groups. A static sibling of the
// [operation] dynamic route (it takes precedence for this exact path). Campaign
// Groups are a deployment construct spanning multiple surveys, so they sit here
// at the Execution level rather than inside any single survey's Campaigns page.
// See CampaignGroupsExecutionBody.
import { CampaignGroupsExecutionBody } from "@/app/components/research-projects/CampaignGroupsExecutionBody";

export default function ExecutionCampaignGroupsPage() {
  return <CampaignGroupsExecutionBody />;
}
