"use client";

// The Outputs area — the cross-source reporting chain (Executive Report →
// Full Research Report → Editorial Article) in its established sequence. The
// (workspace) shell layout provides AdminShell, the ProjectProvider data
// layer and the project header + navigation, so this page renders the body
// chromeless. See OutputsBody for what it does.
import { OutputsBody } from "@/app/components/research-projects/OutputsBody";

export default function ResearchProjectOutputsPage() {
  return <OutputsBody />;
}
