"use client";

import { SectionCard, CollapsedSummary, InfoContent } from "@/app/components/research-projects/Shell";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { INTELLIGENCE_STATUS_META, INTELLIGENCE_STATUS_TONE, SOURCE_BADGE } from "@/app/components/research-projects/constants";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@/app/components/research-projects/ActionPrimitives";

type IntelligenceStatus = "draft" | "edited" | "approved" | "published" | null;

type SurveyIntelligenceItem = { evidence_id: string; name: string; response_count: number; summary_status: IntelligenceStatus };
type DocumentIntelligenceItem = {
  evidence_row_id: string; name: string; document_type: string;
  /** library_documents.status — distinct from summary_status below, see
   * WorkspaceBody's EvidenceItem.document doc comment. */
  library_status: string;
  summary_status: IntelligenceStatus;
};

export function IntelligenceSection({
  isSimulated, surveys, conversationSearches, documents,
  keyFindingsStatus, keyFindingsCount,
  onOpenKeyFindings, onOpenSurveyIntelligence, onOpenConversationIntelligence, onOpenDocumentIntelligence,
}: {
  isSimulated: boolean;
  surveys: SurveyIntelligenceItem[];
  conversationSearches: { evidence_id: string; name: string; mention_count: number; summary_status: IntelligenceStatus }[];
  documents: DocumentIntelligenceItem[];
  keyFindingsStatus: "ready" | null;
  keyFindingsCount: number | null;
  onOpenKeyFindings: () => void;
  onOpenSurveyIntelligence: (evidenceId: string) => void;
  onOpenConversationIntelligence: (evidenceId: string) => void;
  onOpenDocumentIntelligence: (evidenceRowId: string) => void;
}) {
  const hasAnySource = surveys.length > 0 || conversationSearches.length > 0 || documents.length > 0;
  const sourceCount = surveys.length + conversationSearches.length + documents.length;
  const analysedCount = surveys.filter(s => s.summary_status).length + conversationSearches.filter(cs => cs.summary_status).length
    + documents.filter(d => d.summary_status).length;
  const approvedCount = surveys.filter(s => s.summary_status === "approved" || s.summary_status === "published").length
    + conversationSearches.filter(cs => cs.summary_status === "approved" || cs.summary_status === "published").length
    + documents.filter(d => d.summary_status === "approved" || d.summary_status === "published").length;
  return (
    <SectionCard
      id="intelligence"
      title="Intelligence"
      badge={isSimulated && <SimulatedBadge />}
      info={
        <InfoContent title="AI analysis of each research source.">
          <p>Each attached source gets analysed independently here, Survey Intelligence needs a survey in Research Sources first, Conversation Intelligence needs a conversation search.</p>
          <p className="mt-1.5">Combining findings across sources into one story is what Reports (below) is for.</p>
        </InfoContent>
      }
      summary={
        <CollapsedSummary groups={[{ parts: hasAnySource ? [
          `${analysedCount} of ${sourceCount} analysed`,
          ...(approvedCount > 0 ? [`${approvedCount} approved`] : []),
          ...(keyFindingsStatus ? ["Key Findings ready"] : []),
        ] : ["No research sources yet"] }]} />
      }
    >
      <div className="space-y-2">
        {hasAnySource && (
          <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3" style={{ background: "#FBF9F4" }}>
            <div className="min-w-0">
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded inline-block mb-1" style={{ color: "#A98A52", background: "rgba(215,184,122,0.15)" }}>KEY FINDINGS</span>
              {isSimulated && <span className="ml-1"><SimulatedBadge size="xs" /></span>}
              <p className="text-sm font-medium text-gray-800">Every source, one flat list of stat facts</p>
              <span className="inline-block mt-1">
                <StatusBadge label={keyFindingsStatus ? "Ready" : "Not started"} tone={keyFindingsStatus ? "success" : "neutral"} />
              </span>
              {keyFindingsCount !== null && (
                <span className="ml-2 text-xs text-gray-400">{keyFindingsCount} finding{keyFindingsCount !== 1 ? "s" : ""}</span>
              )}
            </div>
            {keyFindingsStatus ? (
              <SecondaryButton onClick={onOpenKeyFindings} className="bg-white">Review Findings →</SecondaryButton>
            ) : (
              <PrimaryButton onClick={onOpenKeyFindings}>Generate Key Findings →</PrimaryButton>
            )}
          </div>
        )}

        {surveys.map(s => {
          const statusMeta = INTELLIGENCE_STATUS_META[s.summary_status ?? "not_started"];
          return (
            <div key={s.evidence_id} className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded inline-block mb-1">{SOURCE_BADGE.survey}</span>
                {isSimulated && <span className="ml-1"><SimulatedBadge size="xs" /></span>}
                <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                <span className="inline-block mt-1">
                  <StatusBadge label={statusMeta.label} tone={INTELLIGENCE_STATUS_TONE[s.summary_status ?? "not_started"]} />
                </span>
                <span className="ml-2 text-xs text-gray-400">{s.response_count.toLocaleString()} response{s.response_count !== 1 ? "s" : ""}</span>
              </div>
              {!s.summary_status ? (
                <PrimaryButton onClick={() => onOpenSurveyIntelligence(s.evidence_id)}>Generate Intelligence →</PrimaryButton>
              ) : (
                <SecondaryButton onClick={() => onOpenSurveyIntelligence(s.evidence_id)}>Review Findings →</SecondaryButton>
              )}
            </div>
          );
        })}

        {conversationSearches.map(cs => {
          const statusMeta = INTELLIGENCE_STATUS_META[cs.summary_status ?? "not_started"];
          return (
            <div key={cs.evidence_id} className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded inline-block mb-1">{SOURCE_BADGE.social_search}</span>
                {isSimulated && <span className="ml-1"><SimulatedBadge size="xs" /></span>}
                <p className="text-sm font-medium text-gray-800 truncate">{cs.name}</p>
                <span className="inline-block mt-1">
                  <StatusBadge label={statusMeta.label} tone={INTELLIGENCE_STATUS_TONE[cs.summary_status ?? "not_started"]} />
                </span>
                <span className="ml-2 text-xs text-gray-400">{cs.mention_count.toLocaleString()} mention{cs.mention_count !== 1 ? "s" : ""}</span>
              </div>
              {!cs.summary_status ? (
                <PrimaryButton onClick={() => onOpenConversationIntelligence(cs.evidence_id)}>Generate Intelligence →</PrimaryButton>
              ) : (
                <SecondaryButton onClick={() => onOpenConversationIntelligence(cs.evidence_id)}>Review Findings →</SecondaryButton>
              )}
            </div>
          );
        })}

        {documents.map(d => {
          const statusMeta = INTELLIGENCE_STATUS_META[d.summary_status ?? "not_started"];
          const notApproved = d.library_status !== "approved";
          return (
            <div key={d.evidence_row_id} className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded inline-block mb-1">{SOURCE_BADGE.document}</span>
                {isSimulated && <span className="ml-1"><SimulatedBadge size="xs" /></span>}
                <p className="text-sm font-medium text-gray-800 truncate">{d.name}</p>
                <span className="inline-block mt-1">
                  <StatusBadge label={statusMeta.label} tone={INTELLIGENCE_STATUS_TONE[d.summary_status ?? "not_started"]} />
                </span>
                {notApproved && <span className="ml-2 text-xs text-amber-600">Awaiting Research Library approval</span>}
              </div>
              {!d.summary_status ? (
                <PrimaryButton onClick={() => onOpenDocumentIntelligence(d.evidence_row_id)} disabled={notApproved} title={notApproved ? "Approve this document's analysis in the Research Library first." : ""}>
                  Generate Intelligence →
                </PrimaryButton>
              ) : (
                <SecondaryButton onClick={() => onOpenDocumentIntelligence(d.evidence_row_id)}>Review Findings →</SecondaryButton>
              )}
            </div>
          );
        })}

        {surveys.length === 0 && (
          <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3 opacity-50">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded inline-block mb-1">{SOURCE_BADGE.survey}</span>
              <p className="text-sm text-gray-500">Attach a survey in Research Sources to unlock this.</p>
            </div>
          </div>
        )}

        {["Industry Intelligence", "Trend Intelligence", "Audience Intelligence"].map(name => (
          <div key={name} className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3 opacity-50">
            <p className="text-sm font-medium text-gray-500">{name}</p>
            <StatusBadge label="Coming Soon" tone="neutral" />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
