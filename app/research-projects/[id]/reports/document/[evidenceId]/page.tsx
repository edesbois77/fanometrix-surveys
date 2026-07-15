"use client";

// Document Intelligence's own page — sibling of ../survey/[evidenceId]/
// and ../conversation/[evidenceId]/page.tsx, same reasons (a "Back to
// Workspace" destination rather than a pop-up). One deliberate difference
// from those two: `evidenceId` here is the research_project_evidence row's
// own id, not the document's own id (library_documents.id) — Document
// Intelligence's research_summaries.source_id is that evidence row's id
// (migration 102), since the same document attached to two projects gets
// two independent summaries. See analyseDocumentForProject.ts's header
// comment for the full reasoning.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { setWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import type { DocumentIntelligenceReport } from "@/lib/intelligence/analysts/analyseDocumentForProject";
import {
  Section, ListField, TracedRecommendationsField, FindingReferenceChips, StatusBadge,
  ProvenanceBadges, EvidenceStrengthBadge,
} from "@/app/components/intelligence/ReviewFields";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import { NAVY, GOLD } from "@/lib/intelligence/theme";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ReportActionRow } from "@/app/components/intelligence/ReportActionRow";
import { ReportHero } from "@/app/components/intelligence/ReportHero";

const APPROVE_PUBLISH_EXPLAINER = (
  <>
    <p>Draft → Approved → Published.</p>
    <p><strong>Approve</strong> signs this report off as accurate and ready, approved reports are what the project&apos;s Executive Report actually draws from.</p>
    <p><strong>Publish</strong> is one further, formal sign-off recorded after approval, for your own audit trail; it doesn&apos;t currently unlock anything Approved doesn&apos;t already provide.</p>
  </>
);

type EvidenceRow = {
  id: string;
  evidence_id: string;
  evidence_type: string;
  document: {
    id: string; name: string; document_type: string;
    library_status: string;
    page_count: number | null;
    summary_status: "draft" | "edited" | "approved" | "published" | null;
  } | null;
};

type ProjectForPage = {
  project_name: string;
  topic: string | null;
  research_mode: "real" | "simulated";
  evidence: EvidenceRow[];
};

export default function DocumentIntelligencePage() {
  const params = useParams();
  const id = params.id as string;
  const evidenceId = params.evidenceId as string;

  const [project, setProject] = useState<ProjectForPage | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/research-projects/${id}`)
      .then(r => r.json())
      .then(json => { if (!cancelled) { setProject(json.data); setLoadingProject(false); } });
    return () => { cancelled = true; };
  }, [id]);

  // Keyed by the evidence ROW's own id (params.evidenceId), never
  // evidence_id — see this file's header comment.
  const item = project?.evidence.find(e => e.evidence_type === "document" && e.id === evidenceId) ?? null;
  const backHref = `/research-projects/${id}#intelligence`;

  if (loadingProject) {
    return (
      <AdminShell>
        <div className="p-6 flex items-center justify-center h-64">
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
      </AdminShell>
    );
  }

  if (!project || !item?.document) {
    return (
      <AdminShell>
        <div className="p-6 max-w-4xl mx-auto text-center py-20">
          <p className="text-gray-400 mb-4">This document isn&apos;t attached to this project.</p>
          <Link href={backHref} scroll={false} onClick={() => setWorkspaceScrollTarget("intelligence")} className="text-[#D7B87A] hover:underline text-sm">← Back to Workspace</Link>
        </div>
      </AdminShell>
    );
  }

  return (
    <DocumentIntelligenceBody
      document={item.document}
      projectId={id}
      evidenceRowId={item.id}
      isSimulated={project.research_mode === "simulated"}
      autoGenerate={!item.document.summary_status}
      backHref={backHref}
    />
  );
}

function DocumentIntelligenceBody({ document: doc, projectId, evidenceRowId, isSimulated, autoGenerate, backHref }: {
  document: { id: string; name: string; document_type: string; library_status: string; page_count: number | null; summary_status: "draft" | "edited" | "approved" | "published" | null };
  projectId: string;
  evidenceRowId: string;
  isSimulated: boolean;
  autoGenerate: boolean;
  backHref: string;
}) {
  const base = `/api/research-projects/${projectId}/reports/document/${evidenceRowId}`;

  const adapter: IntelligenceReviewAdapter<DocumentIntelligenceReport> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(base);
      const json = await res.json();
      return json.data ?? null;
    },
    generate: async confirm => {
      const res  = await fetch(base, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: true };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate intelligence." };
      return { ok: true, data: json.data };
    },
    saveEdit: async editedContent => {
      const res  = await fetch(`${base}/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: json.data };
    },
    approve: async () => {
      const res  = await fetch(`${base}/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: json.data };
    },
    publish: async () => {
      const res  = await fetch(`${base}/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to publish." };
      return { ok: true, data: json.data };
    },
  }), [base]);

  const {
    row, draft, editing, loading, generating, saving, approving, publishing, error, confirmRegen,
    current, busy,
    setDraft, setConfirmRegen,
    generate, startEditing, cancelEditing, saveEdits, approveSummary, publishSummary,
  } = useIntelligenceReview<DocumentIntelligenceReport>(adapter, [evidenceRowId]);

  const notApproved = !row && !loading && doc.library_status !== "approved";

  const autoFired = useRef(false);
  useEffect(() => {
    if (!autoGenerate || loading || notApproved || row || autoFired.current) return;
    autoFired.current = true;
    generate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGenerate, loading, notApproved, row]);

  const showGenerating = generating || (autoGenerate && !loading && !notApproved && !row);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        {isSimulated && <div className="mb-4"><SimulatedBanner /></div>}

        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div className="min-w-0">
            <Link href={backHref} scroll={false} onClick={() => setWorkspaceScrollTarget("intelligence")} className="text-xs text-gray-400 hover:text-gray-600">← Back to Workspace</Link>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 truncate">{doc.name}, Intelligence</h1>
              {row && <StatusBadge status={row.status} />}
              {row && <InfoTooltip text={APPROVE_PUBLISH_EXPLAINER} />}
              {(row?.is_simulated || isSimulated) && <SimulatedBadge />}
            </div>
            <p className="text-sm text-gray-400 mt-0.5">AI-reviewed document intelligence report</p>
            {row && <p className="text-xs text-gray-400 mt-0.5">Last updated {formatRelativeTime(row.updated_at)}</p>}
          </div>

          <ReportActionRow
            editing={editing}
            hasRow={!!row}
            status={row?.status}
            busy={busy}
            saving={saving}
            approving={approving}
            publishing={publishing}
            generating={generating}
            showPublish
            showRegenerate={!notApproved}
            onEdit={startEditing}
            onApprove={approveSummary}
            onPublish={publishSummary}
            onRegenerate={() => generate(false)}
            onCancel={cancelEditing}
            onSave={saveEdits}
          />
        </div>

        {loading && (
          <div className="p-10 text-center">
            <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {notApproved && (
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
              Research Library
            </p>
            <h3 className="text-xl font-bold text-white mb-3">
              Waiting for Research Library approval
            </h3>
            <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed mb-6">
              This document&apos;s own analysis must be reviewed and approved in the Research Library before
              Fanometrix can interpret it against this project&apos;s Research Question.
            </p>
            <Link
              href={`/research-library/${doc.id}`}
              className="inline-block text-sm font-semibold px-5 py-2.5 rounded-xl"
              style={{ background: GOLD, color: NAVY }}
            >
              Open in Research Library →
            </Link>
          </div>
        )}

        {!loading && !notApproved && !row && !showGenerating && (
          <div className="rounded-2xl p-8 text-center" style={{ background: NAVY }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
              Document Intelligence
            </p>
            <h3 className="text-lg font-bold text-white mb-3">
              Interpret &ldquo;{doc.name}&rdquo; for this project
            </h3>
            <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed mb-6">
              Fanometrix reads this document&apos;s already-approved Research Library analysis and interprets
              it specifically against this project&apos;s Research Question — headline, key findings and
              recommended actions, written for this project alone.
            </p>
            <button onClick={() => generate(false)}
              className="text-sm font-semibold px-6 py-3 rounded-xl"
              style={{ background: GOLD, color: NAVY }}>
              Generate Intelligence →
            </button>
          </div>
        )}

        {showGenerating && (
          <GeneratingProgress
            label={`Interpreting ${doc.name}…`}
            sublabel="Reading the document's evidence against this project's Research Question"
            estimatedSeconds={15}
          />
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center mb-4">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {!generating && row && current && (
          <div className="space-y-6">

            <ReportHero
              variant="flat"
              kicker={`${doc.document_type.replace(/_/g, " ")} · ${new Date(row.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
              headline={editing && draft ? draft.headline : current.headline}
              editing={editing && !!draft}
              onHeadlineChange={v => draft && setDraft({ ...draft, headline: v })}
            />

            <div className="bg-white border border-gray-100 rounded-2xl p-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Executive Summary</p>
              {editing && draft ? (
                <textarea value={draft.executive_summary} rows={3}
                  onChange={e => setDraft({ ...draft, executive_summary: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
              ) : (
                <p className="text-base text-gray-800 leading-relaxed">{current.executive_summary}</p>
              )}
            </div>

            <Section title="Key Findings" tone="gold">
              <p className="text-xs text-gray-400 mb-3">The document&apos;s full set of findings, carried through unchanged from the approved Research Library analysis and reordered by significance to this project&apos;s Research Question — nothing is filtered out. Text and citations are owned by the Research Library; edit them there if they need correcting.</p>
              <div className="space-y-3">
                {current.key_findings.length === 0 && <p className="text-sm text-gray-400">The approved Research Library analysis has no key findings.</p>}
                {current.key_findings.map((f, i) => (
                  <div key={f.id} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5"
                      style={{ background: GOLD, color: NAVY }}>
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 leading-relaxed">{f.text}</p>
                      <ProvenanceBadges provenance={f.provenance} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {current.statistics.length > 0 && (
              <Section title="Statistics" tone="positive">
                <p className="text-xs text-gray-400 mb-3">Reordered by significance to this project&apos;s Research Question — the full set, unfiltered.</p>
                <div className="space-y-3">
                  {current.statistics.map(s => (
                    <div key={s.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                      <div className="flex items-baseline gap-2">
                        {s.value && <span className="text-sm font-bold" style={{ color: NAVY }}>{s.value}</span>}
                        <p className="text-sm text-gray-700 leading-relaxed">{s.text}</p>
                      </div>
                      <ProvenanceBadges provenance={s.provenance} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {current.quotes.length > 0 && (
              <Section title="Quotes" tone="difference">
                <div className="space-y-3">
                  {current.quotes.map(q => (
                    <div key={q.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                      <p className="text-sm text-gray-700 italic leading-relaxed">&ldquo;{q.text}&rdquo;</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {q.attribution && <span>{q.attribution}</span>}
                        {q.attribution && q.theme && <span> · </span>}
                        {q.theme && <span>Theme: {q.theme}</span>}
                      </p>
                      <ProvenanceBadges provenance={q.provenance} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {current.document_recommendations.length > 0 && (
              <Section title="Document's Own Recommendations" tone="neutral">
                <p className="text-xs text-gray-400 mb-3">The document&apos;s own conclusions — background context, not this project&apos;s own recommendation. See Recommended Actions below for that.</p>
                <div className="space-y-3">
                  {current.document_recommendations.map(r => (
                    <div key={r.id} className="border border-gray-100 rounded-xl p-3 bg-gray-50/50">
                      <p className="text-sm text-gray-700 leading-relaxed">{r.text}</p>
                      <ProvenanceBadges provenance={r.provenance} />
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title="Recommended Actions" tone="positive">
              <p className="text-xs text-gray-400 mb-3">This project&apos;s own recommendations, traced to the key findings above — not copied from the document&apos;s own recommendations.</p>
              {editing && draft ? (
                <TracedRecommendationsField
                  items={draft.recommended_actions}
                  findingsCount={draft.key_findings.length}
                  onChange={items => setDraft({ ...draft, recommended_actions: items })}
                />
              ) : (
                <div className="space-y-4">
                  {current.recommended_actions.length === 0 && <p className="text-sm text-gray-400">No project-specific recommendation follows from this document alone.</p>}
                  {current.recommended_actions.map((a, i) => (
                    <div key={i} className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#D7F5DC", color: "#166534" }}>
                          {i + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 mb-1">{a.action}</p>
                          <p className="text-xs text-gray-500 leading-relaxed mb-2">{a.rationale}</p>
                          <FindingReferenceChips indices={a.based_on_findings} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Strategic Implications" tone="difference">
              {editing && draft ? (
                <ListField items={draft.strategic_implications} addLabel="implication" onChange={items => setDraft({ ...draft, strategic_implications: items })} />
              ) : (
                <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                  {current.strategic_implications.length === 0 && <p className="text-sm text-gray-400 list-none">None identified.</p>}
                  {current.strategic_implications.map((imp, i) => <li key={i}>{imp}</li>)}
                </ul>
              )}
            </Section>

            <Section title="Further Research Questions" tone="neutral">
              {editing && draft ? (
                <ListField items={draft.further_research_questions} addLabel="question" onChange={items => setDraft({ ...draft, further_research_questions: items })} />
              ) : (
                <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                  {current.further_research_questions.length === 0 && <p className="text-sm text-gray-400 list-none">None identified.</p>}
                  {current.further_research_questions.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              )}
            </Section>

            <Section title="Evidence Strength & Limitations" tone="neutral">
              <p className="text-xs text-gray-400 mb-3">Carried through unchanged from the Research Library&apos;s own analysis — a fact about the document itself, not re-assessed per project.</p>
              <div className="flex items-center gap-2 mb-3">
                <EvidenceStrengthBadge strength={current.evidence_strength} />
              </div>
              <p className="text-sm text-gray-700 leading-relaxed mb-3">{current.evidence_strength_rationale}</p>
              <ul className="text-sm text-gray-700 space-y-1.5 list-disc list-inside">
                {current.limitations.length === 0 && <p className="text-sm text-gray-400 list-none">The document discloses no limitations of its own.</p>}
                {current.limitations.map(l => <li key={l.id}>{l.text}</li>)}
              </ul>
            </Section>

            {!editing && (row.reviewed_by || row.published_at) && (
              <div className="text-xs text-gray-400 text-center">
                {row.reviewed_by && row.reviewed_at && (
                  <span>Approved by {row.reviewed_by} on {new Date(row.reviewed_at).toLocaleDateString("en-GB")}</span>
                )}
                {row.reviewed_by && row.published_at && <span> · </span>}
                {row.published_at && <span>Published {new Date(row.published_at).toLocaleDateString("en-GB")}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmRegen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Regenerate summary?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This document already has a {row?.status} summary. Regenerating replaces it with a new AI draft and resets its status to Draft, any edits or approval will be lost.
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
