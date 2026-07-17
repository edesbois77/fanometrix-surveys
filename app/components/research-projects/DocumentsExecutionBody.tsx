"use client";

// The Documents operation workspace —
// /research-projects/[id]/execution/document. The operational twin of the
// Surveys / Conversation Searches lists: same card language, document-specific
// state (the processing pipeline). Each card is the entry point into a single
// document's processing view rather than the library editor.
//
// Documents are UPLOADED / attached in Research; Execution PROCESSES them;
// Analysis interprets them. A Ready document offers a direct hand-off to
// Analysis, mirroring a live survey's hand-off to Dashboard. Chromeless: the
// (workspace) shell provides the project header + navigation.
import { useRouter } from "next/navigation";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { documentStatusMeta } from "@/app/components/research-projects/document-status";
import { documentTypeLabel } from "@/lib/library-documents/constants";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, EmptyState,
  SourceCard, Button, Icon,
} from "@/app/components/workspace-ui";

type LibraryDocument = NonNullable<EvidenceItem["document"]>;

function OpenAffordance({ ready }: { ready: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
      {ready ? "View Document" : "View Progress"}
      <Icon.chevronRight size={14} />
    </span>
  );
}

export function DocumentsExecutionBody() {
  const router = useRouter();
  const { projectId, project, loading, error } = useResearchProject();

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project's documents."} />
    </PageContainer>
  );

  const base = `/research-projects/${projectId}/execution/document`;
  const documentEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { document: LibraryDocument } => e.evidence_type === "document" && !!e.document
  );

  return (
    <PageContainer>
      <WorkspaceHeader
        back={{ href: `/research-projects/${projectId}/execution`, label: "Back to Execution" }}
        title="Documents"
        description="Process uploaded documents so their content is ready for Analysis."
      />

      {documentEvidence.length === 0 ? (
        <EmptyState
          icon="＋"
          title="No documents attached yet"
          description="Documents are added in the Research Library. Attach one there, then return here to watch it process."
          action={<Button variant="secondary" onClick={() => router.push(`/research-projects/${projectId}/research/library`)}>Go to Research Library →</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {documentEvidence.map(item => {
            const d = item.document;
            const meta = documentStatusMeta(d.library_status);
            const ready = d.library_status === "approved";
            return (
              <SourceCard
                key={item.id}
                type="document"
                name={d.name}
                subtitle={d.author ?? undefined}
                status={{ label: meta.label, tone: meta.tone, dot: true }}
                metrics={[
                  { label: "Type", value: documentTypeLabel(d.document_type) },
                  { label: "Pages", value: d.page_count ?? "—" },
                  { label: "Tags", value: (d.tags ?? []).length },
                  { label: "Uploaded", value: formatRelativeTime(d.uploaded_at) },
                ]}
                actions={ready
                  ? <Button variant="secondary" size="sm" href={`/research-projects/${projectId}/analysis`}>View Analysis →</Button>
                  : undefined}
                onOpen={() => router.push(`${base}/${item.evidence_id}`)}
                footer={<OpenAffordance ready={ready} />}
              />
            );
          })}
        </div>
      )}

      <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
        Documents are added in the{" "}
        <button onClick={() => router.push(`/research-projects/${projectId}/research/library`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Research Library →</button>
        {" "}and interpreted in{" "}
        <button onClick={() => router.push(`/research-projects/${projectId}/analysis`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Analysis →</button>
      </p>
    </PageContainer>
  );
}
