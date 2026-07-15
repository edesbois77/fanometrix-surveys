import { redirect } from "next/navigation";

// The bare project URL is the project's Overview. Redirect /research-projects/[id]
// to /research-projects/[id]/overview so the shell has a single canonical
// landing area. Deep links to specific areas (…/sources, …/dashboard, etc.)
// and to the report routes (…/reports/*) are unaffected.
//
// Exception — specialist-tool return journeys: the Survey/Search/Campaign
// tools and the "Open →"/campaign editors round-trip back to the bare project
// URL with ?evidenceAdded= / ?campaignAdded= / ?returned=. Those journeys are
// handled in the Sources area, so forward them to /sources (preserving the
// param) rather than to Overview. Keeping those tools returning to the bare
// URL means none of them had to learn the new area routes.
//
// This file sits OUTSIDE the (workspace) route group on purpose, so a bare
// project hit doesn't mount the shell layout + data provider only to redirect
// away — it redirects at the routing layer before any of that renders.
export default async function ResearchProjectIndexPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const base = `/research-projects/${id}`;

  const journey =
    typeof sp.evidenceAdded === "string" ? `evidenceAdded=${encodeURIComponent(sp.evidenceAdded)}` :
    typeof sp.campaignAdded === "string" ? `campaignAdded=${encodeURIComponent(sp.campaignAdded)}` :
    typeof sp.returned === "string" ? `returned=${encodeURIComponent(sp.returned)}` :
    null;

  redirect(journey ? `${base}/sources?${journey}` : `${base}/overview`);
}
