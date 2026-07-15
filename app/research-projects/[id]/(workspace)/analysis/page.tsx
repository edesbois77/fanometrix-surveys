"use client";

// The Analysis area — per-source Intelligence (Survey / Conversation /
// Document) and the project-level Key Findings synthesis. The cross-source
// Reports (Executive → Full Research → Editorial Article) are the separate
// Outputs area. The (workspace) shell layout provides AdminShell, the
// ProjectProvider data layer and the project header + navigation, so this
// page renders the body chromeless. See AnalysisBody for what it does.
import { AnalysisBody } from "@/app/components/research-projects/AnalysisBody";

export default function ResearchProjectAnalysisPage() {
  return <AnalysisBody />;
}
