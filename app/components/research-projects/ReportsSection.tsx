"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionCard, CollapsedSummary, InfoContent } from "@/app/components/research-projects/Shell";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { INTELLIGENCE_STATUS_META, INTELLIGENCE_STATUS_TONE } from "@/app/components/research-projects/constants";
import { PrimaryButton, StatusBadge } from "@/app/components/research-projects/ActionPrimitives";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import type { ReportReadiness } from "@/lib/report-readiness";
import { NAVY, GOLD } from "@/lib/intelligence/theme";

export function ReportsSection({ projectId, isSimulated, reportStatus, reportStale, reportReadiness, fullResearchReportStatus, articleStatus }: {
  projectId: string;
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
  const router = useRouter();
  const meta = INTELLIGENCE_STATUS_META[reportStatus ?? "not_started"];
  const fullResearchReportMeta = INTELLIGENCE_STATUS_META[fullResearchReportStatus ?? "not_started"];
  const articleMeta = INTELLIGENCE_STATUS_META[articleStatus ?? "not_started"];
  const executiveReportApproved = reportStatus === "approved" || reportStatus === "published";
  const [showCoverageConfirm, setShowCoverageConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Generating straight from the Workspace — click, a modal with the same
  // progress-bar animation Survey/Conversation Intelligence already use,
  // then land on the (now-populated) report page. Previously this button
  // was a plain Link straight to the Executive Report page, which itself
  // asked for a second "Generate" click before showing anything — two
  // clicks and a blank intermediate page for something that should feel
  // like the same one-click generation every other source already has.
  async function runGenerate() {
    setShowCoverageConfirm(false);
    setGenerating(true);
    setError("");
    const res = await fetch(`/api/research-projects/${projectId}/reports/executive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: false }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setGenerating(false);
      setError(json.error ?? "Failed to generate the Executive Report.");
      return;
    }
    // The Executive Report keeps its own page (not a modal) — a print
    // stylesheet needs a clean standalone view, and it's the primary
    // deliverable, not an in-context lookup. Navigating only now, after
    // generation already succeeded, means that page shows the finished
    // report immediately rather than its own "click to generate" prompt.
    router.push(`/research-projects/${projectId}/reports/executive`);
  }

  function handleGenerateClick() {
    if (reportReadiness.readiness === "partial") { setShowCoverageConfirm(true); return; }
    runGenerate();
  }

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
                <PrimaryButton href={`/research-projects/${projectId}/reports/executive`}>View Report</PrimaryButton>
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
                href={`/research-projects/${projectId}/reports/full-research-report`}
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
                href={`/research-projects/${projectId}/reports/article`}
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

      {generating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <GeneratingProgress
              label="Synthesising every approved Research Source…"
              sublabel="Reviewing every approved source's intelligence to write the Executive Report"
              estimatedSeconds={25}
            />
          </div>
        </div>
      )}

      {error && !generating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm text-center">
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button
              onClick={() => setError("")}
              className="text-sm font-semibold px-4 py-2 rounded-lg"
              style={{ background: NAVY, color: GOLD }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Coverage confirmation — shown before generating when some attached
          sources aren't approved yet, mirroring the Executive Report
          page's own dialog exactly (same copy, same included/excluded
          list), since generation can now start from here instead. */}
      {showCoverageConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Generate with partial evidence?</h2>
            <p className="text-sm text-gray-500 mb-4">
              This Report will be generated using {reportReadiness.approvedCount} of {reportReadiness.total} attached Research Sources.
            </p>
            <div className="space-y-1.5 mb-4">
              {reportReadiness.included.map(s => (
                <div key={s.evidence_id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="text-green-600">✓</span> {s.label}, included
                </div>
              ))}
              {reportReadiness.excluded.map(s => (
                <div key={s.evidence_id} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="text-gray-300">✕</span> {s.label}, {s.reason}, will be excluded
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCoverageConfirm(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl">
                Cancel
              </button>
              <button onClick={runGenerate}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl" style={{ background: NAVY, color: GOLD }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
