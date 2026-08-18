// ── Survey Studio breadcrumb trail (pure, route-aware) ───────────────────────
// One source of truth for "where am I in Survey Studio". Given a pathname (and a
// map of dynamic-segment id → resolved resource name), it returns the ancestor
// trail. Ancestors carry an href; the current (last) item never does. Dynamic
// leaves resolve their label from `labels` and fall back to a loading convention —
// a raw id/UUID is NEVER used as a user-facing label. Purely a function of the
// route table below, so adding a future route means one edit here (and, if the
// leaf is dynamic, one useStudioBreadcrumbLabel call on that page).

export type BreadcrumbItem = { label: string; href?: string };

export const STUDIO_BASE = "/survey-studio";
/** Shown for a dynamic leaf until its real resource name is registered. */
export const BREADCRUMB_LOADING = "Loading…";

const DISCOVER_AREA: Record<string, string> = { reports: "Reports" };

/** Build the breadcrumb trail for a Survey Studio pathname. Returns just `Home`
 *  (current) at the root; `[]` for a path outside Survey Studio. */
export function studioBreadcrumbTrail(pathname: string, labels: Record<string, string> = {}): BreadcrumbItem[] {
  if (pathname !== STUDIO_BASE && !pathname.startsWith(`${STUDIO_BASE}/`)) return [];
  const parts = pathname.slice(STUDIO_BASE.length).split("/").filter(Boolean);
  const dyn = (id: string): string => labels[id] ?? BREADCRUMB_LOADING; // never the raw id
  const trail: BreadcrumbItem[] = [{ label: "Home", href: parts.length ? STUDIO_BASE : undefined }];
  if (parts.length === 0) return trail; // Home is the current page

  const [s0, s1, s2, s3, s4] = parts;

  if (s0 === "create") {
    trail.push({ label: "Create", href: s1 ? `${STUDIO_BASE}/create` : undefined });
    if (s1) trail.push({ label: dyn(s1) }); // /create/[surveyId] editor (current)
    return trail;
  }

  if (s0 === "request") { trail.push({ label: "Request" }); return trail; }

  if (s0 === "discover") {
    trail.push({ label: "Discover", href: s1 ? `${STUDIO_BASE}/discover` : undefined });
    if (!s1) return trail; // Discover Overview (index) is current
    if (s1 === "surveys") {
      // Surveys index + /surveys/[surveyId] survey dashboard (survey is an OBJECT now,
      // a top-level Discover destination — no longer nested under "Dashboards").
      trail.push({ label: "Surveys", href: s2 ? `${STUDIO_BASE}/discover/surveys` : undefined });
      if (!s2) return trail;
      trail.push({ label: dyn(s2) }); // survey dashboard (current)
      return trail;
    }
    if (s1 === "studies") {
      trail.push({ label: "Studies", href: s2 ? `${STUDIO_BASE}/discover/studies` : undefined });
      if (!s2) return trail;
      if (s2 === "create") { trail.push({ label: "Create study" }); return trail; }
      // .../studies/[id] → study is current; .../studies/[id]/edit → study links up, Edit is current.
      const studyIsCurrent = parts.length === 3;
      trail.push({ label: dyn(s2), href: studyIsCurrent ? undefined : `${STUDIO_BASE}/discover/studies/${s2}` });
      if (s3 === "edit") trail.push({ label: "Edit study" });
      return trail;
    }
    if (DISCOVER_AREA[s1]) trail.push({ label: DISCOVER_AREA[s1] }); // reports (current)
    return trail;
  }

  if (s0 === "manage") {
    trail.push({ label: "Manage", href: s1 ? `${STUDIO_BASE}/manage` : undefined });
    if (!s1) return trail;
    if (s1 === "studies") {
      trail.push({ label: "Studies", href: `${STUDIO_BASE}/manage?view=studies` });
      if (!s2) return trail;
      const studyIsCurrent = parts.length === 3;
      trail.push({ label: dyn(s2), href: studyIsCurrent ? undefined : `${STUDIO_BASE}/manage/studies/${s2}` });
      if (s3 === "reports" && s4) trail.push({ label: dyn(s4) }); // report detail (current)
      return trail;
    }
    if (s1 === "surveys") {
      trail.push({ label: "Surveys", href: `${STUDIO_BASE}/manage?view=surveys` });
      if (s2) trail.push({ label: dyn(s2) }); // survey detail (current)
      return trail;
    }
    return trail;
  }

  return trail; // unknown Studio route → Home only (such routes render no container anyway)
}
