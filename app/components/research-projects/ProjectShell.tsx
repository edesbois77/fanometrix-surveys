"use client";

// The persistent Research Project shell chrome — project identity/header plus
// project-level navigation for the six areas, with Activity and Settings as
// utility entry points. Rendered once by the Research Project shell layout
// (app/research-projects/[id]/(workspace)/layout.tsx), inside AdminShell and
// the ProjectProvider, above the page content. It reads project data through
// useResearchProject().
//
// Overview and Design are dedicated area routes now; the remaining areas
// (Sources, Analysis, Outputs, Conclusion & Knowledge) and the Activity /
// Settings utilities still live on the Overview page for now, so they link to
// the matching Overview section anchor (the same anchors the in-page Lifecycle
// tracker uses, resolved by the workspace's own scroll-restore). As each
// remaining area gets its own route in later steps, its entry is repointed
// from an Overview anchor to a real route; the surrounding shell stays put.
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
type LifecycleKey = "research_question" | "evidence" | "intelligence" | "report" | "conclusion";

const AREAS: Area[] = [
  { key: "overview",   label: "Overview",               kind: "route",  segment: "overview" },
  { key: "design",     label: "Design",                 kind: "route",  segment: "design",     stageKey: "research_question" },
  { key: "sources",    label: "Sources",                kind: "route",  segment: "sources",     stageKey: "evidence" },
  { key: "analysis",   label: "Analysis",               kind: "route",  segment: "analysis",    stageKey: "intelligence" },
  { key: "outputs",    label: "Outputs",                kind: "route",  segment: "outputs",     stageKey: "report" },
  { key: "conclusion", label: "Conclusion & Knowledge", kind: "anchor", anchor: "conclusion",   stageKey: "conclusion" },
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
  // Overview, Design, Sources, Analysis and Outputs are area routes today; the
  // base URL redirects to Overview, so anything that isn't Design/Sources/
  // Analysis/Outputs is treated as Overview.
  const activeKey = pathname.endsWith("/sources") ? "sources"
    : pathname.endsWith("/analysis") ? "analysis"
    : pathname.endsWith("/outputs") ? "outputs"
    : pathname.endsWith("/design") ? "design"
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

          {/* Persistent utility entry points. Activity and Settings are not
              rebuilt here (Step 3) — they link to the existing Activity and
              Project Information sections on the Overview page; they become a
              header drawer / dedicated Settings area in later steps. */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Link
              href={`${base}/overview#activity`}
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
