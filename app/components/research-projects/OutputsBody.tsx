"use client";

// The Reports area body — the project's cross-source reporting chain. The
// user-facing area is named "Reports"; its route segment stays /outputs because
// /reports is already the per-report deep-link tree (…/reports/executive, etc.)
// and renaming the segment would collide with those frozen report pages. It
// presents the three client-ready deliverables in their established, frozen
// sequence:
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
import { PageContainer, WorkspaceHeader, PageLoadingState, ErrorState } from "@/app/components/workspace-ui";

export function OutputsBody() {
  const { project, loading, error } = useResearchProject();

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project's reports."} />
    </PageContainer>
  );

  const projectId = project.id;
  const reportReadiness = computeReportReadiness(project.evidence);

  return (
    <PageContainer>
      <WorkspaceHeader
        title="Reports"
        description="Generate the client-ready reports and articles that communicate your research."
      />
      <OutputsView
        projectId={projectId}
        basePath={`/research-projects/${projectId}`}
        reportStatus={project.report_status}
        reportStale={project.report_stale}
        reportReadiness={reportReadiness}
        fullResearchReportStatus={project.full_research_report_status}
        articleStatus={project.article_status}
      />

      <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
        When the reporting is done, capture the project&apos;s answer in{" "}
        <Link href={`/research-projects/${projectId}/conclusion`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Conclusions →</Link>
      </p>
    </PageContainer>
  );
}
