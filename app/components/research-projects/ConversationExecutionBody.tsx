"use client";

// The Conversation Searches operation workspace —
// /research-projects/[id]/execution/conversation. The operational twin of the
// Surveys list (SurveysExecutionBody): same card quality and layout, different
// metrics — mentions, platforms, markets, collection status — and each card is
// the entry point into a single search's collection workflow rather than the
// search editor.
//
// Searches are CONFIGURED in Research; this page never adds one. A search that
// is actively collecting (or already has mentions) offers a direct hand-off to
// Dashboard, mirroring a live survey. Chromeless: the (workspace) shell layout
// provides AdminShell, the ProjectProvider data layer and the project header +
// navigation.
import { useRouter } from "next/navigation";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { conversationCount, totalItems } from "@/lib/connectors/content-kinds";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, EmptyState,
  SourceCard, Button, Icon, type Tone,
} from "@/app/components/workspace-ui";

type ConversationSearch = NonNullable<EvidenceItem["conversationSearch"]>;

// Operational collection state — driven by the Reddit collection run, not the
// search's own Draft/Active lifecycle (that's a Research concern). "Collecting"
// is the live/alive state; a finished run reads as a calm "Collected".
function collectionStatus(cs: ConversationSearch): { label: string; tone: Tone } {
  const rs = cs.latest_run_status;
  if (rs === "running") return { label: "Collecting", tone: "success" };
  if (rs === "failed") return { label: "Collection failed", tone: "danger" };
  if (rs === "partial") return { label: "Collected (partial)", tone: "warning" };
  if (rs === "completed" || cs.mention_count > 0) return { label: "Collected", tone: "neutral" };
  return { label: "Not collected", tone: "neutral" };
}

function ManageAffordance() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>
      Manage Collection
      <Icon.chevronRight size={14} />
    </span>
  );
}

export function ConversationExecutionBody() {
  const router = useRouter();
  const { projectId, project, loading, error } = useResearchProject();

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project's conversation searches."} />
    </PageContainer>
  );

  const base = `/research-projects/${projectId}/execution/conversation`;
  const searchEvidence = project.evidence.filter(
    (e): e is EvidenceItem & { conversationSearch: ConversationSearch } => e.evidence_type === "social_search" && !!e.conversationSearch
  );

  return (
    <PageContainer>
      <WorkspaceHeader
        back={{ href: `/research-projects/${projectId}/execution`, label: "Back to Execution" }}
        title="Conversation Searches"
        description="Run and monitor conversation collection across markets and platforms, and watch the mentions come in."
      />

      {searchEvidence.length === 0 ? (
        <EmptyState
          icon="＋"
          title="No conversation searches attached yet"
          description="Conversation searches are configured in Research. Add one there, then return here to run and monitor collection."
          action={<Button variant="secondary" onClick={() => router.push(`/research-projects/${projectId}/research/conversation`)}>Go to Conversation Intelligence →</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {searchEvidence.map(item => {
            const cs = item.conversationSearch;
            const status = collectionStatus(cs);
            const hasKinds = Object.keys(cs.by_kind ?? {}).length > 0;
            const conv = hasKinds ? conversationCount(cs.by_kind) : cs.mention_count;
            const collected = hasKinds ? totalItems(cs.by_kind) : cs.mention_count;
            const hasData = collected > 0 || cs.latest_run_status === "running";
            const lastCollected = cs.last_collected_at ? `Last collected ${formatRelativeTime(cs.last_collected_at)}` : "Not collected yet";
            return (
              <SourceCard
                key={item.id}
                type="conversation"
                name={cs.name}
                subtitle={cs.markets.length ? cs.markets.join(" · ") : lastCollected}
                status={{ label: status.label, tone: status.tone, dot: true }}
                metrics={[
                  { label: "Collected", value: collected.toLocaleString() },
                  { label: "Conversations", value: conv.toLocaleString() },
                  { label: "Markets", value: cs.markets.length },
                  { label: "Positive", value: cs.mention_count > 0 ? `${Math.round(cs.positive_pct)}%` : "—" },
                ]}
                actions={hasData
                  ? <Button variant="secondary" size="sm" href={`/research-projects/${projectId}/dashboard`}>View Dashboard →</Button>
                  : undefined}
                onOpen={() => router.push(`${base}/${item.evidence_id}`)}
                footer={<ManageAffordance />}
              />
            );
          })}
        </div>
      )}

      <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
        Searches are configured in{" "}
        <button onClick={() => router.push(`/research-projects/${projectId}/research/conversation`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Research →</button>
        {" "}and their live volumes are monitored in{" "}
        <button onClick={() => router.push(`/research-projects/${projectId}/dashboard`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Dashboard →</button>
      </p>
    </PageContainer>
  );
}
