"use client";

// Dashboard › Document Intelligence — a MONITORING page. It surfaces the document
// pipeline state (uploaded → processing → ready → analysed → approved / failed)
// and gives each document a direct entry into its Analysis page. It never
// reproduces the generated analysis itself — that lives in Analysis › Document
// Analysis. No analysis is generated here; the entry point navigates to the
// canonical Document Analysis page, which owns generate-vs-view.
import { type EvidenceItem, type ResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { documentStatusMeta, isProcessing, DocumentPipeline } from "@/app/components/research-projects/document-status";
import { documentTypeLabel } from "@/lib/library-documents/constants";
import { Card, SectionHeading, MetricTile, StatusBadge, Button } from "@/app/components/workspace-ui";

type Doc = NonNullable<EvidenceItem["document"]>;
const isAnalysed = (s: string | null) => s != null;
const isApproved = (s: string | null) => s === "approved" || s === "published";

export function DocumentIntelligenceMonitor({ projectId, project }: { projectId: string; project: ResearchProject }) {
  const documents = project.evidence.filter(
    (e): e is EvidenceItem & { document: Doc } => e.evidence_type === "document" && !!e.document
  );

  if (documents.length === 0) return (
    <Card padding="lg"><p className="text-sm text-center py-4" style={{ color: "var(--text-tertiary)" }}>No documents attached to this project. Add one from the Research Library in Research.</p></Card>
  );

  const processing = documents.filter(e => isProcessing(e.document.library_status)).length;
  const ready = documents.filter(e => e.document.library_status === "approved" && !isAnalysed(e.document.summary_status)).length;
  const analysed = documents.filter(e => isAnalysed(e.document.summary_status)).length;
  const approved = documents.filter(e => isApproved(e.document.summary_status)).length;
  const failed = documents.filter(e => e.document.library_status === "failed").length;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricTile label="Attached" value={documents.length} icon="document" />
        <MetricTile label="Processing" value={processing} />
        <MetricTile label="Ready to analyse" value={ready} />
        <MetricTile label="Analysed" value={analysed} />
        <MetricTile label="Approved" value={approved} />
        <MetricTile label="Failed" value={failed} />
      </div>

      <div>
        <SectionHeading title="Documents" description="Pipeline status for every attached document. Open a document to view or generate its analysis." />
        <div className="space-y-3 mt-3">
          {documents.map(e => {
            const d = e.document;
            const meta = documentStatusMeta(d.library_status);
            const libraryApproved = d.library_status === "approved";
            const analysed = isAnalysed(d.summary_status);
            const analysisHref = `/research-projects/${projectId}/analysis/document/${e.id}`;
            return (
              <Card key={e.id} padding="md">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#7A5C86" }}>Document</p>
                    <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{d.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                      {documentTypeLabel(d.document_type)}
                      {d.author ? ` · ${d.author}` : ""}
                      {d.page_count ? ` · ${d.page_count} pages` : ""}
                      {(d.tags ?? []).length ? ` · ${(d.tags ?? []).length} tag${(d.tags ?? []).length === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge label={analysed ? (isApproved(d.summary_status) ? "Analysis approved" : "Analysis ready") : meta.label} tone={analysed ? "success" : meta.tone} dot />
                  </div>
                </div>

                {d.library_status === "failed" ? (
                  <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs" style={{ color: "#B4694C" }}>Processing failed in the Research Library.</p>
                    <Button href={`/research-library/${e.evidence_id}`} variant="secondary" size="sm">Review in Library</Button>
                  </div>
                ) : isProcessing(d.library_status) ? (
                  <div className="mt-4"><DocumentPipeline status={d.library_status} /></div>
                ) : libraryApproved ? (
                  <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {analysed ? "Interpreted for this project." : "Ready to analyse for this project."}
                    </p>
                    <Button href={analysisHref} variant={analysed ? "secondary" : "primary"} size="sm">
                      {analysed ? "View Analysis →" : "Generate Analysis →"}
                    </Button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}
