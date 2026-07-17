"use client";

// Every attached Research Source, each its own mini-workspace card
// (SourceWorkspaceCard), collapsed to a compact summary by default and
// independently expandable — a project can have any number of Surveys and
// Conversation Searches now (Phase 1 of the multi-source correction), so
// the page can't render every one fully expanded.
//
// Campaigns are not an independent Research Source: every campaign deploys
// one specific Survey, so each Survey's own Campaigns workspace (Research
// Target, Creative Design, and the campaigns themselves, filtered to that
// survey only) lives nested inside that Survey's own card — never in a
// flat project-level block, and never showing another survey's campaigns.
// "Campaign Groups" (organizing a survey's own campaigns by publisher/
// market/audience/wave) is the next phase — for now this nests the
// existing campaigns rows directly, filtered by effective_survey_id.
import { useState } from "react";
import { SectionCard, EmptyState, InfoContent } from "@/app/components/research-projects/Shell";
import { SourceWorkspaceCard, deriveCollectionStatus, type CollectionStatus } from "@/app/components/research-projects/SourceWorkspaceCard";
import { DocumentPipeline } from "@/app/components/research-projects/document-status";
import { documentTypeLabel } from "@/lib/library-documents/constants";
import { PrimaryButton, SecondaryButton } from "@/app/components/research-projects/ActionPrimitives";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { CampaignsManager } from "@/app/components/campaigns/CampaignsManager";
import type { Campaign } from "@/app/components/campaigns/types";
import { TARGET_REACHED_LABEL } from "@/app/components/research-projects/constants";
import { CreativeDesignPicker } from "@/app/components/CreativeDesignPicker";
import { CreativeDesignPreview } from "@/app/components/CreativeDesignPreview";
import { useCreativeDesignNames } from "@/lib/creative-designs";
import { useEstimatedProgress } from "@/lib/intelligence/useEstimatedProgress";

type Org = { id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" };

type RunStatus = "not_started" | "generating" | "ready" | "failed";

type SurveyItem = {
  evidence_row_id: string;
  evidence_id: string;
  name: string;
  question_count: number;
  completed_languages: unknown[];
  brand_name: string | null;
  agency_name: string | null;
  response_count: number;
  target_responses: number | null;
  creative_design: string | null;
  target_reached_action: string | null;
  run_status: RunStatus;
  run_error: string | null;
};

type DocumentItem = {
  evidence_row_id: string;
  evidence_id: string;
  name: string;
  document_type: string;
  library_status: string;
  page_count: number | null;
};

type ConversationSearchItem = {
  id: string;
  evidence_row_id: string;
  evidence_id: string;
  name: string;
  status: string;
  markets: string[];
  platforms: string[];
  mention_count: number;
  positive_pct: number;
  neutral_pct: number;
  negative_pct: number;
  reddit_last_collected_at: string | null;
  run_status: RunStatus;
  run_error: string | null;
};

// "Run Research" (migration 095, Product Walkthrough only) — button while
// not started, animated-but-capped progress while generating (never
// reaches 100% on its own; only a server-confirmed "ready" does that),
// Failed+Retry otherwise. Shared between Survey and Conversation Search
// cards so the two states/behaviours can't drift apart.
function RunResearchControl({
  runStatus, runError, canRun, disabledReason, onRun,
}: {
  runStatus: RunStatus;
  runError: string | null;
  canRun: boolean;
  disabledReason: string;
  onRun: () => Promise<void>;
}) {
  const [starting, setStarting] = useState(false);

  async function handleClick() {
    setStarting(true);
    await onRun();
    setStarting(false);
  }

  if (runStatus === "ready" || runStatus === "generating") return null;

  if (runStatus === "failed") {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          disabled={starting}
          className="text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg disabled:opacity-50 whitespace-nowrap"
        >
          {starting ? "Retrying…" : "Retry"}
        </button>
        {runError && <span className="text-xs text-red-500 truncate max-w-[16rem]" title={runError}>{runError}</span>}
      </div>
    );
  }

  return (
    <PrimaryButton onClick={handleClick} disabled={!canRun || starting} title={canRun ? "" : disabledReason}>
      {starting ? "Starting…" : "Run Research"}
    </PrimaryButton>
  );
}

function SurveyCard({
  s, projectId, isSimulated, isProductWalkthrough, canManage,
  collapsed, onToggleCollapse,
  campaigns, deletedCampaigns, orgs, loading, loadingDeletedCampaigns, isLockedByAdminFor,
  onLoadDeletedCampaigns, onReloadCampaigns, onEditCampaign,
  onCreateCampaign, onCreateMultipleCampaigns, onRemoveSurveyEvidence,
  onSaveResearchTarget, onSaveCreativeDesign, onRunResearch,
}: {
  s: SurveyItem;
  projectId: string;
  isSimulated: boolean;
  isProductWalkthrough: boolean;
  canManage: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  campaigns: Campaign[];
  deletedCampaigns: Campaign[];
  orgs: Org[];
  loading: boolean;
  loadingDeletedCampaigns: boolean;
  isLockedByAdminFor: (c: Campaign) => boolean;
  onLoadDeletedCampaigns: () => void;
  onReloadCampaigns: () => void;
  onEditCampaign: (c: Campaign) => void;
  onCreateCampaign: (evidenceId: string) => void;
  onCreateMultipleCampaigns: (evidenceId: string) => void;
  onRemoveSurveyEvidence: (evidenceId: string) => void;
  onSaveResearchTarget: (evidenceId: string, targetResponses: number | null, targetReachedAction: string) => Promise<{ ok: boolean; error?: string }>;
  onSaveCreativeDesign: (evidenceId: string, design: string | null) => Promise<{ ok: boolean; error?: string }>;
  onRunResearch: (evidenceRowId: string) => Promise<void>;
}) {
  const [editingTarget, setEditingTarget] = useState(false);
  const [draftTarget, setDraftTarget] = useState<number | null>(s.target_responses);
  const [draftAction, setDraftAction] = useState<string>(s.target_reached_action ?? "pause");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openEdit() {
    setDraftTarget(s.target_responses);
    setDraftAction(s.target_reached_action ?? "pause");
    setError("");
    setEditingTarget(true);
  }

  async function save() {
    setSaving(true); setError("");
    const result = await onSaveResearchTarget(s.evidence_id, draftTarget, draftAction);
    setSaving(false);
    if (!result.ok) { setError(result.error ?? "Failed to save."); return; }
    setEditingTarget(false);
  }

  const [editingDesign, setEditingDesign] = useState(false);
  const [draftDesign, setDraftDesign] = useState<string | null>(s.creative_design);
  const [savingDesign, setSavingDesign] = useState(false);
  const [designError, setDesignError] = useState("");
  const designNames = useCreativeDesignNames();

  function openDesignEdit() {
    setDraftDesign(s.creative_design);
    setDesignError("");
    setEditingDesign(true);
  }

  async function saveDesign() {
    setSavingDesign(true); setDesignError("");
    const result = await onSaveCreativeDesign(s.evidence_id, draftDesign);
    setSavingDesign(false);
    if (!result.ok) { setDesignError(result.error ?? "Failed to save."); return; }
    setEditingDesign(false);
  }

  const itemCampaigns = campaigns.filter(c => c.effective_survey_id === s.evidence_id);
  const itemDeletedCampaigns = deletedCampaigns.filter(c => c.effective_survey_id === s.evidence_id);

  // "Run Research" (migration 095) — Product Walkthrough only. The fake
  // fill climbs toward ~96% while generating and is capped there —
  // completion is only ever recognized via s.run_status === "ready"
  // (server-confirmed), never inferred from this animation or from counts
  // alone (counts can exist after a partial/failed run).
  const showRunResearch = isSimulated && isProductWalkthrough;
  const hasLiveCampaign = itemCampaigns.some(c => c.effective_status === "live");
  const { pct: estimatedPct } = useEstimatedProgress(s.run_status === "generating", 6000);
  const displayCurrent = s.run_status === "generating"
    ? Math.round((estimatedPct / 100) * (s.target_responses ?? 0))
    : s.response_count;
  // A completed run (s.run_status === "ready") is always "Target Reached" —
  // the run's own status is the completion authority, never re-derived from
  // counts against a target (a target could be unset/changed after the run
  // completed, and a Conversation Search's mentionTarget in particular is
  // often null, which would otherwise make deriveCollectionStatus report
  // "Not Started" forever despite mentions genuinely having landed).
  const status: CollectionStatus = s.run_status === "generating"
    ? "generating"
    : s.run_status === "failed"
      ? "failed"
      : s.run_status === "ready"
        ? "target_reached"
        : deriveCollectionStatus(s.response_count, s.target_responses);

  return (
    <SourceWorkspaceCard
      badge="Survey"
      simulatedBadge={isSimulated && <SimulatedBadge size="xs" />}
      title={s.name}
      subtitle={[
        `${s.question_count} question${s.question_count !== 1 ? "s" : ""}`,
        s.completed_languages.length ? `${s.completed_languages.length} language${s.completed_languages.length !== 1 ? "s" : ""}` : null,
        s.brand_name,
        s.agency_name,
      ].filter(Boolean).join(" · ") || undefined}
      status={status}
      target={s.target_responses}
      current={displayCurrent}
      unitLabel="response"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      collapsedMeta={<span>{itemCampaigns.length} campaign{itemCampaigns.length !== 1 ? "s" : ""}</span>}
      openAction={
        <SecondaryButton href={`/survey-templates?openSurvey=${s.evidence_id}&returnTo=${projectId}`}>
          Open
        </SecondaryButton>
      }
      runAction={showRunResearch && (
        <RunResearchControl
          runStatus={s.run_status}
          runError={s.run_error}
          canRun={!!s.target_responses && hasLiveCampaign}
          disabledReason={!s.target_responses ? "Set a Research Target first." : "This survey needs a live campaign before you can run research."}
          onRun={() => onRunResearch(s.evidence_row_id)}
        />
      )}
      secondaryAction={canManage && (
        <button
          onClick={() => onRemoveSurveyEvidence(s.evidence_id)}
          disabled={itemCampaigns.length > 0}
          title={itemCampaigns.length > 0 ? "This survey is used by one or more deployments, remove or reassign them first." : ""}
          className="text-xs text-red-400 hover:text-red-500 hover:underline disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline whitespace-nowrap"
        >
          Remove from Project
        </button>
      )}
    >
      {/* Research Target — this survey's own goal, every campaign nested
          below contributes toward it. Survey-scoped (migration 094), not
          project-level, a project with multiple surveys can have a
          different target for each. */}
      <div className="border-t border-gray-100 pt-3 mt-1">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Research Target</p>
          {canManage && !editingTarget && (
            <SecondaryButton onClick={openEdit}>Edit</SecondaryButton>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm mb-1">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Target</p>
            {editingTarget ? (
              <input type="number" min={1} value={draftTarget ?? ""} onChange={e => setDraftTarget(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" placeholder="e.g. 5000" />
            ) : (
              <p className="text-gray-700">{s.target_responses ? s.target_responses.toLocaleString() : "Not set"}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">When Target Reached</p>
            {editingTarget ? (
              <select value={draftAction} onChange={e => setDraftAction(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]">
                <option value="none">Continue collecting responses</option>
                <option value="pause">Pause this survey&apos;s campaigns (recommended)</option>
                <option value="close">Close this survey&apos;s campaigns</option>
              </select>
            ) : (
              <p className="text-gray-700">{TARGET_REACHED_LABEL[s.target_reached_action ?? "none"]}</p>
            )}
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        {editingTarget && (
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setEditingTarget(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancel</button>
            <button onClick={save} disabled={saving}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
              style={{ background: "#0B1929", color: "#D7B87A" }}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* Creative Design — this survey's own default, mirroring Research
          Target above. Survey-scoped (migration 094). */}
      <div className="border-t border-gray-100 pt-3 mt-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Creative Design</p>
          {canManage && !editingDesign && (
            <SecondaryButton onClick={openDesignEdit}>Edit</SecondaryButton>
          )}
        </div>
        {editingDesign ? (
          <>
            <CreativeDesignPicker value={draftDesign} onChange={setDraftDesign} />
            <CreativeDesignPreview designId={draftDesign} />
          </>
        ) : (
          <p className="text-sm text-gray-700">{designNames[s.creative_design ?? ""] ?? "Fanometrix Default"}</p>
        )}
        {designError && <p className="text-xs text-red-500 mt-2">{designError}</p>}
        {editingDesign && (
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setEditingDesign(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancel</button>
            <button onClick={saveDesign} disabled={savingDesign}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
              style={{ background: "#0B1929", color: "#D7B87A" }}>
              {savingDesign ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* Campaigns — this Survey's own deployments only, never another
          survey's. "Campaign Groups" (organizing these by publisher/
          market/audience/wave) is the next phase; for now this is the
          existing campaigns rows, filtered to effective_survey_id ===
          this survey. */}
      <div className="border-t border-gray-100 pt-3 mt-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Campaigns</p>
          {canManage && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCreateCampaign(s.evidence_id)}
                className="text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 px-2.5 py-1 rounded-lg transition-colors"
              >
                + Create Campaign
              </button>
              <button
                onClick={() => onCreateMultipleCampaigns(s.evidence_id)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                style={{ background: "#D7B87A", color: "#0B1929" }}
              >
                + Create Multiple
              </button>
            </div>
          )}
        </div>
        <CampaignsManager
          campaigns={itemCampaigns}
          deletedCampaigns={itemDeletedCampaigns}
          orgs={orgs}
          loading={loading}
          loadingDeleted={loadingDeletedCampaigns}
          isLockedByAdminFor={isLockedByAdminFor}
          onLoadDeletedRequested={onLoadDeletedCampaigns}
          onReload={onReloadCampaigns}
          onEditCampaign={onEditCampaign}
          researchProjectId={projectId}
          paginate
          hideSummaryLine
        />
      </div>
    </SourceWorkspaceCard>
  );
}

function ConversationSearchCard({
  cs, projectId, isSimulated, isProductWalkthrough, canManage, mentionTarget,
  collapsed, onToggleCollapse, onRemoveConversationSearchEvidence, onRunResearch, formatRelativeTime,
}: {
  cs: ConversationSearchItem;
  projectId: string;
  isSimulated: boolean;
  isProductWalkthrough: boolean;
  canManage: boolean;
  mentionTarget: number | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRemoveConversationSearchEvidence: (evidenceId: string) => void;
  onRunResearch: (evidenceRowId: string) => Promise<void>;
  formatRelativeTime: (iso: string) => string;
}) {
  // "Run Research" (migration 095) — Product Walkthrough only. Same
  // treatment as SurveyCard: fake fill capped below 100%, completion only
  // ever recognized via cs.run_status === "ready".
  const showRunResearch = isSimulated && isProductWalkthrough;
  const { pct: estimatedPct } = useEstimatedProgress(cs.run_status === "generating", 6000);
  const displayCurrent = cs.run_status === "generating"
    ? Math.round((estimatedPct / 100) * (mentionTarget ?? 0))
    : cs.mention_count;
  // A completed run is always "Target Reached" regardless of mentionTarget
  // — Conversation Search usually has no configured target at all (no
  // per-search target field exists yet, unlike Survey's), which would
  // otherwise make deriveCollectionStatus report "Not Started" forever
  // despite mentions having genuinely landed. The run's own status is the
  // completion authority, matching the same fix on SurveyCard above.
  const status: CollectionStatus = cs.run_status === "generating"
    ? "generating"
    : cs.run_status === "failed"
      ? "failed"
      : cs.run_status === "ready"
        ? "target_reached"
        : deriveCollectionStatus(cs.mention_count, mentionTarget);

  return (
    <SourceWorkspaceCard
      badge="Conversation Search"
      simulatedBadge={isSimulated && <SimulatedBadge size="xs" />}
      title={cs.name}
      subtitle={[
        cs.markets.length > 0 ? `Markets: ${cs.markets.join(" · ")}` : null,
        cs.platforms.length > 0 ? `Platforms: ${cs.platforms.join(" · ")}` : null,
      ].filter(Boolean).join(" · ") || undefined}
      status={status}
      target={mentionTarget}
      current={displayCurrent}
      unitLabel="mention"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      openAction={
        <SecondaryButton href={`/social-listening/searches/${cs.evidence_id}?returnTo=${projectId}`}>
          Open
        </SecondaryButton>
      }
      runAction={showRunResearch ? (
        <RunResearchControl
          runStatus={cs.run_status}
          runError={cs.run_error}
          canRun={cs.status === "Active"}
          disabledReason="This conversation search needs to be Active before you can run research."
          onRun={() => onRunResearch(cs.evidence_row_id)}
        />
      ) : (
        <SecondaryButton href={`/social-listening/searches/${cs.evidence_id}?returnTo=${projectId}`}>
          Manage Collection →
        </SecondaryButton>
      )}
      secondaryAction={canManage && (
        <button
          onClick={() => onRemoveConversationSearchEvidence(cs.evidence_id)}
          className="text-xs text-red-400 hover:text-red-500 hover:underline whitespace-nowrap"
        >
          Remove from Project
        </button>
      )}
    >
      <p className="text-xs text-gray-400">
        {cs.reddit_last_collected_at ? `Last collected ${formatRelativeTime(cs.reddit_last_collected_at)}` : "Not collected yet"}
        {cs.mention_count > 0 && <> · {cs.positive_pct}% Positive · {cs.neutral_pct}% Neutral · {cs.negative_pct}% Negative</>}
      </p>
    </SourceWorkspaceCard>
  );
}

const DOCUMENT_LIBRARY_STATUS_TO_COLLECTION_STATUS: Record<string, CollectionStatus> = {
  uploaded: "collecting",
  extracting: "collecting",
  analysing: "generating",
  pending_review: "collecting",
  approved: "target_reached",
  failed: "failed",
};

// Documents have no "Run Research"/campaigns concept — a static uploaded
// asset, not a live collection process — so this is deliberately much
// simpler than SurveyCard/ConversationSearchCard: no run action, no
// numeric target/current (library_status alone drives the status badge).
function DocumentCard({
  d, canManage, collapsed, onToggleCollapse, onRemoveDocumentEvidence,
}: {
  d: DocumentItem;
  canManage: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onRemoveDocumentEvidence: (evidenceId: string) => void;
}) {
  const status = DOCUMENT_LIBRARY_STATUS_TO_COLLECTION_STATUS[d.library_status] ?? "not_started";
  const typeLabel = documentTypeLabel(d.document_type);
  return (
    <SourceWorkspaceCard
      badge="Document"
      title={d.name}
      subtitle={[typeLabel, d.page_count ? `${d.page_count} page${d.page_count !== 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || undefined}
      status={status}
      target={null}
      current={null}
      unitLabel="page"
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      openAction={
        <SecondaryButton href={`/research-library/${d.evidence_id}`}>Open in Library</SecondaryButton>
      }
      secondaryAction={canManage && (
        <button
          onClick={() => onRemoveDocumentEvidence(d.evidence_id)}
          className="text-xs text-red-400 hover:text-red-500 hover:underline whitespace-nowrap"
        >
          Remove from Project
        </button>
      )}
    >
      {/* Document processing is the Execution stage for this evidence type:
          preparing an uploaded file (text extraction, AI understanding) so
          Analysis can interpret it. The pipeline runs automatically. */}
      {d.library_status === "failed" ? (
        <p className="text-xs" style={{ color: "#B4694C" }}>Processing failed. The document couldn&apos;t be read or analysed.</p>
      ) : d.library_status === "approved" ? (
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Ready. Processed and available for Analysis.</p>
      ) : (
        <div>
          <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>Preparing this document automatically:</p>
          <DocumentPipeline status={d.library_status} />
        </div>
      )}
    </SourceWorkspaceCard>
  );
}

export function ResearchSourcesSection({
  projectId, isSimulated, isProductWalkthrough, canManage,
  hasAnyEvidence, evidenceSummary,
  surveys,
  conversationSearches, mentionTarget,
  documents,
  campaigns, deletedCampaigns, orgs, loading, loadingDeletedCampaigns, isLockedByAdminFor,
  expandedIds, onToggleExpand,
  onAddResearchSource, onLoadDeletedCampaigns, onReloadCampaigns, onEditCampaign,
  onCreateCampaign, onCreateMultipleCampaigns, onRemoveSurveyEvidence, onRemoveConversationSearchEvidence,
  onRemoveDocumentEvidence,
  onSaveResearchTarget, onSaveCreativeDesign, onRunResearch, formatRelativeTime,
  groupByType = false,
}: {
  projectId: string;
  isSimulated: boolean;
  // Gates "Run Research" — only true when this Workspace is rendered as
  // the actual Product Walkthrough experience (presentModeEnabled on
  // WorkspaceBody), never merely because the project happens to be
  // simulated (e.g. opened directly at /research-projects/[id]).
  isProductWalkthrough: boolean;
  canManage: boolean;
  hasAnyEvidence: boolean;
  evidenceSummary: React.ReactNode;
  surveys: SurveyItem[];
  conversationSearches: ConversationSearchItem[];
  mentionTarget: number | null;
  documents: DocumentItem[];
  campaigns: Campaign[];
  deletedCampaigns: Campaign[];
  orgs: Org[];
  loading: boolean;
  loadingDeletedCampaigns: boolean;
  isLockedByAdminFor: (c: Campaign) => boolean;
  /** Independently-managed expand state — every source's own id, not a
   * single accordion — owned by WorkspaceBody so it can also drive
   * auto-expand-on-create/deep-link later without this section knowing. */
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onAddResearchSource: () => void;
  onLoadDeletedCampaigns: () => void;
  onReloadCampaigns: () => void;
  onEditCampaign: (c: Campaign) => void;
  onCreateCampaign: (evidenceId: string) => void;
  onCreateMultipleCampaigns: (evidenceId: string) => void;
  onRemoveSurveyEvidence: (evidenceId: string) => void;
  onRemoveConversationSearchEvidence: (evidenceId: string) => void;
  onRemoveDocumentEvidence: (evidenceId: string) => void;
  onSaveResearchTarget: (evidenceId: string, targetResponses: number | null, targetReachedAction: string) => Promise<{ ok: boolean; error?: string }>;
  onSaveCreativeDesign: (evidenceId: string, design: string | null) => Promise<{ ok: boolean; error?: string }>;
  onRunResearch: (evidenceRowId: string) => Promise<void>;
  formatRelativeTime: (iso: string) => string;
  /** Research-Project opt-in: group the three source types under clear
   * per-type headings ("Surveys", "Conversation Searches", "Industry
   * Research") instead of one flat list. Defaults to false so Product
   * Walkthrough (which does not pass it) renders exactly as before. */
  groupByType?: boolean;
}) {
  const surveyCards = surveys.map(s => (
    <SurveyCard
      key={s.evidence_id}
      s={s}
      projectId={projectId}
      isSimulated={isSimulated}
      isProductWalkthrough={isProductWalkthrough}
      canManage={canManage}
      collapsed={!expandedIds.has(s.evidence_id)}
      onToggleCollapse={() => onToggleExpand(s.evidence_id)}
      campaigns={campaigns}
      deletedCampaigns={deletedCampaigns}
      orgs={orgs}
      loading={loading}
      loadingDeletedCampaigns={loadingDeletedCampaigns}
      isLockedByAdminFor={isLockedByAdminFor}
      onLoadDeletedCampaigns={onLoadDeletedCampaigns}
      onReloadCampaigns={onReloadCampaigns}
      onEditCampaign={onEditCampaign}
      onCreateCampaign={onCreateCampaign}
      onCreateMultipleCampaigns={onCreateMultipleCampaigns}
      onRemoveSurveyEvidence={onRemoveSurveyEvidence}
      onSaveResearchTarget={onSaveResearchTarget}
      onSaveCreativeDesign={onSaveCreativeDesign}
      onRunResearch={onRunResearch}
    />
  ));
  const searchCards = conversationSearches.map(cs => (
    <ConversationSearchCard
      key={cs.id}
      cs={cs}
      projectId={projectId}
      isSimulated={isSimulated}
      isProductWalkthrough={isProductWalkthrough}
      canManage={canManage}
      mentionTarget={mentionTarget}
      collapsed={!expandedIds.has(cs.evidence_id)}
      onToggleCollapse={() => onToggleExpand(cs.evidence_id)}
      onRemoveConversationSearchEvidence={onRemoveConversationSearchEvidence}
      onRunResearch={onRunResearch}
      formatRelativeTime={formatRelativeTime}
    />
  ));
  const documentCards = documents.map(d => (
    <DocumentCard
      key={d.evidence_row_id}
      d={d}
      canManage={canManage}
      collapsed={!expandedIds.has(d.evidence_id)}
      onToggleCollapse={() => onToggleExpand(d.evidence_id)}
      onRemoveDocumentEvidence={onRemoveDocumentEvidence}
    />
  ));

  return (
    <SectionCard
      id="evidence"
      title="Research Sources"
      info={
        <InfoContent title="Every source feeding this project.">
          <p>Survey, Conversation Search and Document today, with more evidence types to come. Each source is its own collapsible mini-workspace: configuration, target, progress, status, and the actions to run collection or open it.</p>
          <p className="mt-1.5">Add Research Source to create a brand-new one, or attach one that already exists, a project can hold multiple of the same type.</p>
        </InfoContent>
      }
      summary={evidenceSummary}
      cta={canManage && (
        <PrimaryButton onClick={onAddResearchSource}>+ Add Research Source</PrimaryButton>
      )}
    >
      {!hasAnyEvidence ? (
        <EmptyState>No research sources attached to this research project yet, add one to start collecting evidence.</EmptyState>
      ) : groupByType ? (
        // Research-Project view: one clearly-labelled group per source type, so
        // it reads at a glance what evidence has been attached. Only source
        // types that actually exist are shown. Campaigns stay nested inside
        // their survey card; Campaign Groups remain their own separate section.
        <div className="space-y-5">
          {surveys.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Surveys <span className="text-gray-400 font-normal">({surveys.length})</span></h3>
              <div className="space-y-3">{surveyCards}</div>
            </div>
          )}
          {conversationSearches.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Conversation Searches <span className="text-gray-400 font-normal">({conversationSearches.length})</span></h3>
              <div className="space-y-3">{searchCards}</div>
            </div>
          )}
          {documents.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Industry Research <span className="text-gray-400 font-normal">({documents.length})</span></h3>
              <div className="space-y-3">{documentCards}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {surveyCards}
          {searchCards}
          {documentCards}
        </div>
      )}
    </SectionCard>
  );
}
