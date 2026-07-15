"use client";

// The Research Project Workspace — the central workspace of the platform,
// following the research methodology: Research Question → Dashboard →
// Research Sources → Intelligence → Report → Conclusion → Knowledge.
// "Research Sources" and "Intelligence" are this Workspace's display names
// for what the rest of the codebase still calls Evidence and AI
// Intelligence (types, API routes, DB columns, and the lifecycle stage
// `key`s are unchanged) — purely a first-time-user-facing relabel, not an
// architecture change. Project Information is the single home for every
// project-level fact and setting (including the Research Target and its
// derived Status — never a manual dropdown), Research Sources supports
// attaching an already-existing survey (not just creating new ones), the
// Deployment Wizard always starts at Step 1 rather than guessing where to
// reopen, and Campaigns is a fully operational manager (filters, bulk
// actions, per-card controls) shared with the standalone Campaigns page
// via app/components/campaigns/*.
//
// Extracted into its own component (previously the default export of
// app/research-projects/[id]/page.tsx directly) so both the real Research
// Projects Workspace and Product Walkthrough render the exact same UI —
// see the file-level comment on WorkspaceBody() below for how the split
// works.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { PublisherCountryPicker } from "@/app/components/PublisherCountryPicker";
import { GenerateDeploymentsCard } from "@/app/components/GenerateDeploymentsCard";
import { CreativeDesignPicker } from "@/app/components/CreativeDesignPicker";
import { CreativeDesignPreview } from "@/app/components/CreativeDesignPreview";
import { ResearchProjectEditDrawer, type ResearchProjectBriefFields } from "@/app/components/research-projects/ResearchProjectEditDrawer";
import { AttachExistingSurveyModal } from "@/app/components/research-projects/AttachExistingSurveyModal";
import { AttachExistingConversationSearchModal } from "@/app/components/research-projects/AttachExistingConversationSearchModal";
import { AttachExistingDocumentModal } from "@/app/components/research-projects/AttachExistingDocumentModal";
import type { Campaign } from "@/app/components/campaigns/types";
import { missingLanguageCountries, languageLabel } from "@/lib/survey-language-readiness";
import { expectedSurveyLanguage, LANGUAGE_DISPLAY_NAMES } from "@/lib/locales";
import type { GenerateResult } from "@/lib/generate-deployments";
import { studyTypeLabel } from "@/lib/naming";
import { researchSubjectLabel } from "@/lib/research-subjects";
import type { LangCode } from "@/lib/survey-locale";
import { formatRelativeTime, formatRelativeDay } from "@/lib/format-relative-time";
import { computeLifecycleStages, computeResearchProgress, type StageState } from "@/lib/research-project-lifecycle";
import { computeReportReadiness } from "@/lib/report-readiness";
import { computeProjectStatus, PROJECT_STATUS_META, type ProjectStatus } from "@/lib/research-project-status";
import { SimulatedBanner } from "@/app/components/simulation/SimulatedBanner";
import { SimulatedBadge } from "@/app/components/simulation/SimulatedBadge";
import { SimulationInformationPanel } from "@/app/components/simulation/SimulationInformationPanel";
import { SectionCard, EmptyState, CollapsedSummary, InfoContent } from "@/app/components/research-projects/Shell";
import { StatusBadge, type BadgeTone } from "@/app/components/research-projects/ActionPrimitives";
import { ConclusionSection } from "@/app/components/research-projects/ConclusionSection";
import { KnowledgeSection } from "@/app/components/research-projects/KnowledgeSection";
import { ReportsSection } from "@/app/components/research-projects/ReportsSection";
import { DashboardSection } from "@/app/components/research-projects/DashboardSection";
import { IntelligenceSection } from "@/app/components/research-projects/IntelligenceSection";
import { ResearchSourcesSection } from "@/app/components/research-projects/ResearchSourcesSection";
import { CampaignGroupsSection } from "@/app/components/research-projects/CampaignGroupsSection";
import { getWorkspaceScrollTarget, clearWorkspaceScrollTarget } from "@/lib/workspace-scroll";
import { ProjectProvider, useResearchProject, type ResearchProject, type EvidenceItem, type ActivityRow } from "@/app/components/research-projects/ProjectProvider";

const SURVEY_STATUS_META: Record<string, { label: string; className: string }> = {
  draft:    { label: "Draft",    className: "bg-amber-50 text-amber-700" },
  ready:    { label: "Ready",    className: "bg-green-50 text-green-700" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-500" },
  deleted:  { label: "Deleted",  className: "bg-gray-100 text-gray-400" },
};

const SOCIAL_SEARCH_STATUS_META: Record<string, { label: string; className: string }> = {
  Draft:    { label: "Draft",    className: "bg-amber-50 text-amber-700" },
  Active:   { label: "Active",   className: "bg-green-50 text-green-700" },
  Paused:   { label: "Paused",   className: "bg-amber-50 text-amber-700" },
  Archived: { label: "Archived", className: "bg-gray-100 text-gray-500" },
};

const STAGE_STATE_META: Record<StageState, { icon: string; className: string }> = {
  complete:    { icon: "✓", className: "bg-green-50 text-green-700 border-green-100" },
  in_progress: { icon: "🟡", className: "bg-amber-50 text-amber-700 border-amber-100" },
  not_started: { icon: "⚪", className: "bg-gray-50 text-gray-400 border-gray-100" },
};

const EVIDENCE_TYPE_PLURAL: Record<string, [string, string]> = {
  survey: ["Survey", "Surveys"],
  social_search: ["Conversation Search", "Conversation Searches"],
  document: ["Document", "Documents"],
};

const PROJECT_STATUS_TONE: Record<ProjectStatus, BadgeTone> = {
  draft: "warning", active: "success", complete: "info", archived: "neutral",
};

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const m = PROJECT_STATUS_META[status];
  return <StatusBadge label={m.label} tone={PROJECT_STATUS_TONE[status]} dot={m.dot} size="md" />;
}

type NewEvidenceType =
  | "survey" | "social_search" | "document"
  | "crm" | "ticketing" | "merchandise" | "broadcast" | "attendance"
  | "fantasy_football" | "betting_trends" | "google_trends" | "ai_interviews" | "fan_panels";

// "Add from Research Library" (not "Uploaded Document") — an uploaded
// document's own classification (Industry Report, Strategy Document, Case
// Study, etc., see lib/library-documents/constants.ts's DOCUMENT_TYPES) is
// exactly what a standalone "Industry Report" evidence type would have
// meant, so a separate roadmap entry for it would only restate one of
// Document's own possible classifications as if it were a distinct
// Research Source.
const EVIDENCE_TYPES: { type: NewEvidenceType; label: string; description: string; available: boolean }[] = [
  { type: "survey", label: "Survey", description: "Create a new survey, or attach one that already exists.", available: true },
  { type: "social_search", label: "Conversation Search", description: "Create a new conversation search, or attach one that already exists.", available: true },
  { type: "document", label: "Add from Research Library", description: "Attach a document already in the Research Library — industry report, strategy document, case study and more.", available: true },
  { type: "crm", label: "CRM Data", description: "Customer relationship data.", available: false },
  { type: "ticketing", label: "Ticketing Data", description: "Attendance and purchase data from ticketing platforms.", available: false },
  { type: "merchandise", label: "Merchandise Sales", description: "Retail and merchandise sales data.", available: false },
  { type: "broadcast", label: "Broadcast Data", description: "TV and streaming audience data.", available: false },
  { type: "attendance", label: "Attendance Data", description: "In-stadium and event attendance data.", available: false },
  { type: "fantasy_football", label: "Fantasy Football Data", description: "Fantasy football engagement data.", available: false },
  { type: "betting_trends", label: "Betting Trends", description: "Sports betting market data.", available: false },
  { type: "google_trends", label: "Google Trends", description: "Search interest data.", available: false },
  { type: "ai_interviews", label: "AI Interviews", description: "AI-moderated qualitative interviews.", available: false },
  { type: "fan_panels", label: "Fan Panels", description: "Recurring fan panel research.", available: false },
];

// Evidence Orchestration (displayed as "Research Sources" in this
// Workspace — see the file-level comment above): this is the single entry
// point every future research source will follow — the Research Project
// initiates the specialist workflow, the specialist module executes it,
// and the completed evidence attaches back here automatically (via
// POST /api/research-projects/[id]/evidence). Survey and Conversation
// Search are wired up so far, both offering the same two paths — create
// new, or attach an existing one; the rest are visible placeholders for
// that same pattern.
const SOURCE_CHOICE_COPY: Partial<Record<NewEvidenceType, {
  modalTitle: string; createLabel: string; createDescription: string; attachLabel: string; attachDescription: string; createHref: (projectId: string) => string;
}>> = {
  survey: {
    modalTitle: "Add Survey Research Source",
    createLabel: "Create New Survey", createDescription: "Design a brand-new survey for this research.",
    attachLabel: "Attach Existing Survey", attachDescription: "Reuse a survey already created for another project.",
    createHref: projectId => `/survey-templates?createForProject=${projectId}`,
  },
  social_search: {
    modalTitle: "Add Conversation Search Research Source",
    createLabel: "Create New Search", createDescription: "Set up a brand-new conversation search for this research.",
    attachLabel: "Attach Existing Search", attachDescription: "Reuse a conversation search already created for another project.",
    createHref: projectId => `/social-listening/searches?createForProject=${projectId}`,
  },
};

function AddEvidenceModal({ projectId, onClose, onAttachExisting }: { projectId: string; onClose: () => void; onAttachExisting: (type: NewEvidenceType) => void }) {
  const router = useRouter();
  const [sourceChoiceType, setSourceChoiceType] = useState<NewEvidenceType | null>(null);

  function choose(evidenceType: NewEvidenceType) {
    if (SOURCE_CHOICE_COPY[evidenceType]) { setSourceChoiceType(evidenceType); return; }
    // Document has no "Create New" path (documents are uploaded via the
    // Research Library itself, not authored per-project) — no
    // create/attach sub-choice screen to show, go straight to attaching an
    // existing one.
    if (evidenceType === "document") { onClose(); onAttachExisting(evidenceType); return; }
  }

  if (sourceChoiceType && SOURCE_CHOICE_COPY[sourceChoiceType]) {
    const copy = SOURCE_CHOICE_COPY[sourceChoiceType]!;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <h2 className="font-bold text-gray-900">{copy.modalTitle}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
          <div className="p-4 space-y-2">
            <button
              onClick={() => router.push(copy.createHref(projectId))}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-[#D7B87A] hover:bg-[#D7B87A]/5 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-900">{copy.createLabel}</span>
              <p className="text-xs text-gray-500 mt-0.5">{copy.createDescription}</p>
            </button>
            <button
              onClick={() => { onClose(); onAttachExisting(sourceChoiceType); }}
              className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-[#D7B87A] hover:bg-[#D7B87A]/5 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-900">{copy.attachLabel}</span>
              <p className="text-xs text-gray-500 mt-0.5">{copy.attachDescription}</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-gray-900">Choose Research Source Type</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-2 overflow-y-auto">
          {EVIDENCE_TYPES.map(et => (
            <button
              key={et.type}
              onClick={() => et.available && choose(et.type)}
              disabled={!et.available}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                et.available
                  ? "border-gray-200 hover:border-[#D7B87A] hover:bg-[#D7B87A]/5"
                  : "border-gray-100 opacity-50 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{et.label}</span>
                {!et.available && (
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Coming Soon</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{et.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const WIZARD_STEP_LABEL: Record<"survey" | "targets" | "defaults" | "review" | "generate", string> = {
  survey: "Confirm Survey",
  targets: "Publishers & Markets",
  defaults: "Campaign Defaults",
  review: "Review",
  generate: "Generate Deployments",
};

// The bulk "Generate Deployments" workflow — always 5 steps, always
// starting at Step 1: Confirm Survey → Publishers & Markets → Campaign
// Defaults → Review → Generate Deployments. Never guesses which step to
// reopen on — every step pre-fills from whatever's already saved, so
// re-confirming something already set is a single click, and reopening is
// fast and fully predictable rather than dropping the user into the
// middle of the process. "Campaign Defaults" is a transitional convenience
// for bulk creation, not a permanent architectural concept — long-term,
// every campaign should own its own targets/dates/creative/status
// independently (see the single "Create Campaign" flow, which already
// does exactly that via the Campaigns page).
function DeploymentWizardModal({
  project, presetSurveyId, orgPublishers, orgName, publishersDisabled, publishersHelperText, onClose, onComplete, onNeedEvidence,
}: {
  project: ResearchProject;
  // Set when opened from a specific Survey card's "+ Create Multiple" — that
  // survey is the only one this run can target, so the Confirm Survey step
  // never shows a picker across every attached survey regardless of how
  // many the project has.
  presetSurveyId?: string;
  orgPublishers: { id: string; name: string }[];
  orgName: (id: string) => string;
  publishersDisabled?: boolean;
  publishersHelperText?: string;
  onClose: () => void;
  onComplete: (result: GenerateResult) => void;
  onNeedEvidence: () => void;
}) {
  const surveyEvidence = project.evidence.filter((e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey);

  // Local, refreshable copy — Confirm Survey can change which survey this
  // wizard operates against, which changes completed_languages too, so a
  // fresh GET after that choice keeps every later step accurate.
  const [localProject, setLocalProject] = useState(project);

  const [step, setStep] = useState<"survey" | "targets" | "defaults" | "review" | "generate">("survey");

  const [chosenSurveyId, setChosenSurveyId] = useState<string | null>(presetSurveyId ?? project.survey_id ?? surveyEvidence[0]?.evidence_id ?? null);
  const chosenSurveyEvidence = surveyEvidence.find(e => e.evidence_id === chosenSurveyId) ?? null;
  const [savingEvidenceChoice, setSavingEvidenceChoice] = useState(false);
  const [evidenceChoiceError, setEvidenceChoiceError] = useState("");

  async function continueFromSurvey() {
    if (!chosenSurveyId) return;
    if (chosenSurveyId === localProject.survey_id) { setStep("targets"); return; }
    setSavingEvidenceChoice(true); setEvidenceChoiceError("");
    const res = await fetch(`/api/research-projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey_id: chosenSurveyId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setSavingEvidenceChoice(false);
      setEvidenceChoiceError(json.error ?? "Failed to update which survey these deployments use.");
      return;
    }
    const freshRes = await fetch(`/api/research-projects/${project.id}`);
    const freshJson = await freshRes.json();
    setSavingEvidenceChoice(false);
    setLocalProject(freshJson.data);
    setStep("targets");
  }

  const completedLanguages = localProject.survey?.completed_languages ?? [];

  const [draftPublisherIds, setDraftPublisherIds] = useState<string[]>(project.publisher_org_ids);
  const [draftCountryCodes, setDraftCountryCodes] = useState<string[]>(project.country_codes);
  const [targetsEditing, setTargetsEditing] = useState(draftPublisherIds.length === 0 || draftCountryCodes.length === 0);
  const [savingTargets, setSavingTargets] = useState(false);
  const [targetsError, setTargetsError] = useState("");

  async function continueFromTargets() {
    setSavingTargets(true); setTargetsError("");
    const res = await fetch(`/api/research-projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publisher_org_ids: draftPublisherIds, country_codes: draftCountryCodes }),
    });
    setSavingTargets(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setTargetsError(json.error ?? "Failed to save publishers and countries.");
      return;
    }
    setTargetsEditing(false);
    setLocalProject(p => ({ ...p, publisher_org_ids: draftPublisherIds, country_codes: draftCountryCodes }));
    setStep("defaults");
  }

  // Campaign Defaults — operational settings for the campaigns this
  // wizard is about to bulk-create. Start/end date, status and description
  // stay project-level (Campaign Groups territory, next phase). Research
  // Target and Creative Design are survey-owned (migration 094) — read from
  // and saved back to the chosen survey's own research_project_evidence
  // row, not the project, since each attached survey can have its own.
  const [draftTargetResponses, setDraftTargetResponses] = useState<number | null>(chosenSurveyEvidence?.survey.target_responses ?? null);
  const [draftStartDate, setDraftStartDate] = useState<string | null>(project.start_date);
  const [draftEndDate, setDraftEndDate] = useState<string | null>(project.end_date);
  const [draftStatus, setDraftStatus] = useState<string>(project.status ?? "draft");
  const [draftCreativeDesign, setDraftCreativeDesign] = useState<string | null>(chosenSurveyEvidence?.survey.creative_design ?? null);
  const [draftDescription, setDraftDescription] = useState<string | null>(project.description);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsError, setDefaultsError] = useState("");

  async function continueFromDefaults() {
    if (draftStartDate && draftEndDate && draftStartDate > draftEndDate) {
      setDefaultsError("End date must be on or after the start date.");
      return;
    }
    setSavingDefaults(true); setDefaultsError("");
    const [projectRes, evidenceRes] = await Promise.all([
      fetch(`/api/research-projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: draftStartDate, end_date: draftEndDate, status: draftStatus, description: draftDescription }),
      }),
      fetch(`/api/research-projects/${project.id}/evidence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidence_id: chosenSurveyId, target_responses: draftTargetResponses, creative_design: draftCreativeDesign }),
      }),
    ]);
    setSavingDefaults(false);
    if (!projectRes.ok || !evidenceRes.ok) {
      const json = await (!projectRes.ok ? projectRes : evidenceRes).json().catch(() => ({}));
      setDefaultsError(json.error ?? "Failed to save campaign defaults.");
      return;
    }
    setLocalProject(p => ({
      ...p, start_date: draftStartDate, end_date: draftEndDate, status: draftStatus, description: draftDescription,
      evidence: p.evidence.map(e => e.evidence_id === chosenSurveyId && e.survey
        ? { ...e, survey: { ...e.survey, target_responses: draftTargetResponses, creative_design: draftCreativeDesign } }
        : e),
    }));
    setStep("review");
  }

  const readinessMismatches = missingLanguageCountries(completedLanguages, draftCountryCodes);
  const chosenSurveyName = surveyEvidence.find(e => e.evidence_id === chosenSurveyId)?.survey?.name ?? localProject.survey?.name ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Create Multiple Campaigns</h2>
            <p className="text-xs text-gray-400 mt-0.5">{WIZARD_STEP_LABEL[step]}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto">
          {step === "survey" && (
            <div className="p-6 space-y-4">
              {surveyEvidence.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
                  <p className="text-sm font-semibold text-amber-700">No research sources attached yet</p>
                  <p className="text-sm text-amber-700">Add a survey in Research Sources before generating deployments.</p>
                  <button onClick={onNeedEvidence} className="text-xs font-semibold underline text-amber-800">Add Research Source →</button>
                </div>
              ) : presetSurveyId || surveyEvidence.length === 1 ? (
                <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                  <p className="text-sm text-gray-700">Using: <strong>{chosenSurveyEvidence?.survey.name ?? surveyEvidence[0].survey.name}</strong></p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600">Which survey should these deployments use?</p>
                  {surveyEvidence.map(item => (
                    <label key={item.id} className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50">
                      <input type="radio" checked={chosenSurveyId === item.evidence_id} onChange={() => setChosenSurveyId(item.evidence_id)} />
                      <span className="text-sm text-gray-800">{item.survey.name}</span>
                    </label>
                  ))}
                </div>
              )}
              {evidenceChoiceError && <p className="text-xs text-red-500">{evidenceChoiceError}</p>}
              {surveyEvidence.length > 0 && (
                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={continueFromSurvey}
                    disabled={savingEvidenceChoice || !chosenSurveyId}
                    className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "#0B1929", color: "#D7B87A" }}
                  >
                    {savingEvidenceChoice ? "Saving…" : "Continue →"}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === "targets" && (
            <div className="p-6 space-y-4">
              {!targetsEditing ? (
                <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                  <p className="text-sm text-gray-700">
                    Publishers: <strong>{draftPublisherIds.length}</strong> · Countries: <strong>{draftCountryCodes.length}</strong>
                  </p>
                  <button onClick={() => setTargetsEditing(true)} className="text-xs font-semibold text-[#0B1929] underline">Edit</button>
                </div>
              ) : (
                <PublisherCountryPicker
                  publisherOptions={orgPublishers}
                  publisherOrgIds={draftPublisherIds}
                  onPublisherOrgIdsChange={setDraftPublisherIds}
                  publishersDisabled={publishersDisabled}
                  publishersHelperText={publishersHelperText}
                  countryCodes={draftCountryCodes}
                  onCountryCodesChange={setDraftCountryCodes}
                  orgName={orgName}
                />
              )}

              {draftCountryCodes.length > 0 && (() => {
                const relevantLanguages = Array.from(new Set(draftCountryCodes.map(expectedSurveyLanguage)));
                const targetsMismatches = missingLanguageCountries(completedLanguages, draftCountryCodes);
                return (
                  <div className="space-y-3">
                    <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Survey Languages</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {relevantLanguages.map(lang => (
                          <span key={lang} className="text-sm text-gray-700">
                            {completedLanguages.includes(lang as LangCode) ? "✅" : "❌"} {LANGUAGE_DISPLAY_NAMES[lang] ?? lang}
                          </span>
                        ))}
                      </div>
                    </div>
                    {targetsMismatches.length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        <p className="text-sm font-semibold text-amber-700 mb-1">Some selected countries need a translation</p>
                        <ul className="text-sm text-amber-700 list-disc list-inside">
                          {targetsMismatches.map(({ code, lang }) => (
                            <li key={code}>{code} → {languageLabel(lang)} version required</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              {targetsError && <p className="text-xs text-red-500">{targetsError}</p>}
              <div className="flex items-center justify-between gap-2 pt-2">
                <button onClick={() => setStep("survey")} className="text-sm text-gray-500 px-4 py-2">← Back</button>
                <button
                  onClick={continueFromTargets}
                  disabled={savingTargets || draftPublisherIds.length === 0 || draftCountryCodes.length === 0}
                  className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#0B1929", color: "#D7B87A" }}
                >
                  {savingTargets ? "Saving…" : "Continue →"}
                </button>
              </div>
            </div>
          )}

          {step === "defaults" && (
            <div className="p-6 space-y-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                Applied to every campaign this generates, each can still be adjusted individually afterward from its own Campaign page.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Start Date</label>
                  <input type="date" value={draftStartDate ?? ""} onChange={e => setDraftStartDate(e.target.value || null)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">End Date</label>
                  <input type="date" value={draftEndDate ?? ""} min={draftStartDate ?? undefined} onChange={e => setDraftEndDate(e.target.value || null)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Research Target</label>
                <input type="number" min={1} value={draftTargetResponses ?? ""} onChange={e => setDraftTargetResponses(e.target.value ? Number(e.target.value) : null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]" placeholder="e.g. 5000 (optional)" />
                <p className="text-xs text-gray-400 mt-1.5">Same value shown in the Campaigns section, editing it here updates that too.</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Campaign Description</label>
                <textarea value={draftDescription ?? ""} onChange={e => setDraftDescription(e.target.value || null)}
                  rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]"
                  placeholder="Optional, applied to every campaign this generates, and can still be overridden individually afterward." />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Initial Status</label>
                <select value={draftStatus} onChange={e => setDraftStatus(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]">
                  {(["draft", "scheduled", "live", "paused", "closed", "archived"] as const).map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">Creative Design</label>
                <CreativeDesignPicker value={draftCreativeDesign} onChange={setDraftCreativeDesign} />
                <CreativeDesignPreview designId={draftCreativeDesign} />
              </div>
              {defaultsError && <p className="text-xs text-red-500">{defaultsError}</p>}
              <div className="flex items-center justify-between gap-2 pt-2">
                <button onClick={() => setStep("targets")} className="text-sm text-gray-500 px-4 py-2">← Back</button>
                <button
                  onClick={continueFromDefaults}
                  disabled={savingDefaults}
                  className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#0B1929", color: "#D7B87A" }}
                >
                  {savingDefaults ? "Saving…" : "Continue →"}
                </button>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 space-y-1 text-sm text-gray-700">
                <p><span className="text-gray-400">Survey </span>{chosenSurveyName}</p>
                <p><span className="text-gray-400">Deployments </span>{draftPublisherIds.length} publisher{draftPublisherIds.length !== 1 ? "s" : ""} × {draftCountryCodes.length} countr{draftCountryCodes.length !== 1 ? "ies" : "y"} = {draftPublisherIds.length * draftCountryCodes.length}</p>
                <p><span className="text-gray-400">Research Target </span>{draftTargetResponses ?? "—"}</p>
                <p><span className="text-gray-400">Dates </span>{draftStartDate ?? "—"} → {draftEndDate ?? "ongoing"}</p>
                <p><span className="text-gray-400">Initial status </span>{draftStatus}</p>
              </div>
              {readinessMismatches.length === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  <p className="text-sm font-semibold text-green-700">✓ This survey covers every selected country&apos;s expected language.</p>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 space-y-2">
                  <p className="text-sm font-semibold text-amber-700">Translations needed before deployment</p>
                  <ul className="text-sm text-amber-700 list-disc list-inside">
                    {readinessMismatches.map(({ code, lang }) => (
                      <li key={code}>{code} → {languageLabel(lang)} version required</li>
                    ))}
                  </ul>
                  <Link href={`/survey-templates?editSurveyForProject=${project.id}`} className="inline-block text-xs font-semibold underline text-amber-800">
                    Add translations →
                  </Link>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-2">
                <button onClick={() => setStep("defaults")} className="text-sm text-gray-500 px-4 py-2">← Back</button>
                <button
                  onClick={() => setStep("generate")}
                  disabled={readinessMismatches.length > 0}
                  title={readinessMismatches.length > 0 ? "Add the missing translation(s) first" : ""}
                  className="text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "#0B1929", color: "#D7B87A" }}
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {step === "generate" && (
            <div className="p-6 space-y-4">
              <GenerateDeploymentsCard
                projectId={project.id}
                publisherOrgIds={draftPublisherIds}
                countryCodes={draftCountryCodes}
                surveyId={localProject.survey_id}
                deploymentCount={project.deployment_count}
                completedLanguages={completedLanguages}
                onGenerated={onComplete}
              />
              <div className="flex items-center justify-between gap-2 pt-2">
                <button onClick={() => setStep("review")} className="text-sm text-gray-500 px-4 py-2">← Back</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Shared by both /research-projects/[id] (presentModeEnabled: false) and
// /product-walkthrough/[id] (presentModeEnabled: true) — one component, one
// set of section bodies. The flag still distinguishes a real Research
// Project from a Product Walkthrough for things like the SimulatedBanner,
// Run Research and the canonical-route redirect below; it no longer drives
// any guided, beat-by-beat presentation UI (removed — a walkthrough is now
// just this same page, browsed normally). See app/research-projects/[id]/
// page.tsx and app/product-walkthrough/[id]/page.tsx.
//
// The exported component is a thin wrapper that mounts the shared data
// layer (ProjectProvider); WorkspaceBodyContent below reads that data
// through useResearchProject() and renders the Workspace itself. The split
// is purely structural — the provider owns the exact fetch/loading/polling
// state this component used to declare inline, with no behavioural change.
export function WorkspaceBody({ projectId, presentModeEnabled }: { projectId: string; presentModeEnabled: boolean }) {
  return (
    <ProjectProvider projectId={projectId}>
      <WorkspaceBodyContent presentModeEnabled={presentModeEnabled} />
    </ProjectProvider>
  );
}

function WorkspaceBodyContent({ presentModeEnabled }: { presentModeEnabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "publisher";
  const isLockedByAdminFor = useCallback((c: Campaign) => c.created_by_admin && !isAdmin, [isAdmin]);

  const {
    projectId: id, project, orgs, campaigns, campaignGroups, deletedCampaigns,
    loadingDeletedCampaigns, loading, error, load, loadDeletedCampaigns,
  } = useResearchProject();

  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [attachExistingOpen, setAttachExistingOpen] = useState(false);
  const [attachExistingSearchOpen, setAttachExistingSearchOpen] = useState(false);
  const [attachExistingDocumentOpen, setAttachExistingDocumentOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPresetSurveyId, setWizardPresetSurveyId] = useState<string | null>(null);
  const [editingBrief, setEditingBrief] = useState<Partial<ResearchProjectBriefFields> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Research Sources' expand/collapse — every source's own id, independently
  // managed (a Set, not a single accordion index) so expanding one never
  // collapses another. Starts empty: every card collapsed by default.
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(new Set());
  const toggleSourceExpanded = useCallback((evidenceId: string) => {
    setExpandedSourceIds(prev => {
      const next = new Set(prev);
      if (next.has(evidenceId)) next.delete(evidenceId); else next.add(evidenceId);
      return next;
    });
  }, []);

  // Project Information — edit mode for the settings subset (Confidentiality,
  // Version). Owner/Created/Last Updated/Status stay permanently read-only —
  // Status is derived, never a manual field.
  const [editingProjectInfo, setEditingProjectInfo] = useState(false);
  const [draftConfidentiality, setDraftConfidentiality] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState<string | null>(null);
  const [savingProjectInfo, setSavingProjectInfo] = useState(false);
  const [projectInfoError, setProjectInfoError] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // One canonical route per research_mode — a simulated project opened at
  // /research-projects/[id] silently hid Run Research (and its polling)
  // with no indication why, since presentModeEnabled there is always
  // false regardless of the project's own mode; a real project opened at
  // /product-walkthrough/[id] would symmetrically be treated as a
  // Product Walkthrough it isn't. Redirects to the correct wrapper page
  // the moment the mismatch is known, rather than rendering the wrong
  // experience for a project's actual mode.
  useEffect(() => {
    if (!project) return;
    // Preserves the #section hash across the redirect — dropping it here
    // is exactly what silently reset scroll to the top when returning from
    // a Survey/Conversation Intelligence, Key Findings or Executive Report
    // page's "← Back to Workspace" link on a simulated project (that link
    // always points at /research-projects/[id]#..., which only reaches the
    // real Product Walkthrough page via this redirect). `scroll: false` on
    // top of that stops Next's own post-navigation scroll-to-top from
    // fighting the hash-scroll effect below once the redirect lands.
    const hash = window.location.hash;
    if (!presentModeEnabled && project.research_mode === "simulated") {
      router.replace(`/product-walkthrough/${id}${hash}`, { scroll: false });
    } else if (presentModeEnabled && project.research_mode === "real") {
      router.replace(`/research-projects/${id}${hash}`, { scroll: false });
    }
  }, [project, presentModeEnabled, id, router]);

  // Evidence Orchestration: "Add Research Source" and "Add translations"
  // both redirect here with ?evidenceAdded=1 once Survey's specialist
  // workflow (creation or edit) has completed — this continues the journey
  // into the deployment wizard rather than stopping, since only Survey
  // evidence powers Campaigns/the Deployment Wizard. Conversation Search's
  // create-flow redirects with ?evidenceAdded=social_search instead — it has
  // no deployment concept, so it only needs a toast + reload, not the wizard.
  const evidenceAddedHandledRef = useRef(false);
  useEffect(() => {
    const added = searchParams.get("evidenceAdded");
    if (!added) return;
    if (!project || evidenceAddedHandledRef.current) return;
    evidenceAddedHandledRef.current = true;
    router.replace(`/research-projects/${id}`);
    load();
    if (added === "1") {
      setToast("Survey saved, continuing deployment setup.");
      setWizardOpen(true);
    } else {
      setToast("Conversation search saved.");
    }
  }, [searchParams, id, project, router, load]);

  // Create Campaign — deep-linked to the Campaigns page, returns here with
  // ?campaignAdded=1. Nothing further to continue into (unlike Research
  // Sources), just a toast and a refreshed Campaigns list.
  const campaignAddedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("campaignAdded") !== "1") return;
    if (!project || campaignAddedHandledRef.current) return;
    campaignAddedHandledRef.current = true;
    setToast("Campaign created.");
    router.replace(`/research-projects/${id}`);
    load();
  }, [searchParams, id, project, router, load]);

  // Plain "Open →" from a Research Source card — a simple return, no wizard.
  const returnedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("returned") !== "1") return;
    if (!project || returnedHandledRef.current) return;
    returnedHandledRef.current = true;
    setToast("Welcome back.");
    router.replace(`/research-projects/${id}`);
    load();
  }, [searchParams, id, project, router, load]);

  // Scrolls back to a section once the real content exists to scroll to —
  // e.g. the "← Back to Workspace" link on a Survey/Conversation
  // Intelligence, Key Findings or Executive Report page. Reads
  // sessionStorage (set by that link, see lib/workspace-scroll.ts) first,
  // falling back to the URL's own #hash for a direct link/bookmark.
  //
  // Deliberately runs on *every* render (no dependency array) rather than
  // once when `project` first loads: a simulated project's back-link lands
  // on /research-projects/[id], which immediately redirects to
  // /product-walkthrough/[id] above — if that destination Workspace
  // instance is one Next's router cache already had mounted with `project`
  // already loaded, a `[project]`-keyed effect would never fire again since
  // that dependency never changes on this visit. Checking on every render
  // means it doesn't matter whether this is a fresh mount or a reused one;
  // `lastScrolledRef` still stops it from re-scrolling on unrelated
  // re-renders once it's already handled the current target, and it
  // deliberately waits (does nothing, tries again next render) rather than
  // giving up if the target element hasn't rendered yet.
  const lastScrolledRef = useRef<string | null>(null);
  useEffect(() => {
    const stored = getWorkspaceScrollTarget();
    const targetId = stored || window.location.hash.replace(/^#/, "");
    if (!targetId || targetId === lastScrolledRef.current) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    lastScrolledRef.current = targetId;
    if (stored) clearWorkspaceScrollTarget();
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  });

  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");
  const orgPublishers = orgs.filter(o => o.type === "publisher" && (user?.role !== "publisher" || o.id === user.organisationId));
  const orgBrands = orgs.filter(o => o.type === "brand");
  const orgAgencies = orgs.filter(o => o.type === "agency");

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Only the very first load (no project fetched yet) replaces the whole
  // page with this placeholder. A background refresh (e.g. load() called
  // after closing an Intelligence modal) keeps loading true against an
  // already-populated project — gating on loading alone would unmount the
  // entire page in favour of this ~256px placeholder and back again, which
  // collapses the document height and resets scroll to the top even though
  // nothing actually navigated.
  if (loading && !project) return (
    <AdminShell>
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading research project…</p>
      </div>
    </AdminShell>
  );

  if (error || !project) return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto text-center py-20">
        <p className="text-gray-400 mb-4">{error || "Research project not found."}</p>
        <Link href="/research-projects" className="text-[#D7B87A] hover:underline text-sm">← Back to Research Projects</Link>
      </div>
    </AdminShell>
  );

  // Demo/Product Walkthrough pages show just the Research Name (topic) as
  // the title — project_name is the classification-suffixed "Final Research
  // Name" (topic | study type | brand | subject | agency), useful for
  // disambiguating in a flat list of many projects, but redundant clutter
  // as a page title once you're already inside one project. Real Research
  // Projects keep the full project_name here, unaffected.
  const displayName = project.research_mode === "simulated" && project.topic?.trim()
    ? project.topic.trim()
    : project.project_name;

  const surveyEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey
  );
  const conversationSearchEvidence = project.evidence.filter(e => e.evidence_type === "social_search" && e.conversationSearch);
  const documentEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { document: NonNullable<EvidenceItem["document"]> } => e.evidence_type === "document" && !!e.document
  );
  const projectId = project.id;

  // Captured once (rather than read via `project.X` inside the nested
  // function declarations below) because TypeScript doesn't carry the
  // `project !== null` narrowing from the early-return guard above across
  // a nested function's own scope.
  const p = project;

  const hasActiveCampaign = campaigns.some(c => c.effective_status === "live" || c.effective_status === "paused");
  const projectStatus = computeProjectStatus(project, hasActiveCampaign);
  const reportReadiness = computeReportReadiness(project.evidence);

  const evidenceTypeCounts: Record<string, number> = {};
  for (const e of project.evidence) evidenceTypeCounts[e.evidence_type] = (evidenceTypeCounts[e.evidence_type] ?? 0) + 1;
  // Collapsed-card summary — grouped by evidence type (e.g. "Surveys: 2
  // Surveys, 1 Draft, 1 Ready"). Each wired-up evidence type carries its own
  // status breakdown; not-yet-real types just show their count.
  const surveyStatusCounts: Record<string, number> = {};
  for (const e of surveyEvidence) {
    const s = e.survey!.status;
    surveyStatusCounts[s] = (surveyStatusCounts[s] ?? 0) + 1;
  }
  const socialSearchStatusCounts: Record<string, number> = {};
  for (const e of conversationSearchEvidence) {
    const s = e.conversationSearch!.status;
    socialSearchStatusCounts[s] = (socialSearchStatusCounts[s] ?? 0) + 1;
  }
  const evidenceCollapsedGroups = Object.entries(evidenceTypeCounts).map(([type, count]) => {
    const [singular, plural] = EVIDENCE_TYPE_PLURAL[type] ?? [type, type];
    const parts = [`${count} ${count === 1 ? singular : plural}`];
    if (type === "survey") {
      parts.push(...Object.entries(surveyStatusCounts).map(([status, c]) => `${c} ${SURVEY_STATUS_META[status]?.label ?? status}`));
    }
    if (type === "social_search") {
      parts.push(...Object.entries(socialSearchStatusCounts).map(([status, c]) => `${c} ${SOCIAL_SEARCH_STATUS_META[status]?.label ?? status}`));
    }
    return { label: plural, parts };
  });

  const stages = computeLifecycleStages(project);
  const progress = computeResearchProgress(stages);

  async function handleRemoveEvidence(item: EvidenceItem) {
    const name = item.survey?.name ?? item.conversationSearch?.name ?? item.document?.name;
    if (!name) return;
    if (!confirm(`Remove "${name}" from this project? The underlying research source itself won't be deleted.`)) return;
    const res = await fetch(`/api/research-projects/${projectId}/evidence?evidence_type=${item.evidence_type}&evidence_id=${item.evidence_id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to remove research source.");
      return;
    }
    showToast("Research source removed from project.");
    load();
  }

  async function handleAttachExisting(surveyId: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: "survey", evidence_id: surveyId, source: "existing" }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to attach survey.");
      return;
    }
    setAttachExistingOpen(false);
    showToast("Survey attached.");
    load();
  }

  async function handleAttachExistingSearch(searchId: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: "social_search", evidence_id: searchId, source: "existing" }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to attach conversation search.");
      return;
    }
    setAttachExistingSearchOpen(false);
    showToast("Conversation search attached.");
    load();
  }

  async function handleAttachExistingDocument(documentId: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: "document", evidence_id: documentId, source: "existing" }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to attach document.");
      return;
    }
    setAttachExistingDocumentOpen(false);
    showToast("Document attached.");
    load();
  }

  // "Run Research" — server resolves the source's type/id from
  // evidenceRowId itself (research_project_evidence.id) and does the
  // actual generation; this just fires it and refreshes. A 409 ("already
  // running") is expected if the poll effect above hasn't caught up yet —
  // treated as a no-op, not an error, since load() will converge either way.
  async function handleRunResearch(evidenceRowId: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ research_project_evidence_id: evidenceRowId }),
    });
    if (!res.ok && res.status !== 409) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? "Failed to run research.");
    }
    load();
  }

  // Scoped to a specific survey — each Survey card's own "+ Create
  // Campaign" already knows exactly which survey it's for, so there's no
  // longer a "which survey?" picker to show here.
  function handleCreateCampaignClick(evidenceId: string) {
    router.push(`/campaigns?createForProject=${projectId}&surveyId=${evidenceId}`);
  }

  function handleCreateMultipleCampaignsClick(evidenceId: string) {
    setWizardPresetSurveyId(evidenceId);
    setWizardOpen(true);
  }

  function openEditBrief() {
    setEditingBrief({
      id: p.id, project_id: p.project_id,
      topic: p.topic, research_question: p.research_question, research_subject: p.research_subject,
      brand_org_id: p.brand_org_id, agency_org_id: p.agency_org_id, study_type: p.study_type,
      objective: p.objective, tags: p.tags,
    });
  }

  function openProjectInfoEdit() {
    setDraftConfidentiality(p.confidentiality);
    setDraftVersion(p.version);
    setProjectInfoError("");
    setEditingProjectInfo(true);
  }

  async function handleSaveProjectInfo() {
    setSavingProjectInfo(true); setProjectInfoError("");
    const res = await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confidentiality: draftConfidentiality, version: draftVersion }),
    });
    const json = await res.json().catch(() => ({}));
    setSavingProjectInfo(false);
    if (!res.ok) { setProjectInfoError(json.error ?? "Failed to save."); return; }
    setEditingProjectInfo(false);
    showToast("Project Information updated.");
    load();
  }

  async function handleCloseResearch() {
    if (!confirm("Close this research? You can reopen it later if more research sources are needed.")) return;
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: new Date().toISOString() }),
    });
    showToast("Research closed.");
    load();
  }

  async function handleReopenResearch() {
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed_at: null }),
    });
    showToast("Research reopened.");
    load();
  }

  async function handleArchiveProject() {
    if (!confirm("Archive this project? It'll be hidden from the default list but never deleted.")) return;
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived_at: new Date().toISOString() }),
    });
    showToast("Project archived.");
    load();
  }

  async function handleRestoreProject() {
    await fetch(`/api/research-projects/${projectId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived_at: null }),
    });
    showToast("Project restored.");
    load();
  }

  const groupedActivity: [string, ActivityRow[]][] = [];
  for (const a of project.activity) {
    const day = formatRelativeDay(a.created_at);
    const group = groupedActivity.find(([d]) => d === day);
    if (group) group[1].push(a);
    else groupedActivity.push([day, [a]]);
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

        {/* Permanent — no dismiss, no collapse. See Platform Contract §02/§03. */}
        {project.research_mode === "simulated" && <SimulatedBanner />}

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Link href="/research-projects" className="hover:text-[#D7B87A]">Research Projects</Link>
          <span>›</span>
          <span className="text-gray-700">{displayName}</span>
        </div>

        {/* ── Hero: Research Brief ─────────────────────────────────────────── */}
        {/* The main card on the page, so its navy header gets a bit more
            room (bigger padding, bigger title) than every other section's. */}
        <div id="hero" className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden scroll-mt-4">
          <div className="flex items-start justify-between gap-4 px-6 py-6" style={{ background: "#0B1929" }}>
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-2xl font-bold text-white truncate">{displayName}</h1>
              {project.research_mode === "simulated" && <SimulatedBadge />}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canManage && (
                <button onClick={openEditBrief}
                  className="text-xs font-semibold border border-white/20 text-white/80 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
                  Edit Research Brief
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Research Question</p>
              {project.research_question ? (
                <p className="text-base font-medium text-gray-900 leading-relaxed">{project.research_question}</p>
              ) : (
                <p className="text-sm text-gray-400">No research question set, edit the project to add one.</p>
              )}
            </div>

            {project.objective && (
              <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Objective</p>
                <p className="text-base font-medium text-gray-900 leading-relaxed">{project.objective}</p>
              </div>
            )}

            <div className="border-t border-gray-100 pt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
              <span><span className="text-gray-400">Research Sources </span>{project.evidence.length}</span>
              <span><span className="text-gray-400">Research Progress </span>{progress.label}</span>
              <span><span className="text-gray-400">Research Type </span>{studyTypeLabel(project.study_type)}</span>
              <span><span className="text-gray-400">Research Category </span>{researchSubjectLabel(project.research_subject)}</span>
            </div>
          </div>
        </div>

        {/* ── Research Lifecycle — progress tracker + page nav ───────────────── */}
        {/* Sticky against <main>'s own scroll container (see AdminShell) so
            it stays visible while scrolling the rest of the Workspace —
            what's done and what's left should never require scrolling
            back up to check. */}
        <div className="sticky top-0 z-20 bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-center flex-wrap gap-1.5">
            {stages.map((stage, i) => {
              const meta = STAGE_STATE_META[stage.state];
              const pill = (
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border inline-flex items-center gap-1 whitespace-nowrap ${meta.className}`}>
                  <span className="text-[9px]">{meta.icon}</span>{stage.label}
                </span>
              );
              return (
                <div key={stage.key} className="flex items-center gap-1">
                  {stage.sectionId ? (
                    <button onClick={() => scrollToSection(stage.sectionId!)} className="transition-transform hover:scale-105">
                      {pill}
                    </button>
                  ) : pill}
                  {i < stages.length - 1 && <span className="text-gray-300 text-xs">→</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Project Information — the home for every project-level fact and
            setting: metadata, and Status (always derived, never manual).
            The Research Target lives in the Campaigns section instead —
            it's a campaign-collection setting, not project metadata. */}
        <SectionCard
          id="project-info"
          title="Project Information"
          info={
            <InfoContent title="Project-level facts, all in one place.">
              <p>Owner, Status, Created/Updated dates, Confidentiality and Version for this project.</p>
              <p className="mt-1.5">Status updates automatically from what&apos;s happening in Campaigns below, it&apos;s never set manually here. The Research Target lives in Campaigns too, since it&apos;s a campaign-collection setting rather than project metadata.</p>
            </InfoContent>
          }
          cta={canManage && !editingProjectInfo && (
            <button onClick={openProjectInfoEdit} className="text-xs font-semibold border border-white/20 text-white/80 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors">
              Edit
            </button>
          )}
          summary={
            <CollapsedSummary groups={[
              { label: "Status", parts: [PROJECT_STATUS_META[projectStatus].label] },
              { label: "Owner", parts: [project.owner_name ?? "—"] },
            ]} />
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Owner</p>
              <p className="text-gray-700">{project.owner_name ?? "—"}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Set automatically from whoever created this project.</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Status</p>
              <ProjectStatusBadge status={projectStatus} />
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Created</p>
              <p className="text-gray-700">{formatRelativeTime(project.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Last Updated</p>
              <p className="text-gray-700">{formatRelativeTime(project.last_response_at ?? project.updated_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Confidentiality</p>
              {editingProjectInfo ? (
                <select value={draftConfidentiality ?? ""} onChange={e => setDraftConfidentiality(e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]">
                  <option value="">Not set</option>
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                </select>
              ) : (
                <p className="text-gray-700 capitalize">{project.confidentiality ?? "—"}</p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Version</p>
              {editingProjectInfo ? (
                <input value={draftVersion ?? ""} onChange={e => setDraftVersion(e.target.value || null)}
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#D7B87A]" placeholder="e.g. v1" />
              ) : (
                <p className="text-gray-700">{project.version ?? "—"}</p>
              )}
            </div>
          </div>

          {editingProjectInfo && (
            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              {projectInfoError && <p className="text-xs text-red-500 mr-auto self-center">{projectInfoError}</p>}
              <button onClick={() => setEditingProjectInfo(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancel</button>
              <button onClick={handleSaveProjectInfo} disabled={savingProjectInfo}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
                style={{ background: "#0B1929", color: "#D7B87A" }}>
                {savingProjectInfo ? "Saving…" : "Save"}
              </button>
            </div>
          )}

          {canManage && !editingProjectInfo && (
            <div className="border-t border-gray-100 pt-3 mt-4 flex gap-4">
              {projectStatus !== "archived" && (
                <button
                  onClick={projectStatus === "complete" ? handleReopenResearch : handleCloseResearch}
                  className="text-xs text-gray-500 hover:underline"
                >
                  {projectStatus === "complete" ? "Reopen Research" : "Close Research"}
                </button>
              )}
              <button
                onClick={projectStatus === "archived" ? handleRestoreProject : handleArchiveProject}
                className={`text-xs hover:underline ${projectStatus === "archived" ? "text-gray-500" : "text-red-400"}`}
              >
                {projectStatus === "archived" ? "Restore Project" : "Archive Project"}
              </button>
            </div>
          )}

          {project.research_mode === "simulated" && project.simulation_info && (
            <SimulationInformationPanel info={project.simulation_info} />
          )}
        </SectionCard>

        <ResearchSourcesSection
          projectId={projectId}
          isSimulated={project.research_mode === "simulated"}
          isProductWalkthrough={presentModeEnabled}
          canManage={canManage}
          hasAnyEvidence={project.evidence.length > 0}
          evidenceSummary={<CollapsedSummary groups={evidenceCollapsedGroups.length > 0 ? evidenceCollapsedGroups : [{ parts: ["No research sources yet"] }]} />}
          surveys={surveyEvidence.map(item => ({
            evidence_row_id: item.id,
            evidence_id: item.evidence_id,
            name: item.survey.name,
            question_count: item.survey.question_count,
            completed_languages: item.survey.completed_languages,
            brand_name: item.survey.brand_name,
            agency_name: item.survey.agency_name,
            response_count: item.survey.response_count,
            target_responses: item.survey.target_responses,
            creative_design: item.survey.creative_design,
            target_reached_action: item.survey.target_reached_action,
            run_status: item.run_status,
            run_error: item.run_error,
          }))}
          conversationSearches={conversationSearchEvidence.map(item => ({
            id: item.id,
            evidence_row_id: item.id,
            evidence_id: item.evidence_id,
            name: item.conversationSearch!.name,
            status: item.conversationSearch!.status,
            markets: item.conversationSearch!.markets,
            platforms: item.conversationSearch!.platforms,
            mention_count: item.conversationSearch!.mention_count,
            positive_pct: item.conversationSearch!.positive_pct,
            neutral_pct: item.conversationSearch!.neutral_pct,
            negative_pct: item.conversationSearch!.negative_pct,
            reddit_last_collected_at: item.conversationSearch!.reddit_last_collected_at,
            run_status: item.run_status,
            run_error: item.run_error,
          }))}
          mentionTarget={project.simulation_info?.mentionTarget ?? null}
          documents={documentEvidence.map(item => ({
            evidence_row_id: item.id,
            evidence_id: item.evidence_id,
            name: item.document.name,
            document_type: item.document.document_type,
            library_status: item.document.library_status,
            page_count: item.document.page_count,
          }))}
          campaigns={campaigns}
          deletedCampaigns={deletedCampaigns}
          orgs={orgs}
          loading={loading}
          loadingDeletedCampaigns={loadingDeletedCampaigns}
          isLockedByAdminFor={isLockedByAdminFor}
          expandedIds={expandedSourceIds}
          onToggleExpand={toggleSourceExpanded}
          onAddResearchSource={() => setEvidenceModalOpen(true)}
          onLoadDeletedCampaigns={loadDeletedCampaigns}
          onReloadCampaigns={load}
          onEditCampaign={c => router.push(`/campaigns?editCampaignId=${c.id}&returnTo=${projectId}`)}
          onCreateCampaign={handleCreateCampaignClick}
          onCreateMultipleCampaigns={handleCreateMultipleCampaignsClick}
          onRunResearch={handleRunResearch}
          onRemoveSurveyEvidence={evidenceId => {
            const item = surveyEvidence.find(e => e.evidence_id === evidenceId);
            if (item) handleRemoveEvidence(item);
          }}
          onRemoveConversationSearchEvidence={evidenceId => {
            const item = conversationSearchEvidence.find(e => e.evidence_id === evidenceId);
            if (item) handleRemoveEvidence(item);
          }}
          onRemoveDocumentEvidence={evidenceId => {
            const item = documentEvidence.find(e => e.evidence_id === evidenceId);
            if (item) handleRemoveEvidence(item);
          }}
          onSaveResearchTarget={async (evidenceId, targetResponses, targetReachedAction) => {
            const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ evidence_id: evidenceId, target_responses: targetResponses, target_reached_action: targetReachedAction }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return { ok: false, error: json.error ?? "Failed to save." };
            showToast("Research Target updated.");
            load();
            return { ok: true };
          }}
          onSaveCreativeDesign={async (evidenceId, creativeDesign) => {
            const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ evidence_id: evidenceId, creative_design: creativeDesign }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return { ok: false, error: json.error ?? "Failed to save." };
            showToast("Creative Design updated.");
            load();
            return { ok: true };
          }}
          formatRelativeTime={formatRelativeTime}
        />

        <CampaignGroupsSection
          projectId={project.id}
          groups={campaignGroups}
          canManage={canManage}
          campaigns={campaigns}
          orgs={orgs}
          surveyNameById={new Map(surveyEvidence.map(e => [e.evidence_id, e.survey.name]))}
          returnTo={presentModeEnabled ? `/product-walkthrough/${project.id}` : `/research-projects/${project.id}`}
        />

        <DashboardSection
          projectId={project.id}
          isSimulated={project.research_mode === "simulated"}
          hasEvidence={project.evidence.length > 0}
          onScrollToResearchSources={() => scrollToSection("evidence")}
          surveys={surveyEvidence.map(item => ({
            evidence_id: item.evidence_id, name: item.survey.name, response_count: item.survey.response_count,
            target_responses: item.survey.target_responses ?? project.simulation_info?.surveyResponseTarget ?? null,
            run_status: item.run_status,
          }))}
          conversationSearches={conversationSearchEvidence.map(item => ({
            evidence_id: item.evidence_id, name: item.conversationSearch!.name, mention_count: item.conversationSearch!.mention_count,
            run_status: item.run_status,
            markets: item.conversationSearch!.markets, platforms: item.conversationSearch!.platforms,
            positive_pct: item.conversationSearch!.positive_pct, neutral_pct: item.conversationSearch!.neutral_pct, negative_pct: item.conversationSearch!.negative_pct,
          }))}
          mentionTarget={project.simulation_info?.mentionTarget ?? null}
          campaigns={campaigns}
        />

        <IntelligenceSection
          isSimulated={project.research_mode === "simulated"}
          surveys={surveyEvidence.map(item => ({
            evidence_id: item.evidence_id,
            name: item.survey.name,
            response_count: item.survey.response_count,
            summary_status: item.survey.summary_status,
          }))}
          conversationSearches={conversationSearchEvidence.map(item => ({
            evidence_id: item.evidence_id,
            name: item.conversationSearch!.name,
            mention_count: item.conversationSearch!.mention_count,
            summary_status: item.conversationSearch!.summary_status,
          }))}
          documents={documentEvidence.map(item => ({
            evidence_row_id: item.id,
            name: item.document.name,
            document_type: item.document.document_type,
            library_status: item.document.library_status,
            summary_status: item.document.summary_status,
          }))}
          keyFindingsStatus={project.key_findings_status}
          keyFindingsCount={project.key_findings_count}
          onOpenKeyFindings={() => router.push(`/research-projects/${projectId}/reports/key-findings`)}
          onOpenSurveyIntelligence={evidenceId => router.push(`/research-projects/${projectId}/reports/survey/${evidenceId}`)}
          onOpenConversationIntelligence={evidenceId => router.push(`/research-projects/${projectId}/reports/conversation/${evidenceId}`)}
          onOpenDocumentIntelligence={evidenceRowId => router.push(`/research-projects/${projectId}/reports/document/${evidenceRowId}`)}
        />

        <ReportsSection
          projectId={projectId}
          isSimulated={project.research_mode === "simulated"}
          reportStatus={project.report_status}
          reportStale={project.report_stale}
          reportReadiness={reportReadiness}
          fullResearchReportStatus={project.full_research_report_status}
          articleStatus={project.article_status}
        />

        <ConclusionSection
          projectId={project.id}
          projectName={displayName}
          researchQuestion={project.research_question ?? ""}
          reportApproved={project.report_status === "approved" || project.report_status === "published"}
          isSimulated={project.research_mode === "simulated"}
        />

        <KnowledgeSection publishedConclusion={project.published_conclusion} />

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        <SectionCard
          id="activity"
          title="Activity"
          badge={project.research_mode === "simulated" && <SimulatedBadge />}
          info={
            <InfoContent title="Everything that's happened on this project.">
              <p>A chronological log, research sources attached, targets changed, publishers/countries updated, campaigns generated, grouped by day.</p>
              <p className="mt-1.5">Use it to see what changed and when, without reconstructing it from memory.</p>
            </InfoContent>
          }
          summary={
            <p className="text-xs text-gray-500 line-clamp-2">
              {project.activity.length === 0 ? "No activity yet." : `Latest: ${project.activity[0].description}`}
            </p>
          }
        >
          {project.activity.length === 0 ? (
            <EmptyState>No activity yet.</EmptyState>
          ) : (
            <div className="space-y-4">
              {groupedActivity.map(([day, items]) => (
                <div key={day}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{day}</p>
                  <div className="space-y-1.5">
                    {items.map(a => (
                      <div key={a.id} className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-gray-700">{a.description}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(a.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {evidenceModalOpen && (
        <AddEvidenceModal
          projectId={project.id}
          onClose={() => setEvidenceModalOpen(false)}
          onAttachExisting={type => {
            if (type === "survey") setAttachExistingOpen(true);
            if (type === "social_search") setAttachExistingSearchOpen(true);
            if (type === "document") setAttachExistingDocumentOpen(true);
          }}
        />
      )}

      {attachExistingOpen && (
        <AttachExistingSurveyModal
          excludeSurveyIds={surveyEvidence.map(e => e.evidence_id)}
          orgName={orgName}
          orgBrands={orgBrands}
          isSimulated={project.research_mode === "simulated"}
          onClose={() => setAttachExistingOpen(false)}
          onAttach={handleAttachExisting}
        />
      )}

      {attachExistingSearchOpen && (
        <AttachExistingConversationSearchModal
          excludeSearchIds={conversationSearchEvidence.map(e => e.evidence_id)}
          isSimulated={project.research_mode === "simulated"}
          onClose={() => setAttachExistingSearchOpen(false)}
          onAttach={handleAttachExistingSearch}
        />
      )}

      {attachExistingDocumentOpen && (
        <AttachExistingDocumentModal
          excludeDocumentIds={project.evidence.filter(e => e.evidence_type === "document").map(e => e.evidence_id)}
          onClose={() => setAttachExistingDocumentOpen(false)}
          onAttach={handleAttachExistingDocument}
        />
      )}

      {editingBrief && (
        <ResearchProjectEditDrawer
          initial={editingBrief}
          orgBrands={orgBrands}
          orgAgencies={orgAgencies}
          orgName={orgName}
          onClose={() => setEditingBrief(null)}
          onSaved={() => { setEditingBrief(null); showToast("Research Brief updated."); load(); }}
        />
      )}

      {wizardOpen && (
        <DeploymentWizardModal
          project={project}
          presetSurveyId={wizardPresetSurveyId ?? undefined}
          orgPublishers={orgPublishers}
          orgName={orgName}
          publishersDisabled={user?.role === "publisher"}
          publishersHelperText={user?.role === "publisher" ? "Locked to your organisation." : undefined}
          onClose={() => { setWizardOpen(false); setWizardPresetSurveyId(null); }}
          onNeedEvidence={() => { setWizardOpen(false); setEvidenceModalOpen(true); }}
          onComplete={result => {
            const parts = [`${result.created.length} created`];
            if (result.restored.length > 0) parts.push(`${result.restored.length} restored`);
            if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
            showToast(`Deployments generated: ${parts.join(", ")}.`);
            load();
            // Keep the wizard open when anything failed — GenerateDeploymentsCard
            // renders result.failed with per-combo reasons inline; closing here
            // would discard that detail behind a toast that only has counts.
            if (result.failed.length === 0) setWizardOpen(false);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
          ✓ {toast}
        </div>
      )}

    </AdminShell>
  );
}
