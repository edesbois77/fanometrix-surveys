"use client";

// The last step before Knowledge. Same review-lifecycle state machine
// Survey/Conversation Intelligence use (Generate → Draft/Edit/Approve/
// Publish), pointed at /api/research-projects/[id]/conclusion/* — but
// rendered fully inline in this card rather than a page or pop-up, since
// (unlike those source-specific reports) there's exactly one Conclusion per
// project and no reason to navigate away from the Workspace to see it. A
// Conclusion is deliberately not another AI summary: its `answer` is copied
// verbatim from the approved Executive Report, never regenerated here (see
// lib/intelligence/analysts/analyseConclusion.ts).
import { useMemo } from "react";
import { SectionCard, CollapsedSummary, InfoContent } from "@/app/components/research-projects/Shell";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { INTELLIGENCE_STATUS_META } from "@/app/components/research-projects/constants";
import { SecondaryButton, UtilityButton, StatusBadge } from "@/app/components/research-projects/ActionPrimitives";
import { useIntelligenceReview, type IntelligenceReviewAdapter } from "@/lib/intelligence/useIntelligenceReview";
import { InfoTooltip } from "@/app/components/InfoTooltip";
import { GeneratingProgress } from "@/app/components/intelligence/GeneratingProgress";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { Conclusion } from "@/lib/intelligence/analysts/analyseConclusion";
import { NAVY, GOLD } from "@/lib/intelligence/theme";

const SLATE = "#374151";

const APPROVE_EXPLAINER = (
  <p><strong>Approve</strong> signs this conclusion off as accurate and ready.</p>
);

export function ConclusionSection({ projectId, projectName, researchQuestion, reportApproved, isSimulated }: {
  projectId: string;
  projectName: string;
  researchQuestion: string;
  reportApproved: boolean;
  isSimulated: boolean;
}) {
  const adapter: IntelligenceReviewAdapter<Conclusion> = useMemo(() => ({
    fetchCurrent: async () => {
      const res  = await fetch(`/api/research-projects/${projectId}/conclusion`);
      const json = await res.json();
      return json.data ?? null;
    },
    generate: async confirm => {
      const res  = await fetch(`/api/research-projects/${projectId}/conclusion`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (res.status === 409) return { ok: false, error: json.error, requiresConfirm: true };
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to generate the Conclusion." };
      return { ok: true, data: json.data };
    },
    saveEdit: async editedContent => {
      const res  = await fetch(`/api/research-projects/${projectId}/conclusion/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edited_content: editedContent }),
      });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to save edits." };
      return { ok: true, data: json.data };
    },
    approve: async () => {
      const res  = await fetch(`/api/research-projects/${projectId}/conclusion/approve`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to approve." };
      return { ok: true, data: json.data };
    },
    publish: async () => {
      const res  = await fetch(`/api/research-projects/${projectId}/conclusion/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return { ok: false, error: json.error ?? "Failed to publish." };
      return { ok: true, data: json.data };
    },
  }), [projectId]);

  const {
    row, draft, editing, loading, generating, saving, approving, error, confirmRegen,
    current, busy,
    setDraft, setConfirmRegen,
    generate, startEditing, cancelEditing, saveEdits, approveSummary,
  } = useIntelligenceReview<Conclusion>(adapter, [projectId]);

  const meta = INTELLIGENCE_STATUS_META[row?.status ?? "not_started"];
  // The Conclusion snapshots the Research Question it was generated
  // against (research_question on its own content) — already fetched here,
  // so the comparison is direct, no separate server field needed (compare
  // ReportsSection, which doesn't fetch report content and relies on
  // project.report_stale instead).
  const conclusionStale = !!current?.research_question && current.research_question.trim() !== researchQuestion.trim();

  return (
    <>
      <SectionCard
        id="conclusion"
        title="Conclusion"
        badge={isSimulated && <SimulatedBadge />}
        info={
          <InfoContent title="The answer to this project's Research Question.">
            <p>Distilled from the approved Executive Report, this project&apos;s lasting answer for future research to draw on.</p>
          </InfoContent>
        }
        summary={
          <div className="space-y-1">
            <CollapsedSummary groups={[{ parts: conclusionStale ? [meta.label, "Question changed"] : [meta.label] }]} />
            {current && <p className="text-xs text-gray-600 line-clamp-2">{current.answer}</p>}
          </div>
        }
      >
        <div className="space-y-4">

          {loading && (
            <div className="p-10 text-center">
              <div className="w-8 h-8 border-4 border-[#D7B87A] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}

          {!loading && !reportApproved && !row && (
            <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
                Conclusion
              </p>
              <h3 className="text-lg font-bold text-white mb-3">Approve the Executive Report first</h3>
              <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed">
                A Conclusion distils this project&apos;s Executive Report into one clear answer, it needs that report approved
                first, so there&apos;s a reviewed, signed-off synthesis to distil from.
              </p>
            </div>
          )}

          {!loading && reportApproved && !row && (
            <div className="bg-[#0B1929] rounded-2xl p-8 text-center">
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: GOLD }}>
                Conclusion
              </p>
              <h3 className="text-lg font-bold text-white mb-3">
                Distil the approved Executive Report into one answer
              </h3>
              <p className="text-sm text-white/60 max-w-sm mx-auto leading-relaxed mb-6">
                Takes this project&apos;s already-approved answer to &quot;{researchQuestion}&quot; and writes a short,
                standalone rationale for it.
              </p>
              {error && <p className="text-sm text-red-300 mb-4">{error}</p>}
              <button onClick={() => generate(false)}
                className="text-sm font-semibold px-6 py-3 rounded-xl"
                style={{ background: GOLD, color: NAVY }}>
                Generate Conclusion →
              </button>
            </div>
          )}

          {generating && (
            <GeneratingProgress
              label={`Distilling ${projectName}'s Executive Report…`}
              sublabel="Reviewing the approved report to write a standalone rationale, the answer itself is copied from the approved report, never regenerated"
              estimatedSeconds={12}
            />
          )}

          {error && row && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {!generating && row && current && (
            <div className="space-y-4">

              <div className="rounded-2xl p-6 text-center" style={{ background: SLATE }}>
                <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: GOLD }}>
                  Answering: {current.research_question}
                </p>
                {editing && draft ? (
                  <textarea value={draft.answer} rows={2} onChange={e => setDraft({ ...draft, answer: e.target.value })}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-xl font-bold text-white text-center placeholder-white/40 focus:outline-none focus:border-[#D7B87A]" />
                ) : (
                  <h2 className="text-xl font-bold text-white leading-tight">{current.answer}</h2>
                )}
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Rationale</p>
                {editing && draft ? (
                  <textarea value={draft.rationale} rows={4}
                    onChange={e => setDraft({ ...draft, rationale: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base text-gray-800 focus:outline-none focus:border-[#D7B87A]" />
                ) : (
                  <p className="text-base text-gray-800 leading-relaxed">{current.rationale}</p>
                )}
              </div>

              {!editing && (row.reviewed_by || row.published_at) && (
                <div className="text-xs text-gray-400 text-center">
                  {row.reviewed_by && row.reviewed_at && (
                    <span>Approved by {row.reviewed_by} on {new Date(row.reviewed_at).toLocaleDateString("en-GB")}</span>
                  )}
                  {row.reviewed_by && row.published_at && <span> · </span>}
                  {row.published_at && <span>Published {formatRelativeTime(row.published_at)}</span>}
                </div>
              )}
            </div>
          )}

          {/* Action row — the (i) explainer and staleness flag sit next to
              the buttons they're actually about, rather than a separate row
              up top duplicating the Approved status already shown here. */}
          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-gray-100">
            <div className="flex items-center gap-2 flex-wrap">
              {row && <InfoTooltip text={APPROVE_EXPLAINER} />}
              {conclusionStale && (
                <span title="The Research Question has changed since this was generated, Regenerate to answer the current question.">
                  <StatusBadge label="⚠ Question changed" tone="warning" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!editing ? (
                <>
                  {row && (
                    <SecondaryButton onClick={startEditing} disabled={busy}>Edit</SecondaryButton>
                  )}
                  {row && (
                    row.status === "approved" || row.status === "published" ? (
                      <StatusBadge label="Approved ✓" tone="success" />
                    ) : (
                      <button onClick={approveSummary} disabled={busy}
                        className="text-xs font-semibold border-2 border-green-600 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-50 disabled:opacity-40">
                        {approving ? "Approving…" : "Approve"}
                      </button>
                    )
                  )}
                  {row && reportApproved && (
                    <UtilityButton onClick={() => generate(false)} disabled={busy}>
                      {generating ? "Generating…" : "Regenerate"}
                    </UtilityButton>
                  )}
                </>
              ) : (
                <>
                  <button onClick={cancelEditing} disabled={saving}
                    className="text-xs border border-gray-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                    Cancel
                  </button>
                  <button onClick={saveEdits} disabled={saving}
                    className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                    style={{ background: NAVY, color: GOLD }}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Regenerate confirmation */}
      {confirmRegen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Regenerate conclusion?</h2>
            <p className="text-sm text-gray-500 mb-5">
              This project already has a {row?.status} conclusion. Regenerating replaces it with a new AI draft and resets its status to Draft, any edits or approval will be lost.
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
    </>
  );
}
