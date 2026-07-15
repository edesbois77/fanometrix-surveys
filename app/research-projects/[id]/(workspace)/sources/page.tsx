"use client";

// The Sources area — Research Sources (Surveys, Conversation Searches,
// Documents) with each survey's Research Target / Creative Design / Campaigns
// nested, the read-only Campaign Groups view, and the Collection (Dashboard)
// monitoring rollup. The (workspace) shell layout provides AdminShell, the
// ProjectProvider data layer and the project header + navigation, so this page
// renders the body chromeless. See SourcesBody for everything it does.
import { SourcesBody } from "@/app/components/research-projects/SourcesBody";

export default function ResearchProjectSourcesPage() {
  return <SourcesBody />;
}
