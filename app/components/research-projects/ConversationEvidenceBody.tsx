"use client";

// Research Evidence view — the in-project place a researcher reviews the actual
// conversations behind their findings. Conversations are presented as
// qualitative evidence (like reviewing interview transcripts), NOT as a
// social-listening data grid: the text leads, with source, market, date,
// sentiment, topics, entities and the analyst note as quiet provenance. This is
// the "Review Evidence" stage between Collect (Execution) and Generate Findings
// (Analysis) — and the destination for "View the conversations" everywhere,
// replacing the legacy Social Listening mentions table.
import { useEffect, useMemo, useState } from "react";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { useWorkspaceRecord } from "@/app/components/research-projects/WorkspaceRecordContext";
import { SourceLogo } from "@/app/components/research-projects/SourceLogo";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, EmptyState, FilterChip, Button, StatusBadge, Icon,
} from "@/app/components/workspace-ui";

type Conversation = {
  id: string;
  content: string;
  platform: string | null;
  connector: string | null;
  content_kind: string | null;
  author: string | null;
  source_url: string | null;
  market: string | null;
  published_at: string | null;
  sentiment: "Positive" | "Neutral" | "Negative" | "Unknown" | null;
  topic: string | null;
  subtopic: string | null;
  entities: { name: string; type?: string }[] | null;
  ai_summary: string | null;
  relevance_score: number | null;
};

const SENTIMENT_TONE = { Positive: "success", Neutral: "neutral", Negative: "danger", Unknown: "neutral" } as const;

function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ConversationEvidenceCard({ c, inFindings }: { c: Conversation; inFindings: boolean }) {
  const entities = (c.entities ?? []).filter(e => e?.name).slice(0, 4);
  return (
    <div className="border p-4 md:p-5" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-xs)" }}>
      {/* The conversation itself leads. */}
      <div className="flex gap-2.5">
        <span aria-hidden className="text-2xl leading-none flex-shrink-0 select-none" style={{ color: "var(--border-strong)" }}>&ldquo;</span>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{c.content}</p>
      </div>

      {/* Analyst note (AI summary) — quiet, secondary. */}
      {c.ai_summary && (
        <p className="text-xs mt-3 pl-5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          <span className="font-semibold">Analyst note </span>{c.ai_summary}
        </p>
      )}

      {/* Topics + entities. */}
      {(c.topic || entities.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-3 pl-5">
          {c.topic && <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--accent-wash)", color: "var(--accent-ink)", border: "1px solid #ECDCB8" }}>{c.topic}{c.subtopic ? ` · ${c.subtopic}` : ""}</span>}
          {entities.map((e, i) => (
            <span key={i} className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>{e.name}</span>
          ))}
        </div>
      )}

      {/* Provenance footer. */}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 mt-3 pt-3 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          {c.platform && <SourceLogo id={c.platform} size={14} />}
          {c.platform ?? c.connector ?? "Source"}
        </span>
        {c.author && <span className="text-xs truncate max-w-[12rem]" style={{ color: "var(--text-tertiary)" }}>· {c.author}</span>}
        {c.market && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>· {c.market}</span>}
        {c.published_at && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>· {fmtDate(c.published_at)}</span>}
        <span className="ml-auto flex items-center gap-2">
          {inFindings && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--accent-ink)" }} title="This conversation was relevant enough to inform the generated findings.">
              <Icon.check size={12} strokeWidth={2.5} /> In findings
            </span>
          )}
          {c.sentiment && <StatusBadge label={c.sentiment} tone={SENTIMENT_TONE[c.sentiment]} size="sm" />}
          {c.source_url && <a href={c.source_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs font-semibold hover:underline" style={{ color: "var(--text-tertiary)" }}>Source ↗</a>}
        </span>
      </div>
    </div>
  );
}

export function ConversationEvidenceBody({ searchEvidenceId }: { searchEvidenceId: string }) {
  const { projectId, project, loading, error } = useResearchProject();
  const { setRecordLabel } = useWorkspaceRecord();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [fetching, setFetching] = useState(true);
  const [sentiment, setSentiment] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const item = project?.evidence.find(
    (e): e is EvidenceItem & { conversationSearch: NonNullable<EvidenceItem["conversationSearch"]> } =>
      e.evidence_type === "social_search" && e.evidence_id === searchEvidenceId && !!e.conversationSearch
  );
  const searchName = item?.conversationSearch.name ?? null;
  const hasFindings = !!item?.conversationSearch.summary_status;

  useEffect(() => {
    setRecordLabel(searchName);
    return () => setRecordLabel(null);
  }, [searchName, setRecordLabel]);

  useEffect(() => {
    let cancelled = false;
    setFetching(true);
    fetch(`/api/social/mentions?search_id=${searchEvidenceId}&limit=300`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(j => { if (!cancelled) { setConversations(j.data ?? []); setFetching(false); } })
      .catch(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [searchEvidenceId]);

  const sources = useMemo(() => Array.from(new Set(conversations.map(c => c.platform).filter((x): x is string => !!x))), [conversations]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter(c =>
      (sentiment === "all" || c.sentiment === sentiment) &&
      (sourceFilter === "all" || c.platform === sourceFilter) &&
      (!q || c.content.toLowerCase().includes(q) || (c.ai_summary ?? "").toLowerCase().includes(q))
    );
  }, [conversations, sentiment, sourceFilter, query]);

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return (
    <PageContainer><ErrorState title="Research project not found" description={error || "We couldn't load this project."} /></PageContainer>
  );
  if (!item) return (
    <PageContainer>
      <ErrorState title="Conversation search not found" description="This search isn't attached to the project, or it may have been removed."
        backHref={`/research-projects/${projectId}/execution/conversation`} backLabel="Back to Conversation Searches" />
    </PageContainer>
  );

  const backHref = `/research-projects/${projectId}/execution/conversation/${searchEvidenceId}`;

  return (
    <PageContainer>
      <WorkspaceHeader
        back={{ href: backHref, label: "Back to Collection" }}
        title="Review Evidence"
        description={`The conversations collected for "${item.conversationSearch.name}" — the qualitative evidence behind your findings.`}
        meta={<span className="fx-tabular-nums">{conversations.length.toLocaleString()} conversation{conversations.length === 1 ? "" : "s"}</span>}
        primaryAction={<Button variant="primary" href={`/research-projects/${projectId}/analysis/conversation/${searchEvidenceId}`}>Generate Findings →</Button>}
      />

      {fetching ? (
        <PageLoadingState />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="＂"
          title="No conversations collected yet"
          description="Once collection has run, the conversations appear here to review before generating findings."
          action={<Button variant="secondary" href={backHref}>Go to Collection →</Button>}
        />
      ) : (
        <>
          {/* Filters — reviewing lenses, not database queries */}
          <div className="border p-3 space-y-2.5" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-xs)" }}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }}><Icon.search size={15} /></span>
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search within the conversations…"
                className="w-full text-sm rounded-lg pl-9 pr-3 py-2 outline-none" style={{ background: "var(--surface-sunken)", border: "1px solid transparent", color: "var(--text-primary)" }} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] mr-1" style={{ color: "var(--text-tertiary)" }}>Sentiment</span>
              {["all", "Positive", "Neutral", "Negative"].map(s => (
                <FilterChip key={s} label={s === "all" ? "All" : s} selected={sentiment === s} onClick={() => setSentiment(s)} />
              ))}
              {sources.length > 1 && (
                <>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.05em] mx-1" style={{ color: "var(--text-tertiary)" }}>Source</span>
                  <FilterChip label="All" selected={sourceFilter === "all"} onClick={() => setSourceFilter("all")} />
                  {sources.map(s => <FilterChip key={s} label={s} selected={sourceFilter === s} onClick={() => setSourceFilter(s)} />)}
                </>
              )}
            </div>
          </div>

          <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
            Showing {shown.length.toLocaleString()} of {conversations.length.toLocaleString()} conversations.
          </p>

          {shown.length === 0 ? (
            <div className="border px-4 py-8 text-center text-sm" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--border-subtle)", background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>
              No conversations match these filters.
            </div>
          ) : (
            <div className="space-y-3">
              {shown.map(c => (
                <ConversationEvidenceCard key={c.id} c={c} inFindings={hasFindings && (c.relevance_score ?? 0) >= 0.5} />
              ))}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
