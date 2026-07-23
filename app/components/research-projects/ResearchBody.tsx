"use client";

// The Research area body — method selection, at /research-projects/[id]/research.
// This answers "what evidence are we going to collect?": one card per research
// capability the platform offers, so a user chooses the methods that will
// answer their research question. It is deliberately NOT operational — no
// campaigns, deployments or run-research here (that is Execution). Each card
// shows a description, how many sources are attached, a light status, and the
// actions to attach an existing source, add a new one, or open Execution to
// manage it.
//
// Adding capabilities later (Google Trends, Reddit, CRM, POS…) is just a new
// entry in METHODS — the page is built to grow.
//
// Reuse, not rebuild: the add/attach flow is the same shared AddEvidenceModal +
// AttachExisting*Modal used before, with the same POST /evidence handlers. A
// newly *created* survey returns via ?evidenceAdded=1 and is routed on to
// Execution's deployment wizard (see [id]/page.tsx); a newly attached/created
// conversation search returns via ?evidenceAdded=social_search and lands here.
//
// Chromeless: AdminShell, the ProjectProvider data layer and the project header
// + navigation come from the (workspace) shell layout. Product Walkthrough is
// unaffected (its own WalkthroughBody keeps the single-page source workspace).
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/app/components/SessionProvider";
import { AttachExistingSurveyModal } from "@/app/components/research-projects/AttachExistingSurveyModal";
import { AttachExistingConversationSearchModal } from "@/app/components/research-projects/AttachExistingConversationSearchModal";
import { AttachExistingDocumentModal } from "@/app/components/research-projects/AttachExistingDocumentModal";
import { PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, Icon } from "@/app/components/workspace-ui";
import { PrimaryButton, StatusBadge } from "@/app/components/research-projects/ActionPrimitives";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { AddEvidenceModal } from "@/app/components/research-projects/workspace-shared";
import { ResearchPlanPanel } from "@/app/components/research-projects/ResearchPlanPanel";

type MethodType = "survey" | "social_search" | "document";

// Evidence type → the mini-workspace route slug it opens
// (/research-projects/[id]/research/[slug]). News Coverage keys off "news"
// rather than an evidence type of its own: it stores as social_search evidence
// and is separated by its MEDIUM, so the two share a record and a pipeline
// without ever sharing a card.
const METHOD_SLUG: Record<string, string> = { survey: "survey", social_search: "conversation", news: "news", document: "library" };

const METHODS: { key: MethodType | string; label: string; description: string; available: boolean }[] = [
  { key: "survey", label: "Survey Research", description: "Structured questionnaires deployed to your audiences to measure attitudes, motivations and behaviours.", available: true },
  { key: "social_search", label: "Conversation Intelligence", description: "Analyse public conversations across markets and platforms.", available: true },
  { key: "news", label: "News Coverage", description: "Credible editorial and industry coverage of the brand, its comparators and the category. What publishers report, kept distinct from what fans say.", available: true },
  { key: "document", label: "Research Library", description: "Attach industry reports, strategy documents and case studies already in the Research Library.", available: true },
  { key: "google_trends", label: "Google Trends", description: "Search-interest signals over time and by region.", available: false },
  { key: "crm", label: "CRM Data", description: "First-party customer relationship data.", available: false },
  { key: "pos", label: "POS Data", description: "Point-of-sale and transaction data.", available: false },
];

export function ResearchBody() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useSession();
  const canManage = user?.role === "admin" || user?.role === "publisher";

  const { projectId: id, project, orgs, loading, error, load } = useResearchProject();

  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [attachExistingOpen, setAttachExistingOpen] = useState(false);
  const [attachExistingSearchOpen, setAttachExistingSearchOpen] = useState(false);
  const [attachExistingDocumentOpen, setAttachExistingDocumentOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  // A newly created/attached conversation search returns here with
  // ?evidenceAdded=social_search (surveys go to Execution's wizard instead).
  const evidenceAddedHandledRef = useRef(false);
  useEffect(() => {
    if (searchParams.get("evidenceAdded") !== "social_search") return;
    if (!project || evidenceAddedHandledRef.current) return;
    evidenceAddedHandledRef.current = true;
    router.replace(`/research-projects/${id}/research`);
    load();
    setToast("Conversation search saved.");
  }, [searchParams, id, project, router, load]);

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project's research methods."} />
    </PageContainer>
  );

  const projectId = project.id;
  const orgBrands = orgs.filter(o => o.type === "brand");
  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");

  const surveyEvidence = project.evidence.filter(e => e.evidence_type === "survey");
  // Both media are stored as social_search evidence, so they are split by the
  // task's medium here. A task with no medium recorded predates News and is a
  // Conversation Search, which is what defaulting to conversation preserves.
  const allSearchEvidence = project.evidence.filter(e => e.evidence_type === "social_search");
  const searchEvidence = allSearchEvidence.filter(e => e.conversationSearch?.medium !== "news");
  const newsEvidence = allSearchEvidence.filter(e => e.conversationSearch?.medium === "news");
  const documentEvidence = project.evidence.filter(e => e.evidence_type === "document");
  const countFor = (k: string) => k === "survey" ? surveyEvidence.length : k === "social_search" ? searchEvidence.length : k === "news" ? newsEvidence.length : k === "document" ? documentEvidence.length : 0;

  async function attach(evidenceType: MethodType, evidenceId: string, close: () => void, okMsg: string, errMsg: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: evidenceType, evidence_id: evidenceId, source: "existing" }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? errMsg);
      return;
    }
    close();
    showToast(okMsg);
    load();
  }

  return (
    <>
      <PageContainer>
        <WorkspaceHeader
          title="Research Sources"
          description="Select the research methods and evidence sources that will answer your research question."
          primaryAction={canManage
            ? <PrimaryButton onClick={() => setEvidenceModalOpen(true)}>+ Add Research Source</PrimaryButton>
            : undefined}
        />

        {/* The methodology briefing that drives the methods below. */}
        <ResearchPlanPanel projectId={projectId} researchQuestion={project.research_question} canManage={canManage} />

        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] px-1 mt-2" style={{ color: "var(--text-tertiary)" }}>Research Methods</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {METHODS.map(m => {
            const count = countFor(m.key);
            const used = count > 0;
            const openMethod = () => router.push(`/research-projects/${projectId}/research/${METHOD_SLUG[m.key]}`);
            return (
              <div
                key={m.key}
                onClick={m.available ? openMethod : undefined}
                className={`bg-white border border-gray-100 rounded-xl flex flex-col overflow-hidden ${m.available ? "shadow-sm cursor-pointer transition-shadow hover:shadow-[var(--shadow-md)]" : "opacity-60"}`}
              >
                <div className="p-5 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-bold text-gray-900">{m.label}</h3>
                    {m.available
                      ? <StatusBadge label={used ? `${count} attached` : "Not used"} tone={used ? "success" : "neutral"} />
                      : <StatusBadge label="Coming Soon" tone="neutral" />}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{m.description}</p>
                </div>
                {m.available && (
                  <div className="px-5 py-2.5 border-t" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
                      {used ? "Manage sources" : "Open"}
                      <Icon.chevronRight size={14} />
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 px-1">More research capabilities will appear here as they become available.</p>
      </PageContainer>

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
          onAttach={surveyId => attach("survey", surveyId, () => setAttachExistingOpen(false), "Survey attached.", "Failed to attach survey.")}
        />
      )}

      {attachExistingSearchOpen && (
        <AttachExistingConversationSearchModal
          excludeSearchIds={searchEvidence.map(e => e.evidence_id)}
          isSimulated={project.research_mode === "simulated"}
          onClose={() => setAttachExistingSearchOpen(false)}
          onAttach={searchId => attach("social_search", searchId, () => setAttachExistingSearchOpen(false), "Conversation search attached.", "Failed to attach conversation search.")}
        />
      )}

      {attachExistingDocumentOpen && (
        <AttachExistingDocumentModal
          excludeDocumentIds={documentEvidence.map(e => e.evidence_id)}
          projectId={projectId}
          onClose={() => setAttachExistingDocumentOpen(false)}
          onAttach={documentId => attach("document", documentId, () => setAttachExistingDocumentOpen(false), "Document attached.", "Failed to attach document.")}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
          ✓ {toast}
        </div>
      )}
    </>
  );
}
