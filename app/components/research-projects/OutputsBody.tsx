"use client";

// The Outputs area body — the project's cross-source reporting chain, at
// /research-projects/[id]/outputs. It presents the three client-ready
// outputs in their established, frozen sequence:
//
//   Executive Report → Full Research Report → Editorial Article
//
// This is a relocation only. ReportsSection is reused exactly as before,
// with the same readiness/gating/dependency behaviour: the Executive Report
// is generated from approved source Intelligence, the Full Research Report is
// gated on an approved Executive Report, and the Editorial Article is gated
// on both. Generation, review, editing, approval, exports and the manual
// article Add-Section flow all live on the individual report pages (still
// under …/reports/*) and are unchanged — this area is the shell + the three
// cards, nothing more.
//
// Source-level Intelligence and Key Findings are NOT here — they are the
// Analysis area. Conclusion and Knowledge remain on Overview for now.
//
// Chromeless: AdminShell, the ProjectProvider data layer and the project
// header + navigation are provided by the (workspace) shell layout. Product
// Walkthrough is unaffected — it keeps its own single-page WalkthroughBody
// with its own copy of this section.
import Link from "next/link";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { computeReportReadiness } from "@/lib/report-readiness";
import { OutputsView } from "@/app/components/research-projects/OutputsView";

export function OutputsBody() {
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

  const projectId = project.id;
  const reportReadiness = computeReportReadiness(project.evidence);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <OutputsView
        projectId={projectId}
        basePath={`/research-projects/${projectId}`}
        reportStatus={project.report_status}
        reportStale={project.report_stale}
        reportReadiness={reportReadiness}
        fullResearchReportStatus={project.full_research_report_status}
        articleStatus={project.article_status}
      />
    </div>
  );
}
