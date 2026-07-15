import { redirect } from "next/navigation";

// The bare project URL is the project's Overview. Redirect /research-projects/[id]
// to /research-projects/[id]/overview so the shell has a single canonical
// landing area. Deep links to specific areas (…/design) and to the report
// routes (…/reports/*) are unaffected.
//
// This file sits OUTSIDE the (workspace) route group on purpose, so a bare
// project hit doesn't mount the shell layout + data provider only to redirect
// away — it redirects at the routing layer before any of that renders.
export default async function ResearchProjectIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/research-projects/${id}/overview`);
}
