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
  { key: "conclusion", label: "Conclusions",             kind: "route",  segment: "conclusion",  stageKey: "conclusion" },
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
  const { project } = useResearchProject();

  const base = `/research-projects/${id}`;
  // Active tab = the first path segment after the project id, so a Research
  // sub-page (…/research/survey) still highlights Research. Anything unmatched
  // (or the base redirect) resolves to Overview.
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const areaSeg = rest.split("/").filter(Boolean)[0] ?? "overview";
  const activeKey = ["research", "execution", "dashboard", "analysis", "outputs", "conclusion"].includes(areaSeg)
    ? areaSeg
    : "overview";

  const stages = project ? computeLifecycleStages(project) : [];
  const stageState = (key: string): StageState | undefined => stages.find(s => s.key === key)?.state;

  return (
    <div className="sticky top-0 z-30" style={{ background: "var(--brand-navy)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="mx-auto px-4 md:px-6 pt-3" style={{ maxWidth: "var(--page-max)" }}>
        {/* Application shell — navigation and structure only. The project itself
            is introduced by the page header (ProjectPageHeader), not here: the
            shell tells you which section of the app you're in and lets you move
            between areas; the page opens the project. Deliberately carries no
            project name / status / metadata / utilities — those belong to the
            page (Activity is the final Overview section; project settings live in
            Project Information).

            The section title is the consistent, heavy workspace heading meant to
            be reused verbatim across every major platform area (Research
            Projects, Research Library, Organisation Intelligence, …) so users
            always know which part of Fanometrix they're in. */}
        <div className="flex items-center">
          <Link
            href="/research-projects"
            className="text-xl md:text-2xl font-bold tracking-[-0.02em] transition-colors text-white hover:text-white/80"
          >
            Research Projects
          </Link>
        </div>

        {/* Project-level navigation — the seven areas. Directly clickable, in any
            order; the dot shows each area's lifecycle progress. Horizontally
            scrollable on narrow viewports. */}
        <nav aria-label="Project areas" className="flex items-center gap-1 overflow-x-auto mt-3">
          {AREAS.map((area, i) => {
            const href = area.kind === "route" ? `${base}/${area.segment}` : `${base}/overview#${area.anchor}`;
            const active = area.kind === "route" && area.key === activeKey;
            const state = area.stageKey ? stageState(area.stageKey) : undefined;
            // Drop the first tab's left padding so its label lines up flush with
            // the container edge — i.e. under the "R" of the "Research Projects"
            // heading above — instead of sitting 12px in. Its underline then
            // starts at the word too; the other tabs keep symmetric padding.
            return (
              <Link
                key={area.key}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap text-sm font-medium ${i === 0 ? "pl-0 pr-3" : "px-3"} py-2 border-b-2 transition-colors ${
                  active
                    ? "text-white border-[#D7B87A]"
                    : "text-white/70 border-transparent hover:text-white hover:border-[#D7B87A]"
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
