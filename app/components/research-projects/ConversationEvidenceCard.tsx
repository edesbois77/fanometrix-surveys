"use client";

// The single conversation-evidence card — one collected conversation presented
// as qualitative research evidence (quote-led, with the relevance judgement,
// "why this matters", research aspect, topic, entities and provenance). Shared
// so the Dashboard Evidence view and the Analysis synthesis reader render the
// SAME card: supporting evidence behind a finding looks identical to the same
// conversation in the Evidence view, because it is the same component.
import { useState } from "react";
import { SourceLogo } from "@/app/components/research-projects/SourceLogo";
import { StatusBadge, Icon } from "@/app/components/workspace-ui";

export type Conversation = {
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
  relevance_rationale: string | null;      // "Why this matters"
  relevance_confidence: string | null;     // 'High' | 'Medium' | 'Low'
  research_aspect: string | null;          // AI-generated facet of the research this informs
};

// Load the FULL cumulative conversation base for a project, paging through
// /api/social/mentions (≤1000 per page) until every row is fetched. Both the
// Evidence view and Analysis's citation resolution use this, so neither ever
// truncates — the Evidence list and Dashboard totals read the same base.
export async function fetchAllProjectConversations(projectId: string): Promise<Conversation[]> {
  const all: Conversation[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`/api/social/mentions?research_project_id=${projectId}&limit=${pageSize}&offset=${offset}`);
    if (!res.ok) break;
    const j = await res.json();
    const rows = (j.data ?? []) as Conversation[];
    all.push(...rows);
    if (rows.length < pageSize) break;   // last page
  }
  return all;
}

const SENTIMENT_TONE = { Positive: "success", Neutral: "neutral", Negative: "danger", Unknown: "neutral" } as const;

export function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// 0–1 score → 0–100 for display. Null = not question-judged (fallback / legacy).
export const relevancePct = (s: number | null): number | null => (typeof s === "number" ? Math.round(s * 100) : null);

// The natural, human relevance label the researcher reads instead of a raw score.
export type Band = { label: string; ink: string; bg: string; border: string };
export function relevanceBand(pct: number): Band {
  if (pct >= 75) return { label: "Highly Relevant", ink: "var(--accent-ink)", bg: "var(--accent-wash)", border: "#ECDCB8" };
  if (pct >= 50) return { label: "Relevant", ink: "var(--accent-ink)", bg: "var(--surface)", border: "#ECDCB8" };
  if (pct >= 25) return { label: "Supporting Context", ink: "var(--text-secondary)", bg: "var(--surface-sunken)", border: "var(--border-subtle)" };
  return { label: "Low Relevance", ink: "var(--text-tertiary)", bg: "var(--surface-sunken)", border: "var(--border-subtle)" };
}

export function ConversationEvidenceCard({ c, inFindings = false, lowRelevance = false, showAspect = true }: {
  c: Conversation;
  inFindings?: boolean;
  lowRelevance?: boolean;
  /** Hide the research-aspect chip where the surrounding context already names it (a synthesis aspect section). */
  showAspect?: boolean;
}) {
  const [showScore, setShowScore] = useState(false);
  const entities = (c.entities ?? []).filter(e => e?.name).slice(0, 4);
  const pct = relevancePct(c.relevance_score);
  const band = pct !== null ? relevanceBand(pct) : null;
  const conf = c.relevance_confidence && ["High", "Medium", "Low"].includes(c.relevance_confidence) ? c.relevance_confidence : null;
  const whyThisMatters = c.relevance_rationale ?? c.ai_summary;
  const aspect = showAspect && c.research_aspect && c.research_aspect.toLowerCase() !== "off-topic" ? c.research_aspect : null;
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

      {/* Research Aspect leads the chips, then topic and named entities. */}
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
