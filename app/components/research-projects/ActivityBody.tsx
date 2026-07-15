"use client";

// The Activity body — the project's chronological activity log, at
// /research-projects/[id]/activity. Activity is a persistent project utility
// (reached from the project header), not one of the six research areas, so it
// deliberately lives outside the primary area navigation.
//
// Relocation only: the day-grouped log was moved here verbatim from the
// Overview page; its data (project.activity) and behaviour are unchanged.
// Chromeless — AdminShell, the ProjectProvider data layer and the project
// header + navigation come from the (workspace) shell layout. Product
// Walkthrough is unaffected (it keeps its own inline Activity section).
import Link from "next/link";
import { useResearchProject, type ActivityRow } from "@/app/components/research-projects/ProjectProvider";
import { SectionCard, EmptyState, InfoContent } from "@/app/components/research-projects/Shell";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { formatRelativeDay } from "@/lib/format-relative-time";

export function ActivityBody() {
  const { project, loading, error } = useResearchProject();

  if (loading && !project) return (
    <div className="p-6 flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">Loading research project…</p>
    </div>
  );
  if (error || !project) return (
    <div className="p-6 max-w-5xl mx-auto text-center py-20">
      <p className="text-gray-400 mb-4">{error || "Research project not found."}</p>
      <Link href="/research-projects" className="text-[#D7B87A] hover:underline text-sm">← Back to Research Projects</Link>
    </div>
  );

  const groupedActivity: [string, ActivityRow[]][] = [];
  for (const a of project.activity) {
    const day = formatRelativeDay(a.created_at);
    const group = groupedActivity.find(([d]) => d === day);
    if (group) group[1].push(a);
    else groupedActivity.push([day, [a]]);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <SectionCard
        id="activity"
        title="Activity"
        badge={project.research_mode === "simulated" && <SimulatedBadge />}
        info={
          <InfoContent title="Everything that's happened on this project.">
            <p>A chronological log, research sources attached, targets changed, publishers/countries updated, campaigns generated, grouped by day.</p>
            <p className="mt-1.5">Use it to see what changed and when, without reconstructing it from memory.</p>
          </InfoContent>
        }
        summary={
          <p className="text-xs text-gray-500 line-clamp-2">
            {project.activity.length === 0 ? "No activity yet." : `Latest: ${project.activity[0].description}`}
          </p>
        }
      >
        {project.activity.length === 0 ? (
          <EmptyState>No activity yet.</EmptyState>
        ) : (
          <div className="space-y-4">
            {groupedActivity.map(([day, items]) => (
              <div key={day}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{day}</p>
                <div className="space-y-1.5">
                  {items.map(a => (
                    <div key={a.id} className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-gray-700">{a.description}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(a.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
