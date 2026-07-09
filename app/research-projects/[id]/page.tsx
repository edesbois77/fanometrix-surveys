"use client";

// Phase 2 of the V2 Blueprint — the Research Project becomes the central
// workspace of the platform. Step 1 composed existing data into a read-only
// workspace; Step 2 added Evidence Orchestration (Create Evidence → Survey);
// Step 3 (this file) completes the loop: Survey → Publishers & Countries →
// Deployment Readiness → Generate Deployments → back to this Workspace,
// entirely hosted here rather than bouncing to the Research Projects list
// page. The two pieces of that journey with real business logic — the
// publisher/country picker and the Generate Deployments action — are shared
// components (app/components/PublisherCountryPicker.tsx,
// app/components/GenerateDeploymentsCard.tsx) also used by the list page's
// own Edit drawer, so neither the picker nor the generate-deployments
// validation/endpoint is duplicated here.
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { useSession } from "@/app/components/SessionProvider";
import { SurveyIntelligenceModal } from "@/app/components/SurveyIntelligenceModal";
import { PublisherCountryPicker } from "@/app/components/PublisherCountryPicker";
import { GenerateDeploymentsCard } from "@/app/components/GenerateDeploymentsCard";
import { missingLanguageCountries, languageLabel } from "@/lib/survey-language-readiness";
import type { GenerateResult } from "@/lib/generate-deployments";
import { STATUS_META, type CampaignStatus } from "@/lib/campaign-status";
import { studyTypeLabel } from "@/lib/naming";
import type { LangCode } from "@/lib/survey-locale";

type ResearchProject = {
  id: string;
  project_id: string;
  project_name: string;
  brand_org_id: string | null;
  agency_org_id: string | null;
  study_type: string;
  topic: string | null;
  description: string | null;
  status: string;
  survey_id: string | null;
  publisher_org_ids: string[];
  country_codes: string[];
  target_responses: number | null;
  created_at: string;
  updated_at: string;
  deployment_count: number;
  total_responses: number;
  completion_pct: number | null;
  survey: Survey | null;
};

type Survey = {
  id: string;
  name: string;
  status: string;
  response_count: number;
  completed_languages: LangCode[];
};

type Org = { id: string; name: string; type: "publisher" | "agency" | "brand" | "internal" };

const SURVEY_STATUS_META: Record<string, { label: string; className: string }> = {
  draft:    { label: "Draft",    className: "bg-amber-50 text-amber-700" },
  ready:    { label: "Ready",    className: "bg-green-50 text-green-700" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-500" },
  deleted:  { label: "Deleted",  className: "bg-gray-100 text-gray-400" },
};

const LIFECYCLE_STAGES = ["Research Question", "Evidence", "Intelligence", "Reports", "Knowledge"];

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }: { status: CampaignStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${m.bg} ${m.text}`}>
      <span className="text-[9px]">{m.dot}</span>{m.label}
    </span>
  );
}

function SectionCard({ title, cta, children }: { title: string; cta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">{title}</h2>
        {cta}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 py-2">{children}</p>;
}

type EvidenceType = "survey" | "conversation_search" | "industry_report" | "document";

const EVIDENCE_TYPES: { type: EvidenceType; label: string; description: string; available: boolean }[] = [
  { type: "survey", label: "Survey", description: "Create a new survey and deploy it to collect responses.", available: true },
  { type: "conversation_search", label: "Conversation Search", description: "Social listening evidence.", available: false },
  { type: "industry_report", label: "Industry Report", description: "Third-party research evidence.", available: false },
  { type: "document", label: "Uploaded Document", description: "Bring your own evidence.", available: false },
];

// Evidence Orchestration (Phase 2, Step 2): this is the single entry point
// every future evidence source will follow — the Research Project initiates
// the specialist workflow, the specialist module executes it, and the
// completed evidence attaches back here automatically. Only Survey is wired
// up so far; the rest are visible placeholders for that same pattern.
function CreateEvidenceModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter();

  function choose(evidenceType: EvidenceType) {
    if (evidenceType === "survey") {
      router.push(`/survey-templates?createForProject=${projectId}`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Choose Evidence Type</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-4 space-y-2">
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

const WIZARD_STEP_LABEL: Record<"targets" | "readiness" | "generate", string> = {
  targets: "Publishers & Countries",
  readiness: "Deployment Readiness",
  generate: "Generate Deployments",
};

// Phase 2, Step 3 — the wizard that continues the Evidence journey past
// Survey creation. Hosted entirely on the Workspace (per the confirmed
// design: "Don't bounce users back to the list page"). The two steps with
// real logic reuse the exact shared components/functions the Research
// Projects list page uses for the same job — this modal only sequences them.
function DeploymentWizardModal({
  project, orgPublishers, orgName, publishersDisabled, publishersHelperText, onClose, onComplete,
}: {
  project: ResearchProject;
  orgPublishers: { id: string; name: string }[];
  orgName: (id: string) => string;
  publishersDisabled?: boolean;
  publishersHelperText?: string;
  onClose: () => void;
  onComplete: (result: GenerateResult) => void;
}) {
  const completedLanguages = project.survey?.completed_languages ?? [];

  const [step, setStep] = useState<"targets" | "readiness" | "generate">(() => {
    const hasTargets = project.publisher_org_ids.length > 0 && project.country_codes.length > 0;
    if (!hasTargets) return "targets";
    return missingLanguageCountries(completedLanguages, project.country_codes).length > 0 ? "readiness" : "generate";
  });

  const [draftPublisherIds, setDraftPublisherIds] = useState<string[]>(project.publisher_org_ids);
  const [draftCountryCodes, setDraftCountryCodes] = useState<string[]>(project.country_codes);
  // Fast-path (confirmed decision B): only show the full picker when targets
  // aren't already valid — otherwise a one-line summary with an Edit button.
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
    const mismatches = missingLanguageCountries(completedLanguages, draftCountryCodes);
    setStep(mismatches.length > 0 ? "readiness" : "generate");
  }

  const readinessMismatches = missingLanguageCountries(completedLanguages, draftCountryCodes);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Set Up Deployments</h2>
            <p className="text-xs text-gray-400 mt-0.5">{WIZARD_STEP_LABEL[step]}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

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
            {targetsError && <p className="text-xs text-red-500">{targetsError}</p>}
            <div className="flex items-center justify-between gap-2 pt-2">
              <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">I&apos;ll do this later</button>
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

        {step === "readiness" && (
          <div className="p-6 space-y-4">
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
                <Link
                  href={`/survey-templates?editSurveyForProject=${project.id}`}
                  className="inline-block text-xs font-semibold underline text-amber-800"
                >
                  Add translations →
                </Link>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pt-2">
              <button onClick={() => setStep("targets")} className="text-sm text-gray-500 px-4 py-2">← Back</button>
              <div className="flex items-center gap-2">
                <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">I&apos;ll do this later</button>
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
          </div>
        )}

        {step === "generate" && (
          <div className="p-6 space-y-4">
            <GenerateDeploymentsCard
              projectId={project.id}
              publisherOrgIds={draftPublisherIds}
              countryCodes={draftCountryCodes}
              surveyId={project.survey_id}
              deploymentCount={project.deployment_count}
              completedLanguages={completedLanguages}
              onGenerated={onComplete}
            />
            <div className="flex items-center justify-between gap-2 pt-2">
              <button onClick={() => setStep("targets")} className="text-sm text-gray-500 px-4 py-2">← Back</button>
              <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2">I&apos;ll do this later</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResearchProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { user } = useSession();
  const canManage = user?.role === "admin" || user?.role === "publisher";

  const [project, setProject] = useState<ResearchProject | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [intelligenceOpen, setIntelligenceOpen] = useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [pRes, oRes] = await Promise.all([
      fetch(`/api/research-projects/${id}`),
      fetch("/api/organisations"),
    ]);
    if (!pRes.ok) { setError("Research project not found."); setLoading(false); return; }
    const [pJson, oJson] = await Promise.all([pRes.json(), oRes.json()]);
    setProject(pJson.data);
    setOrgs(oJson.data ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Evidence Orchestration (Phase 2, Steps 2–3): "Create Evidence" and
  // "Add translations" both redirect here with ?evidenceAdded=1 once their
  // specialist workflow (Survey creation or edit) has completed — this
  // continues the journey into the deployment wizard rather than stopping.
  const evidenceAddedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("evidenceAdded") !== "1") return;
    if (!project || evidenceAddedHandledRef.current) return;
    evidenceAddedHandledRef.current = true;
    setToast("Survey saved — continuing deployment setup.");
    router.replace(`/research-projects/${id}`);
    setWizardOpen(true);
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [searchParams, id, project, router]);

  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");

  const orgPublishers = orgs.filter(o => o.type === "publisher" && (user?.role !== "publisher" || o.id === user.organisationId));

  if (loading) return (
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

  const organisation = orgName(project.brand_org_id) || orgName(project.agency_org_id) || "—";
  const survey = project.survey;
  const possibleCombos = project.publisher_org_ids.length * project.country_codes.length;
  const needsDeploymentSetup = !!project.survey_id && (possibleCombos === 0 || project.deployment_count < possibleCombos);

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Link href="/research-projects" className="hover:text-[#D7B87A]">Research Projects</Link>
          <span>›</span>
          <span className="text-gray-700">{project.project_name}</span>
        </div>

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Research Question</p>
              <h1 className="text-xl font-bold text-gray-900">{project.project_name}</h1>
            </div>
            <StatusBadge status={project.status as CampaignStatus} />
          </div>

          {project.description && (
            <p className="text-sm text-gray-500 mb-4 leading-relaxed">{project.description}</p>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
            <span><span className="text-gray-400">Study Type </span>{studyTypeLabel(project.study_type)}</span>
            <span><span className="text-gray-400">Organisation </span>{organisation}</span>
            <span><span className="text-gray-400">Created </span>{formatDate(project.created_at)}</span>
            <span><span className="text-gray-400">Last updated </span>{formatDate(project.updated_at)}</span>
          </div>
        </div>

        {/* ── Research Lifecycle ───────────────────────────────────────────── */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
          <div className="flex items-center flex-wrap gap-2">
            {LIFECYCLE_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-50 text-gray-600 border border-gray-100">
                  {stage}
                </span>
                {i < LIFECYCLE_STAGES.length - 1 && <span className="text-gray-300">→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Evidence ──────────────────────────────────────────────────────── */}
        <SectionCard
          title="Evidence"
          cta={
            <button
              onClick={() => canManage && setEvidenceModalOpen(true)}
              disabled={!canManage}
              title={canManage ? "" : "Only admins and publishers can add evidence."}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#D7B87A", color: "#0B1929" }}
            >
              + Create Evidence
            </button>
          }
        >
          {!survey ? (
            <EmptyState>No surveys attached to this research project yet.</EmptyState>
          ) : (
            <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{survey.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${(SURVEY_STATUS_META[survey.status] ?? SURVEY_STATUS_META.draft).className}`}>
                    {(SURVEY_STATUS_META[survey.status] ?? SURVEY_STATUS_META.draft).label}
                  </span>
                  <span className="text-xs text-gray-400">
                    {project.total_responses.toLocaleString()} response{project.total_responses !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {needsDeploymentSetup && canManage && (
                  <button onClick={() => setWizardOpen(true)} className="text-xs font-semibold text-[#0B1929] hover:underline">
                    Continue to Deployments →
                  </button>
                )}
                <Link href="/survey-templates" className="text-xs font-semibold text-[#0B1929] hover:underline">
                  Open Survey →
                </Link>
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── Intelligence ──────────────────────────────────────────────────── */}
        <SectionCard title="Intelligence">
          {!survey ? (
            <EmptyState>Attach a survey in Evidence to unlock Intelligence.</EmptyState>
          ) : (
            <div className="border border-gray-100 rounded-lg px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-gray-800 truncate">{survey.name}</p>
              <button
                onClick={() => setIntelligenceOpen(true)}
                className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
              >
                Intelligence
              </button>
            </div>
          )}
        </SectionCard>

        {/* ── Reports ───────────────────────────────────────────────────────── */}
        <SectionCard title="Reports">
          <EmptyState>No reports yet.</EmptyState>
        </SectionCard>

        {/* ── Activity ──────────────────────────────────────────────────────── */}
        <SectionCard title="Activity">
          <EmptyState>No activity yet.</EmptyState>
        </SectionCard>
      </div>

      {intelligenceOpen && survey && (
        <SurveyIntelligenceModal
          survey={survey}
          onClose={() => setIntelligenceOpen(false)}
        />
      )}

      {evidenceModalOpen && (
        <CreateEvidenceModal
          projectId={project.id}
          onClose={() => setEvidenceModalOpen(false)}
        />
      )}

      {wizardOpen && (
        <DeploymentWizardModal
          project={project}
          orgPublishers={orgPublishers}
          orgName={orgName}
          publishersDisabled={user?.role === "publisher"}
          publishersHelperText={user?.role === "publisher" ? "Locked to your organisation." : undefined}
          onClose={() => setWizardOpen(false)}
          onComplete={result => {
            setWizardOpen(false);
            const parts = [`${result.created.length} created`];
            if (result.restored.length > 0) parts.push(`${result.restored.length} restored`);
            setToast(`Deployments generated: ${parts.join(", ")}.`);
            setTimeout(() => setToast(null), 4000);
            load();
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
