"use client";

// Editorial Article's own page — sibling of ../executive/page.tsx, same
// reasons for a dedicated route (print stylesheet for PDF, the primary
// deliverable rather than an in-context lookup). Deliberately a lighter
// edit experience than the Executive Report: v1 supports editing every
// text field (headline, standfirst, key takeaways, introduction, each
// section's subheading/body, conclusion), adding/removing whole sections,
// but not reordering or swapping a section's chart — the smallest useful
// editor first, widen it only if that proves insufficient in practice.
//
// A manually-added section (based_on: [], never AI-authored) is tagged
// "Manual" here and, critically, survives Regenerate — see
// analyseEditorialArticle()'s own comment for why: it is carried forward
// unchanged rather than discarded, so writing one down is safe, not a
// one-shot edit regeneration will silently erase. An AI-written section
// (based_on populated) has no such protection and is fully replaced by
// regeneration, same as every other AI-authored field always has been.
//
// Chrome (back link, status, Edit/Approve/Publish/Regenerate) is kept
// visually separate from the article itself — a border and generous
// whitespace below it, then either the edit form or the read-only
// EditorialArticleView, never a card wrapping the article. That view
// component is intentionally standalone (no knowledge of edit/review
// state) so it can be reused unchanged by a future public-facing route.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { setWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import { Section, ListField, StatusBadge } from "@/app/components/intelligence/ReviewFields";
import { ReportActionRow } from "@/app/components/intelligence/ReportActionRow";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import { ArticleChart } from "@/app/components/intelligence/ArticleChart";
import { EditorialArticleView } from "@/app/components/intelligence/EditorialArticleView";
import { ReportImageAsset } from "@/app/components/intelligence/ReportImageAsset";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { NAVY, GOLD } from "@/lib/intelligence/theme";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { EditorialArticle, EditorialSection } from "@/lib/intelligence/analysts/analyseEditorialArticle";
import type { ExecutiveReport } from "@/lib/intelligence/analysts/analyseExecutiveReport";
import { flagArticleReviewConcerns, REVIEW_FLAG_CATEGORY_LABEL } from "@/lib/intelligence/editorial-article-review";
import { PAPER, PAPER_LINE, REPORT_TONES } from "@/lib/intelligence/theme";

type ProjectForArticle = {
  project_name: string;
  research_mode: "real" | "simulated";
  report_status: "draft" | "edited" | "approved" | "published" | null;
  full_research_report_status: "draft" | "edited" | "approved" | "published" | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB");
}

export default function EditorialArticlePage() {
  const params = useParams();
  const id = params.id as string;
  const pathname = usePathname();
  // Report links stay inside whichever tree opened them — the real workspace
  // (/research-projects/[id]) or Product Walkthrough (/product-walkthrough/[id]).
  // API calls below still address the shared /api/research-projects/[id] routes.
  const projectBase = pathname?.startsWith("/product-walkthrough") ? `/product-walkthrough/${id}` : `/research-projects/${id}`;
  const backHref = `${projectBase}#reports`;

  const [project, setProject] = useState<ProjectForArticle | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research-projects/${id}`).then(r => r.json()).then(json => {
      if (!cancelled) { setProject(json.data); setLoadingProject(false); }
    });
    return () => { cancelled = true; };
  }, [id]);

  const adapter: IntelligenceReviewAdapter<EditorialArticle> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(`/api/research-projects/${id}/articles`);
      const json = await res.json();
      return json.data ?? null;
    },
    generate: async confirm => {
      const res  = await fetch(`/api/research-projects/${id}/articles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: true };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate the Editorial Article." };
      return { ok: true, data: json.data };
    },
    saveEdit: async editedContent => {
      const res  = await fetch(`/api/research-projects/${id}/articles/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: json.data };
    },
    approve: async () => {
      const res  = await fetch(`/api/research-projects/${id}/articles/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: json.data };
    },
    publish: async () => {
      const res  = await fetch(`/api/research-projects/${id}/articles/publish`, { method: "POST" });
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
  } = useIntelligenceReview<EditorialArticle>(adapter, [id]);

  const executiveApproved = project?.report_status === "approved" || project?.report_status === "published";
  const fullResearchApproved = project?.full_research_report_status === "approved" || project?.full_research_report_status === "published";
  // The article is downstream of BOTH reports — it can only be generated
  // once each has been approved (see analyseEditorialArticle's own dual
  // gate). Eligibility and auto-generation both require both.
  const upstreamReady = executiveApproved && fullResearchApproved;

  // Same "fire generation on arrival instead of making the user click
  // again" pattern as ../key-findings/page.tsx — the click that got the
  // user here (Generate/View Article on the Workspace's Reports card)
  // already expressed intent, a second click on this page would just be
  // friction. Only fires once eligibility is known (both upstream reports
  // approved) and there's nothing here yet. A ref (not state), read and
  // written only inside the effect, never during render — same as Key
  // Findings' own page, and required by this project's lint rules, which
  // forbid reading ref.current in the render body.
  const autoFired = useRef(false);
  const autoGenerate = upstreamReady && !row;
  useEffect(() => {
    if (!autoGenerate || loading || loadingProject || autoFired.current) return;
    autoFired.current = true;
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, loading, loadingProject]);

  const showGenerating = generating || (autoGenerate && !loading && !loadingProject);

  // Dual-upstream staleness: the article snapshots both approved reports'
  // generated_at at build time. If EITHER upstream has since been
  // regenerated or re-approved (its current approved generated_at no longer
  // matches the snapshot), the article may no longer reflect the latest
  // approved intelligence — surface a "regenerate" prompt, the same signal
  // the Full Research Report shows against the Executive Report, here
  // extended to both. Snapshots missing on articles built before these
  // fields existed are treated as unknown, never as stale.
  const [erGeneratedAt, setErGeneratedAt] = useState<string | null>(null);
  const [frrGeneratedAt, setFrrGeneratedAt] = useState<string | null>(null);
  const [erContent, setErContent] = useState<ExecutiveReport | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/research-projects/${id}/reports/executive`).then(r => r.json()),
      fetch(`/api/research-projects/${id}/reports/full-research-report`).then(r => r.json()),
    ]).then(([erJson, frrJson]) => {
      if (cancelled) return;
      const er = erJson.data ? (erJson.data.edited_content ?? erJson.data.content) : null;
      const frr = frrJson.data ? (frrJson.data.edited_content ?? frrJson.data.content) : null;
      setErGeneratedAt(er?.generated_at ?? null);
      setFrrGeneratedAt(frr?.generated_at ?? null);
      setErContent(er);
    });
    return () => { cancelled = true; };
  }, [id, row?.id]);
  const executiveReportStale = !!current?.executive_report_generated_at && !!erGeneratedAt
    && current.executive_report_generated_at !== erGeneratedAt;
  const fullResearchReportStale = !!current?.full_research_report_generated_at && !!frrGeneratedAt
    && current.full_research_report_generated_at !== frrGeneratedAt;
  const articleStale = executiveReportStale || fullResearchReportStale;
  const staleUpstreamLabel = executiveReportStale && fullResearchReportStale
    ? "Executive Report and Full Research Report have"
    : executiveReportStale ? "Executive Report has" : "Full Research Report has";

  // Deterministic, advisory-only Review Prompts for the Article's own
  // independently-generated prose — the same shared detector engine the
  // Executive Report and Full Research Report reviews use (see
  // editorial-article-review.ts). The percentage "claim may exceed evidence"
  // check needs an evidence pool the Article doesn't itself carry, so we
  // build one from the approved Executive Report's own claims (fetched above
  // for staleness) plus the Article's own frozen chart values. Recomputes
  // from `current` — the edited Article — so a reviewer who hand-corrects a
  // flagged passage sees the prompt clear. Shown only while under review;
  // once approved, the reviewer has already made these calls.
  const evidencePool = useMemo(() => {
    const parts: string[] = [];
    if (erContent) {
      erContent.key_findings?.forEach(f => parts.push(f.finding));
      erContent.areas_of_difference?.forEach(d => parts.push(d.finding, d.explanation));
      parts.push(...(erContent.opportunities ?? []), ...(erContent.risks ?? []));
      erContent.recommendations?.forEach(r => parts.push(r.action, r.rationale));
    }
    current?.charts?.forEach(c => c.series.forEach(s => parts.push(`${s.value}%`, String(s.value))));
    return parts.filter(Boolean).join("  ");
  }, [erContent, current]);
  const reviewFlags = useMemo(() => (current ? flagArticleReviewConcerns(current, evidencePool) : []), [current, evidencePool]);
  const showReviewPrompts = !!row && (row.status === "draft" || row.status === "edited");

  const [exporting, setExporting] = useState(false);
  function handleExportPdf() {
    if (!current) return;
    setExporting(true);
    // Browsers suggest document.title as the "Save as PDF" filename — the
    // page's own static title ("Fanometrix") would otherwise save every
    // export as the same generic name. Set it to the article's actual
    // headline just for the print, then restore it once the print dialog
    // closes (afterprint fires whether the user saves, cancels or prints
    // to paper), so the tab title/history are never left showing this.
    const originalTitle = document.title;
    document.title = `Fanometrix - ${current.headline}`;
    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
    setExporting(false);
  }

  function updateSection(i: number, patch: Partial<Pick<EditorialSection, "subheading" | "body" | "image">>) {
    if (!draft) return;
    setDraft({ ...draft, sections: draft.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          {project?.research_mode === "simulated" && <div className="mb-4 print:hidden"><SimulatedBanner /></div>}

          <div className="flex items-start justify-between mb-6 print:hidden flex-wrap gap-3">
            <div>
              <Link href={backHref} scroll={false} onClick={() => setWorkspaceScrollTarget("reports")} className="text-xs text-gray-400 hover:text-gray-600">
                ← Back to Workspace
              </Link>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">Editorial Article</h1>
                {row && <StatusBadge status={row.status} />}
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
                <button onClick={handleExportPdf} disabled={exporting}
                  className="text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-50">
                  {exporting ? "Exporting…" : "Export PDF"}
                </button>
              )}
            />
          </div>

          {row && current && articleStale && !editing && (
            <div className="mb-4 rounded-xl px-4 py-3 print:hidden flex items-start gap-2.5" style={{ background: "#FEF3C7", border: "1px solid #FDE68A" }}>
              <span className="text-base leading-none mt-0.5">⚠</span>
              <p className="text-xs text-amber-800 leading-relaxed">
                The approved {staleUpstreamLabel} changed since this article was generated. Regenerate to rebuild it from the latest approved research.
              </p>
            </div>
          )}

          {/* Automated Review Prompts — advisory only, never a failure state
              and never a change to the article. Collapsible, hidden in
              print/PDF and every client-facing export, shown only while the
              article is under review (draft/edited). Recomputes from the
              current (edited) article, so a reviewer who hand-corrects a
              flagged passage and saves sees the prompt clear. */}
          {!showGenerating && row && current && showReviewPrompts && reviewFlags.length > 0 && (
            <details className="mb-6 rounded-2xl overflow-hidden print:hidden" style={{ background: PAPER, border: `1px solid ${PAPER_LINE}` }}>
              <summary className="cursor-pointer select-none px-5 py-4 flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5" style={{ color: REPORT_TONES.gold.ink }}>❖</span>
                <span className="min-w-0">
                  <span className="text-sm font-semibold" style={{ color: REPORT_TONES.gold.ink }}>
                    Review Prompts ({reviewFlags.length})
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">
                    Passages worth a second look before you approve — not errors, and not a failed check. The article has not been changed. This automated pass is deliberately cautious and will sometimes flag legitimate journalism; use it to inspect, edit what you judge necessary, and the prompt clears when you save.
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

          {(loading || loadingProject) && (
            <div className="p-10 text-center">
              <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {!loading && !loadingProject && !row && !showGenerating && (
            <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>Editorial Article</p>
              <h3 className="text-lg font-bold text-white mb-3">Tell the strongest story in this research</h3>
              <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed mb-6">
                A public-facing, data-journalism style article built from the approved Executive Report and Full Research Report — exact statistics and charts, real analytical depth, not an internal summary.
              </p>
              {error && <p className="text-sm text-red-300 mb-4">{error}</p>}
              <button
                onClick={() => generate(false)}
                disabled={!upstreamReady}
                title={!upstreamReady ? "Approve the Executive Report and Full Research Report first" : undefined}
                className="text-sm font-semibold px-6 py-3 rounded-xl disabled:opacity-40"
                style={{ background: GOLD, color: NAVY }}
              >
                Generate Editorial Article →
              </button>
              {!upstreamReady && (
                <p className="text-xs text-white/40 mt-3">
                  Approve this project&apos;s {!executiveApproved && !fullResearchApproved ? "Executive Report and Full Research Report" : !executiveApproved ? "Executive Report" : "Full Research Report"} first.
                </p>
              )}
            </div>
          )}

          {showGenerating && (
            <GeneratingProgress
              label="Finding the strongest story in this research…"
              sublabel="Reviewing the approved Executive Report and its underlying evidence to write a public-facing article"
              estimatedSeconds={25}
            />
          )}

          {error && row && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center mb-4">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* The article itself — visually separated from the chrome above
            by this divider, never inside the same card/column. */}
        {current && !showGenerating && (
          <div className="border-t border-gray-100 mt-6 pt-8 md:pt-10 print:border-none print:mt-0 print:pt-0">
            {editing && draft ? (
              <div className="max-w-2xl mx-auto space-y-5 print:hidden">
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Headline</label>
                  <input value={draft.headline} onChange={e => setDraft({ ...draft, headline: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-lg font-bold text-gray-900 mt-1 focus:outline-none focus:border-[#D7B87A]" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Standfirst</label>
                  <textarea value={draft.standfirst} rows={2} onChange={e => setDraft({ ...draft, standfirst: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-700 mt-1 focus:outline-none focus:border-[#D7B87A]" />
                </div>

                {/* Editorial presentation only — never read or written by
                    generation, see EditorialArticle.hero_image's own doc
                    comment. Attached here, by a human, or not at all. */}
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Hero Image (optional)</label>
                  <div className="mt-1">
                    <ReportImageAsset value={draft.hero_image ?? null} onChange={img => setDraft({ ...draft, hero_image: img })}
                      recommendedSize="Recommended: 1600×900px (16:9), min. 1200px wide" />
                  </div>
                </div>

                {/* key_takeaways/introduction/conclusion are each optional
                    now (see analyseEditorialArticle.ts) — a story that
                    doesn't genuinely benefit from one comes back null, and
                    that field simply doesn't render an editor, rather than
                    showing an empty or manufactured field. An article
                    whose model omitted one of these can't currently have
                    it added back in via editing — that's a deliberately
                    small v1 scope, not an oversight. */}
                {draft.key_takeaways !== null && (
                  <Section title="Key Takeaways" tone="gold">
                    <ListField items={draft.key_takeaways} addLabel="takeaway" onChange={items => setDraft({ ...draft, key_takeaways: items })} />
                  </Section>
                )}

                {draft.introduction !== null && (
                  <Section title="Introduction" tone="navy">
                    <textarea value={draft.introduction} rows={3} onChange={e => setDraft({ ...draft, introduction: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
                  </Section>
                )}

                {draft.sections.map((s, i) => {
                  const chart = current.charts.find(c => c.id === s.chart_id);
                  const isManual = s.based_on.length === 0;
                  return (
                    <Section key={i} title={(s.subheading || `Section ${i + 1}`) + (isManual ? " · Manual" : "")} tone="navy">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input value={s.subheading} onChange={e => updateSection(i, { subheading: e.target.value })}
                            placeholder="Subheading"
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:border-[#D7B87A]" />
                          <button type="button"
                            onClick={() => draft && setDraft({ ...draft, sections: draft.sections.filter((_, j) => j !== i) })}
                            className="text-xs font-semibold text-gray-400 hover:text-red-500 hover:underline flex-shrink-0">
                            Remove
                          </button>
                        </div>
                        <textarea value={s.body} rows={6} onChange={e => updateSection(i, { body: e.target.value })}
                          placeholder="Section body"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
                        <div>
                          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Section Image (optional)</label>
                          <div className="mt-1">
                            <ReportImageAsset value={s.image ?? null} onChange={img => updateSection(i, { image: img })}
                              recommendedSize="Recommended: 1200×800px, min. 1000px wide" />
                          </div>
                        </div>
                      </div>
                      {chart && <ArticleChart spec={chart} />}
                    </Section>
                  );
                })}

                {/* Manually added sections (based_on: []) survive
                    Regenerate — see analyseEditorialArticle()'s own
                    comment. AI-written sections don't, same as every
                    other AI-authored field. */}
                <button type="button"
                  onClick={() => draft && setDraft({
                    ...draft,
                    sections: [...draft.sections, { subheading: "", body: "", based_on: [], chart_id: null, image: null }],
                  })}
                  className="text-xs font-semibold text-[#0B1929] hover:underline">
                  + Add Section
                </button>

                {draft.conclusion !== null && (
                  <Section title="Conclusion" tone="neutral">
                    <textarea value={draft.conclusion} rows={3} onChange={e => setDraft({ ...draft, conclusion: e.target.value })}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
                  </Section>
                )}

                {/* Research Basis is never editable — same restrained note
                    style as the read view, just inline here too rather
                    than the old bordered card. */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Sources &amp; Methodology</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {current.research_basis.sources.map(s => s.label).join(", ")}
                    {current.research_basis.date_range && (
                      <> · {formatDate(current.research_basis.date_range.from)}–{formatDate(current.research_basis.date_range.to)}</>
                    )}
                    {" · "}{current.research_basis.methodology_note}
                  </p>
                </div>
              </div>
            ) : (
              <EditorialArticleView article={current} publishedAt={row?.published_at} />
            )}
          </div>
        )}
      </div>

      {/* Regenerate confirmation */}
      {confirmRegen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Regenerate article?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This project already has a {row?.status} article. Regenerating writes a fresh AI draft and resets its status to Draft — any sections you added manually are kept, but edits to AI-written text and its approval will be lost.
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
