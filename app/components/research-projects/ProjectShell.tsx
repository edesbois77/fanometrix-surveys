"use client";

// The persistent Research Project shell chrome — project identity/header plus
// project-level navigation for the six areas, with Activity and Settings as
// utility entry points. Rendered once by the Research Project shell layout
// (app/research-projects/[id]/(workspace)/layout.tsx), inside AdminShell and
// the ProjectProvider, above the page content. It reads project data through
// useResearchProject().
//
// This is the Step 2 foundation: the header and nav render, but the six area
// routes don't exist yet, so — rather than link to routes that would 404 or
// present misleading empty pages — each nav entry scrolls to the matching
// section of the current single-page workspace (the same anchors the in-page
// Lifecycle tracker already uses). Nav is directly clickable, never a forced
// wizard. When the area routes are created in later steps, these entries are
// repointed from anchors to real routes; the surrounding shell stays put.
//
// Deliberately non-sticky for this step: the current workspace still renders
// its own sticky Lifecycle tracker, and two sticky bars at the same offset
// would collide. The tracker is replaced by this nav (and this nav made
// sticky) in a later step, once the single page is split.
import Link from "next/link";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { computeLifecycleStages, type StageState } from "@/lib/research-project-lifecycle";
import { computeProjectStatus } from "@/lib/research-project-status";
import { ProjectStatusBadge } from "@/app/components/research-projects/workspace-shared";

// The six project areas, in order. `anchor` is the current-page section each
// scrolls to for now; `stageKey` (when set) maps to a lifecycle stage whose
// state drives the small progress dot. Overview is the landing area and
// carries no progress dot of its own.
const AREAS: { key: string; label: string; anchor: string; stageKey?: "research_question" | "evidence" | "intelligence" | "report" | "conclusion" }[] = [
  { key: "overview",   label: "Overview",               anchor: "hero" },
  { key: "design",     label: "Design",                 anchor: "hero",         stageKey: "research_question" },
  { key: "sources",    label: "Sources",                anchor: "evidence",     stageKey: "evidence" },
  { key: "analysis",   label: "Analysis",               anchor: "intelligence", stageKey: "intelligence" },
  { key: "outputs",    label: "Outputs",                anchor: "reports",      stageKey: "report" },
  { key: "conclusion", label: "Conclusion & Knowledge", anchor: "conclusion",   stageKey: "conclusion" },
];

const DOT_CLASS: Record<StageState, string> = {
  complete: "bg-green-500",
  in_progress: "bg-amber-400",
  not_started: "bg-gray-300",
};

function scrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ProjectShell() {
  const { project, campaigns } = useResearchProject();

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
              rebuilt here (Step 2) — they scroll to the existing Activity and
              Project Information sections of the current workspace; they become
              a header drawer / dedicated Settings area in later steps. */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={() => scrollToSection("activity")}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Activity
            </button>
            <button
              onClick={() => scrollToSection("project-info")}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              Settings
            </button>
          </div>
        </div>

        {/* Project-level navigation — the six areas. Directly clickable, in any
            order; the dot shows each area's lifecycle progress. Horizontally
            scrollable on narrow viewports. */}
        <nav aria-label="Project areas" className="flex items-center gap-1 overflow-x-auto mt-2.5">
          {AREAS.map(area => {
            const state = area.stageKey ? stageState(area.stageKey) : undefined;
            return (
              <button
                key={area.key}
                onClick={() => scrollToSection(area.anchor)}
                className="group flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-2 border-b-2 border-transparent hover:border-[#D7B87A] transition-colors"
              >
                {state && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT_CLASS[state]}`} aria-hidden />}
                {area.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
