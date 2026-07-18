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
import { conversationCount, totalItems, collectionBreakdown } from "@/lib/connectors/content-kinds";
import { RESEARCH_GOAL_LABELS } from "@/lib/social-taxonomy";
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
      Manage Search
      <Icon.chevronRight size={14} />
    </span>
  );
}

// Compact overall-sentiment split — never just "Positive", which is misleading.
function SentimentSplit({ pos, neu, neg }: { pos: number; neu: number; neg: number }) {
  return (
    <span className="text-sm fx-tabular-nums">
      <span style={{ color: "#3F5D42" }}>{Math.round(pos)}%</span>
      <span style={{ color: "var(--text-disabled)" }}> · </span>
      <span style={{ color: "#6B6459" }}>{Math.round(neu)}%</span>
      <span style={{ color: "var(--text-disabled)" }}> · </span>
      <span style={{ color: "#8A4B33" }}>{Math.round(neg)}%</span>
    </span>
  );
}

// One search's derived display fields, in one place. The Execution page renders
// these as large SourceCards today; because the derivation lives here (not inline
// in the card), the same view-model can later feed a compact list/table row when
// projects hold many searches — without reworking the data or this component.
function deriveSearchView(cs: ConversationSearch) {
  const status = collectionStatus(cs);
  const hasKinds = Object.keys(cs.by_kind ?? {}).length > 0;
  const conv = hasKinds ? conversationCount(cs.by_kind) : cs.mention_count;
  const collected = hasKinds ? totalItems(cs.by_kind) : cs.mention_count;
  const breakdown = hasKinds ? collectionBreakdown(cs.by_kind) : (cs.mention_count > 0 ? `${cs.mention_count.toLocaleString()} items` : "—");
  const hasData = collected > 0 || cs.latest_run_status === "running";
  const goalLabel = RESEARCH_GOAL_LABELS[cs.research_goal] ?? cs.research_goal;
  const sources = (cs.platforms.length ? cs.platforms : cs.connectors).join(", ");
  // Research Goal · Markets · Sources — distinguishes searches at a glance.
  const subtitle = [goalLabel, cs.markets.join(", "), sources].filter(Boolean).join("  ·  ");
  return { status, conv, breakdown, hasData, subtitle };
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
        description="Collect and review the conversations gathered for each search across your sources and markets."
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
            const v = deriveSearchView(cs);
            return (
              <SourceCard
                key={item.id}
                type="conversation"
                name={cs.name}
                subtitle={v.subtitle}
                status={{ label: v.status.label, tone: v.status.tone, dot: true }}
                metrics={[
                  { label: "Evidence Collected", value: <span className="text-sm">{v.breakdown}</span> },
                  { label: "Conversations Analysed", value: v.conv.toLocaleString() },
                  { label: "Overall Sentiment", value: cs.mention_count > 0
                      ? <SentimentSplit pos={cs.positive_pct} neu={cs.neutral_pct} neg={cs.negative_pct} />
                      : "—" },
                ]}
                actions={v.hasData
                  ? <Button variant="secondary" size="sm" href={`/research-projects/${projectId}/dashboard`}>View Dashboard →</Button>
                  : undefined}
                onOpen={() => router.push(`${base}/${item.evidence_id}`)}
                footer={<ManageAffordance />}
              />
            );
          })}
        </div>
      )}

      {/* The source's journey across the workspace — where each stage happens. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
        <span>Configured in{" "}
          <button onClick={() => router.push(`/research-projects/${projectId}/research/conversation`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Research</button>
        </span>
        <span aria-hidden>→</span>
        <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Collected in Execution</span>
        <span aria-hidden>→</span>
        <span>Monitored in{" "}
          <button onClick={() => router.push(`/research-projects/${projectId}/dashboard`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Dashboard</button>
        </span>
        <span aria-hidden>→</span>
        <span>Analysed in{" "}
          <button onClick={() => router.push(`/research-projects/${projectId}/analysis`)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Analysis</button>
        </span>
      </div>
    </PageContainer>
  );
}
