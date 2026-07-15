"use client";

// The Research Project's Analysis presentation — a richer, purpose-built view
// that answers "what have we learned?". It is a Research-Project-only component:
// the shared IntelligenceSection (still used by Product Walkthrough) is left
// entirely untouched, so PW is unchanged. It reuses the same shared primitives
// (SectionCard, StatusBadge, PrimaryButton/SecondaryButton) and the same
// intelligence status/source-badge constants — no new engines, APIs or data.
//
// Two distinct concepts, kept separate:
//   Source Intelligence — what each individual Research Source found (opens the
//     per-source report). Cards surface the learning signals already in the
//     project payload: review/approval status, volume analysed, sentiment split
//     (conversation searches) and when it was last analysed. The actual findings
//     text is NOT shown here (it isn't in the payload) — a content taster is a
//     deferred, separately-approved step.
//   Key Findings — the project-level synthesis across the approved sources.
//
// Deliberately omits the "Coming Soon" roadmap rows and empty placeholders the
// shared section shows — this view lists only real, attached intelligence.
import { SectionCard, EmptyState, InfoContent } from "@/app/components/research-projects/Shell";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@/app/components/research-projects/ActionPrimitives";
import { INTELLIGENCE_STATUS_META, INTELLIGENCE_STATUS_TONE, SOURCE_BADGE } from "@/app/components/research-projects/constants";
import { formatRelativeTime } from "@/lib/format-relative-time";

type IntelligenceStatus = "draft" | "edited" | "approved" | "published" | null;

export type AnalysisSurvey = {
  evidence_id: string; name: string; response_count: number; question_count: number;
  summary_status: IntelligenceStatus; generated_at: string | null;
};
export type AnalysisSearch = {
  evidence_id: string; name: string; mention_count: number;
  positive_pct: number; neutral_pct: number; negative_pct: number;
  markets: string[]; platforms: string[];
  summary_status: IntelligenceStatus; generated_at: string | null;
};
export type AnalysisDocument = {
  evidence_row_id: string; name: string; document_type: string; page_count: number | null;
  library_status: string; summary_status: IntelligenceStatus; generated_at: string | null;
};

function SourceBadge({ label }: { label: string }) {
  return <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{label}</span>;
}

// A card's status + "last analysed" line — the shared read on whether a source
// has been learned from yet, and how recently.
function AnalysisStatusLine({ status, generatedAt }: { status: IntelligenceStatus; generatedAt: string | null }) {
  const meta = INTELLIGENCE_STATUS_META[status ?? "not_started"];
  return (
    <div className="flex items-center gap-2 flex-wrap mt-1.5">
      <StatusBadge label={meta.label} tone={INTELLIGENCE_STATUS_TONE[status ?? "not_started"]} />
      {generatedAt && <span className="text-xs text-gray-400">Analysed {formatRelativeTime(generatedAt)}</span>}
    </div>
  );
}

function AnalysisCard({ children, action }: { children: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  );
}

function reviewAction(status: IntelligenceStatus, onOpen: () => void, disabled?: boolean, title?: string) {
  return status
    ? <SecondaryButton onClick={onOpen}>Review Findings →</SecondaryButton>
    : <PrimaryButton onClick={onOpen} disabled={disabled} title={title}>Generate Intelligence →</PrimaryButton>;
}

export function AnalysisView({
  surveys, conversationSearches, documents, keyFindingsStatus, keyFindingsCount,
  onOpenKeyFindings, onOpenSurveyIntelligence, onOpenConversationIntelligence, onOpenDocumentIntelligence,
}: {
  surveys: AnalysisSurvey[];
  conversationSearches: AnalysisSearch[];
  documents: AnalysisDocument[];
  keyFindingsStatus: "ready" | null;
  keyFindingsCount: number | null;
  onOpenKeyFindings: () => void;
  onOpenSurveyIntelligence: (evidenceId: string) => void;
  onOpenConversationIntelligence: (evidenceId: string) => void;
  onOpenDocumentIntelligence: (evidenceRowId: string) => void;
}) {
  const sourceCount = surveys.length + conversationSearches.length + documents.length;
  const approvedCount =
    surveys.filter(s => s.summary_status === "approved" || s.summary_status === "published").length +
    conversationSearches.filter(c => c.summary_status === "approved" || c.summary_status === "published").length +
    documents.filter(d => d.summary_status === "approved" || d.summary_status === "published").length;

  return (
    <>
      {/* ── Source Intelligence — what each Research Source found ──────────── */}
      <SectionCard
        id="intelligence"
        title="Source Intelligence"
        info={
          <InfoContent title="What each research source found.">
            <p>Each attached source is analysed independently. Approve a source&apos;s Intelligence to make it count toward the reports and the project synthesis.</p>
          </InfoContent>
        }
        summary={
          <p className="text-xs text-gray-500">
            {sourceCount === 0 ? "No research sources yet" : `${approvedCount} of ${sourceCount} source${sourceCount !== 1 ? "s" : ""} approved`}
          </p>
        }
      >
        {sourceCount === 0 ? (
          <EmptyState>No research sources attached yet. Attach a survey, conversation search or document in Sources to analyse it.</EmptyState>
        ) : (
          <div className="space-y-2">
            {surveys.map(s => (
              <AnalysisCard key={s.evidence_id} action={reviewAction(s.summary_status, () => onOpenSurveyIntelligence(s.evidence_id))}>
                <SourceBadge label={SOURCE_BADGE.survey} />
                <p className="text-sm font-medium text-gray-800 truncate mt-1">{s.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {s.response_count.toLocaleString()} response{s.response_count !== 1 ? "s" : ""} · {s.question_count} question{s.question_count !== 1 ? "s" : ""}
                </p>
                <AnalysisStatusLine status={s.summary_status} generatedAt={s.generated_at} />
              </AnalysisCard>
            ))}

            {conversationSearches.map(c => {
              const total = c.positive_pct + c.neutral_pct + c.negative_pct;
              return (
                <AnalysisCard key={c.evidence_id} action={reviewAction(c.summary_status, () => onOpenConversationIntelligence(c.evidence_id))}>
                  <SourceBadge label={SOURCE_BADGE.social_search} />
                  <p className="text-sm font-medium text-gray-800 truncate mt-1">{c.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {c.mention_count.toLocaleString()} mention{c.mention_count !== 1 ? "s" : ""}
                    {c.markets.length > 0 && <span> · {c.markets.slice(0, 3).join(", ")}{c.markets.length > 3 ? "…" : ""}</span>}
                  </p>
                  {c.mention_count > 0 && total > 0 && (
                    <div className="mt-1.5">
                      <div className="flex h-1.5 w-full max-w-[200px] rounded-full overflow-hidden bg-gray-100">
                        <div style={{ width: `${c.positive_pct}%`, background: "#16a34a" }} />
                        <div style={{ width: `${c.neutral_pct}%`, background: "#d1d5db" }} />
                        <div style={{ width: `${c.negative_pct}%`, background: "#dc2626" }} />
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">{Math.round(c.positive_pct)}% positive · {Math.round(c.negative_pct)}% negative</p>
                    </div>
                  )}
                  <AnalysisStatusLine status={c.summary_status} generatedAt={c.generated_at} />
                </AnalysisCard>
              );
            })}

            {documents.map(d => {
              const notApproved = d.library_status !== "approved";
              return (
                <AnalysisCard
                  key={d.evidence_row_id}
                  action={reviewAction(d.summary_status, () => onOpenDocumentIntelligence(d.evidence_row_id), notApproved && !d.summary_status, notApproved ? "Approve this document's analysis in the Research Library first." : "")}
                >
                  <SourceBadge label={SOURCE_BADGE.document} />
                  <p className="text-sm font-medium text-gray-800 truncate mt-1">{d.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {d.document_type}{d.page_count != null && <span> · {d.page_count} page{d.page_count !== 1 ? "s" : ""}</span>}
                  </p>
                  {notApproved && <p className="text-xs text-amber-600 mt-0.5">Awaiting Research Library approval</p>}
                  <AnalysisStatusLine status={d.summary_status} generatedAt={d.generated_at} />
                </AnalysisCard>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ── Key Findings — the project-level synthesis across sources ──────── */}
      <SectionCard
        id="key-findings"
        title="Key Findings"
        info={
          <InfoContent title="The project-level synthesis.">
            <p>One flat list of stat-backed facts distilled across every analysed source — distinct from each source&apos;s own Intelligence above.</p>
          </InfoContent>
        }
        summary={
          <p className="text-xs text-gray-500">
            {keyFindingsStatus ? `Ready${keyFindingsCount !== null ? ` · ${keyFindingsCount} finding${keyFindingsCount !== 1 ? "s" : ""}` : ""}` : "Not started"}
          </p>
        }
      >
        <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-start justify-between gap-3 flex-wrap" style={{ background: "#FBF9F4" }}>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded inline-block" style={{ color: "#A98A52", background: "rgba(215,184,122,0.15)" }}>KEY FINDINGS</span>
            <p className="text-sm font-medium text-gray-800 mt-1">Every source, one list of stat-backed facts</p>
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <StatusBadge label={keyFindingsStatus ? "Ready" : "Not started"} tone={keyFindingsStatus ? "success" : "neutral"} />
              {keyFindingsCount !== null && <span className="text-xs text-gray-400">{keyFindingsCount} finding{keyFindingsCount !== 1 ? "s" : ""}</span>}
            </div>
          </div>
          <div className="flex-shrink-0">
            {keyFindingsStatus
              ? <SecondaryButton onClick={onOpenKeyFindings} className="bg-white">Review Findings →</SecondaryButton>
              : <PrimaryButton onClick={onOpenKeyFindings}>Generate Key Findings →</PrimaryButton>}
          </div>
        </div>
      </SectionCard>
    </>
  );
}
