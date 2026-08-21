import { ManageWorkspace } from "@/app/components/studio/manage/ManageWorkspace";
import { campaignGroupsStudioEnabled } from "@/lib/campaign-groups/flag";

// Manage landing — Surveys (live operational monitoring) + Requests (intake
// review). Both reuse the org-scoped ownership authority server-side; Discover
// data entitlement is NOT used here. `?view=` selects the initial tab.
export default async function ManagePage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const sp = await searchParams;
  const view = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  // Resolved on the SERVER and passed down as a plain boolean. The flag carries
  // no NEXT_PUBLIC_ prefix, so it is never inlined into the client bundle and
  // the browser is told only the answer, never the question.
  return <ManageWorkspace initialView={view} campaignGroupsEnabled={campaignGroupsStudioEnabled()} />;
}
