"use client";

// Phase 4 of the Fanometrix V2 migration: the Executive Report — the first
// place a Research Project's findings from every Research Source are
// synthesised into one client-ready narrative that answers the project's
// Research Question. Gets its own route (not a modal like Survey/
// Conversation Intelligence) because a print stylesheet needs a clean
// standalone view, and because this is the primary deliverable, not an
// in-context lookup. Path leaves room for future report types
// (reports/benchmark, reports/client, etc.) alongside it.
import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { setWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import type { ExecutiveReport, ExecutiveReportFinding, ExecutiveReportRecommendation } from "@/lib/intelligence/analysts/analyseExecutiveReport";
import { computeReportReadiness, type ReadinessEvidenceItem } from "@/lib/report-readiness";
import {
  Section, ListField, TaggedFindingsField,
  AreasOfDifferenceField, TracedRecommendationsField, EvidenceTicks, FindingReferenceChips,
  StatusBadge,
} from "@/app/components/intelligence/ReviewFields";
import { exportExecutiveReportPptx } from "@/lib/export-report-pptx";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { ReportActionRow } from "@/app/components/intelligence/ReportActionRow";
import { ReportHero } from "@/app/components/intelligence/ReportHero";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";

const APPROVE_EXPLAINER = (
  <p><strong>Approve</strong> signs this report off as accurate and ready to share.</p>
);
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { NAVY, GOLD, PAPER, PAPER_LINE, REPORT_TONES } from "@/lib/intelligence/theme";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { flagThemeCoherence, flagConstructComparability } from "@/lib/intelligence/executive-report-review";

type ProjectForReport = {
  project_name: string;
  research_question: string | null;
  research_mode: "real" | "simulated";
  evidence: ReadinessEvidenceItem[];
};

function CorroborationTag({ corroboration }: { corroboration: ExecutiveReportFinding["corroboration"] }) {
  return corroboration === "cross_source" ? (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: REPORT_TONES.positive.wash, color: REPORT_TONES.positive.ink }}>Cross-source</span>
  ) : (
    <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Single-source</span>
  );
}

function findingElementId(i: number) {
  return `executive-report-finding-${i}`;
}

function jumpToFinding(i: number) {
  const el = document.getElementById(findingElementId(i));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-[#D7B87A]");
  setTimeout(() => el.classList.remove("ring-2", "ring-[#D7B87A]"), 1500);
}

export default function ExecutiveReportPage() {
  const params = useParams();
  const id = params.id as string;
  const pathname = usePathname();
  // Report links stay inside whichever tree opened them — the real workspace
  // (/research-projects/[id]) or Product Walkthrough (/product-walkthrough/[id]).
  // API calls below still address the shared /api/research-projects/[id] routes.
  const projectBase = pathname?.startsWith("/product-walkthrough") ? `/product-walkthrough/${id}` : `/research-projects/${id}`;
  const [project, setProject] = useState<ProjectForReport | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [showCoverageConfirm, setShowCoverageConfirm] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research-projects/${id}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) { setProject(json.data); setLoadingProject(false); } });
    return () => { cancelled = true; };
  }, [id]);

  const adapter: IntelligenceReviewAdapter<ExecutiveReport> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(`/api/research-projects/${id}/reports/executive`);
      const json = await res.json();
      return json.data ?? null;
    },
    generate: async confirm => {
      const res  = await fetch(`/api/research-projects/${id}/reports/executive`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: true };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate the Executive Report." };
      return { ok: true, data: json.data };
    },
    saveEdit: async editedContent => {
      const res  = await fetch(`/api/research-projects/${id}/reports/executive/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: json.data };
    },
    approve: async () => {
      const res  = await fetch(`/api/research-projects/${id}/reports/executive/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: json.data };
    },
    publish: async () => {
      const res  = await fetch(`/api/research-projects/${id}/reports/executive/publish`, { method: "POST" });
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
  } = useIntelligenceReview<ExecutiveReport>(adapter, [id]);

  const readiness = useMemo(
    () => project ? computeReportReadiness(project.evidence) : null,
    [project]
  );

  // The report snapshots the Research Question it was generated against
  // (research_question on its own content) — comparing it to the project's
  // current one flags "this no longer answers what's actually being asked"
  // without re-running anything. Missing on reports generated before this
  // field existed — treated as unknown, never as stale.
  const reportStale = !!current?.research_question && !!project?.research_question
    && current.research_question.trim() !== project.research_question.trim();

  // Theme-coherence Review Prompts — deterministic, computed at render from
  // the report in hand, never stored and never mutating content (see
  // lib/intelligence/executive-report-review.ts). Detection only: it
  // surfaces a theme whose name may be scoped more narrowly than its
  // findings so a human can rename, re-home or leave it. Shown only while
  // the report is under review (draft/edited); once approved, the reviewer
  // has already made these calls.
  const themeReviewFlags = useMemo(() => (current ? flagThemeCoherence(current) : []), [current]);
  const constructReviewFlags = useMemo(() => (current ? flagConstructComparability(current) : []), [current]);
  const totalReviewFlags = themeReviewFlags.length + constructReviewFlags.length;
  const showReviewPrompts = !!row && (row.status === "draft" || row.status === "edited");

  function handleGenerateClick() {
    if (readiness?.readiness === "partial") setShowCoverageConfirm(true);
    else generate(false);
  }

  async function handleExport(format: "pdf" | "pptx") {
    if (!current || !project) return;
    setExporting(format);
    if (format === "pdf") {
      // Browsers suggest document.title as the "Save as PDF" filename —
      // the page's own static title ("Fanometrix") would otherwise save
      // every export as the same generic name. Set it to this project's
      // report name just for the print, then restore it once the print
      // dialog closes (afterprint fires whether the user saves, cancels
      // or prints to paper), so the tab title/history are never left
      // showing this.
      const originalTitle = document.title;
      document.title = `Fanometrix - ${project.project_name} - Executive Report`;
      const restoreTitle = () => {
        document.title = originalTitle;
        window.removeEventListener("afterprint", restoreTitle);
      };
      window.addEventListener("afterprint", restoreTitle);
      window.print();
    } else {
      await exportExecutiveReportPptx(project.project_name, current);
    }
    setExporting(null);
  }

  // TracedRecommendationsField (shared with Survey Intelligence) knows
  // nothing about `targets` — it's Executive-only. Re-attach whatever
  // target the item already had by position, defaulting a newly-added row
  // to null (no target), rather than widen the shared field editor's own
  // type just for this one report's extra field.
  function updateRecommendations(items: { action: string; rationale: string; based_on_findings: number[] }[]) {
    if (!draft) return;
    const recommendations: ExecutiveReportRecommendation[] = items.map((it, i) => ({
      ...it,
      targets: draft.recommendations[i]?.targets ?? null,
    }));
    setDraft({ ...draft, recommendations });
  }

  // Only the theme's own authored narrative — its name and synthesis — is
  // editable. The reference index arrays (supporting_findings,
  // related_opportunities/risks/recommendations) are spread through
  // unchanged, so an edit never touches an evidence relationship, only the
  // human-readable text the Review Prompts point at.
  function updateTheme(i: number, patch: { theme?: string; synthesis?: string }) {
    if (!draft) return;
    setDraft({ ...draft, major_themes: draft.major_themes.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">

        {/* Permanent — no dismiss, no collapse, shows in print too via its own rule below. */}
        {project?.research_mode === "simulated" && (
          <div className="mb-4 print:hidden"><SimulatedBanner /></div>
        )}

        {/* Header (screen only) */}
        <div className="flex items-start justify-between mb-6 print:hidden flex-wrap gap-3">
          <div>
            <Link
              href={`${projectBase}#reports`}
              scroll={false}
              onClick={() => setWorkspaceScrollTarget("reports")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ← Back to Workspace
            </Link>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">Executive Report</h1>
              {row && <StatusBadge status={row.status} />}
              {row && <InfoTooltip text={APPROVE_EXPLAINER} />}
              {reportStale && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: REPORT_TONES.gold.wash, color: REPORT_TONES.gold.ink }}
                  title="The Research Question has changed since this was generated, Regenerate to answer the current question."
                >
                  ⚠ Question changed
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
            showPublish={false}
            onEdit={startEditing}
            onApprove={approveSummary}
            onRegenerate={handleGenerateClick}
            onCancel={cancelEditing}
            onSave={saveEdits}
            extraActions={current && (
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

        {/* State messages */}
        {(loading || loadingProject) && (
          <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm">
            <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {!loading && !loadingProject && !row && !generating && readiness && (
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>Executive Report</p>
            <h2 className="text-xl font-bold text-white mb-3">
              Synthesise every approved Research Source into one client-ready narrative
            </h2>
            <p className="text-sm text-white/60 max-w-md mx-auto leading-relaxed mb-5">
              Fanometrix combines this project&apos;s approved Intelligence, Survey and Conversation Search alike,
              into one Executive Report that directly answers the Research Question.
            </p>
            <p className="text-xs text-white/50 mb-6">
              Research Sources: {readiness.total} attached · Intelligence Approved: {readiness.approvedCount}/{readiness.total} · Report Readiness: {
                readiness.readiness === "ready" ? "Ready" : readiness.readiness === "partial" ? "Partial" : "Empty"
              }
            </p>
            <button
              onClick={handleGenerateClick}
              disabled={readiness.readiness === "empty"}
              title={readiness.readiness === "empty" ? "Approve at least one Research Source's Intelligence first" : undefined}
              className="text-sm font-semibold px-6 py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: GOLD, color: NAVY }}
            >
              Generate Executive Report →
            </button>
          </div>
        )}

        {generating && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <GeneratingProgress
              label="Synthesising every approved Research Source…"
              sublabel="Reviewing every approved source's intelligence to write the Executive Report"
              estimatedSeconds={25}
            />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Theme-coherence Review Prompts — a review aid, never a failure
            state. Collapsible, hidden in print, shown only while under
            review. Never changes the report; it draws the reviewer's eye
            to a theme whose name may be narrower than its findings so they
            can rename it, move a finding, or leave it if the grouping is
            deliberate. */}
        {!generating && row && current && showReviewPrompts && totalReviewFlags > 0 && (
          <details className="mb-6 rounded-2xl overflow-hidden print:hidden" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
            <summary className="cursor-pointer select-none px-5 py-4 flex items-start gap-2.5">
              <span className="text-base leading-none mt-0.5" style={{ color: REPORT_TONES.gold.ink }}>❖</span>
              <span className="min-w-0">
                <span className="text-sm font-semibold" style={{ color: REPORT_TONES.gold.ink }}>
                  Review Prompts ({totalReviewFlags})
                </span>
                <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                  Passages worth a look before you approve — not errors, and the report has not been changed. These are automated prompts for human judgement; decide what, if anything, to change.
                </span>
              </span>
            </summary>
            <div className="px-5 pb-5 space-y-3">
              {themeReviewFlags.map((f, i) => (
                <div key={`t${i}`} className="rounded-xl bg-white/70 p-3.5" style={{ border: `1px solid ${PAPER_LINE}` }}>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: REPORT_TONES.gold.wash, color: REPORT_TONES.gold.ink }}>
                      Possible theme-scope mismatch
                    </span>
                    <span className="text-[11px] text-gray-400">{f.theme}</span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed mb-2">{f.why}</p>
                  <div className="space-y-1">
                    {f.offending.map(o => (
                      <p key={o.findingNumber} className="text-xs text-gray-500 leading-relaxed">
                        <span className="font-semibold text-gray-600">Finding {o.findingNumber} ({o.market}):</span> {o.text}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
              {constructReviewFlags.map((f, i) => (
                <div key={`c${i}`} className="rounded-xl bg-white/70 p-3.5" style={{ border: `1px solid ${PAPER_LINE}` }}>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: REPORT_TONES.gold.wash, color: REPORT_TONES.gold.ink }}>
                      Possible construct mismatch
                    </span>
                    <span className="text-[11px] text-gray-400">Area of Difference</span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed mb-1.5 italic">“{f.difference}”</p>
                  <p className="text-xs text-gray-600 leading-relaxed mb-2">{f.why}</p>
                  <div className="space-y-1">
                    {f.findings.map(o => (
                      <p key={o.findingNumber} className="text-xs text-gray-500 leading-relaxed">
                        <span className="font-semibold text-gray-600">Finding {o.findingNumber} ({o.construct}):</span> {o.text}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {!generating && row && current && (
          <div className="space-y-6 print:space-y-4">

            {/* Masthead — the print/PDF path's only header, so the notice
                lives here too, not just in the screen-only header above. */}
            <div className="hidden print:block mb-6">
              {current.synthetic_notice && (
                <div className="mb-3 px-3 py-2 rounded" style={{ background: NAVY, color: GOLD }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest">Simulated Research, Synthetic Data Only</p>
                  <p className="text-xs mt-0.5">{current.synthetic_notice}</p>
                </div>
              )}
              <p className="text-xs font-bold tracking-widest uppercase" style={{ color: GOLD }}>Fanometrix, Executive Report</p>
              <h1 className="text-3xl font-bold mt-1" style={{ color: NAVY }}>{current.headline}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{project?.project_name}</p>
            </div>

            {/* On-screen cover — the print masthead's headline was never
                shown to an on-screen viewer at all before this: the page
                opened straight into a section list with no arrival moment,
                which read as "another intermediate page" rather than the
                destination the whole research journey builds toward.
                Mirrors the print masthead's content (same headline, same
                notice) with on-screen weight instead of a printed one. */}
            <ReportHero
              variant="gradient"
              editing={editing}
              kicker="Fanometrix, Executive Report"
              headline={current.headline}
              subtitle={`${project?.project_name} · ${new Date(row.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
              syntheticNotice={current.synthetic_notice}
            />

            {/* On-screen equivalent of the print notice's detail sentence — the
                pill above already carries the headline label; this keeps the
                full explanatory sentence available without repeating the label. */}
            {current.synthetic_notice && (
              <div className="print:hidden px-4 py-3 rounded-xl text-center" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
                <p className="text-sm" style={{ color: REPORT_TONES.gold.ink }}>{current.synthetic_notice}</p>
              </div>
            )}

            {/* Research Question + Research Answer band */}
            <div className="rounded-2xl p-6" style={{ background: NAVY }}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: GOLD }}>Research Question</p>
              <p className="text-base text-white/90 mb-4">{project?.research_question}</p>
              <div className="border-t border-white/10 pt-4">
                <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: GOLD }}>Research Answer</p>
                {editing && draft ? (
                  <textarea value={draft.research_answer} rows={2}
                    onChange={e => setDraft({ ...draft, research_answer: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-lg font-bold text-white placeholder-white/40 focus:outline-none focus:border-[#D7B87A]" />
                ) : (
                  <p className="text-xl font-bold text-white leading-snug">{current.research_answer}</p>
                )}
              </div>
            </div>

            {/* Executive Summary */}
            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Executive Summary</p>
                <p className="text-[11px] text-gray-400">
                  {new Date(row.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              {editing && draft ? (
                <textarea value={draft.executive_summary} rows={4}
                  onChange={e => setDraft({ ...draft, executive_summary: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
              ) : (
                <p className="text-base text-gray-800 leading-relaxed">{current.executive_summary}</p>
              )}
            </div>

            {/* Strategic Themes — the depth layer beneath the concise Research
                Answer/Executive Summary above. In Edit mode, the theme NAME
                and SYNTHESIS prose are editable (the human-authored
                narrative the Review Prompts point at); the reference index
                arrays (supporting findings, related opportunities/risks/
                recommendations) stay read-only and carry through the edit
                untouched, so an edit never changes an evidence relationship.
                Every claim traces to a Key Finding below via the same
                reference-jump mechanism Recommendations already uses. */}
            {(editing && draft ? draft.major_themes : current.major_themes).length > 0 && (
              <Section title="Strategic Themes" tone="navy">
                <div className="space-y-5">
                  {(editing && draft ? draft.major_themes : current.major_themes).map((raw, i) => {
                    // Defensive against a stored (schema-free JSONB) report
                    // predating this section's shape (e.g. the pre-Strategic-
                    // Themes {theme, summary} version) — never let a missing
                    // field crash this page, degrade to empty instead. Only
                    // a stale saved draft could hit this; Regenerate always
                    // produces the current shape.
                    const t = {
                      theme: raw.theme,
                      synthesis: raw.synthesis ?? "",
                      supporting_findings: raw.supporting_findings ?? [],
                      related_opportunities: raw.related_opportunities ?? [],
                      related_risks: raw.related_risks ?? [],
                      related_recommendations: raw.related_recommendations ?? [],
                    };
                    // Related opportunity/risk/recommendation lines are
                    // read-only cross-references; source them from whichever
                    // copy is live so they stay consistent while those
                    // sections are themselves being edited below.
                    const refSrc = editing && draft ? draft : current;
                    return (
                    <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                      {editing && draft ? (
                        <>
                          <input value={t.theme}
                            onChange={e => updateTheme(i, { theme: e.target.value })}
                            placeholder="Theme name"
                            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-900 mb-2 focus:outline-none focus:border-[#D7B87A]" />
                          <textarea value={t.synthesis} rows={4}
                            onChange={e => updateTheme(i, { synthesis: e.target.value })}
                            placeholder="Theme synthesis"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 mb-2 focus:outline-none focus:border-[#D7B87A]" />
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-gray-900 mb-1.5">{t.theme}</p>
                          <p className="text-sm text-gray-700 leading-relaxed mb-2">{t.synthesis}</p>
                        </>
                      )}
                      <FindingReferenceChips indices={t.supporting_findings} label="Finding" onJump={jumpToFinding} />
                      {(t.related_opportunities.length > 0 || t.related_risks.length > 0 || t.related_recommendations.length > 0) && (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-1.5">
                          {t.related_opportunities.map(idx => refSrc.opportunities[idx] && (
                            <p key={`o${idx}`} className="text-xs text-gray-600"><span className="font-semibold" style={{ color: REPORT_TONES.positive.ink }}>Opportunity —</span> {refSrc.opportunities[idx]}</p>
                          ))}
                          {t.related_risks.map(idx => refSrc.risks[idx] && (
                            <p key={`r${idx}`} className="text-xs text-gray-600"><span className="font-semibold" style={{ color: REPORT_TONES.concern.ink }}>Risk —</span> {refSrc.risks[idx]}</p>
                          ))}
                          {t.related_recommendations.map(idx => refSrc.recommendations[idx] && (
                            <p key={`rec${idx}`} className="text-xs text-gray-600"><span className="font-semibold" style={{ color: GOLD }}>Recommendation —</span> {refSrc.recommendations[idx].action}</p>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Key Findings */}
            <Section title="Key Findings" tone="navy">
              {editing && draft ? (
                <TaggedFindingsField
                  items={draft.key_findings.map(f => ({ finding: f.finding, supporting_sources: f.supporting_sources }))}
                  tagKey="supporting_sources"
                  tagPlaceholder="survey, conversation_search"
                  addLabel="finding"
                  onChange={items => setDraft({
                    ...draft,
                    key_findings: items.map(it => ({
                      finding: it.finding,
                      supporting_sources: it.supporting_sources.filter((s): s is "survey" | "conversation_search" | "document" => s === "survey" || s === "conversation_search" || s === "document"),
                      corroboration: it.supporting_sources.length >= 2 ? "cross_source" : "single_source",
                    })),
                  })}
                />
              ) : (
                <div className="space-y-4">
                  {current.key_findings.map((f, i) => (
                    <div key={i} id={findingElementId(i)} className="flex items-start gap-3 rounded-lg transition-all">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                        style={{ background: GOLD, color: NAVY }}>
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-700 leading-relaxed mb-1.5">{f.finding}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <EvidenceTicks sources={f.supporting_sources} />
                          <CorroborationTag corroboration={f.corroboration} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Areas of Agreement */}
            <Section title="Areas of Agreement" tone="positive">
              {editing && draft ? (
                <ListField
                  items={draft.areas_of_agreement.map(a => a.finding)}
                  addLabel="area of agreement"
                  onChange={items => setDraft({
                    ...draft,
                    // ListField knows nothing about `supporting_findings` (a
                    // plain string[] editor shared with opportunities/risks)
                    // — re-attach it by position rather than widen the
                    // shared editor's type for this one field, same
                    // convention as `resolved`/`targets` below.
                    areas_of_agreement: items.map((finding, i) => ({ finding, supporting_findings: draft.areas_of_agreement[i]?.supporting_findings ?? [] })),
                  })}
                />
              ) : current.areas_of_agreement.length ? (
                <div className="space-y-3">
                  {current.areas_of_agreement.map((a, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: REPORT_TONES.positive.wash, color: REPORT_TONES.positive.ink }}>✓</div>
                      <p className="text-sm text-gray-700 leading-relaxed">{a.finding}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No cross-source agreement identified.</p>
              )}
            </Section>

            {/* Areas of Difference */}
            <Section title="Areas of Difference" tone="difference">
              {editing && draft ? (
                <AreasOfDifferenceField
                  items={draft.areas_of_difference}
                  onChange={items => setDraft({
                    ...draft,
                    // AreasOfDifferenceField knows nothing about `resolved`
                    // or `supporting_findings` (a plain {finding, explanation}
                    // editor shared with no other report). Re-attach both by
                    // position rather than widen the shared editor's type
                    // for this one field.
                    areas_of_difference: items.map((it, i) => ({
                      ...it,
                      resolved: draft.areas_of_difference[i]?.resolved ?? false,
                      supporting_findings: draft.areas_of_difference[i]?.supporting_findings ?? [],
                    })),
                  })}
                />
              ) : current.areas_of_difference.length ? (
                <div className="space-y-4">
                  {current.areas_of_difference.map((d, i) => (
                    <div key={i} className="rounded-xl p-4" style={{ border: `1px solid ${REPORT_TONES.difference.line}`, background: REPORT_TONES.difference.wash }}>
                      <p className="text-sm font-medium text-gray-800 leading-relaxed mb-1.5">{d.finding}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{d.explanation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No cross-source differences identified.</p>
              )}
            </Section>

            {/* Opportunities */}
            <Section title="Opportunities" tone="positive">
              {editing && draft ? (
                <ListField items={draft.opportunities} addLabel="opportunity" onChange={items => setDraft({ ...draft, opportunities: items })} />
              ) : (
                <div className="space-y-3">
                  {current.opportunities.map((o, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: REPORT_TONES.positive.wash, color: REPORT_TONES.positive.ink }}>
                        {i + 1}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{o}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Risks */}
            <Section title="Risks" tone="concern">
              {editing && draft ? (
                <ListField items={draft.risks} addLabel="risk" onChange={items => setDraft({ ...draft, risks: items })} />
              ) : (
                <div className="space-y-3">
                  {current.risks.map((r, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: REPORT_TONES.concern.wash, color: REPORT_TONES.concern.ink }}>
                        {i + 1}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{r}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Recommendations */}
            <Section title="Recommendations" tone="gold">
              {editing && draft ? (
                <TracedRecommendationsField
                  items={draft.recommendations}
                  findingsCount={draft.key_findings.length}
                  onChange={updateRecommendations}
                />
              ) : (
                <div className="space-y-4">
                  {current.recommendations.map((r, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                          style={{ background: GOLD, color: NAVY }}>
                          {i + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 mb-1">{r.action}</p>
                          <p className="text-xs text-gray-500 leading-relaxed mb-2">{r.rationale}</p>
                          {/* "Executive Finding" not the bare "Finding" default — this
                              indexes the Executive Report's own synthesised key_findings,
                              a fresh list distinct from any single source's own numbered
                              Key Findings, which happens to use identical unqualified
                              numbering ("Finding 5") for a completely different item. */}
                          <FindingReferenceChips indices={r.based_on_findings} label="Executive Finding" onJump={jumpToFinding} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Evidence & Coverage (closing) — three independent measures,
                deliberately never blended into one badge or sentence. A
                report can have full source coverage and mixed methods while
                having zero finding-level corroboration; showing these
                separately is the whole point, see analyseExecutiveReport.ts's
                EvidenceStrength type comment for the full rationale. */}
            <Section title="Evidence & Coverage" tone="neutral">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg p-3" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
                    <p className="text-gray-400 uppercase tracking-wide mb-1">Evidence Coverage</p>
                    <p className="font-medium text-gray-700">
                      {current.evidence_strength.sources_included.length} of {current.evidence_strength.sources_included.length + current.evidence_strength.sources_excluded.length} approved sources included
                    </p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
                    <p className="text-gray-400 uppercase tracking-wide mb-1">Method Diversity</p>
                    <p className="font-medium text-gray-700">{current.evidence_strength.method_diversity === "mixed_method" ? "Mixed methods" : "Single method"}</p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
                    <p className="text-gray-400 uppercase tracking-wide mb-1">Cross-source Corroboration</p>
                    <p className="font-medium text-gray-700">{current.evidence_strength.corroborated_findings} of {current.evidence_strength.total_findings} findings supported by more than one source</p>
                  </div>
                </div>
                {current.evidence_strength.sources_included.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Sources Included</p>
                    <div className="space-y-1.5">
                      {current.evidence_strength.sources_included.map(s => (
                        <div key={s.evidence_id} className="flex items-center gap-2 text-xs text-gray-600">
                          <span style={{ color: REPORT_TONES.positive.ink }}>✓</span> {s.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {current.evidence_strength.sources_excluded.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Sources Excluded</p>
                    <div className="space-y-1.5">
                      {current.evidence_strength.sources_excluded.map(s => (
                        <div key={s.evidence_id} className="flex items-center gap-2 text-xs text-gray-500">
                          <span className="text-gray-300">✕</span> {s.label}, <span className="text-gray-400">{s.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* Closing — one composed sign-off rather than two trailing gray
                lines. Restates the Research Answer as a bookend to the
                opening band, so the report reads as arriving somewhere,
                not just stopping. */}
            {!editing && (
              <div className="pt-2">
                <div className="border-t border-gray-100 pt-6 text-center">
                  <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-2">In short</p>
                  <p className="text-base font-semibold text-gray-800 max-w-xl mx-auto leading-relaxed" style={{ textWrap: "balance" }}>
                    {current.research_answer}
                  </p>
                </div>
                {(row.reviewed_by || row.published_at) && (
                  <p className="text-xs text-gray-400 text-center mt-4">
                    {row.reviewed_by && row.reviewed_at && (
                      <span>Approved by {row.reviewed_by} on {new Date(row.reviewed_at).toLocaleDateString("en-GB")}</span>
                    )}
                    {row.reviewed_by && row.published_at && <span> · </span>}
                    {row.published_at && <span>Published {new Date(row.published_at).toLocaleDateString("en-GB")}</span>}
                  </p>
                )}
                <div className="text-center pt-6 pb-4 text-xs text-gray-300 tracking-wide print:block">
                  FANOMETRIX · Football Fan Intelligence Platform · fanometrix.com
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Coverage confirmation — shown before generating when some attached
          sources aren't approved yet, per the user's explicit "prominent
          warning" requirement rather than a silent gap. */}
      {showCoverageConfirm && readiness && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Generate with partial evidence?</h2>
            <p className="text-sm text-gray-500 mb-4">
              This Report will be generated using {readiness.approvedCount} of {readiness.total} attached Research Sources.
            </p>
            <div className="space-y-1.5 mb-4">
              {readiness.included.map(s => (
                <div key={s.evidence_id} className="flex items-center gap-2 text-xs text-gray-600">
                  <span style={{ color: REPORT_TONES.positive.ink }}>✓</span> {s.label}, included
                </div>
              ))}
              {readiness.excluded.map(s => (
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
              <button onClick={() => { setShowCoverageConfirm(false); generate(false); }}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl" style={{ background: NAVY, color: GOLD }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Regenerate confirmation (overwriting an existing non-draft report) */}
      {confirmRegen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Regenerate report?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This project already has a {row?.status} Executive Report. Regenerating replaces it with a new AI draft and resets its status to Draft, any edits or approval will be lost.
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
