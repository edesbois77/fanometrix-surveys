"use client";

// A Research Source mini-workspace — one per research method, at
// /research-projects/[id]/research/[method] (survey | conversation | library).
// This is where a single kind of evidence is SELECTED and ORGANISED for the
// project: a short description of the method, the actions to add a new source or
// attach an existing one, and every attached source of that type as its own
// card with summary information and an "Open" action to drill into it.
//
// Deliberately NOT operational: configuring, deploying and running research
// stays in Execution. This page only answers "which evidence of this type
// belongs to the project?" — the same add/attach handlers the Research area
// already used (shared AttachExisting*Modal + POST /evidence), just scoped to
// one method and presented as a dedicated workspace.
//
// Chromeless: AdminShell, the ProjectProvider data layer, the shell nav and the
// project page header (breadcrumb Research Projects › Overview › Research ›
// {Method}) all come from the (workspace) layout.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/components/SessionProvider";
import { AttachExistingSurveyModal } from "@/app/components/research-projects/AttachExistingSurveyModal";
import { AttachExistingConversationSearchModal } from "@/app/components/research-projects/AttachExistingConversationSearchModal";
import { AttachExistingDocumentModal } from "@/app/components/research-projects/AttachExistingDocumentModal";
import { UploadDocumentModal } from "@/app/components/library-documents/UploadDocumentModal";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState,
  SourceCard, StatusBadge, EmptyState, Button, Icon, type Tone,
} from "@/app/components/workspace-ui";
import { documentStatusMeta, isProcessing } from "@/app/components/research-projects/document-status";
import { documentTypeLabel } from "@/lib/library-documents/constants";

export type ResearchMethod = "survey" | "conversation" | "library";

type MethodConfig = {
  title: string;
  description: string;
  evidenceType: "survey" | "social_search" | "document";
  sourceType: "survey" | "conversation" | "document";
  createLabel?: string;
  createHref?: (projectId: string) => string;
  attachLabel: string;
  openLabel: string;
  emptyTitle: string;
};

const CONFIG: Record<ResearchMethod, MethodConfig> = {
  survey: {
    title: "Survey Research",
    description: "Structured questionnaires deployed to your audiences to measure attitudes, motivations and behaviours. Manage every survey attached to this research project here.",
    evidenceType: "survey",
    sourceType: "survey",
    createLabel: "+ New Survey",
    // Create + configure INSIDE the project (Research context) — save → attach →
    // return here, never into Execution. Deploying is a deliberate Execution step.
    createHref: pid => `/research-projects/${pid}/research/survey/new`,
    attachLabel: "+ Attach Existing Survey",
    openLabel: "Edit Survey →",
    emptyTitle: "No surveys attached yet",
  },
  conversation: {
    title: "Conversation Intelligence",
    description: "Analyse public conversations across markets and platforms. Manage every conversation search attached to this research project here.",
    evidenceType: "social_search",
    sourceType: "conversation",
    createLabel: "+ New Search",
    // Create INSIDE the project (Research context) — saves the same global
    // record and auto-associates it, rather than sending the user to the
    // standalone Social Listening area.
    createHref: pid => `/research-projects/${pid}/research/conversation/new`,
    attachLabel: "+ Attach Existing Search",
    openLabel: "Edit Search →",
    emptyTitle: "No conversation searches attached yet",
  },
  library: {
    title: "Research Library",
    description: "Industry reports, strategy documents and case studies from the Research Library. Manage every document attached to this research project here.",
    evidenceType: "document",
    sourceType: "document",
    attachLabel: "+ Attach from Library",
    openLabel: "View document →",
    emptyTitle: "No documents attached yet",
  },
};

function surveyStatusTone(s: string): { label: string; tone: Tone } {
  const m: Record<string, { label: string; tone: Tone }> = {
    draft: { label: "Draft", tone: "warning" },
    ready: { label: "Ready", tone: "success" },
    archived: { label: "Archived", tone: "neutral" },
    deleted: { label: "Deleted", tone: "neutral" },
  };
  return m[s] ?? { label: s || "—", tone: "neutral" };
}

function searchStatusTone(s: string): { label: string; tone: Tone } {
  const m: Record<string, { label: string; tone: Tone }> = {
    Draft: { label: "Draft", tone: "warning" },
    Active: { label: "Active", tone: "success" },
    Paused: { label: "Paused", tone: "warning" },
    Archived: { label: "Archived", tone: "neutral" },
  };
  return m[s] ?? { label: s || "—", tone: "neutral" };
}


export function ResearchMethodBody({ method }: { method: ResearchMethod }) {
  const cfg = CONFIG[method];
  const router = useRouter();
  const { user } = useSession();
  const canManage = user?.role === "admin" || user?.role === "publisher";

  const { projectId, project, orgs, campaigns, loading, error, load } = useResearchProject();

  const [attachOpen, setAttachOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false); // Research Library: upload a new document inside the project
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 4000); }

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this research source."} />
    </PageContainer>
  );

  const orgBrands = orgs.filter(o => o.type === "brand");
  const orgName = (orgId: string | null) => (orgId ? orgs.find(o => o.id === orgId)?.name ?? "" : "");
  const evidence = project.evidence.filter(e => e.evidence_type === cfg.evidenceType);

  async function attach(evidenceId: string, okMsg: string, errMsg: string) {
    const res = await fetch(`/api/research-projects/${projectId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evidence_type: cfg.evidenceType, evidence_id: evidenceId, source: "existing" }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showToast(json.error ?? errMsg);
      return;
    }
    setAttachOpen(false);
    showToast(okMsg);
    load();
  }

  function openHref(item: EvidenceItem): string {
    // All three open INSIDE the project (Research configures / organises).
    if (method === "conversation") return `/research-projects/${projectId}/research/conversation/${item.evidence_id}`;
    if (method === "library") return `/research-projects/${projectId}/research/library/${item.evidence_id}`;
    return `/research-projects/${projectId}/research/survey/${item.evidence_id}`;
  }

  function renderCard(item: EvidenceItem) {
    if (method === "survey" && item.survey) {
      const s = item.survey;
      const linked = campaigns.filter(c => (c.effective_survey_id ?? c.survey_id) === item.evidence_id);
      const campaignCount = linked.length;
      // Target = the sum of every linked campaign's response target, so it stays
      // reactive as campaigns (or their targets) change; falls back to the
      // survey's own target only when no campaigns reference it yet.
      const campaignTarget = linked.reduce((sum, c) => sum + (c.effective_target_responses ?? c.target_responses ?? 0), 0);
      const surveyTarget = campaignTarget > 0 ? campaignTarget : (s.target_responses ?? 0);
      return (
        <SourceCard
          key={item.id}
          type="survey"
          name={s.name}
          subtitle={s.brand_name ?? undefined}
          status={surveyStatusTone(s.status)}
          metrics={[
            { label: "Responses", value: surveyTarget > 0 ? `${s.response_count.toLocaleString()} / ${surveyTarget.toLocaleString()}` : s.response_count.toLocaleString() },
            { label: "Questions", value: s.question_count },
            { label: "Languages", value: s.completed_languages.length },
            { label: "Campaigns", value: campaignCount },
          ]}
          onOpen={() => router.push(openHref(item))}
          footer={<OpenAffordance label={cfg.openLabel} />}
        />
      );
    }
    if (method === "conversation" && item.conversationSearch) {
      const c = item.conversationSearch;
      return (
        <SourceCard
          key={item.id}
          type="conversation"
          name={c.name}
          subtitle={c.markets.length ? c.markets.join(" · ") : undefined}
          status={searchStatusTone(c.status)}
          metrics={[
            { label: "Conversations", value: c.mention_count.toLocaleString() },
            { label: "Markets", value: c.markets.length },
            { label: "Platforms", value: c.platforms.length },
            { label: "Positive", value: `${Math.round(c.positive_pct)}%` },
          ]}
          onOpen={() => router.push(openHref(item))}
          footer={<OpenAffordance label={cfg.openLabel} />}
        />
      );
    }
    if (method === "library" && item.document) {
      return <DocumentCard key={item.id} doc={item.document} onOpen={() => router.push(openHref(item))} openLabel={cfg.openLabel} />;
    }
    return null;
  }

  return (
    <>
      <PageContainer>
        <WorkspaceHeader
          back={{ href: `/research-projects/${projectId}/research`, label: "Back to Research" }}
          title={cfg.title}
          description={cfg.description}
          secondaryActions={canManage ? <Button variant="secondary" onClick={() => setAttachOpen(true)}>{cfg.attachLabel}</Button> : undefined}
          primaryAction={canManage
            ? (method === "library"
                ? <Button variant="primary" onClick={() => setUploadOpen(true)}>+ Upload New Document</Button>
                : cfg.createHref
                  ? <Button variant="primary" onClick={() => router.push(cfg.createHref!(projectId))}>{cfg.createLabel}</Button>
                  : undefined)
            : undefined}
        />

        {evidence.length === 0 ? (
          <EmptyState
            icon="＋"
            title={cfg.emptyTitle}
            description={canManage ? "Attach an existing source or create a new one to begin." : "No sources of this type have been added yet."}
            action={canManage ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setAttachOpen(true)}>{cfg.attachLabel}</Button>
                {method === "library"
                  ? <Button variant="primary" onClick={() => setUploadOpen(true)}>+ Upload New Document</Button>
                  : cfg.createHref && <Button variant="primary" onClick={() => router.push(cfg.createHref!(projectId))}>{cfg.createLabel}</Button>}
              </div>
            ) : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {evidence.map(renderCard)}
          </div>
        )}

        {/* Where this source goes next — Research configures; the operational /
            interpretive stages own the rest. Documents aren't run, so Library
            points to Analysis rather than Execution. */}
        {method === "library" ? (
          <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
            Documents are added and organised here. What they say is interpreted in{" "}
            <button onClick={() => router.push(`/research-projects/${projectId}/analysis`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Analysis →</button>
          </p>
        ) : (
          <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
            Once evidence is selected here, configure, deploy and run it in{" "}
            <button onClick={() => router.push(`/research-projects/${projectId}/execution`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Execution →</button>
          </p>
        )}
      </PageContainer>

      {attachOpen && method === "survey" && (
        <AttachExistingSurveyModal
          excludeSurveyIds={evidence.map(e => e.evidence_id)}
          orgName={orgName}
          orgBrands={orgBrands}
          isSimulated={project.research_mode === "simulated"}
          onClose={() => setAttachOpen(false)}
          onAttach={surveyId => attach(surveyId, "Survey attached.", "Failed to attach survey.")}
        />
      )}
      {attachOpen && method === "conversation" && (
        <AttachExistingConversationSearchModal
          excludeSearchIds={evidence.map(e => e.evidence_id)}
          isSimulated={project.research_mode === "simulated"}
          onClose={() => setAttachOpen(false)}
          onAttach={searchId => attach(searchId, "Conversation search attached.", "Failed to attach conversation search.")}
        />
      )}
      {attachOpen && method === "library" && (
        <AttachExistingDocumentModal
          excludeDocumentIds={evidence.map(e => e.evidence_id)}
          onClose={() => setAttachOpen(false)}
          onAttach={documentId => attach(documentId, "Document attached.", "Failed to attach document.")}
          onUploadNew={() => { setAttachOpen(false); setUploadOpen(true); }}
        />
      )}
      {uploadOpen && method === "library" && (
        // Same global upload + processing pipeline as the standalone Library,
        // but it stays in the project: on success we attach the new document to
        // THIS project and remain on the mini-workspace (the list refreshes).
        <UploadDocumentModal
          onClose={() => setUploadOpen(false)}
          onUploaded={docId => {
            setUploadOpen(false);
            attach(docId, "Document uploaded and attached to the project.", "Uploaded, but couldn't attach to the project.");
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 shadow-lg text-sm font-medium bg-green-600 text-white" style={{ borderRadius: "var(--radius-panel)" }}>
          ✓ {toast}
        </div>
      )}
    </>
  );
}

// The "Open …" affordance in each source card's footer. The whole card is
// clickable (onOpen); this is the visible cue.
function OpenAffordance({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
      {label.replace(/\s*→\s*$/, "")}
      <Icon.chevronRight size={14} />
    </span>
  );
}

const fmtCardDate = (s: string) => new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function DocMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>{children}</div>
    </div>
  );
}

// The Research Library document card. Deliberately NOT the shared SourceCard:
// no source-type eyebrow, the status sits top-right, the author is the
// secondary line (not the document type), and tags are surfaced restrained.
// Reuses the UI v2 card container, StatusBadge, typography and footer style.
function DocumentCard({ doc, onOpen, openLabel }: {
  doc: NonNullable<EvidenceItem["document"]>;
  onOpen: () => void;
  openLabel: string;
}) {
  const status = documentStatusMeta(doc.library_status);
  // Manual metadata (type, pages, uploaded) is available immediately. AI
  // metadata (author-if-derived, tags) only lands once processing finishes,
  // so while processing we show a "generating" hint rather than a blank/final
  // value — and only hide it once a completed document genuinely has none.
  const processing = isProcessing(doc.library_status);
  const tags = doc.tags ?? [];
  const shownTags = tags.slice(0, 2);
  const extra = tags.length - shownTags.length;
  return (
    <div
      className="border overflow-hidden cursor-pointer transition-shadow hover:shadow-[var(--shadow-md)] h-full flex flex-col"
      style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-sm)" }}
      onClick={onOpen}
    >
      <div className="p-4 md:p-5 flex-1">
        {/* Header — title left, status top-right */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{doc.name}</h3>
            <p className="text-xs mt-0.5 truncate" style={{ color: doc.author ? "var(--text-secondary)" : "var(--text-tertiary)", fontStyle: doc.author ? undefined : "italic" }}>
              {doc.author || (processing ? "Identifying author…" : "Author unknown")}
            </p>
          </div>
          <StatusBadge label={status.label} tone={status.tone} dot />
        </div>

        {/* Metadata basics — friendly labels, no repeated type/title */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3 mt-4">
          <DocMeta label="Type">{documentTypeLabel(doc.document_type)}</DocMeta>
          <DocMeta label="Pages">{doc.page_count ?? "—"}</DocMeta>
          <DocMeta label="Uploaded">{fmtCardDate(doc.uploaded_at)}</DocMeta>
        </div>
        {/* Tags — always on their own row so the row lines up across cards
            whether the value is chips or a "generating" hint. */}
        {tags.length > 0 ? (
          <div className="mt-3">
            <DocMeta label="Tags">
              <div className="flex items-center gap-1.5">
                {shownTags.map(t => (
                  <span key={t} className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{t}</span>
                ))}
                {extra > 0 && <span className="text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>+{extra}</span>}
              </div>
            </DocMeta>
          </div>
        ) : processing ? (
          <div className="mt-3">
            <DocMeta label="Tags"><span className="text-xs font-normal italic" style={{ color: "var(--text-tertiary)" }}>Generating…</span></DocMeta>
          </div>
        ) : null}
      </div>

      {/* Footer — one clear action into the project-scoped document page */}
      <div className="px-4 md:px-5 py-2.5 border-t" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
        <OpenAffordance label={openLabel} />
      </div>
    </div>
  );
}
