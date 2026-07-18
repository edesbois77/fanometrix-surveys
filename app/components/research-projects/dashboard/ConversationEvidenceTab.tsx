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
import { ConversationEvidenceCard, fetchAllProjectConversations, type Conversation } from "@/app/components/research-projects/ConversationEvidenceCard";
import { FilterChip, Icon, Card } from "@/app/components/workspace-ui";

// Videos/trends are containers, not conversations — excluded so the Evidence
// list's total matches the Dashboard's "conversations" total exactly.
const NON_CONVERSATION = new Set(["video", "trend"]);

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
    // Full cumulative base (all pages) so the Evidence list never truncates and
    // always matches the Dashboard total.
    fetchAllProjectConversations(projectId)
      .then(rows => { if (!cancelled) { setConversations(rows.filter(c => !(c.content_kind && NON_CONVERSATION.has(c.content_kind)))); setFetching(false); } })
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
            <FilterChip label="All Conversations" selected={searchFilter === "all"} onClick={() => setSearchFilter("all")} />
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
