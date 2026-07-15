"use client";

// The Dashboard area body — the project-level cross-source collection
// dashboard, at /research-projects/[id]/dashboard. It is the full Collection
// view (coverage, per-source progress, survey responses, conversation volumes,
// campaign state) that previously sat inside Sources; Overview now shows only
// a lightweight snapshot with a link here.
//
// Relocation only: DashboardSection is reused exactly as before — this is the
// single dashboard implementation, not a second one. It is built to grow
// richer over time (market breakdowns, campaign performance, cross-source
// visualisations) without changing where it lives.
//
// Chromeless: AdminShell, the ProjectProvider data layer and the project
// header + navigation are provided by the (workspace) shell layout. Product
// Walkthrough is unaffected — it keeps its own single-page WalkthroughBody
// with its own copy of this section.
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { DashboardSection } from "@/app/components/research-projects/DashboardSection";

export function DashboardBody() {
  const router = useRouter();
  const { project, campaigns, loading, error } = useResearchProject();

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

  const projectId = project.id;
  const surveyEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey
  );
  const conversationSearchEvidence = project.evidence.filter(e => e.evidence_type === "social_search" && e.conversationSearch);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <DashboardSection
        projectId={project.id}
        isSimulated={project.research_mode === "simulated"}
        hasEvidence={project.evidence.length > 0}
        onScrollToResearchSources={() => router.push(`/research-projects/${projectId}/execution`)}
        surveys={surveyEvidence.map(item => ({
          evidence_id: item.evidence_id, name: item.survey.name, response_count: item.survey.response_count,
          target_responses: item.survey.target_responses ?? project.simulation_info?.surveyResponseTarget ?? null,
          run_status: item.run_status,
        }))}
        conversationSearches={conversationSearchEvidence.map(item => ({
          evidence_id: item.evidence_id, name: item.conversationSearch!.name, mention_count: item.conversationSearch!.mention_count,
          run_status: item.run_status,
          markets: item.conversationSearch!.markets, platforms: item.conversationSearch!.platforms,
          positive_pct: item.conversationSearch!.positive_pct, neutral_pct: item.conversationSearch!.neutral_pct, negative_pct: item.conversationSearch!.negative_pct,
        }))}
        mentionTarget={project.simulation_info?.mentionTarget ?? null}
        campaigns={campaigns}
      />
    </div>
  );
}
