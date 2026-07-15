"use client";

// The Overview area — the project's executive-snapshot landing page. It shows
// the Research Brief (question + objective + brief editor), Project Information
// (metadata + classification + lifecycle actions), and a lightweight Research
// Snapshot that links to the full Dashboard. Every other research area
// (Sources, Dashboard, Analysis, Outputs, Conclusion & Knowledge) and the
// Activity utility now have their own routes.
//
// The (workspace) shell layout provides AdminShell, the ProjectProvider data
// layer and the project header + navigation, so this page renders the body
// chromeless.
import { WorkspaceBodyContent } from "@/app/components/research-projects/WorkspaceBody";

export default function ResearchProjectOverviewPage() {
  return <WorkspaceBodyContent />;
}
