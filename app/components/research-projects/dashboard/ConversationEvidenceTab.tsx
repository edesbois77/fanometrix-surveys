"use client";

// Dashboard › Conversation Intelligence › Evidence — the project-scoped place a
// researcher reviews the actual conversations collected across every attached
// search. Conversations are presented as qualitative evidence (like reviewing
// interview transcripts), NOT a social-listening data grid: the text leads, with
// source, market, date, sentiment, topics, entities and the analyst note as
// quiet provenance. This is the "review the collected data" half of the
// Conversation Intelligence dashboard (its sibling is the Overview's KPIs and
// charts) — the monitoring stage between Collect (Execution) and Generate
// Findings (Analysis). A `?search=<evidence_id>` query pre-filters to one search
// (used by the Overview's Collection Status drill-downs).
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useResearchProject, type EvidenceItem } from "@/app/components/research-projects/ProjectProvider";
import { SourceLogo } from "@/app/components/research-projects/SourceLogo";
import { FilterChip, StatusBadge, Icon, Card } from "@/app/components/workspace-ui";

type Conversation = {
  id: string;
  search_id: string | null;
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
  relevance_score: number | null;          // 0–1, presented as 0–100
  relevance_rationale: string | null;      // "Why this matters" — 1–2 sentences of research value
  relevance_confidence: string | null;     // 'High' | 'Medium' | 'Low'
  research_aspect: string | null;          // AI-generated facet of the research this informs
};

const SENTIMENT_TONE = { Positive: "success", Neutral: "neutral", Negative: "danger", Unknown: "neutral" } as const;

function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// 0–1 score → 0–100 for display. Null = not question-judged (fallback / legacy).
const relevancePct = (s: number | null): number | null => (typeof s === "number" ? Math.round(s * 100) : null);

// The natural, human relevance label the researcher reads instead of a raw score.
// The exact percentage stays available on demand — scoring never dominates the UI.
type Band = { label: string; ink: string; bg: string; border: string };
function relevanceBand(pct: number): Band {
  if (pct >= 75) return { label: "Highly Relevant", ink: "var(--accent-ink)", bg: "var(--accent-wash)", border: "#ECDCB8" };
  if (pct >= 50) return { label: "Relevant", ink: "var(--accent-ink)", bg: "var(--surface)", border: "#ECDCB8" };
  if (pct >= 25) return { label: "Supporting Context", ink: "var(--text-secondary)", bg: "var(--surface-sunken)", border: "var(--border-subtle)" };
  return { label: "Low Relevance", ink: "var(--text-tertiary)", bg: "var(--surface-sunken)", border: "var(--border-subtle)" };
}

function ConversationEvidenceCard({ c, inFindings, lowRelevance }: { c: Conversation; inFindings: boolean; lowRelevance: boolean }) {
  const [showScore, setShowScore] = useState(false);
  const entities = (c.entities ?? []).filter(e => e?.name).slice(0, 4);
  const pct = relevancePct(c.relevance_score);
  const band = pct !== null ? relevanceBand(pct) : null;
  const conf = c.relevance_confidence && ["High", "Medium", "Low"].includes(c.relevance_confidence) ? c.relevance_confidence : null;
  // "Why this matters" — the research value. Falls back to the legacy summary for
  // evidence collected before this richer classification existed.
  const whyThisMatters = c.relevance_rationale ?? c.ai_summary;
  const aspect = c.research_aspect && c.research_aspect.toLowerCase() !== "off-topic" ? c.research_aspect : null;
  return (
    <div className="border p-4 md:p-5" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-xs)", opacity: lowRelevance ? 0.72 : 1 }}>
      {/* The conversation itself leads; the natural relevance label sits quietly
          to the side, expanding to the exact score only on request. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2.5 min-w-0">
          <span aria-hidden className="text-2xl leading-none flex-shrink-0 select-none" style={{ color: "var(--border-strong)" }}>&ldquo;</span>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{c.content}</p>
        </div>
        {band && (
          <button type="button" onClick={() => setShowScore(s => !s)} title="Relevance to the research question — click for the exact score"
            className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap"
            style={{ background: band.bg, color: band.ink, border: `1px solid ${band.border}` }}>
            {band.label}
          </button>
        )}
      </div>
      {band && showScore && (
        <p className="text-[11px] mt-1.5 text-right fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>
          {pct}% relevant{conf ? ` · ${conf} confidence` : ""}
        </p>
      )}

      {/* Why this matters — the research value, not a restatement of sentiment. */}
      {whyThisMatters && (
        <div className="mt-3 pl-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-0.5" style={{ color: "var(--accent-ink)" }}>Why this matters</p>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{whyThisMatters}</p>
        </div>
      )}

      {/* Research Aspect (the facet this evidence informs) leads the chips,
          followed by topic and named entities. */}
      {(aspect || c.topic || entities.length > 0) && (
        <div className="flex flex-wrap gap-1.5 mt-3 pl-5">
          {aspect && <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--accent-ink)", color: "#fff" }} title="The part of the research this conversation contributes to">{aspect}</span>}
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

export function ConversationEvidenceTab() {
  const { projectId, project } = useResearchProject();
  const searchParams = useSearchParams();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [fetching, setFetching] = useState(true);
  const [sentiment, setSentiment] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>(searchParams.get("search") ?? "all");
  const [aspectFilter, setAspectFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [includeLowRelevance, setIncludeLowRelevance] = useState(false);

  // The project's conversation searches — for the "Search" filter, the "In
  // findings" heuristic, and each search's relevance threshold.
  const searches = useMemo(() => (project?.evidence ?? [])
    .filter((e): e is EvidenceItem & { conversationSearch: NonNullable<EvidenceItem["conversationSearch"]> } => e.evidence_type === "social_search" && !!e.conversationSearch)
    .map(e => ({ id: e.evidence_id, name: e.conversationSearch.name, hasFindings: !!e.conversationSearch.summary_status, threshold: e.conversationSearch.relevance_threshold })), [project?.evidence]);
  const findingsBySearch = useMemo(() => new Map(searches.map(s => [s.id, s.hasFindings])), [searches]);
  const thresholdBySearch = useMemo(() => new Map(searches.map(s => [s.id, s.threshold])), [searches]);

  // A conversation is "low relevance" only if it was actually question-judged
  // (has a score) AND falls below its search's threshold. Unscored items (the
  // fallback classifier, or evidence collected before relevance judging) are
  // never treated as low-relevance — we don't hide what we couldn't judge.
  const isLowRelevance = useMemo(() => (c: Conversation): boolean => {
    if (typeof c.relevance_score !== "number") return false;
    const threshold = thresholdBySearch.get(c.search_id ?? "") ?? 50;
    return Math.round(c.relevance_score * 100) < threshold;
  }, [thresholdBySearch]);

  useEffect(() => {
    let cancelled = false;
    setFetching(true);
    fetch(`/api/social/mentions?research_project_id=${projectId}&limit=500`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(j => { if (!cancelled) { setConversations(j.data ?? []); setFetching(false); } })
      .catch(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const sources = useMemo(() => Array.from(new Set(conversations.map(c => c.platform).filter((x): x is string => !!x))), [conversations]);
  // The research aspects present — evidence organised by the facet it informs.
  const aspects = useMemo(() => Array.from(new Set(
    conversations.map(c => c.research_aspect).filter((a): a is string => !!a && a.toLowerCase() !== "off-topic")
  )).sort(), [conversations]);

  const hiddenLowCount = useMemo(() => conversations.filter(isLowRelevance).length, [conversations, isLowRelevance]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter(c =>
      (includeLowRelevance || !isLowRelevance(c)) &&
      (sentiment === "all" || c.sentiment === sentiment) &&
      (sourceFilter === "all" || c.platform === sourceFilter) &&
      (searchFilter === "all" || c.search_id === searchFilter) &&
      (aspectFilter === "all" || c.research_aspect === aspectFilter) &&
      (!q || c.content.toLowerCase().includes(q) || (c.relevance_rationale ?? c.ai_summary ?? "").toLowerCase().includes(q))
    );
  }, [conversations, sentiment, sourceFilter, searchFilter, aspectFilter, query, includeLowRelevance, isLowRelevance]);

  if (searches.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No conversation searches attached to this project. Add one in Research.</p>
      </Card>
    );
  }

  if (fetching) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map(i => <div key={i} className="fx-skeleton rounded-xl" style={{ height: 120 }} />)}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>No conversations collected yet</p>
        <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>Run collection in Execution and the conversations appear here to review before generating findings.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        The conversations collected across this project&apos;s searches, each judged by AI for how well it helps answer the research question — not just for keyword matches. Low-relevance evidence is hidden by default. Interpretation happens in Analysis.
      </p>

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
        {searches.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] mr-1" style={{ color: "var(--text-tertiary)" }}>Search</span>
            <FilterChip label="All" selected={searchFilter === "all"} onClick={() => setSearchFilter("all")} />
            {searches.map(s => <FilterChip key={s.id} label={s.name} selected={searchFilter === s.id} onClick={() => setSearchFilter(s.id)} />)}
          </div>
        )}
        {aspects.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] mr-1" style={{ color: "var(--text-tertiary)" }}>Research aspect</span>
            <FilterChip label="All" selected={aspectFilter === "all"} onClick={() => setAspectFilter("all")} />
            {aspects.map(a => <FilterChip key={a} label={a} selected={aspectFilter === a} onClick={() => setAspectFilter(a)} />)}
          </div>
        )}
        {/* Relevance gate — the evidence-quality control. Off by default so the
            researcher sees only conversations judged to help answer the question. */}
        {hiddenLowCount > 0 && (
          <div className="flex items-center justify-between gap-3 pt-1 mt-1 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              {includeLowRelevance
                ? `Showing ${hiddenLowCount.toLocaleString()} low-relevance conversation${hiddenLowCount === 1 ? "" : "s"} below the relevance threshold.`
                : `${hiddenLowCount.toLocaleString()} low-relevance conversation${hiddenLowCount === 1 ? "" : "s"} hidden below the relevance threshold.`}
            </span>
            <button onClick={() => setIncludeLowRelevance(v => !v)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold flex-shrink-0 hover:underline" style={{ color: "var(--accent-ink)" }}>
              <span aria-hidden className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm" style={{ border: `1.5px solid ${includeLowRelevance ? "var(--accent-ink)" : "var(--border-strong)"}`, background: includeLowRelevance ? "var(--accent-ink)" : "transparent", color: "#fff" }}>
                {includeLowRelevance && <Icon.check size={10} strokeWidth={3} />}
              </span>
              Include low-relevance evidence
            </button>
          </div>
        )}
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
            <ConversationEvidenceCard key={c.id} c={c} lowRelevance={isLowRelevance(c)} inFindings={(findingsBySearch.get(c.search_id ?? "") ?? false) && (c.relevance_score ?? 0) >= 0.5} />
          ))}
        </div>
      )}
    </div>
  );
}
