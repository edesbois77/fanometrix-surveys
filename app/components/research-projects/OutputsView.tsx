"use client";

// The Research Project's Reports presentation — the deliverables desk that
// answers "how do I communicate my findings?". Research-Project-only: the
// shared ReportsSection (still rendered by Product Walkthrough) is untouched,
// so PW is unchanged. The Executive Report inline-generate flow is reused via
// the shared useExecutiveReportGeneration hook — the same one ReportsSection
// uses — so there is a single implementation, not a parallel one, and the
// reporting chain (generation, review, approval, exports) is unchanged.
//
// Presented as a portfolio of deliverables rather than a technical generator:
// the reports themselves are the focus, the generation mechanics are quiet. The
// three real deliverables lead, each card communicating what it is for (a role
// eyebrow + purpose), its current status, its readiness/prerequisites, and the
// one available action. Their fixed sequence is still enforced by the gating
// (each needs the one before it approved) but is framed as a prerequisite, not
// a "Step 1/2/3" mechanic. The Research-Project-only "Coming Soon" roadmap rows
// are omitted here. No content preview (report content isn't in the payload).
//
// A richer publication treatment (cover/thumbnail, audience, last-updated) is a
// deferred UI-refinement step — not built here.
import { SectionCard, InfoContent } from "@/app/components/research-projects/Shell";
import { PrimaryButton, StatusBadge } from "@/app/components/research-projects/ActionPrimitives";
import { INTELLIGENCE_STATUS_META, INTELLIGENCE_STATUS_TONE } from "@/app/components/research-projects/constants";
import type { ReportReadiness } from "@/lib/report-readiness";
import { useExecutiveReportGeneration } from "@/app/components/research-projects/useExecutiveReportGeneration";

type ReportStatus = "draft" | "edited" | "approved" | "published" | null;

function ReportCard({
  eyebrow, title, purpose, status, stale, detail, blocked, action,
}: {
  eyebrow: string;
  title: string;
  purpose: string;
  status: ReportStatus;
  stale?: boolean;
  detail?: React.ReactNode;
  blocked?: boolean;
  action: React.ReactNode;
}) {
  const meta = INTELLIGENCE_STATUS_META[status ?? "not_started"];
  return (
    <div className={`border rounded-lg px-4 py-4 ${blocked ? "border-gray-100 opacity-70" : "border-gray-100"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#A98A52" }}>{eyebrow}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900">{title}</p>
            <StatusBadge label={meta.label} tone={INTELLIGENCE_STATUS_TONE[status ?? "not_started"]} />
            {stale && (
              <span title="The Research Question has changed since this was generated. Regenerate to answer the current question.">
                <StatusBadge label="⚠ Question changed" tone="warning" />
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{purpose}</p>
          {detail && <div className="mt-1.5">{detail}</div>}
        </div>
        <div className="flex-shrink-0">{action}</div>
      </div>
    </div>
  );
}

export function OutputsView({
  projectId, basePath, reportStatus, reportStale, reportReadiness, fullResearchReportStatus, articleStatus,
}: {
  projectId: string;
  basePath: string;
  reportStatus: ReportStatus;
  reportStale: boolean;
  reportReadiness: ReportReadiness;
  fullResearchReportStatus: ReportStatus;
  articleStatus: ReportStatus;
}) {
  const executiveReportApproved = reportStatus === "approved" || reportStatus === "published";
  const { handleGenerateClick, overlays } = useExecutiveReportGeneration({ projectId, basePath, reportReadiness });

  const readinessLabel = reportReadiness.readiness === "ready" ? "Ready"
    : reportReadiness.readiness === "partial" ? "Partial" : "Empty";

  return (
    <>
      <SectionCard
        id="reports"
        title="Reports"
        info={
          <InfoContent title="Your client-ready deliverables, built from approved Intelligence.">
            <p>The Executive Report synthesises your approved sources; the Full Research Report expands it into a comprehensive study; the Editorial Article turns it into a public-facing story.</p>
            <p className="mt-1.5">Each deliverable needs the one before it approved first, shown as a prerequisite on the card.</p>
          </InfoContent>
        }
        summary={
          <p className="text-xs text-gray-500">
            {INTELLIGENCE_STATUS_META[reportStatus ?? "not_started"].label}
            {reportReadiness.total > 0 ? ` · ${reportReadiness.approvedCount}/${reportReadiness.total} sources approved` : ""}
          </p>
        }
      >
        <div className="space-y-3">
          <ReportCard
            eyebrow="Primary client deliverable"
            title="Executive Report"
            purpose="The headline synthesis of your approved Research Sources, the primary deliverable for stakeholders."
            status={reportStatus}
            stale={reportStale}
            detail={
              <p className="text-xs text-gray-500">
                {reportReadiness.total === 0
                  ? "No Research Sources attached yet"
                  : `Intelligence approved: ${reportReadiness.approvedCount}/${reportReadiness.total} sources · Readiness: ${readinessLabel}`}
              </p>
            }
            action={
              reportStatus
                ? <PrimaryButton href={`${basePath}/reports/executive`}>View Report</PrimaryButton>
                : <PrimaryButton
                    onClick={handleGenerateClick}
                    disabled={reportReadiness.readiness === "empty"}
                    title={reportReadiness.readiness === "empty" ? "Approve at least one Research Source's Intelligence first" : ""}
                  >Generate Executive Report</PrimaryButton>
            }
          />

          <ReportCard
            eyebrow="In-depth analysis"
            title="Full Research Report"
            purpose="The comprehensive analytical expansion of your approved Executive Report, the complete written study."
            status={fullResearchReportStatus}
            blocked={!executiveReportApproved}
            detail={!executiveReportApproved && <p className="text-xs text-amber-600">Prerequisite: an approved Executive Report</p>}
            action={
              <PrimaryButton
                href={`${basePath}/reports/full-research-report`}
                disabled={!executiveReportApproved}
                title={!executiveReportApproved ? "Approve the Executive Report first" : ""}
              >{fullResearchReportStatus ? "View Full Research Report" : "Generate Full Research Report"}</PrimaryButton>
            }
          />

          <ReportCard
            eyebrow="Public-facing story"
            title="Editorial Article"
            purpose="A publication-ready story built from your approved Executive Report, for a wider audience."
            status={articleStatus}
            blocked={!executiveReportApproved}
            detail={!executiveReportApproved && <p className="text-xs text-amber-600">Prerequisite: an approved Executive Report</p>}
            action={
              <PrimaryButton
                href={`${basePath}/reports/article`}
                disabled={!executiveReportApproved}
                title={!executiveReportApproved ? "Approve the Executive Report first" : ""}
              >{articleStatus ? "View Article" : "Generate Article"}</PrimaryButton>
            }
          />
        </div>
      </SectionCard>

      {overlays}
    </>
  );
}
