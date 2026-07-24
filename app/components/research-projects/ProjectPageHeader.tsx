"use client";

// The Research Project page header — the project's editorial "cover" that opens
// every workspace page. This is deliberately the PAGE's job, not the shell's:
// the application shell (ProjectShell) provides navigation and structure; the
// page introduces the project, the way a consulting report opens with its
// subject before its contents.
//
// Anatomy (top → bottom), then the page's own content follows (on Overview,
// the Research Question hero):
//   Breadcrumb            Research Projects › Overview › {Area}   (app navigation)
//   Project title         the primary heading
//   One-line description  the purpose of the research
//   Metadata (one line)   Status · Updated by {who} · {when}
//
// The whole introduction sits on a subtle full-width "cover" surface (a calm
// blue-grey band, no border/shadow/card) so it reads as the cover page of a
// report rather than elements floating on the page.
//
// Rendered once by the (workspace) layout, above the page content and below the
// shell nav, so all seven areas inherit the same opening without re-declaring
// it. Reads everything from the shared ProjectProvider; renders nothing until
// the project resolves (the page shows its own loading/error state meanwhile).

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { useWorkspaceRecord } from "@/app/components/research-projects/WorkspaceRecordContext";
import { computeProjectStatus } from "@/lib/research-project-status";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ProjectStatusBadge } from "@/app/components/research-projects/workspace-shared";

function Sep() {
  return <span aria-hidden style={{ color: "var(--text-disabled)" }}>·</span>;
}

// Area segment → breadcrumb label. Overview is implicit (always the second
// crumb); everything else appends as the current, third crumb.
const AREA_LABEL: Record<string, string> = {
  design: "Evidence Strategy",
  research: "Research",
  execution: "Execution",
  dashboard: "Dashboard",
  findings: "Findings",
  analysis: "Analysis",
  outputs: "Reports",
  conclusion: "Conclusions",
  activity: "Activity",
};

// Research sub-page slug → breadcrumb label (…/research/[slug]).
const METHOD_LABEL: Record<string, string> = {
  survey: "Survey Research",
  conversation: "Conversation Intelligence",
  library: "Research Library",
};

// Execution operation slug → breadcrumb label (…/execution/[operation]). The
// operational twins of the research methods above, named for the task rather
// than the discipline ("Surveys", not "Survey Research").
const OPERATION_LABEL: Record<string, string> = {
  survey: "Surveys",
  conversation: "Conversation Searches",
  document: "Documents",
  // Deployment-level, not an evidence type — a static sibling route under
  // Execution, but it reads the same way in the breadcrumb.
  "campaign-groups": "Campaign Groups",
};

export function ProjectPageHeader() {
  const { project, campaigns } = useResearchProject();
  const { recordLabel } = useWorkspaceRecord();
  const pathname = usePathname();
  if (!project) return null;

  // Real projects show the classification-suffixed project_name; the simulated
  // topic fallback is only for robustness (simulated opens in Product Walkthrough).
  const displayName = project.research_mode === "simulated" && project.topic?.trim()
    ? project.topic.trim()
    : project.project_name;

  const hasActiveCampaign = campaigns.some(c => c.effective_status === "live" || c.effective_status === "paused");
  const status = computeProjectStatus(project, hasActiveCampaign);

  // Breadcrumb = application navigation (Research Projects › Overview › {Area}
  // [› {Sub-page}]), NOT project metadata. Overview is always present so there's
  // a consistent route back to the project's home from any area. Segments are
  // read relative to the project base so a Research sub-page (…/research/survey)
  // resolves to Research › Survey Research.
  const base = `/research-projects/${project.id}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const [areaSeg, subSeg, recordSeg, deepSeg, deepId, leafSeg] = rest.split("/").filter(Boolean);
  const isChildPage = !!areaSeg && areaSeg !== "overview";

  const crumbs: { label: string; href: string }[] = [
    { label: "Research Projects", href: "/research-projects" },
    { label: "Overview", href: `${base}/overview` },
  ];
  if (isChildPage) {
    crumbs.push({ label: AREA_LABEL[areaSeg] ?? areaSeg, href: `${base}/${areaSeg}` });
    if (areaSeg === "research" && subSeg && METHOD_LABEL[subSeg]) {
      crumbs.push({ label: METHOD_LABEL[subSeg], href: `${base}/research/${subSeg}` });
      // A specific record open inside the method (…/research/[method]/[recordId]) —
      // its name comes from the mounted body via WorkspaceRecordContext. Until it
      // loads, the method crumb stays current; once known, the record is the tail.
      if (recordSeg && recordLabel) {
        crumbs.push({ label: recordLabel, href: `${base}/research/${subSeg}/${recordSeg}` });
      }
    }
    // Execution mirrors Research's two extra tiers: an operation workspace
    // (…/execution/[operation]) and a specific source open inside it
    // (…/execution/[operation]/[recordId]), whose name comes from the mounted
    // body via WorkspaceRecordContext just as the research record does.
    if (areaSeg === "execution" && subSeg === "survey" && recordSeg) {
      // Surveys are surfaced directly on the Execution homepage — there's no
      // intermediate Surveys list in the journey — so a survey's Campaigns page
      // reads Execution › {Survey}, skipping the redundant Surveys level. The
      // survey and campaign names are resolved from the shared provider data
      // (no WorkspaceRecordContext needed); each crumb appears once its data
      // loads, otherwise the previous crumb stays current.
      const surveyName = project.evidence.find(e => e.evidence_type === "survey" && e.evidence_id === recordSeg)?.survey?.name;
      const surveyHref = `${base}/execution/survey/${recordSeg}`;
      if (surveyName) crumbs.push({ label: surveyName, href: surveyHref });

      // Campaign depth: …/campaign/[cid][/edit] or …/campaign/new
      if (deepSeg === "campaign" && deepId) {
        if (deepId === "new") {
          crumbs.push({ label: "Create Campaign", href: `${surveyHref}/campaign/new` });
        } else {
          const campaignName = campaigns.find(c => c.id === deepId)?.campaign_name;
          const campaignHref = `${surveyHref}/campaign/${deepId}`;
          if (campaignName) crumbs.push({ label: campaignName, href: campaignHref });
          if (leafSeg === "edit") crumbs.push({ label: "Edit", href: `${campaignHref}/edit` });
        }
      }
    } else if (areaSeg === "execution" && subSeg && OPERATION_LABEL[subSeg]) {
      // Conversation Searches, Documents, Campaign Groups — the operation level,
      // with an optional record (its name from WorkspaceRecordContext).
      crumbs.push({ label: OPERATION_LABEL[subSeg], href: `${base}/execution/${subSeg}` });
      if (recordSeg && recordLabel) {
        crumbs.push({ label: recordLabel, href: `${base}/execution/${subSeg}/${recordSeg}` });
      }
    }
  }

  // Breadcrumb — application navigation. Every crumb but the current one is a
  // link; Overview always routes back to the project home. Rendered on every
  // page (it's the consistent route back); the full cover below is Overview-only.
  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="flex items-center flex-wrap gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={c.href}>
            {i > 0 && <span aria-hidden style={{ color: "var(--text-disabled)" }}>›</span>}
            {last ? (
              <span aria-current="page" className="font-medium" style={{ color: "var(--text-secondary)" }}>{c.label}</span>
            ) : (
              <Link href={c.href} className="hover:text-[color:var(--accent-ink)] transition-colors">{c.label}</Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );

  // Child workspaces (Research, Execution, …) are chapters, not covers: they get
  // only the breadcrumb back to Overview, then introduce their own task (the
  // page's own title). No project title / metadata / cover surface is repeated.
  if (isChildPage) {
    return (
      <div className="mx-auto w-full px-4 md:px-6 pt-6" style={{ maxWidth: "var(--page-max)" }}>
        {breadcrumb}
      </div>
    );
  }

  // Overview — the project's cover page. Full introduction on a subtle
  // full-width cover surface (borderless, no shadow, no card).
  return (
    <div className="w-full" style={{ background: "var(--surface-cover)" }}>
      <header className="mx-auto w-full px-4 md:px-6 pt-6 pb-7" style={{ maxWidth: "var(--page-max)" }}>
        <div className="mb-2.5">{breadcrumb}</div>

        {/* Project title — the primary heading. Sized below the Research Question
            hero so the question remains the dominant element on Overview. */}
        <h1 className="text-2xl md:text-[26px] font-bold tracking-[-0.02em] leading-tight" style={{ color: "var(--text-primary)" }}>
          {displayName}
        </h1>

        {/* One-line description — the purpose of the research (omitted when empty;
            the objective lives on the Overview hero, so this never duplicates it). */}
        {project.description?.trim() && (
          <p className="text-sm md:text-[15px] mt-2 leading-relaxed max-w-2xl" style={{ color: "var(--text-secondary)" }}>
            {project.description}
          </p>
        )}

        {/* Metadata — status, updated by, when — on a single line. */}
        <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
          <ProjectStatusBadge status={status} />
          {project.owner_name && <><Sep /><span>Updated by {project.owner_name}</span></>}
          <Sep />
          <span>{formatRelativeTime(project.last_response_at ?? project.updated_at)}</span>
        </div>
      </header>
    </div>
  );
}
