// Legacy deep-link → canonical Survey destination. Surveys are now a top-level
// Discover object (/survey-studio/discover/surveys/[id]); this preserves old
// /dashboards/[surveyId] links (incl. their filter/view query) by redirecting.
import { redirect } from "next/navigation";

export default async function LegacySurveyDashboardRedirect({
  params, searchParams,
}: {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { surveyId } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const val = Array.isArray(v) ? v[0] : v; if (val) qs.set(k, val); }
  const q = qs.toString();
  redirect(`/survey-studio/discover/surveys/${encodeURIComponent(surveyId)}${q ? `?${q}` : ""}`);
}
