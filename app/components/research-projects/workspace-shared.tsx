"use client";

// Mode-agnostic building blocks shared by both single-page project bodies —
// the real Research Project's WorkspaceBody and Product Walkthrough's
// WalkthroughBody. Extracted here (rather than left in WorkspaceBody.tsx)
// as part of Step 1's Product Walkthrough decoupling so that when the real
// workspace is later dismantled into the multi-page shell, the walkthrough
// keeps working: it depends on this neutral module, never on WorkspaceBody.
//
// Nothing here is present-mode aware — these are the status/badge display
// constants and the two self-contained "add source" / "generate multiple
// deployments" modals. Both bodies import them unchanged.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PublisherCountryPicker } from "@/app/components/PublisherCountryPicker";
import { GenerateDeploymentsCard } from "@/app/components/GenerateDeploymentsCard";
import { CreativeDesignPicker } from "@/app/components/CreativeDesignPicker";
import { CreativeDesignPreview } from "@/app/components/CreativeDesignPreview";
import { missingLanguageCountries, languageLabel } from "@/lib/survey-language-readiness";
import { expectedSurveyLanguage, LANGUAGE_DISPLAY_NAMES } from "@/lib/locales";
import type { GenerateResult } from "@/lib/generate-deployments";
import type { LangCode } from "@/lib/survey-locale";
import { StatusBadge, type BadgeTone } from "@/app/components/research-projects/ActionPrimitives";
import { type StageState } from "@/lib/research-project-lifecycle";
import { PROJECT_STATUS_META, type ProjectStatus } from "@/lib/research-project-status";
import type { ResearchProject, EvidenceItem } from "@/app/components/research-projects/ProjectProvider";

export const SURVEY_STATUS_META: Record<string, { label: string; className: string }> = {
  draft:    { label: "Draft",    className: "bg-amber-50 text-amber-700" },
  ready:    { label: "Ready",    className: "bg-green-50 text-green-700" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-500" },
  deleted:  { label: "Deleted",  className: "bg-gray-100 text-gray-400" },
};

export const SOCIAL_SEARCH_STATUS_META: Record<string, { label: string; className: string }> = {
  Draft:    { label: "Draft",    className: "bg-amber-50 text-amber-700" },
  Active:   { label: "Active",   className: "bg-green-50 text-green-700" },
  Paused:   { label: "Paused",   className: "bg-amber-50 text-amber-700" },
  Archived: { label: "Archived", className: "bg-gray-100 text-gray-500" },
};

export const STAGE_STATE_META: Record<StageState, { icon: string; className: string }> = {
  complete:    { icon: "✓", className: "bg-green-50 text-green-700 border-green-100" },
  in_progress: { icon: "🟡", className: "bg-amber-50 text-amber-700 border-amber-100" },
  not_started: { icon: "⚪", className: "bg-gray-50 text-gray-400 border-gray-100" },
};

export const EVIDENCE_TYPE_PLURAL: Record<string, [string, string]> = {
  survey: ["Survey", "Surveys"],
  social_search: ["Conversation Search", "Conversation Searches"],
  document: ["Document", "Documents"],
};

const PROJECT_STATUS_TONE: Record<ProjectStatus, BadgeTone> = {
  draft: "warning", active: "success", complete: "info", archived: "neutral",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const m = PROJECT_STATUS_META[status];
  return <StatusBadge label={m.label} tone={PROJECT_STATUS_TONE[status]} dot={m.dot} size="md" />;
}

export type NewEvidenceType =
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

export function AddEvidenceModal({ projectId, onClose, onAttachExisting }: { projectId: string; onClose: () => void; onAttachExisting: (type: NewEvidenceType) => void }) {
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
export function DeploymentWizardModal({
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
