"use client";

// Analysis › Document Findings reader (the two-layer document output), mounted
// inside the Research Project workspace shell. Reuses the shared
// DocumentFindingsReader; review logic, engine, approval workflow and stored
// output are untouched. evidenceId here is the evidence ROW id.
import { DocumentFindingsReader } from "@/app/components/research-projects/analysis/DocumentFindingsReader";

export default function AnalysisDocumentFindingsPage() {
  return <DocumentFindingsReader />;
}
