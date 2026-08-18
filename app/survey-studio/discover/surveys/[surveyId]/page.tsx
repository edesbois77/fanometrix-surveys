// Discover → Dashboards → [surveyId]. Stable, deep-linkable Survey Dashboard route.
// Phase 3: the real Performance dashboard. Authorisation is enforced server-side by
// the Performance API (SurveyDashboardShell consumes it). Initial filter state is
// read here from the URL and handed to the client shell for deep-linking.
import { SurveyDashboardShell } from "@/app/components/studio/discover/SurveyDashboardShell";

const FILTER_KEYS = ["publisher", "market", "language", "campaign"] as const;

export default async function SurveyDashboardPage({
  params, searchParams,
}: {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { surveyId } = await params;
  const sp = await searchParams;
  const initialFilters: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = sp[k];
    const val = Array.isArray(v) ? v[0] : v;
    if (val) initialFilters[k] = val;
  }
  const viewParam = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const initialView = viewParam === "results" ? "results" : viewParam === "findings" ? "findings" : "performance";
  return <SurveyDashboardShell surveyId={surveyId} initialFilters={initialFilters} initialView={initialView} />;
}
