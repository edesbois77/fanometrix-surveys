import { redirect } from "next/navigation";

// The bare project URL is the project's Overview. Redirect /research-projects/[id]
// to /research-projects/[id]/overview so the shell has a single canonical
// landing area. Deep links to specific areas (…/research, …/execution, etc.)
// and to the report routes (…/reports/*) are unaffected.
//
// Exception — specialist-tool return journeys: the Survey/Search/Campaign tools
// and the "Open →"/campaign editors round-trip back to the bare project URL
// with ?evidenceAdded= / ?campaignAdded= / ?returned=. Forward each to the area
// that handles it, preserving the param, so those tools never had to learn the
// new area routes:
//   - evidenceAdded=1 (a survey) continues into the deployment wizard → Execution
//   - evidenceAdded=social_search (a conversation search) → Research (method attached)
//   - campaignAdded / returned (campaign work, "Open →") → Execution
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

  const target =
    sp.evidenceAdded === "1" ? `execution?evidenceAdded=1` :
    typeof sp.evidenceAdded === "string" ? `research?evidenceAdded=${encodeURIComponent(sp.evidenceAdded)}` :
    sp.campaignAdded === "1" ? `execution?campaignAdded=1` :
    sp.returned === "1" ? `execution?returned=1` :
    "overview";

  redirect(`${base}/${target}`);
}
