"use client";

// The Research Project's Analysis presentation — the intelligence workspace
// that answers "what have we learned?". It is a Research-Project-only component:
// the shared IntelligenceSection (still used by Product Walkthrough) is left
// entirely untouched, so PW is unchanged. It reuses the same shared primitives
// (SectionCard, StatusBadge, PrimaryButton/SecondaryButton) and the same
// intelligence status constants — no new engines, APIs or data.
//
// Organised by evidence source, not as one flat Intelligence list. Each
// research method gets its own section — Survey Intelligence, Conversation
// Intelligence, Industry Intelligence — surfacing the key information already
// in the project payload for that method (volume analysed, sentiment split and
// markets for conversations, scope for surveys and documents, plus when each
// was analysed and its review status). The findings *text* itself isn't in the
// payload, so "Review Findings →" opens the per-source report where the themes
// and narrative live. Future methods (Google Trends, CRM, Retail/POS…) slot in
// as another <IntelligenceGroup> with its own card renderer — the layout takes
// them without a redesign.
//
// Key Findings is kept separate below the source sections: it is the
// project-level synthesis across the approved sources, not a fourth source.
//
// Deliberately omits the "Coming Soon" roadmap rows and empty placeholders the
// shared section shows — this view lists only real, attached intelligence.
import { SectionCard, EmptyState, InfoContent } from "@/app/components/research-projects/Shell";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@/app/components/research-projects/ActionPrimitives";
import { INTELLIGENCE_STATUS_META, INTELLIGENCE_STATUS_TONE } from "@/app/components/research-projects/constants";
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

const isApproved = (s: IntelligenceStatus) => s === "approved" || s === "published";
const approvedOf = (items: { summary_status: IntelligenceStatus }[]) => items.filter(i => isApproved(i.summary_status)).length;

// A single inline stat — a value with a muted label, the shared way each card
// surfaces "what this source measured": evidence volume, scope, markets…
function Metric({ value, label }: { value: React.ReactNode; label?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-gray-800 font-semibold">{value}</span>
      {label && <span className="text-gray-400">{label}</span>}
    </span>
  );
}

function MetricRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs mt-1">{children}</div>;
}

// A card's review status + "last analysed" line — the shared read on whether a
// source has been learned from yet, and how recently.
function AnalysisStatusLine({ status, generatedAt }: { status: IntelligenceStatus; generatedAt: string | null }) {
  const meta = INTELLIGENCE_STATUS_META[status ?? "not_started"];
  return (
    <div className="flex items-center gap-2 flex-wrap mt-2">
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

// One research method's section — a consistent header, an approved-count
// summary and an empty state, with that method's type-specific cards inside.
// Adding a future method (Google Trends, CRM, Retail/POS…) is a new
// <IntelligenceGroup> with its own card renderer; nothing else changes.
function IntelligenceGroup({
  id, title, infoTitle, infoBody, total, approved, emptyText, children,
}: {
  id: string; title: string; infoTitle: string; infoBody: React.ReactNode;
  total: number; approved: number; emptyText: string; children: React.ReactNode;
}) {
  return (
    <SectionCard
      id={id}
      title={title}
      info={<InfoContent title={infoTitle}>{infoBody}</InfoContent>}
      summary={
        <p className="text-xs text-gray-500">
          {total === 0 ? "None attached" : `${approved} of ${total} approved`}
        </p>
      }
    >
      {total === 0 ? <EmptyState>{emptyText}</EmptyState> : <div className="space-y-2">{children}</div>}
    </SectionCard>
  );
}

// The dominant sentiment across a conversation search's mention split — the
// headline "current sentiment" read, backed by the positive/negative bar below.
function dominantSentiment(pos: number, neu: number, neg: number): { label: string; tone: "success" | "neutral" | "warning" } {
  if (pos >= neu && pos >= neg) return { label: "Mostly positive", tone: "success" };
  if (neg >= neu && neg >= pos) return { label: "Mostly negative", tone: "warning" };
  return { label: "Mostly neutral", tone: "neutral" };
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
  return (
    <>
      {/* ── Survey Intelligence — what the questionnaires told us ──────────── */}
      <IntelligenceGroup
        id="survey-intelligence"
        title="Survey Intelligence"
        infoTitle="What your surveys told you."
        infoBody={<p>Each survey is analysed independently. Approve a survey&apos;s Intelligence to make it count toward the reports and the project synthesis.</p>}
        total={surveys.length}
        approved={approvedOf(surveys)}
        emptyText="No surveys attached yet. Attach a survey in Research to analyse it here."
      >
        {surveys.map(s => (
          <AnalysisCard key={s.evidence_id} action={reviewAction(s.summary_status, () => onOpenSurveyIntelligence(s.evidence_id))}>
            <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
            <MetricRow>
              <Metric value={s.response_count.toLocaleString()} label={`response${s.response_count !== 1 ? "s" : ""} analysed`} />
              <Metric value={s.question_count} label={`question${s.question_count !== 1 ? "s" : ""}`} />
            </MetricRow>
            <AnalysisStatusLine status={s.summary_status} generatedAt={s.generated_at} />
          </AnalysisCard>
        ))}
      </IntelligenceGroup>

      {/* ── Conversation Intelligence — what public conversation told us ───── */}
      <IntelligenceGroup
        id="conversation-intelligence"
        title="Conversation Intelligence"
        infoTitle="What public conversation told you."
        infoBody={<p>Public mentions across the chosen markets and platforms, with the sentiment split. Approve a search&apos;s Intelligence to make it count toward the reports and the project synthesis.</p>}
        total={conversationSearches.length}
        approved={approvedOf(conversationSearches)}
        emptyText="No conversation searches attached yet. Attach one in Research to analyse it here."
      >
        {conversationSearches.map(c => {
          const total = c.positive_pct + c.neutral_pct + c.negative_pct;
          const hasSentiment = c.mention_count > 0 && total > 0;
          const sentiment = dominantSentiment(c.positive_pct, c.neutral_pct, c.negative_pct);
          return (
            <AnalysisCard key={c.evidence_id} action={reviewAction(c.summary_status, () => onOpenConversationIntelligence(c.evidence_id))}>
              <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
              <MetricRow>
                <Metric value={c.mention_count.toLocaleString()} label={`mention${c.mention_count !== 1 ? "s" : ""}`} />
                {c.markets.length > 0 && <Metric value={c.markets.length} label={`market${c.markets.length !== 1 ? "s" : ""}`} />}
                {c.platforms.length > 0 && <Metric value={c.platforms.length} label={`platform${c.platforms.length !== 1 ? "s" : ""}`} />}
              </MetricRow>
              {c.markets.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-1 truncate">{c.markets.slice(0, 4).join(", ")}{c.markets.length > 4 ? ` +${c.markets.length - 4} more` : ""}</p>
              )}
              {hasSentiment && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge label={sentiment.label} tone={sentiment.tone} />
                    <span className="text-[11px] text-gray-500">{Math.round(c.positive_pct)}% positive · {Math.round(c.negative_pct)}% negative</span>
                  </div>
                  <div className="flex h-1.5 w-full max-w-[220px] rounded-full overflow-hidden bg-gray-100">
                    <div style={{ width: `${c.positive_pct}%`, background: "#16a34a" }} />
                    <div style={{ width: `${c.neutral_pct}%`, background: "#d1d5db" }} />
                    <div style={{ width: `${c.negative_pct}%`, background: "#dc2626" }} />
                  </div>
                </div>
              )}
              <AnalysisStatusLine status={c.summary_status} generatedAt={c.generated_at} />
            </AnalysisCard>
          );
        })}
      </IntelligenceGroup>

      {/* ── Industry Intelligence — what the library documents told us ─────── */}
      <IntelligenceGroup
        id="industry-intelligence"
        title="Industry Intelligence"
        infoTitle="What industry sources told you."
        infoBody={<p>Reports, strategy documents and case studies from the Research Library, interpreted for this project. Approve a document&apos;s Intelligence to make it count toward the reports and the project synthesis.</p>}
        total={documents.length}
        approved={approvedOf(documents)}
        emptyText="No documents attached yet. Attach one from the Research Library in Research to analyse it here."
      >
        {documents.map(d => {
          const notApproved = d.library_status !== "approved";
          return (
            <AnalysisCard
              key={d.evidence_row_id}
              action={reviewAction(d.summary_status, () => onOpenDocumentIntelligence(d.evidence_row_id), notApproved && !d.summary_status, notApproved ? "Approve this document's analysis in the Research Library first." : "")}
            >
              <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
              <MetricRow>
                <Metric value={d.document_type} />
                {d.page_count != null && <Metric value={d.page_count} label={`page${d.page_count !== 1 ? "s" : ""}`} />}
              </MetricRow>
              {notApproved && <p className="text-xs text-amber-600 mt-1">Awaiting Research Library approval</p>}
              <AnalysisStatusLine status={d.summary_status} generatedAt={d.generated_at} />
            </AnalysisCard>
          );
        })}
      </IntelligenceGroup>

      {/* ── Key Findings — the project-level synthesis across sources ──────── */}
      <SectionCard
        id="key-findings"
        title="Key Findings"
        info={
          <InfoContent title="The project-level synthesis.">
            <p>One list of stat-backed facts distilled across every analysed source — distinct from each source&apos;s own Intelligence above. Not a research source of its own.</p>
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
