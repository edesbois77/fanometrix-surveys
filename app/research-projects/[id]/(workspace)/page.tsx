"use client";

// The real, operational Research Project Workspace page. Thin by design: the
// (workspace) shell layout owns AdminShell, the ProjectProvider data layer,
// and the project header + navigation, so this page renders only the
// workspace body itself (chromeless), reading project data from the layout's
// provider. This still renders the whole single-page workspace as "Overview"
// for now — the content is split into per-area routes in later steps. See
// app/components/research-projects/WorkspaceBody.tsx.
import { WorkspaceBodyContent } from "@/app/components/research-projects/WorkspaceBody";

export default function ResearchProjectDetailPage() {
  return <WorkspaceBodyContent />;
}
