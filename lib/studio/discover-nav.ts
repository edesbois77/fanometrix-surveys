// ── Survey Studio → Discover — Level-3 local navigation config ───────────────
// Discover is a single Level-2 destination (see STUDIO_NAV in lib/studio-nav.ts,
// which is deliberately left UNCHANGED). Its internal areas are Level-3 tabs that
// live inside the workspace, under the page — NEVER as children of the sidebar.
// This mirrors the Manage/Create local-nav convention and the workspace-ui SubNav
// contract ({segment,label} + a `base`). Dashboards is a first-class Level-3 tab
// here; it is intentionally NOT a STUDIO_NAV (primary sidebar) item.

export const DISCOVER_BASE = "/survey-studio/discover" as const;

export type DiscoverNavItem = {
  /** URL segment after DISCOVER_BASE; "" is the Discover index (Overview landing). */
  segment: string;
  label: string;
  /** false = a considered "coming soon" placeholder (later phase), not a link to
   *  a half-built feature. Only Dashboards is live in this phase. */
  live: boolean;
};

// V1 product IA: research OBJECTS (Surveys, Studies) are top-level Discover
// destinations, no longer nested under a "Dashboards" container. Overview is the
// editorial landing ("the latest from your research"); Reports is the finished/
// uploaded reports destination. NB: "Overview" is the DISCOVER-LEVEL landing only —
// individual Survey/Study pages keep "Dashboard" as their first object-level tab.
export const DISCOVER_NAV: DiscoverNavItem[] = [
  { segment: "", label: "Overview", live: true },
  { segment: "surveys", label: "Surveys", live: true },
  { segment: "studies", label: "Studies", live: true },
  { segment: "reports", label: "Reports", live: false },
];

/** The active Discover segment for a pathname (first segment after the base).
 *  The index ("") is the Overview. Mirrors SubNav's own active derivation. */
export function activeDiscoverSegment(pathname: string): string {
  const rest = pathname.startsWith(DISCOVER_BASE) ? pathname.slice(DISCOVER_BASE.length) : "";
  return rest.split("/").filter(Boolean)[0] ?? "";
}

/** Stable, deep-linkable route for a Survey's Dashboard, carrying any already-
 *  validated scope filters as query params (consumed server-side). */
export function surveyDashboardHref(surveyId: string, filters?: Record<string, string>): string {
  const base = `${DISCOVER_BASE}/surveys/${encodeURIComponent(surveyId)}`;
  const entries = Object.entries(filters ?? {}).filter(([, v]) => v);
  if (!entries.length) return base;
  const qs = new URLSearchParams(entries).toString();
  return `${base}?${qs}`;
}

/** Deep-linkable route for a Study's Dashboard. */
export function studyDashboardHref(studyId: string): string {
  return `${DISCOVER_BASE}/studies/${encodeURIComponent(studyId)}`;
}
