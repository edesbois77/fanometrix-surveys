"use client";

// The Research area — choosing the research methods and evidence sources that
// will answer the research question. Method selection only; the operational
// work (campaigns, deployment, run research) is the Execution area. The
// (workspace) shell layout provides AdminShell, the ProjectProvider data layer
// and the project header + navigation, so this page renders the body
// chromeless. See ResearchBody.
import { ResearchBody } from "@/app/components/research-projects/ResearchBody";

export default function ResearchProjectResearchPage() {
  return <ResearchBody />;
}
