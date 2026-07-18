"use client";

// A single conversation search's operational home, at
// /research-projects/[id]/execution/conversation/[searchEvidenceId] — the
// operational twin of the Campaigns page. This is where a search is run and
// watched: trigger collection, monitor status/evidence/sentiment, then hand off
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
import { conversationCount } from "@/lib/connectors/content-kinds";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState,
  Card, Panel, Button, Icon, SectionHeading, MetricTile, SentimentBar, type Tone,
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
  const [evidenceBuilt, setEvidenceBuilt] = useState<{ conversations: number; runs: number; sources: string[]; markets: string[] } | null>(null);
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

  // Cumulative "Evidence Built" across every run — refetched after each run.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/social/searches/${searchEvidenceId}/evidence-summary`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.evidence_built) setEvidenceBuilt(j.evidence_built); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [searchEvidenceId, runsVersion]);

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
  // Evidence Built = cumulative across every run; falls back to latest-run data
  // until the cumulative summary loads (or if it's unavailable).
  const builtConversations = evidenceBuilt?.conversations ?? conversationTotal;
  const runCount = evidenceBuilt?.runs ?? cs.run_count;
  const builtSources = evidenceBuilt ? evidenceBuilt.sources.length : (cs.connectors.length || cs.platforms.length);
  const builtMarkets = evidenceBuilt ? evidenceBuilt.markets.length : cs.markets.length;
  const collecting = running || cs.latest_run_status === "running";
  const hasData = cs.mention_count > 0 || cs.video_count > 0;
  const lastCollected = cs.last_collected_at ? formatRelativeTime(cs.last_collected_at) : "Never";
  const failed = cs.latest_run_status === "failed";

  const runLabel = collecting ? "Collecting…" : failed ? "Retry collection" : hasData ? "Re-run collection" : "Run Collection";
  // Reviewing evidence lives in the Dashboard now — Execution is purely
  // operational (configure, run, monitor collection). This is a hand-off link.
  const dashboardEvidenceHref = `/research-projects/${projectId}/dashboard/conversation/evidence?search=${searchEvidenceId}`;

  const summaryParts = [
    cs.video_count > 0 ? `${cs.video_count.toLocaleString()} video${cs.video_count === 1 ? "" : "s"}` : null,
    `${cs.mention_count.toLocaleString()} conversation${cs.mention_count === 1 ? "" : "s"}`,
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
    // Stage 2 outcome — how many candidates the relevance classifier kept.
    const relevant = json.stats?.relevant;
    const relDetail = typeof relevant === "number" ? ` · ${relevant.toLocaleString()} relevant to the research question` : "";
    showToast(`${json.status === "partial" ? "Collected (partial): " : "Collected "}${detail}${relDetail}.`, json.status !== "failed");
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
          description="One conversation search, one research question — evolve its scope and keep building evidence over time."
          status={{ label: status.label, tone: status.tone, dot: true }}
          meta={<span className="fx-tabular-nums">{summaryParts.join(" · ")}</span>}
          secondaryActions={(collecting || hasData)
            ? <Button variant="secondary" href={`/research-projects/${projectId}/dashboard/conversation`}>View Dashboard →</Button>
            : undefined}
        />

        {/* ── Collection complete → review the evidence, then generate findings ── */}
        {lastResult && (
          <div className="flex items-start gap-3 px-4 py-3.5" style={{ borderRadius: "var(--radius-panel)", background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "var(--accent-ink)" }}>Collection complete</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {lastResult.conversations.toLocaleString()} conversation{lastResult.conversations === 1 ? "" : "s"} collected. Review them in Dashboard, then generate your findings.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="brand" size="sm" href={dashboardEvidenceHref}>Review in Dashboard →</Button>
              <Button variant="secondary" size="sm" href={`/research-projects/${projectId}/analysis/conversation/${searchEvidenceId}`}>Generate Findings →</Button>
            </div>
          </div>
        )}

        {/* ── The research question this search exists to answer ────────────── */}
        {cs.research_question && (
          <div className="flex items-start gap-2.5 px-4 py-3.5" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
            <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "var(--accent-ink)" }}><Icon.search size={15} /></span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--text-tertiary)" }}>Research Question</p>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-primary)" }}>{cs.research_question}</p>
            </div>
          </div>
        )}

        {/* ── Research Scope — the settings this search collects against. Edit
            Scope and Run Collection are the two primary operational actions. ── */}
        <Card padding="md">
          <SectionHeading
            title="Research Scope"
            description="What this search collects against. Refine the scope and run again — the evidence keeps growing."
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" href={`/research-projects/${projectId}/research/conversation/${searchEvidenceId}`}>Edit Scope</Button>
                <Button variant="brand" onClick={handleRunCollection} disabled={collecting}>{runLabel}</Button>
              </div>
            }
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <ChipRow label="Sources" values={cs.platforms} />
            <ChipRow label="Markets" values={cs.markets} />
            <ChipRow label="Languages" values={cs.languages} />
            <ChipRow label="Keywords" values={cs.keywords} />
          </div>
          {failed && (
            <p className="text-xs mt-3" style={{ color: "#B4694C" }}>The last collection run failed. Check the search&apos;s keywords and connector settings, then retry.</p>
          )}
        </Card>

        {/* ── Evidence Built (cumulative) vs. Last Collection (latest run) —
            reinforces one search = one question, many runs = growing evidence. ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card padding="md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--text-tertiary)" }}>Evidence Built</p>
            <p className="text-[26px] font-bold mt-1.5 leading-none fx-tabular-nums" style={{ color: "var(--text-primary)" }}>
              {builtConversations.toLocaleString()}
              <span className="text-sm font-medium ml-1.5" style={{ color: "var(--text-tertiary)" }}>conversations</span>
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
              {runCount.toLocaleString()} collection run{runCount === 1 ? "" : "s"}
              {"  ·  "}{builtSources.toLocaleString()} source{builtSources === 1 ? "" : "s"}
              {"  ·  "}{builtMarkets.toLocaleString()} market{builtMarkets === 1 ? "" : "s"}
            </p>
          </Card>
          <Card padding="md">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--text-tertiary)" }}>Last Collection</p>
            <p className="text-[26px] font-bold mt-1.5 leading-none fx-tabular-nums" style={{ color: "var(--text-primary)" }}>
              {cs.mention_count.toLocaleString()}
              <span className="text-sm font-medium ml-1.5" style={{ color: "var(--text-tertiary)" }}>new conversations</span>
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
              {cs.connectors.length ? connectorLabel(cs) : "No runs yet"}{"  ·  "}
              <span style={{ color: status.tone === "danger" ? "#B4694C" : "var(--text-secondary)" }}>{lastCollected}</span>
            </p>
          </Card>
        </div>

        {/* ── Sentiment (once there is evidence) ────────────────────────────── */}
        {hasData && (
          <div>
            <SectionHeading title="Sentiment" description="The tone of the conversations collected so far. Explore the full breakdown in Dashboard." />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <MetricTile label="Conversations" value={cs.mention_count.toLocaleString()} icon="conversation" />
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

        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
          <span>Configured in{" "}
            <Link href={`/research-projects/${projectId}/research/conversation/${searchEvidenceId}`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Research</Link>
          </span>
          <span aria-hidden>→</span>
          <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Collected here</span>
          <span aria-hidden>→</span>
          <span>{hasData
            ? <Link href={dashboardEvidenceHref} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Reviewed in Dashboard</Link>
            : <span style={{ color: "var(--text-disabled)" }}>Reviewed in Dashboard</span>}
          </span>
          <span aria-hidden>→</span>
          <span>Analysed in{" "}
            <Link href={`/research-projects/${projectId}/analysis/conversation/${searchEvidenceId}`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Analysis</Link>
          </span>
        </div>
      </PageContainer>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? "bg-green-600" : "bg-red-600"}`}>
          {toast.ok ? "✓" : "✕"} {toast.msg}
        </div>
      )}
    </>
  );
}
