"use client";

import { SectionCard, CollapsedSummary, InfoContent } from "@/app/components/research-projects/Shell";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { INTELLIGENCE_STATUS_META, INTELLIGENCE_STATUS_TONE } from "@/app/components/research-projects/constants";
import { PrimaryButton, StatusBadge } from "@/app/components/research-projects/ActionPrimitives";
import type { ReportReadiness } from "@/lib/report-readiness";
import { useExecutiveReportGeneration } from "@/app/components/research-projects/useExecutiveReportGeneration";

export function ReportsSection({ projectId, basePath, isSimulated, reportStatus, reportStale, reportReadiness, fullResearchReportStatus, articleStatus }: {
  projectId: string;
  /** The project's route base for report navigation — `/research-projects/${id}`
   * in the real workspace, `/product-walkthrough/${id}` in Product Walkthrough.
   * Only the "View / Generate" links use it; the generate API call still hits
   * the shared `/api/research-projects/${projectId}/...` route regardless. */
  basePath: string;
  isSimulated: boolean;
  reportStatus: "draft" | "edited" | "approved" | "published" | null;
  /** The Research Question has changed since this report was generated —
   * the report still exists and is still viewable, it just no longer
   * answers what's currently being asked. Regenerate to catch it up. */
  reportStale: boolean;
  reportReadiness: ReportReadiness;
  /** Full Research Report's own independent status — sits after the
   * Executive Report in the Reports product hierarchy, before Editorial
   * Article. Its own page (not this card) does the actual generating,
   * same "navigate first, generate on landing" pattern Key Findings/
   * Conclusion already use — deliberately never triggered from this row
   * directly, unlike the Executive Report row's own runGenerate(), since
   * generation here is a substantial, costlier call that must only start
   * from an explicit click, not just navigating here. */
  fullResearchReportStatus: "draft" | "edited" | "approved" | "published" | null;
  /** Editorial Article's own independent status — same reasoning as
   * reportStatus above. Its own page (not this card) does the actual
   * generating, same "navigate first, generate on landing" pattern Key
   * Findings/Conclusion already use, rather than duplicating a second
   * inline-generate trigger here. */
  articleStatus: "draft" | "edited" | "approved" | "published" | null;
}) {
  const meta = INTELLIGENCE_STATUS_META[reportStatus ?? "not_started"];
  const fullResearchReportMeta = INTELLIGENCE_STATUS_META[fullResearchReportStatus ?? "not_started"];
  const articleMeta = INTELLIGENCE_STATUS_META[articleStatus ?? "not_started"];
  const executiveReportApproved = reportStatus === "approved" || reportStatus === "published";

  // The Executive Report inline-generate flow (button handler + the generating/
  // error/coverage-confirmation overlays) is shared with OutputsView via this
  // hook — one implementation, no parallel copy. The produced markup is
  // identical to before, so Product Walkthrough (which renders this section) is
  // unchanged.
  const { handleGenerateClick, overlays } = useExecutiveReportGeneration({ projectId, basePath, reportReadiness });

  return (
    <>
      <SectionCard
        id="reports"
        title="Reports"
        badge={isSimulated && <SimulatedBadge />}
        info={
          <InfoContent title="Client-ready reports, built from your Intelligence.">
            <p>Synthesises this project&apos;s approved Intelligence into client-ready report types, the Executive Report and Editorial Article today, with Benchmark, Client and Presentation Deck to follow.</p>
            <p className="mt-1.5">Approve each source&apos;s Intelligence first, so there&apos;s something for Reports to draw on.</p>
          </InfoContent>
        }
        summary={
          <CollapsedSummary groups={[{ parts: [
            ...(reportStale ? [meta.label, "Question changed"] : [meta.label]),
            ...(reportReadiness.total > 0 ? [`${reportReadiness.approvedCount}/${reportReadiness.total} sources approved`] : []),
          ] }]} />
        }
      >
        <div className="space-y-2">
          <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Executive Report</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {reportReadiness.total === 0
                  ? "No Research Sources attached yet"
                  : `Intelligence Approved: ${reportReadiness.approvedCount}/${reportReadiness.total} · Report Readiness: ${
                      reportReadiness.readiness === "ready" ? "Ready" : reportReadiness.readiness === "partial" ? "Partial" : "Empty"
                    }`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge label={meta.label} tone={INTELLIGENCE_STATUS_TONE[reportStatus ?? "not_started"]} />
              {reportStale && (
                <span title="The Research Question has changed since this was generated, Regenerate to answer the current question.">
                  <StatusBadge label="⚠ Question changed" tone="warning" />
                </span>
              )}
              {reportStatus ? (
                <PrimaryButton href={`${basePath}/reports/executive`}>View Report</PrimaryButton>
              ) : (
                <PrimaryButton
                  onClick={handleGenerateClick}
                  disabled={reportReadiness.readiness === "empty"}
                  title={reportReadiness.readiness === "empty" ? "Approve at least one Research Source's Intelligence first" : ""}
                >
                  Generate Executive Report
                </PrimaryButton>
              )}
            </div>
          </div>

          <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Full Research Report</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {executiveReportApproved
                  ? "The comprehensive analytical expansion of your approved Executive Report"
                  : "Approve the Executive Report first"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge label={fullResearchReportMeta.label} tone={INTELLIGENCE_STATUS_TONE[fullResearchReportStatus ?? "not_started"]} />
              <PrimaryButton
                href={`${basePath}/reports/full-research-report`}
                disabled={!executiveReportApproved}
                title={!executiveReportApproved ? "Approve the Executive Report first" : ""}
              >
                {fullResearchReportStatus ? "View Full Research Report" : "Generate Full Research Report"}
              </PrimaryButton>
            </div>
          </div>

          <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Editorial Article</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {executiveReportApproved
                  ? "A public-facing story built from your approved Executive Report"
                  : "Approve the Executive Report first"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusBadge label={articleMeta.label} tone={INTELLIGENCE_STATUS_TONE[articleStatus ?? "not_started"]} />
              <PrimaryButton
                href={`${basePath}/reports/article`}
                disabled={!executiveReportApproved}
                title={!executiveReportApproved ? "Approve the Executive Report first" : ""}
              >
                {articleStatus ? "View Article" : "Generate Article"}
              </PrimaryButton>
            </div>
          </div>

          {["Benchmark Report", "Client Report", "Presentation Deck"].map(name => (
            <div key={name} className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3 opacity-50">
              <p className="text-sm font-medium text-gray-500">{name}</p>
              <StatusBadge label="Coming Soon" tone="neutral" />
            </div>
          ))}
        </div>
      </SectionCard>

      {overlays}
    </>
  );
}
