"use client";

// Dashboard › Conversation Intelligence — the project's operational conversation
// dashboard, aggregating every attached search. Reuses the existing conversation
// aggregation (server-side, scoped by research_project_id) and the existing
// stats charts — no aggregation is re-implemented. Configuration and Fetch
// controls remain in Research and Execution.
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { ConversationDashboardBody } from "@/app/components/research-projects/dashboard/ConversationDashboardBody";
import { PageLoadingState, ErrorState } from "@/app/components/workspace-ui";

export default function DashboardConversationPage() {
  const { projectId, project, loading, error } = useResearchProject();

  if (loading && !project) return <PageLoadingState />;
  if (error || !project) return (
    <ErrorState title="Research project not found" description={error || "We couldn't load this project's conversation dashboard."} />
  );

  const searches = project.evidence
    .filter((e): e is EvidenceItem & { conversationSearch: NonNullable<EvidenceItem["conversationSearch"]> } => e.evidence_type === "social_search" && !!e.conversationSearch)
    .map(e => ({
      evidence_id: e.evidence_id,
      name: e.conversationSearch.name,
      mention_count: e.conversationSearch.mention_count,
      reddit_collection_status: e.conversationSearch.reddit_collection_status,
      reddit_last_collected_at: e.conversationSearch.reddit_last_collected_at,
    }));

  return <ConversationDashboardBody projectId={projectId} searches={searches} />;
}
