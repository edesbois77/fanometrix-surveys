"use client";

// The Conclusion & Knowledge area — the final project-level Conclusion
// (generate → review → approve → publish) and the durable Knowledge populated
// from the published Conclusion. The (workspace) shell layout provides
// AdminShell, the ProjectProvider data layer and the project header +
// navigation, so this page renders the body chromeless. See
// ConclusionKnowledgeBody for what it does.
import { ConclusionKnowledgeBody } from "@/app/components/research-projects/ConclusionKnowledgeBody";

export default function ResearchProjectConclusionPage() {
  return <ConclusionKnowledgeBody />;
}
