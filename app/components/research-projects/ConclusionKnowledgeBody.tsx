"use client";

// The Conclusion & Knowledge area body — at /research-projects/[id]/conclusion.
// Two distinct concepts kept in one top-level project area, not merged:
//
//   Conclusion — the final, project-level research conclusion. Distilled from
//     the approved Executive Report, it closes the project (generate → review
//     → approve → publish).
//   Knowledge — the durable, reusable organisational knowledge produced from
//     the completed research. It is populated only by publishing the approved
//     Conclusion; there is no other way in.
//
// The established relationship is preserved: research + reporting produce the
// evidence and outputs → the Conclusion closes the project → the published
// Conclusion populates Knowledge. This is a relocation only — ConclusionSection
// and KnowledgeSection are reused exactly as before, each keeping its own data
// model, generation/publish logic and review states. Knowledge continues to be
// populated solely through the completed-research/Conclusion workflow; context
// or design inputs never reach it.
//
// Chromeless: AdminShell, the ProjectProvider data layer and the project
// header + navigation are provided by the (workspace) shell layout. Product
// Walkthrough is unaffected — it keeps its own single-page WalkthroughBody
// with its own copy of these sections.
import Link from "next/link";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { ConclusionSection } from "@/app/components/research-projects/ConclusionSection";
import { KnowledgeSection } from "@/app/components/research-projects/KnowledgeSection";

export function ConclusionKnowledgeBody() {
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

  const displayName = project.research_mode === "simulated" && project.topic?.trim()
    ? project.topic.trim()
    : project.project_name;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <ConclusionSection
        projectId={project.id}
        projectName={displayName}
        researchQuestion={project.research_question ?? ""}
        reportApproved={project.report_status === "approved" || project.report_status === "published"}
        isSimulated={project.research_mode === "simulated"}
      />

      <KnowledgeSection publishedConclusion={project.published_conclusion} />
    </div>
  );
}
