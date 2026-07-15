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
import Link from "next/link";
import { useSession } from "@/app/components/SessionProvider";
import { AttachExistingSurveyModal } from "@/app/components/research-projects/AttachExistingSurveyModal";
import { AttachExistingConversationSearchModal } from "@/app/components/research-projects/AttachExistingConversationSearchModal";
import { AttachExistingDocumentModal } from "@/app/components/research-projects/AttachExistingDocumentModal";
import { PageIntro } from "@/app/components/research-projects/PageIntro";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@/app/components/research-projects/ActionPrimitives";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { AddEvidenceModal } from "@/app/components/research-projects/workspace-shared";

type MethodType = "survey" | "social_search" | "document";

const METHODS: { key: MethodType | string; label: string; description: string; available: boolean }[] = [
  { key: "survey", label: "Survey Research", description: "Structured questionnaires deployed to your audiences to measure attitudes, motivations and behaviours.", available: true },
  { key: "social_search", label: "Conversation Intelligence", description: "Analyse public conversations and social mentions across markets and platforms.", available: true },
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

  if (loading && !project) return (
    <div className="p-6 flex items-center justify-center h-64">
      <p className="text-gray-400 text-sm">Loading research project…</p>
    </div>
  );
  if (error || !project) return (
    <div className="p-6 max-w-5xl mx-auto text-center py-20">
      <p className="text-gray-400 mb-4">{error || "Research project not found."}</p>
      <Link href="/research-projects" className="text-[#D7B87A] hover:underline text-sm">← Back to Research Projects</Link>
    </div>
  );

  const projectId = project.id;
  const orgBrands = orgs.filter(o => o.type === "brand");
  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");

  const surveyEvidence = project.evidence.filter(e => e.evidence_type === "survey");
  const searchEvidence = project.evidence.filter(e => e.evidence_type === "social_search");
  const documentEvidence = project.evidence.filter(e => e.evidence_type === "document");
  const countFor = (k: string) => k === "survey" ? surveyEvidence.length : k === "social_search" ? searchEvidence.length : k === "document" ? documentEvidence.length : 0;

  function openAttach(type: MethodType) {
    if (type === "survey") setAttachExistingOpen(true);
    if (type === "social_search") setAttachExistingSearchOpen(true);
    if (type === "document") setAttachExistingDocumentOpen(true);
  }

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
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <PageIntro>Select the research methods and evidence sources that will answer your research question.</PageIntro>
          {canManage && (
            <PrimaryButton onClick={() => setEvidenceModalOpen(true)}>+ Add Research Source</PrimaryButton>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {METHODS.map(m => {
            const count = countFor(m.key);
            const used = count > 0;
            return (
              <div key={m.key} className={`bg-white border rounded-xl p-5 flex flex-col ${m.available ? "border-gray-100 shadow-sm" : "border-gray-100 opacity-60"}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-bold text-gray-900">{m.label}</h3>
                  {m.available
                    ? <StatusBadge label={used ? `${count} attached` : "Not used"} tone={used ? "success" : "neutral"} />
                    : <StatusBadge label="Coming Soon" tone="neutral" />}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed flex-1">{m.description}</p>
                {m.available && (
                  <div className="flex items-center gap-2 flex-wrap mt-4">
                    {used && (
                      <SecondaryButton onClick={() => router.push(`/research-projects/${projectId}/execution`)}>View &amp; manage →</SecondaryButton>
                    )}
                    {canManage && (
                      <SecondaryButton onClick={() => openAttach(m.key as MethodType)}>Attach existing</SecondaryButton>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-400 px-1">More research capabilities will appear here as they become available.</p>
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
