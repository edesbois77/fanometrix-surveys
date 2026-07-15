"use client";

// The Executive Report inline-generate flow, extracted verbatim from
// ReportsSection so it can be reused by both the shared ReportsSection (still
// rendered by Product Walkthrough) and the Research-Project-only OutputsView —
// one implementation, no parallel copy, no change to the reporting chain.
//
// It owns the generate call (POST /api/research-projects/[id]/reports/executive,
// unchanged), the "generate with partial evidence?" coverage confirmation, the
// generating progress overlay and the error overlay. Callers wire the button to
// `handleGenerateClick` and render `overlays`; the produced markup is identical
// to ReportsSection's previous inline modals, so Product Walkthrough is
// unchanged.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import type { ReportReadiness } from "@/lib/report-readiness";
import { NAVY, GOLD } from "@/lib/intelligence/theme";

export function useExecutiveReportGeneration({
  projectId, basePath, reportReadiness,
}: {
  projectId: string;
  basePath: string;
  reportReadiness: ReportReadiness;
}) {
  const router = useRouter();
  const [showCoverageConfirm, setShowCoverageConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Generating straight from the Workspace — click, a modal with the same
  // progress-bar animation Survey/Conversation Intelligence already use, then
  // land on the (now-populated) report page.
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
    // deliverable. Navigating only now, after generation already succeeded,
    // means that page shows the finished report immediately.
    router.push(`${basePath}/reports/executive`);
  }

  function handleGenerateClick() {
    if (reportReadiness.readiness === "partial") { setShowCoverageConfirm(true); return; }
    runGenerate();
  }

  const overlays = (
    <>
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

  return { handleGenerateClick, generating, overlays };
}
