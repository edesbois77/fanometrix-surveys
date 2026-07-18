"use client";

// A single conversation search's operational home, at
// /research-projects/[id]/execution/conversation/[searchEvidenceId] — the
// operational twin of the Campaigns page. This is where a search is run and
// watched: trigger collection, monitor status/mentions/sentiment, then hand off
// to Dashboard once it's collecting.
//
// Run Collection posts to the unified POST /api/social/searches/[id]/collect —
// the single collection pipeline shared with the standalone Social Listening
// tool. It runs every connector the search has enabled (YouTube, Reddit, …) and
// records the run as a timestamped snapshot. Collection is on-demand — "refresh"
// is simply running it again, which captures a fresh snapshot.
//
// Chromeless: the (workspace) shell provides the project header + navigation;
// this body sets the breadcrumb tail (the search name) via WorkspaceRecordContext.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { useWorkspaceRecord } from "@/app/components/research-projects/WorkspaceRecordContext";
import { CollectionRunHistory } from "@/app/components/research-projects/CollectionRunHistory";
import { collectionBreakdown, conversationCount } from "@/lib/connectors/content-kinds";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState,
  Card, Panel, Button, StatusBadge, SectionHeading, MetricTile, SentimentBar, type Tone,
} from "@/app/components/workspace-ui";

type ConversationSearch = NonNullable<EvidenceItem["conversationSearch"]>;

function collectionStatus(cs: ConversationSearch): { label: string; tone: Tone } {
  const rs = cs.latest_run_status;
  if (rs === "running") return { label: "Collecting", tone: "success" };
  if (rs === "failed") return { label: "Collection failed", tone: "danger" };
  if (rs === "partial") return { label: "Collected (partial)", tone: "warning" };
  if (rs === "completed" || cs.mention_count > 0) return { label: "Collected", tone: "neutral" };
  return { label: "Not collected", tone: "neutral" };
}

// Human label for the sources this search collects from.
function connectorLabel(cs: ConversationSearch): string {
  const names = (cs.connectors.length ? cs.connectors : cs.platforms).map(c =>
    c.toLowerCase() === "youtube" ? "YouTube" : c.toLowerCase() === "reddit" ? "Reddit" : c);
  return names.length ? names.join(" · ") : "no sources";
}

// A compact "health" stat for the collection summary row.
function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border px-3 py-2.5" style={{ borderRadius: "var(--radius-tile)", borderColor: "var(--border-subtle)", background: "var(--surface)" }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="mt-1 text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{children}</div>
    </div>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span key={i} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{v}</span>
        ))}
      </div>
    </div>
  );
}

export function ConversationSearchExecutionBody({ searchEvidenceId }: { searchEvidenceId: string }) {
  const { projectId, project, loading, error, load } = useResearchProject();
  const { setRecordLabel } = useWorkspaceRecord();

  const [running, setRunning] = useState(false);
  const [runsVersion, setRunsVersion] = useState(0);
  const [lastResult, setLastResult] = useState<{ conversations: number; status: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const item = project?.evidence.find(
    (e): e is EvidenceItem & { conversationSearch: ConversationSearch } =>
      e.evidence_type === "social_search" && e.evidence_id === searchEvidenceId && !!e.conversationSearch
  );

  useEffect(() => {
    setRecordLabel(item?.conversationSearch.name ?? null);
    return () => setRecordLabel(null);
  }, [item?.conversationSearch.name, setRecordLabel]);

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer>
      <ErrorState title="Research project not found" description={error || "We couldn't load this project."} />
    </PageContainer>
  );
  if (!item) return (
    <PageContainer>
      <ErrorState
        title="Conversation search not found"
        description="This search isn't attached to the project, or it may have been removed."
        backHref={`/research-projects/${projectId}/execution/conversation`}
        backLabel="Back to Conversation Searches"
      />
    </PageContainer>
  );

  const cs = item.conversationSearch;
  const status = collectionStatus(cs);
  const hasKinds = Object.keys(cs.by_kind ?? {}).length > 0;
  const conversationTotal = hasKinds ? conversationCount(cs.by_kind) : cs.mention_count;
  const collecting = running || cs.latest_run_status === "running";
  const hasData = cs.mention_count > 0 || cs.video_count > 0;
  const lastCollected = cs.last_collected_at ? formatRelativeTime(cs.last_collected_at) : "Never";
  const failed = cs.latest_run_status === "failed";

  const runLabel = collecting ? "Collecting…" : failed ? "Retry collection" : hasData ? "Re-run collection" : "Run Collection";

  const summaryParts = [
    cs.video_count > 0 ? `${cs.video_count.toLocaleString()} video${cs.video_count === 1 ? "" : "s"}` : null,
    `${cs.mention_count.toLocaleString()} mention${cs.mention_count === 1 ? "" : "s"}`,
    cs.markets.length ? `${cs.markets.length} market${cs.markets.length === 1 ? "" : "s"}` : null,
    `Last collected ${lastCollected}`,
  ].filter(Boolean) as string[];

  async function handleRunCollection() {
    setRunning(true);
    const res = await fetch(`/api/social/searches/${searchEvidenceId}/collect`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setRunning(false);
    if (!res.ok) { showToast(json.error ?? "Collection failed.", false); return; }
    const byKind = (json.stats?.by_kind ?? {}) as Record<string, number>;
    const parts = [
      byKind.video ? `${byKind.video} video${byKind.video === 1 ? "" : "s"}` : null,
      byKind.comment ? `${byKind.comment} comment${byKind.comment === 1 ? "" : "s"}` : null,
      byKind.post ? `${byKind.post} post${byKind.post === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    const detail = parts.length ? parts.join(", ") : `${json.inserted ?? 0} items`;
    showToast(`${json.status === "partial" ? "Collected (partial): " : "Collected "}${detail}.`, json.status !== "failed");
    const conversations = (byKind.comment ?? 0) + (byKind.post ?? 0);
    if (json.status !== "failed") setLastResult({ conversations, status: json.status });
    setRunsVersion(v => v + 1);
    load();
  }

  return (
    <>
      <PageContainer>
        <WorkspaceHeader
          back={{ href: `/research-projects/${projectId}/execution/conversation`, label: "Back to Conversation Searches" }}
          title={cs.name}
          description="Run and monitor collection for this search."
          status={{ label: status.label, tone: status.tone, dot: true }}
          meta={<span className="fx-tabular-nums">{summaryParts.join(" · ")}</span>}
          primaryAction={(collecting || hasData)
            ? <Button variant="primary" href={`/research-projects/${projectId}/dashboard`}>View Dashboard →</Button>
            : undefined}
        />

        {/* ── Collection complete → next step is analysis ───────────────────── */}
        {lastResult && (
          <div className="flex items-start gap-3 px-4 py-3.5" style={{ borderRadius: "var(--radius-panel)", background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "var(--accent-ink)" }}>Collection complete</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {lastResult.conversations.toLocaleString()} conversation{lastResult.conversations === 1 ? "" : "s"} have been collected and classified. Your evidence is now ready for analysis.
              </p>
            </div>
            <Button variant="primary" size="sm" href={`/research-projects/${projectId}/analysis`}>View Analysis →</Button>
          </div>
        )}

        {/* ── Collection ────────────────────────────────────────────────────── */}
        <Card padding="md">
          <SectionHeading
            title="Collection"
            description={`Collect the latest conversations from ${connectorLabel(cs)} for this search's keywords. Runs on demand — run it again to capture a fresh snapshot.`}
            action={<Button variant="brand" onClick={handleRunCollection} disabled={collecting}>{runLabel}</Button>}
          />
          {/* Health summary — the at-a-glance state of this search's collection.
              Counts render generically from content kinds, so a new source's
              items (articles, posts, …) appear here with no code change. */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mt-4">
            <StatTile label="Collection Status"><StatusBadge label={status.label} tone={status.tone} dot size="sm" /></StatTile>
            <StatTile label="Source(s)">{connectorLabel(cs)}</StatTile>
            <StatTile label="Collected"><span className="text-xs font-semibold">{hasKinds ? collectionBreakdown(cs.by_kind) : `${cs.mention_count.toLocaleString()} items`}</span></StatTile>
            <StatTile label="Conversations"><span className="fx-tabular-nums">{conversationTotal.toLocaleString()}</span></StatTile>
            <StatTile label="Last collected"><span style={{ fontWeight: 500 }}>{lastCollected}</span></StatTile>
          </div>
          {failed && (
            <p className="text-xs mt-3" style={{ color: "#B4694C" }}>The last collection run failed. Check the search&apos;s keywords and connector settings, then retry.</p>
          )}
          {(cs.markets.length > 0 || cs.platforms.length > 0 || cs.keywords.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
              <ChipRow label="Keywords" values={cs.keywords} />
              <ChipRow label="Markets" values={cs.markets} />
              <ChipRow label="Platforms" values={cs.platforms} />
            </div>
          )}
        </Card>

        {/* ── Sentiment (once there are mentions) ───────────────────────────── */}
        {hasData && (
          <div>
            <SectionHeading title="Mentions & sentiment" description="The volume and tone collected so far. Explore the full breakdown in Dashboard." />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <MetricTile label="Mentions" value={cs.mention_count.toLocaleString()} icon="conversation" />
              <MetricTile label="Positive" value={`${Math.round(cs.positive_pct)}%`} />
              <MetricTile label="Neutral" value={`${Math.round(cs.neutral_pct)}%`} />
              <MetricTile label="Negative" value={`${Math.round(cs.negative_pct)}%`} />
            </div>
            <Panel className="mt-3">
              <SentimentBar positive={cs.positive_pct} neutral={cs.neutral_pct} negative={cs.negative_pct} />
            </Panel>
          </div>
        )}

        {/* ── Collection history — timestamped snapshots ────────────────────── */}
        <CollectionRunHistory searchId={searchEvidenceId} version={runsVersion} />

        <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
          Configured in{" "}
          <Link href={`/research-projects/${projectId}/research/conversation/${searchEvidenceId}`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Research</Link>
          {" · "}monitored in{" "}
          <Link href={`/research-projects/${projectId}/dashboard`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Dashboard →</Link>
        </p>
      </PageContainer>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </>
  );
}
