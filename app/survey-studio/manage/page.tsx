import { ManageWorkspace } from "@/app/components/studio/manage/ManageWorkspace";

// Manage landing — Surveys (live operational monitoring) + Requests (intake
// review). Both reuse the org-scoped ownership authority server-side; Discover
// data entitlement is NOT used here. `?view=` selects the initial tab.
export default async function ManagePage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const sp = await searchParams;
  const view = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  return <ManageWorkspace initialView={view} />;
}
