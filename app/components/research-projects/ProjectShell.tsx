"use client";

// The persistent Research Project shell chrome — project identity/header plus
// project-level navigation for the six areas, with Activity and Settings as
// utility entry points. Rendered once by the Research Project shell layout
// (app/research-projects/[id]/(workspace)/layout.tsx), inside AdminShell and
// the ProjectProvider, above the page content. It reads project data through
// useResearchProject().
//
// All six areas (Overview, Sources, Dashboard, Analysis, Outputs, Conclusion
// & Knowledge) are dedicated area routes. Activity and Settings remain
// persistent project utilities rather than areas: Activity has its own utility
// route (/activity, outside this nav) reached from the header; Settings links
// to the Project Information section that lives on Overview. A dedicated
// Settings area / header drawer is a later step.
//
// Deliberately non-sticky for this step: the Overview page still renders its
// own sticky Lifecycle tracker, and two sticky bars at the same offset would
// collide. The tracker is replaced by this nav (and this nav made sticky) in a
// later step, once the Overview page is slimmed down.
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { computeLifecycleStages, type StageState } from "@/lib/research-project-lifecycle";
import { computeProjectStatus } from "@/lib/research-project-status";
import { ProjectStatusBadge } from "@/app/components/research-projects/workspace-shared";

// The six project areas, in order. `route` areas (Overview, Design) have their
// own page; `anchor` areas still live on the Overview page and link to a
// section there. `stageKey` (when set) maps to a lifecycle stage whose state
// drives the small progress dot.
type Area =
  | { key: string; label: string; kind: "route"; segment: string; stageKey?: LifecycleKey }
  | { key: string; label: string; kind: "anchor"; anchor: string; stageKey?: LifecycleKey };
type LifecycleKey = "research_question" | "dashboard" | "evidence" | "intelligence" | "report" | "conclusion";

const AREAS: Area[] = [
  { key: "overview",   label: "Overview",               kind: "route",  segment: "overview" },
  { key: "research",   label: "Research",               kind: "route",  segment: "research",    stageKey: "evidence" },
  { key: "execution",  label: "Execution",              kind: "route",  segment: "execution",   stageKey: "dashboard" },
  { key: "dashboard",  label: "Dashboard",              kind: "route",  segment: "dashboard",   stageKey: "dashboard" },
  { key: "analysis",   label: "Analysis",               kind: "route",  segment: "analysis",    stageKey: "intelligence" },
  { key: "outputs",    label: "Reports",                kind: "route",  segment: "outputs",     stageKey: "report" },
  { key: "conclusion", label: "Conclusion & Knowledge", kind: "route",  segment: "conclusion",  stageKey: "conclusion" },
];

const DOT_CLASS: Record<StageState, string> = {
  complete: "bg-green-500",
  in_progress: "bg-amber-400",
  not_started: "bg-gray-300",
};

export function ProjectShell() {
  const params = useParams();
  const id = params.id as string;
  const pathname = usePathname();
  const { project, campaigns } = useResearchProject();

  const base = `/research-projects/${id}`;
  // All six areas are route-backed now; Activity and Settings remain utilities.
  // The base URL redirects to Overview, so anything not matched is Overview.
  const activeKey = pathname.endsWith("/research") ? "research"
    : pathname.endsWith("/execution") ? "execution"
    : pathname.endsWith("/dashboard") ? "dashboard"
    : pathname.endsWith("/analysis") ? "analysis"
    : pathname.endsWith("/outputs") ? "outputs"
    : pathname.endsWith("/conclusion") ? "conclusion"
    : "overview";

  const hasActiveCampaign = campaigns.some(c => c.effective_status === "live" || c.effective_status === "paused");
  const projectStatus = project ? computeProjectStatus(project, hasActiveCampaign) : null;
  const stages = project ? computeLifecycleStages(project) : [];
  const stageState = (key: string): StageState | undefined => stages.find(s => s.key === key)?.state;

  // Real Research Projects show the classification-suffixed project_name; the
  // simulated/topic fallback is kept only for robustness (a simulated project
  // never reaches this shell — it opens in Product Walkthrough).
  const displayName = project
    ? (project.research_mode === "simulated" && project.topic?.trim() ? project.topic.trim() : project.project_name)
    : "…";

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-3">
        {/* Project identity + persistent utilities */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
              <Link href="/research-projects" className="hover:text-[#D7B87A]">Research Projects</Link>
              <span>›</span>
              <span className="text-gray-600 truncate max-w-[60vw]">{displayName}</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{displayName}</h1>
              {projectStatus && <ProjectStatusBadge status={projectStatus} />}
            </div>
          </div>

          {/* Persistent utility entry points (not primary areas). Activity has
              its own utility route (/activity, deliberately outside the six-area
              nav); Settings still links to the Project Information section that
              remains on Overview. A header drawer / dedicated Settings area is a
              later step. */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Link
              href={`${base}/activity`}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Activity
            </Link>
            <Link
              href={`${base}/overview#project-info`}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Settings
            </Link>
          </div>
        </div>

        {/* Project-level navigation — the six areas. Directly clickable, in any
            order; the dot shows each area's lifecycle progress. Horizontally
            scrollable on narrow viewports. */}
        <nav aria-label="Project areas" className="flex items-center gap-1 overflow-x-auto mt-2.5">
          {AREAS.map(area => {
            const href = area.kind === "route" ? `${base}/${area.segment}` : `${base}/overview#${area.anchor}`;
            const active = area.kind === "route" && area.key === activeKey;
            const state = area.stageKey ? stageState(area.stageKey) : undefined;
            return (
              <Link
                key={area.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap text-sm font-medium px-3 py-2 border-b-2 transition-colors ${
                  active
                    ? "text-gray-900 border-[#D7B87A]"
                    : "text-gray-600 border-transparent hover:text-gray-900 hover:border-[#D7B87A]"
                }`}
              >
                {state && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_CLASS[state]}`} aria-hidden />}
                {area.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
