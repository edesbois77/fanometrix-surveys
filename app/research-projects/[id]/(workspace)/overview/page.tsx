"use client";

// The Overview area — the project's landing page. For now it renders the
// (trimmed) single-page workspace body: the project summary at the top
// (Research Question, Objective, source/progress rollup) followed by the
// sections that haven't been split into their own area routes yet (Project
// Information/Settings, Sources, Collection, Analysis, Outputs, Conclusion,
// Knowledge, Activity). As each of those is given its own area route in
// later steps it leaves this page, and Overview slims down to just the
// summary. The Design layer has already been split out to /design.
//
// The (workspace) shell layout provides AdminShell, the ProjectProvider data
// layer and the project header + navigation, so this page renders the body
// chromeless.
import { WorkspaceBodyContent } from "@/app/components/research-projects/WorkspaceBody";

export default function ResearchProjectOverviewPage() {
  return <WorkspaceBodyContent />;
}
