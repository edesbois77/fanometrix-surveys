"use client";

// The Analysis area body — the project's source-level analysis and
// project-level Intelligence surface, at /research-projects/[id]/analysis.
// It shows, per attached Research Source, the state of that source's own AI
// interpretation (Survey / Conversation / Document Intelligence) and opens
// each source's dedicated report; alongside Key Findings, the project-level
// synthesis distilled across the approved source Intelligence.
//
// The distinction is deliberately preserved, not merged: source-level
// analysis is what one Research Source found (per-evidence reports under
// …/reports/{survey|conversation|document}/…); project-level Intelligence is
// the synthesis across the available evidence (Key Findings). This is a
// relocation only — IntelligenceSection and the report routes are reused
// exactly as before; nothing about generation, review states, readiness or
// methodology changes.
//
// The cross-source Reports (Executive → Full Research → Editorial Article)
// are NOT here — they are the Outputs area (a later step) and remain on the
// Overview page for now.
//
// Chromeless: AdminShell, the ProjectProvider data layer and the project
// header + navigation are provided by the (workspace) shell layout. Product
// Walkthrough is unaffected — it keeps its own single-page WalkthroughBody
// with its own copy of this section.
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { IntelligenceSection } from "@/app/components/research-projects/IntelligenceSection";

export function AnalysisBody() {
  const router = useRouter();
  const { project, loading, error } = useResearchProject();

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
  const surveyEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { survey: NonNullable<EvidenceItem["survey"]> } => e.evidence_type === "survey" && !!e.survey
  );
  const conversationSearchEvidence = project.evidence.filter(e => e.evidence_type === "social_search" && e.conversationSearch);
  const documentEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { document: NonNullable<EvidenceItem["document"]> } => e.evidence_type === "document" && !!e.document
  );

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
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
    </div>
  );
}
