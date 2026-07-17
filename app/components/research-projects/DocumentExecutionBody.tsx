"use client";

// A single document's operational home, at
// /research-projects/[id]/execution/document/[documentEvidenceId] — the
// operational twin of the Campaigns / Conversation Search pages. This is where
// an uploaded document is PROCESSED into something Analysis can read: the
// pipeline is made visible, cleanly, and the primary action evolves with state
// (Processing → the pipeline itself · Failed → Retry · Ready → View Analysis).
//
// The pipeline stages shown reflect what the platform actually does —
// text extraction, then a single AI pass that produces metadata, a summary and
// tags — presented as clean stages rather than raw statuses. There is no
// embeddings stage in the platform, so none is shown. Retry reuses the same
// POST /api/library-documents/[id]/analysis the standalone Library uses.
//
// While processing, the page polls so the pipeline advances live. Chromeless:
// the (workspace) shell provides the project header + navigation; this body
// sets the breadcrumb tail (the document name) via WorkspaceRecordContext.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { useWorkspaceRecord } from "@/app/components/research-projects/WorkspaceRecordContext";
import { documentStatusMeta, isProcessing } from "@/app/components/research-projects/document-status";
import { documentTypeLabel } from "@/lib/library-documents/constants";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState,
  Card, Button, SectionHeading, ProgressSteps, type StepState,
} from "@/app/components/workspace-ui";

type LibraryDocument = NonNullable<EvidenceItem["document"]>;

const STATUS_ORDER = ["uploaded", "extracting", "analysing", "pending_review", "approved"];

// Which pipeline stages are complete, from the document's real signals — the
// coarse library_status plus the observable outputs (author, summary, tags).
// Metadata / summary / tags land together in the single analysis pass, so their
// ticks flip together; that's honest to how the platform works.
function pipelineSteps(d: LibraryDocument): { label: string; description: string; state: StepState }[] {
  const idx = STATUS_ORDER.indexOf(d.library_status);
  const failed = d.library_status === "failed";
  const done = {
    extract: idx >= 2,
    metadata: idx >= 3 || !!d.author,
    summary: idx >= 4 || !!d.generated_at || d.summary_status != null,
    tags: (d.tags ?? []).length > 0 || idx >= 4,
    ready: idx >= 4,
  };
  const order = ["extract", "metadata", "summary", "tags", "ready"] as const;
  const active = failed ? null : order.find(k => !done[k]) ?? null;
  const st = (k: keyof typeof done): StepState => (done[k] ? "done" : active === k ? "active" : "pending");

  return [
    { label: "Uploaded", description: "The document arrived and was queued for processing.", state: "done" },
    { label: "Text extracted", description: "The document's text is read and prepared.", state: st("extract") },
    { label: "Metadata identified", description: "Title, author and document type are recognised.", state: st("metadata") },
    { label: "Summary written", description: "A concise summary of the document is generated.", state: st("summary") },
    { label: "Tags generated", description: "Key themes are turned into searchable tags.", state: st("tags") },
    { label: "Ready for Analysis", description: "Prepared and available for interpretation in Analysis.", state: st("ready") },
  ];
}

export function DocumentExecutionBody({ documentEvidenceId }: { documentEvidenceId: string }) {
  const { projectId, project, loading, error, load } = useResearchProject();
  const { setRecordLabel } = useWorkspaceRecord();

  const [retrying, setRetrying] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const item = project?.evidence.find(
    (e): e is EvidenceItem & { document: LibraryDocument } =>
      e.evidence_type === "document" && e.evidence_id === documentEvidenceId && !!e.document
  );

  useEffect(() => {
    setRecordLabel(item?.document.name ?? null);
    return () => setRecordLabel(null);
  }, [item?.document.name, setRecordLabel]);

  // Poll while processing so the pipeline advances live (the shared provider
  // only polls for the walkthrough's Run Research, not document processing).
  const processing = item ? isProcessing(item.document.library_status) : false;
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [processing, load]);

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project."} />
    </PageContainer>
  );
  if (!item) return (
    <PageContainer>
      <ErrorState
        title="Document not found"
        description="This document isn't attached to the project, or it may have been removed."
        backHref={`/research-projects/${projectId}/execution/document`}
        backLabel="Back to Documents"
      />
    </PageContainer>
  );

  const d = item.document;
  const meta = documentStatusMeta(d.library_status);
  const failed = d.library_status === "failed";
  const ready = d.library_status === "approved";
  const tags = d.tags ?? [];

  const summaryParts = [
    documentTypeLabel(d.document_type),
    d.page_count ? `${d.page_count} page${d.page_count === 1 ? "" : "s"}` : null,
    `Uploaded ${formatRelativeTime(d.uploaded_at)}`,
    d.author ? `by ${d.author}` : null,
  ].filter(Boolean) as string[];

  async function handleRetry() {
    setRetrying(true);
    const res = await fetch(`/api/library-documents/${documentEvidenceId}/analysis`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true }),
    });
    const json = await res.json().catch(() => ({}));
    setRetrying(false);
    if (!res.ok) { showToast(json.error ?? "Couldn't restart processing.", false); return; }
    showToast("Reprocessing started.");
    load();
  }

  const primaryAction = ready
    ? <Button variant="primary" href={`/research-projects/${projectId}/analysis`}>View Analysis →</Button>
    : failed
      ? <Button variant="primary" onClick={handleRetry} disabled={retrying}>{retrying ? "Retrying…" : "Retry processing"}</Button>
      : undefined;

  return (
    <>
      <PageContainer>
        <WorkspaceHeader
          back={{ href: `/research-projects/${projectId}/execution/document`, label: "Back to Documents" }}
          title={d.name}
          description="Prepare this document for Analysis. Processing runs automatically; watch its progress below."
          status={{ label: meta.label, tone: meta.tone, dot: true }}
          meta={<span>{summaryParts.join(" · ")}</span>}
          primaryAction={primaryAction}
        />

        {/* ── Processing pipeline ───────────────────────────────────────────── */}
        <Card padding="lg">
          <SectionHeading
            title="Processing"
            description={ready
              ? "This document is fully processed and ready for Analysis."
              : failed
                ? "Processing didn't finish. Retry to run it again."
                : "Preparing this document automatically — no action needed."}
          />
          {failed ? (
            <div className="mt-4 rounded-lg border px-4 py-3" style={{ background: "#F9EFEA", borderColor: "#E8D2C4" }}>
              <p className="text-sm font-semibold" style={{ color: "#B4694C" }}>Processing failed</p>
              <p className="text-xs mt-1" style={{ color: "#B4694C" }}>The document couldn&apos;t be read or analysed. Retry, or re-upload it in the Research Library if the file is damaged.</p>
              <div className="mt-3">
                <Button variant="brand" onClick={handleRetry} disabled={retrying}>{retrying ? "Retrying…" : "Retry processing"}</Button>
              </div>
            </div>
          ) : (
            <ProgressSteps className="mt-5" steps={pipelineSteps(d)} />
          )}
        </Card>

        {/* ── Ready outputs ─────────────────────────────────────────────────── */}
        {ready && tags.length > 0 && (
          <div>
            <SectionHeading title="What we extracted" description="The metadata and tags now available to Analysis." />
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map((t, i) => (
                <span key={i} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{t}</span>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
          Added in the{" "}
          <Link href={`/research-projects/${projectId}/research/library/${documentEvidenceId}`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Research Library</Link>
          {" · "}interpreted in{" "}
          <Link href={`/research-projects/${projectId}/analysis`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Analysis →</Link>
        </p>
      </PageContainer>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </>
  );
}
