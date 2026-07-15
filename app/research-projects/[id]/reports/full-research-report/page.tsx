"use client";

// Full Research Report — the comprehensive analytical expansion of an
// approved Executive Report. Sibling of ../executive/page.tsx and
// ../article/page.tsx, same reasons for a dedicated route (print
// stylesheet for PDF, the primary deliverable rather than an in-context
// lookup). Sits after the Executive Report in the Reports product
// hierarchy, before any derivative output — Editorial Article/Conclusion
// are untouched by this page and still read only the Executive Report.
//
// Auto-generates on arrival, same "navigate first, generate on landing"
// pattern every other report page (Article, Key Findings, Conclusion)
// already uses — the click that got the user here (Generate/View on the
// Workspace's Reports card) already expressed intent, a second click on
// this page would just be friction. This must stay consistent with every
// other report type; do not reintroduce a manual "click to generate"
// landing state here.
//
// The Evidence Appendix (the complete Key Findings pool) is visually
// separated from the main analytical report and collapsed by default —
// a project can have hundreds of findings, and this page's reading flow
// is the theme deep-dives and validated architecture above it, not a
// restatement of the full fact list. The PDF export forces it open just
// before printing (see handleExportPdf) so the PDF always contains the
// complete appendix regardless of its on-screen state; the PPTX export
// never includes it at all (see lib/export-full-research-report-pptx.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { setWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import type { FullResearchReport } from "@/lib/intelligence/analysts/analyseFullResearchReport";
import { Section, FindingReferenceChips, StatusBadge } from "@/app/components/intelligence/ReviewFields";
import { ReportActionRow } from "@/app/components/intelligence/ReportActionRow";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import { exportFullResearchReportPptx } from "@/lib/export-full-research-report-pptx";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { NAVY, GOLD, PAPER, PAPER_LINE, REPORT_TONES } from "@/lib/intelligence/theme";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { flagReviewConcerns, REVIEW_FLAG_CATEGORY_LABEL } from "@/lib/intelligence/full-research-report-review";
import { stripCitationIds } from "@/lib/intelligence/strip-citation-ids";
import { nonBlankStrings, withFinding, withAction, withInsight } from "@/lib/intelligence/report-content";

type ProjectForReport = {
  project_name: string;
  research_mode: "real" | "simulated";
  report_status: "draft" | "edited" | "approved" | "published" | null;
};

function appendixElementId(i: number) {
  return `full-research-report-appendix-${i}`;
}

export default function FullResearchReportPage() {
  const params = useParams();
  const id = params.id as string;
  const backHref = `/research-projects/${id}#reports`;

  const [project, setProject] = useState<ProjectForReport | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);
  const appendixRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research-projects/${id}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) { setProject(json.data); setLoadingProject(false); } });
    return () => { cancelled = true; };
  }, [id]);

  const adapter: IntelligenceReviewAdapter<FullResearchReport> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(`/api/research-projects/${id}/reports/full-research-report`);
      const json = await res.json();
      return json.data ?? null;
    },
    generate: async confirm => {
      const res  = await fetch(`/api/research-projects/${id}/reports/full-research-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: true };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate the Full Research Report." };
      return { ok: true, data: json.data };
    },
    saveEdit: async editedContent => {
      const res  = await fetch(`/api/research-projects/${id}/reports/full-research-report/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: json.data };
    },
    approve: async () => {
      const res  = await fetch(`/api/research-projects/${id}/reports/full-research-report/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: json.data };
    },
    publish: async () => {
      const res  = await fetch(`/api/research-projects/${id}/reports/full-research-report/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to publish." };
      return { ok: true, data: json.data };
    },
  }), [id]);

  const {
    row, draft, editing, loading, generating, saving, approving, error, confirmRegen,
    current, busy,
    setDraft, setConfirmRegen,
    generate, startEditing, cancelEditing, saveEdits, approveSummary,
  } = useIntelligenceReview<FullResearchReport>(adapter, [id]);

  const executiveReportApproved = project?.report_status === "approved" || project?.report_status === "published";

  // Same "fire generation on arrival instead of making the user click
  // again" pattern as ../article/page.tsx and ../key-findings/page.tsx —
  // the click that got the user here already expressed intent. A ref (not
  // state), read and written only inside the effect, never during render.
  const autoFired = useRef(false);
  const autoGenerate = executiveReportApproved && !row;
  useEffect(() => {
    if (!autoGenerate || loading || loadingProject || autoFired.current) return;
    autoFired.current = true;
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, loading, loadingProject]);

  const showGenerating = generating || (autoGenerate && !loading && !loadingProject);

  // The Executive Report may have been regenerated since this Full
  // Research Report was built — same "underlying report changed"
  // signal the Executive Report's own page shows for a Research Question
  // drift, here comparing the snapshot this report took at generation
  // time. Missing on reports generated before this field existed —
  // treated as unknown, never as stale.
  const [executiveReportGeneratedAt, setExecutiveReportGeneratedAt] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research-projects/${id}/reports/executive`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const report = json.data ? (json.data.edited_content ?? json.data.content) : null;
        setExecutiveReportGeneratedAt(report?.generated_at ?? null);
      });
    return () => { cancelled = true; };
  }, [id, row?.id]);
  const executiveReportStale = !!current?.executive_report_generated_at && !!executiveReportGeneratedAt
    && current.executive_report_generated_at !== executiveReportGeneratedAt;

  // Automated Review Prompts — computed at render, purely from the report
  // in hand, never stored and never mutating content (see
  // lib/intelligence/full-research-report-review.ts). Only shown while the
  // report is still under review (draft/edited); once a human has approved
  // it, they have already made these judgements. Recomputes automatically
  // whenever `current` changes (e.g. after an edit is saved).
  const reviewFlags = useMemo(() => (current ? flagReviewConcerns(current) : []), [current]);
  const showReviewPrompts = !!row && (row.status === "draft" || row.status === "edited");

  function jumpToAppendixFinding(i: number) {
    if (appendixRef.current) appendixRef.current.open = true;
    requestAnimationFrame(() => {
      const el = document.getElementById(appendixElementId(i));
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[#D7B87A]");
      setTimeout(() => el.classList.remove("ring-2", "ring-[#D7B87A]"), 1500);
    });
  }

  async function handleExport(format: "pdf" | "pptx") {
    if (!current || !project) return;
    setExporting(format);
    if (format === "pdf") {
      // Force the (possibly collapsed) Evidence Appendix open for the
      // print pass — the PDF must always contain the complete appendix
      // regardless of its on-screen collapsed state — then restore
      // whatever state it was actually in once the print dialog closes.
      const wasOpen = appendixRef.current?.open ?? false;
      if (appendixRef.current) appendixRef.current.open = true;
      const originalTitle = document.title;
      document.title = `Fanometrix - ${project.project_name} - Full Research Report`;
      const restore = () => {
        document.title = originalTitle;
        if (appendixRef.current) appendixRef.current.open = wasOpen;
        window.removeEventListener("afterprint", restore);
      };
      window.addEventListener("afterprint", restore);
      window.print();
    } else {
      await exportFullResearchReportPptx(project.project_name, current);
    }
    setExporting(null);
  }

  function updateDeepDive(i: number, text: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      theme_deep_dives: draft.theme_deep_dives.map((d, j) => (j === i ? { ...d, deep_dive: text } : d)),
    });
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">

        {project?.research_mode === "simulated" && (
          <div className="mb-4 print:hidden"><SimulatedBanner /></div>
        )}

        {/* Header (screen only) */}
        <div className="flex items-start justify-between mb-6 print:hidden flex-wrap gap-3">
          <div>
            <Link
              href={backHref}
              scroll={false}
              onClick={() => setWorkspaceScrollTarget("reports")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ← Back to Workspace
            </Link>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">Full Research Report</h1>
              {row && <StatusBadge status={row.status} />}
              {executiveReportStale && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: REPORT_TONES.gold.wash, color: REPORT_TONES.gold.ink }}
                  title="The Executive Report has changed since this was generated, Regenerate to catch it up."
                >
                  ⚠ Executive Report changed
                </span>
              )}
              {current?.research_mode === "simulated" && <SimulatedBadge />}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">{project?.project_name ?? "…"}</p>
            {row && <p className="text-xs text-gray-400 mt-0.5">Last updated {formatRelativeTime(row.updated_at)}</p>}
          </div>

          <ReportActionRow
            editing={editing}
            hasRow={!!row}
            status={row?.status}
            busy={busy}
            saving={saving}
            approving={approving}
            generating={generating}
            onEdit={startEditing}
            onApprove={approveSummary}
            onRegenerate={() => generate(false)}
            onCancel={cancelEditing}
            onSave={saveEdits}
            extraActions={current && !editing && (
              <>
                <button onClick={() => handleExport("pdf")} disabled={!!exporting}
                  className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                  {exporting === "pdf" ? "…" : "Export PDF"}
                </button>
                <button onClick={() => handleExport("pptx")} disabled={!!exporting}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
                  style={{ background: GOLD, color: NAVY }}>
                  {exporting === "pptx" ? "Generating…" : "Export PPTX"}
                </button>
              </>
            )}
          />
        </div>

        {(loading || loadingProject) && (
          <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm">
            <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {/* Only ever reached when the Executive Report isn't approved yet
            (autoGenerate false in that case) — once it is, showGenerating
            takes over before this can render, same as every other report
            page's own gated empty state. */}
        {!loading && !loadingProject && !row && !showGenerating && (
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>Full Research Report</p>
            <h2 className="text-xl font-bold text-white mb-3">
              Explore the complete evidence pool behind the approved Executive Report
            </h2>
            <p className="text-sm text-white/60 max-w-md mx-auto leading-relaxed mb-6">
              One analytical deep-dive per Strategic Theme, drawing on every validated Key Finding, not only the ones
              selected into the concise Executive Report — plus the full evidence appendix and methodology detail.
            </p>
            {error && <p className="text-sm text-red-300 mb-4">{error}</p>}
            <button
              onClick={() => generate(false)}
              disabled={!executiveReportApproved}
              title={!executiveReportApproved ? "Approve the Executive Report first" : undefined}
              className="text-sm font-semibold px-6 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: GOLD, color: NAVY }}
            >
              Generate Full Research Report →
            </button>
            {!executiveReportApproved && <p className="text-xs text-white/40 mt-3">Approve this project&apos;s Executive Report first.</p>}
          </div>
        )}

        {showGenerating && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <GeneratingProgress
              label="Expanding the approved Executive Report…"
              sublabel="Drawing on the complete validated evidence pool to write one deep-dive per Strategic Theme"
              estimatedSeconds={40}
            />
          </div>
        )}

        {error && row && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Automated Review Prompts — a review aid, never a failure state.
            Collapsible, hidden in print, shown only while under review.
            These never change the report; they draw the reviewer's eye to
            passages worth confirming, and the validator is deliberately
            conservative so some flags will be legitimate analytical
            language. */}
        {!generating && row && current && showReviewPrompts && reviewFlags.length > 0 && (
          <details className="mb-6 rounded-2xl overflow-hidden print:hidden" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
            <summary className="cursor-pointer select-none px-5 py-4 flex items-start gap-2.5">
              <span className="text-base leading-none mt-0.5" style={{ color: REPORT_TONES.gold.ink }}>❖</span>
              <span className="min-w-0">
                <span className="text-sm font-semibold" style={{ color: REPORT_TONES.gold.ink }}>
                  Review Prompts ({reviewFlags.length})
                </span>
                <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                  Passages worth a second look before you approve — not errors, and not a failed check. The report has not been changed. This automated pass is deliberately cautious and will sometimes flag legitimate analysis; use it to inspect, then edit only what you judge necessary.
                </span>
              </span>
            </summary>
            <div className="px-5 pb-5 space-y-3">
              {reviewFlags.map((f, i) => (
                <div key={i} className="rounded-xl bg-white/70 p-3.5" style={{ border: `1px solid ${PAPER_LINE}` }}>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: REPORT_TONES.gold.wash, color: REPORT_TONES.gold.ink }}>
                      {REVIEW_FLAG_CATEGORY_LABEL[f.category]}
                    </span>
                    <span className="text-[11px] text-gray-400">{f.section}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed mb-1.5">“{f.passage}”</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{f.why}</p>
                  {f.evidenceNote && <p className="text-[11px] text-gray-400 mt-0.5">{f.evidenceNote}</p>}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Generation fallback notice — reviewer-facing only. Some sections'
            AI generation can fail (after retries) and fall back to existing
            approved content; this tells the reviewer which sections were NOT
            freshly generated so they can check them, without changing any
            report prose. Gated exactly like the Review Prompts (draft/edited
            only, print:hidden) so it never reaches the approved report, the
            PDF, or the PPTX. */}
        {!generating && row && current && showReviewPrompts && (current.generation_fallbacks?.length ?? 0) > 0 && (
          <div className="mb-6 rounded-2xl p-5 print:hidden" style={{ background: REPORT_TONES.concern.wash, border: `1px solid ${REPORT_TONES.concern.line}` }}>
            <p className="text-sm font-semibold mb-1.5" style={{ color: REPORT_TONES.concern.ink }}>
              ⚠ Some sections could not be generated
            </p>
            <p className="text-xs text-gray-600 leading-relaxed mb-2">
              The following {current.generation_fallbacks!.length === 1 ? "section" : "sections"} could not be produced by the AI analysis and currently show existing approved content as a fallback rather than freshly-generated analysis. Review {current.generation_fallbacks!.length === 1 ? "it" : "them"} — and regenerate if needed — before approving.
            </p>
            <ul className="list-disc list-inside space-y-0.5">
              {current.generation_fallbacks!.map((label, i) => (
                <li key={i} className="text-xs" style={{ color: REPORT_TONES.concern.ink }}>{label}</li>
              ))}
            </ul>
          </div>
        )}

        {!generating && row && current && (
          <div className="space-y-6 print:space-y-4">

            {/* Print-only masthead */}
            <div className="hidden print:block mb-6">
              {current.synthetic_notice && (
                <div className="mb-3 px-3 py-2 rounded" style={{ background: NAVY, color: GOLD }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest">Simulated Research, Synthetic Data Only</p>
                  <p className="text-xs mt-0.5">{current.synthetic_notice}</p>
                </div>
              )}
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: GOLD }}>Fanometrix, Full Research Report</p>
              <h1 className="text-2xl font-bold mt-1" style={{ color: NAVY }}>{project?.project_name}</h1>
            </div>

            {current.synthetic_notice && (
              <div className="print:hidden px-4 py-3 rounded-xl text-center" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
                <p className="text-sm" style={{ color: REPORT_TONES.gold.ink }}>{current.synthetic_notice}</p>
              </div>
            )}

            {/* Research Question + Answer — fixed, verbatim from the
                approved Executive Report, never editable here. */}
            <div className="rounded-2xl p-6" style={{ background: NAVY }}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: GOLD }}>Research Question</p>
              <p className="text-base text-white/90 mb-4">{current.research_question}</p>
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: GOLD }}>Research Answer</p>
                <p className="text-xl font-bold text-white leading-snug">{current.research_answer}</p>
              </div>
            </div>

            {/* Executive Summary — this report's own, fuller and
                independently editable, never the Executive Report's
                shorter one. */}
            <Section title="Executive Summary" tone="navy">
              {editing && draft ? (
                <textarea value={draft.executive_summary} rows={5}
                  onChange={e => setDraft({ ...draft, executive_summary: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
              ) : (
                <p className="text-base text-gray-800 leading-relaxed">{stripCitationIds(current.executive_summary)}</p>
              )}
            </Section>

            {/* Theme Deep-Dives — the report's real analytical body. Each
                theme's name/identity is fixed (copied from the approved
                Executive Report), only the deep_dive prose is editable. */}
            <Section title="Theme Deep-Dives" tone="navy">
              <div className="space-y-5">
                {current.theme_deep_dives.map((dive, i) => {
                  const citedQuotes = dive.quote_ids.map(qid => current.quote_pool.find(q => q.id === qid)).filter((q): q is typeof current.quote_pool[number] => !!q);
                  return (
                    <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                      <p className="text-sm font-semibold text-gray-900 mb-1.5">{dive.theme}</p>
                      {editing && draft ? (
                        <textarea value={draft.theme_deep_dives[i]?.deep_dive ?? dive.deep_dive} rows={6}
                          onChange={e => updateDeepDive(i, e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
                      ) : (
                        <p className="text-sm text-gray-700 leading-relaxed mb-2 whitespace-pre-line">{stripCitationIds(dive.deep_dive)}</p>
                      )}
                      {!editing && (
                        <div className="mt-2 space-y-2">
                          <FindingReferenceChips indices={dive.additional_findings} label="Evidence" onJump={jumpToAppendixFinding} />
                          {citedQuotes.length > 0 && (
                            <div className="space-y-1">
                              {citedQuotes.map(q => (
                                <p key={q.id} className="text-xs italic text-gray-500 leading-relaxed">
                                  “{q.text}”{q.attribution ? <span className="not-italic text-gray-400"> — {q.attribution}</span> : null}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Additional Evidence-Led Insights — material wider-pool
                evidence with no home in an approved Core Theme. Explicitly
                subordinate to the Executive Report (a "the evidence also
                shows" addition, never a correction). Only rendered when the
                analyst actually produced any — an empty section never
                shows. Read-only, like the deep-dives' own findings.
                Defensive `?? []`: a stored (schema-free JSONB) report
                generated before this field existed has it undefined —
                never let that crash the page, degrade to empty. Only a
                stale saved draft could hit this; Regenerate always
                produces the current shape. */}
            {withInsight(current.additional_insights).length > 0 && (
              <Section title="Additional Evidence-Led Insights" tone="gold">
                <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                  Material evidence relevant to the Research Question that sits outside the approved Executive Report&apos;s Strategic Themes. These are evidence-led observations, not approved strategic conclusions.
                </p>
                <div className="space-y-4">
                  {withInsight(current.additional_insights).map((insight, i) => {
                    const citedQuotes = (insight.quote_ids ?? []).map(qid => current.quote_pool.find(q => q.id === qid)).filter((q): q is typeof current.quote_pool[number] => !!q);
                    return (
                      <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                        <p className="text-sm text-gray-700 leading-relaxed mb-2 whitespace-pre-line">{stripCitationIds(insight.insight)}</p>
                        <FindingReferenceChips indices={insight.based_on_findings ?? []} label="Evidence" onJump={jumpToAppendixFinding} />
                        {citedQuotes.length > 0 && (
                          <div className="space-y-1 mt-2">
                            {citedQuotes.map(q => (
                              <p key={q.id} className="text-xs italic text-gray-500 leading-relaxed">
                                “{q.text}”{q.attribution ? <span className="not-italic text-gray-400"> — {q.attribution}</span> : null}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Areas of Agreement/Difference, Evidence Gaps, Opportunities,
                Risks, Recommendations — verbatim copies of the approved
                Executive Report's own arrays, unabridged, never rewritten
                here. Read-only: editing these belongs to the Executive
                Report itself. */}
            {withFinding(current.areas_of_agreement).length > 0 && (
              <Section title="Areas of Agreement" tone="positive">
                <div className="space-y-3">
                  {withFinding(current.areas_of_agreement).map((a, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: REPORT_TONES.positive.wash, color: REPORT_TONES.positive.ink }}>✓</div>
                      <p className="text-sm text-gray-700 leading-relaxed">{a.finding}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {withFinding(current.areas_of_difference).length > 0 && (
              <Section title="Areas of Difference" tone="difference">
                <div className="space-y-4">
                  {withFinding(current.areas_of_difference).map((d, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: `1px solid ${REPORT_TONES.difference.line}`, background: REPORT_TONES.difference.wash }}>
                      <p className="text-sm font-medium text-gray-800 leading-relaxed mb-1.5">{d.finding}</p>
                      {d.explanation && <p className="text-xs text-gray-500 leading-relaxed">{d.explanation}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {nonBlankStrings(current.evidence_gaps).length > 0 && (
              <Section title="Evidence Gaps" tone="neutral">
                <ul className="space-y-2 list-disc list-inside">
                  {nonBlankStrings(current.evidence_gaps).map((g, i) => <li key={i} className="text-sm text-gray-700">{g}</li>)}
                </ul>
              </Section>
            )}

            {nonBlankStrings(current.opportunities).length > 0 && (
              <Section title="Opportunities" tone="positive">
                <div className="space-y-3">
                  {nonBlankStrings(current.opportunities).map((o, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: REPORT_TONES.positive.wash, color: REPORT_TONES.positive.ink }}>{i + 1}</div>
                      <p className="text-sm text-gray-700 leading-relaxed">{o}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {nonBlankStrings(current.risks).length > 0 && (
              <Section title="Risks" tone="concern">
                <div className="space-y-3">
                  {nonBlankStrings(current.risks).map((r, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: REPORT_TONES.concern.wash, color: REPORT_TONES.concern.ink }}>{i + 1}</div>
                      <p className="text-sm text-gray-700 leading-relaxed">{r}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {withAction(current.recommendations).length > 0 && (
              <Section title="Recommendations" tone="gold">
                <div className="space-y-4">
                  {withAction(current.recommendations).map((r, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                      <p className="text-sm font-semibold text-gray-900 mb-1">{r.action}</p>
                      {r.rationale && <p className="text-xs text-gray-500 leading-relaxed">{r.rationale}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Strategic Conclusion — the report's closing synthesis,
                drawing the deep-dives and additional insights together into
                a deepened answer to the Research Question. The mirror of
                the Executive Summary that opened the report. Editable, like
                the Executive Summary and deep-dives (this report's own
                authored prose, not a copy of the Executive Report).
                Conditional so a stored report generated before this field
                existed (undefined) shows nothing rather than an empty navy
                box — same defensive stance as the section above. */}
            {(editing ? draft?.strategic_conclusion !== undefined : !!current.strategic_conclusion) && (
              <div className="rounded-2xl p-6" style={{ background: NAVY }}>
                <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>Strategic Conclusion</p>
                {editing && draft ? (
                  <textarea value={draft.strategic_conclusion ?? ""} rows={6}
                    onChange={e => setDraft({ ...draft, strategic_conclusion: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-base text-white placeholder-white/40 focus:outline-none focus:border-[#D7B87A]" />
                ) : (
                  <p className="text-base text-white/90 leading-relaxed whitespace-pre-line">{stripCitationIds(current.strategic_conclusion)}</p>
                )}
              </div>
            )}

            {/* Methodology & Provenance — moved here, immediately after the
                Strategic Conclusion, so it no longer interrupts the
                analytical narrative. Now a project-specific narrative of the
                research approach (generated as one field of the existing
                Phase-2 synthesis call), NOT the source inventory — that
                inventory moved into Sources & Citations below. The narrative
                is editable through the normal Edit workflow (like the
                Executive Summary and Strategic Conclusion); the source
                metadata beneath it is NOT editable here. In read mode it is
                hidden entirely when absent, so a report generated before this
                field existed (narrative null) shows nothing; in Edit mode the
                field always shows so a reviewer can add or correct it. */}
            {(editing && draft ? true : !!current.methodology.narrative) && (
              <Section title="Methodology & Provenance" tone="neutral">
                {editing && draft ? (
                  <textarea value={draft.methodology.narrative ?? ""} rows={4}
                    onChange={e => setDraft({ ...draft, methodology: { ...draft.methodology, narrative: e.target.value } })}
                    placeholder="Methodology & provenance narrative"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-[#D7B87A]" />
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{stripCitationIds(current.methodology.narrative!)}</p>
                )}
              </Section>
            )}

            {/* Sources & Citations — the factual source inventory (now the
                single home for source metadata) plus the existing links to
                each source's own Intelligence page. Each included source
                joins its methodology metadata (sample/mention size, markets,
                publishers, date range, or a document descriptor) by
                evidence_id — the same data the old Methodology block showed,
                rendered here once, with no duplication. */}
            <Section title="Sources & Citations" tone="neutral">
              <div className="space-y-2">
                {current.sources_included.map(s => {
                  const href = s.evidence_type === "survey" ? `/research-projects/${id}/reports/survey/${s.evidence_id}`
                    : s.evidence_type === "social_search" ? `/research-projects/${id}/reports/conversation/${s.evidence_id}`
                    : `/research-projects/${id}/reports/document/${s.evidence_id}`;
                  const meta = current.methodology.sources.find(m => m.evidence_id === s.evidence_id);
                  const metaLine = meta
                    ? (meta.description ? meta.description : [
                        meta.sample_size !== null ? `${meta.sample_size} ${meta.evidence_type === "survey" ? "responses" : "mentions"}` : null,
                        meta.publishers.length ? meta.publishers.join(", ") : null,
                        meta.countries.length ? meta.countries.join(", ") : null,
                        meta.date_range ? `${meta.date_range.from} – ${meta.date_range.to}` : null,
                      ].filter(Boolean).join(" · "))
                    : "";
                  return (
                    <div key={s.evidence_id}>
                      <Link href={href} className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900">
                        <span style={{ color: REPORT_TONES.positive.ink }}>✓</span> {s.label}
                      </Link>
                      {metaLine && <p className="text-[11px] text-gray-400 ml-4 mt-0.5">{metaLine}</p>}
                    </div>
                  );
                })}
                {current.sources_excluded.map(s => (
                  <div key={s.evidence_id} className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="text-gray-300">✕</span> {s.label}, <span className="text-gray-400">{s.reason}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Evidence Appendix — visually separated, collapsed by
                default. The complete Key Findings pool, grouped by
                source. Never part of the reading flow above it. */}
            <details ref={appendixRef} className="bg-white rounded-2xl overflow-hidden" style={{ border: `1px solid ${REPORT_TONES.neutral.line}` }}>
              <summary className="cursor-pointer select-none px-6 py-4 flex items-center gap-2.5">
                <span className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: REPORT_TONES.neutral.ink }} />
                <h2 className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: REPORT_TONES.neutral.ink }}>
                  Appendix — Complete Evidence Pool ({current.evidence_appendix.length})
                </h2>
              </summary>
              <div className="px-6 pb-6">
                <div className="space-y-3">
                  {current.evidence_appendix.map((f, i) => (
                    <div key={i} id={appendixElementId(i)} className="flex items-start gap-3 rounded-lg transition-all">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5" style={{ background: GOLD, color: NAVY }}>{i + 1}</div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700 leading-relaxed">{f.text}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{f.source_label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </details>

            <div className="text-center pt-6 pb-4 text-xs text-gray-300 tracking-wide print:block">
              FANOMETRIX · Football Fan Intelligence Platform · fanometrix.com
            </div>
          </div>
        )}
      </div>

      {/* Regenerate confirmation (overwriting an existing non-draft report) */}
      {confirmRegen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Regenerate report?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This project already has a {row?.status} Full Research Report. Regenerating replaces it with a new AI draft and resets its status to Draft, any edits or approval will be lost.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmRegen(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl">
                Cancel
              </button>
              <button onClick={() => { setConfirmRegen(false); generate(true); }}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl" style={{ background: NAVY, color: GOLD }}>
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
