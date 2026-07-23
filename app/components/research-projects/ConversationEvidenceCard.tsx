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
import {
  NEWS_SOURCE_TYPE_LABEL, NEWS_SOURCE_TYPE_ATTRIBUTION_RULE, NEWS_SOURCE_TYPE_IS_SELF_REPORTED,
  NEWS_CLAIM_BASIS_LABEL, type NewsSourceType, type NewsClaimBasis,
} from "@/lib/news-taxonomy";

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
  /** Per-source fields. For News Coverage this carries the publisher, the
   *  byline, the syndication record and the news provenance judgement — see
   *  NewsMeta below. */
  metadata?: Record<string, unknown> | null;
};

// ── News Coverage ────────────────────────────────────────────────────────────
// An article must never LOOK like something a fan said. It is presented as a
// headline with its masthead, its byline, its date and what kind of statement it
// is; its sentiment is labelled as the tone of the COVERAGE; and where it
// carries no evidence of fan reaction, the card says so out loud.

type NewsMeta = {
  headline?: string; summary?: string | null; publisher?: string | null;
  publisher_site?: string | null; publisher_tier?: string | null; publisher_note?: string | null;
  byline?: string | null; syndicated_copies?: { publisher: string | null; url: string }[];
  syndicated_copy_count?: number; acquisition_source?: string;
  news?: {
    source_type?: string; attribution?: string | null; claim_basis?: string;
    fan_evidence?: string; fan_evidence_note?: string | null;
    outcome_claimed?: string | null; classified?: boolean;
  };
};

const newsMeta = (c: Conversation): NewsMeta | null =>
  c.content_kind === "article" ? ((c.metadata ?? {}) as NewsMeta) : null;

// The kinds of article where the interested party is speaking about itself. Shown
// in a warmer, more prominent chip, because that is the distinction a reader must
// not miss when they are about to treat a claim as an outcome.
const SELF_REPORTED = new Set(
  Object.entries(NEWS_SOURCE_TYPE_IS_SELF_REPORTED).filter(([, v]) => v).map(([k]) => k),
);

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

/** What kind of statement this article is, who is claiming it, and whether it
 *  carries any actual fan evidence. Rendered ON the card rather than behind a
 *  disclosure, because a reader who misses it draws the wrong conclusion. */
function NewsProvenanceBlock({ meta }: { meta: NewsMeta }) {
  const n = meta.news;
  // Stored values are validated on the way in (asNewsSourceType / asClaimBasis),
  // so a stored string is one of the vocabulary members; narrowed here rather
  // than trusted, so an older row with an unknown value degrades to "unclear".
  const rawType = n?.source_type;
  const sourceType: NewsSourceType | null =
    rawType && rawType !== "unclear" && rawType in NEWS_SOURCE_TYPE_LABEL ? (rawType as NewsSourceType) : null;
  const rawBasis = n?.claim_basis;
  const claimBasis: NewsClaimBasis | null =
    rawBasis && rawBasis !== "not_applicable" && rawBasis in NEWS_CLAIM_BASIS_LABEL ? (rawBasis as NewsClaimBasis) : null;
  const selfReported = !!sourceType && SELF_REPORTED.has(sourceType);
  const copies = meta.syndicated_copies ?? [];

  // Nothing judged and nothing to declare: don't render an empty shell.
  if (!sourceType && !n?.attribution && !copies.length && n?.classified !== false) return null;

  return (
    <div className="mt-3 pl-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {sourceType && (
          <span
            className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full"
            title={NEWS_SOURCE_TYPE_ATTRIBUTION_RULE[sourceType]}
            style={selfReported
              ? { background: "#FDF2E3", color: "#8A5A12", border: "1px solid #ECDCB8" }
              : { background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}
          >
            {NEWS_SOURCE_TYPE_LABEL[sourceType]}
          </span>
        )}
        {claimBasis && (
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
            {NEWS_CLAIM_BASIS_LABEL[claimBasis]}
          </span>
        )}
        {/* The plainest possible statement of the thing that matters most. */}
        {n?.fan_evidence === "none" && (
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full"
            title="This article contains no fan quotes, polling or reported audience reaction. It cannot tell you what fans think."
            style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)", border: "1px dashed var(--border-default)" }}>
            No fan evidence
          </span>
        )}
        {n?.fan_evidence && n.fan_evidence !== "none" && (
          <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "var(--accent-wash)", color: "var(--accent-ink)", border: "1px solid #ECDCB8" }}>
            {n.fan_evidence === "quoted" ? "Fans quoted" : "Fan reaction reported"}
          </span>
        )}
        {n?.classified === false && (
          <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full"
            title="No classifier was available when this article was collected, so its source type has not been established."
            style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)", border: "1px dashed var(--border-default)" }}>
            Not yet assessed
          </span>
        )}
      </div>

      {n?.attribution && (
        <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Claim made by: </span>{n.attribution}
        </p>
      )}
      {n?.outcome_claimed && (
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Outcome claimed: </span>{n.outcome_claimed}
        </p>
      )}
      {n?.fan_evidence_note && (
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
          <span style={{ color: "var(--text-tertiary)" }}>Fan evidence: </span>{n.fan_evidence_note}
        </p>
      )}
      {meta.publisher_note && (
        <p className="text-xs mt-1 italic" style={{ color: "var(--text-tertiary)" }}>{meta.publisher_note}</p>
      )}
      {copies.length > 0 && (
        <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>
          Also carried by {copies.map(cp => cp.publisher).filter(Boolean).join(", ")} — the same story, counted once.
        </p>
      )}
    </div>
  );
}

export function ConversationEvidenceCard({ c, inFindings = false, lowRelevance = false, showAspect = true }: {
  c: Conversation;
  inFindings?: boolean;
  lowRelevance?: boolean;
  /** Hide the research-aspect chip where the surrounding context already names it (a synthesis aspect section). */
  showAspect?: boolean;
}) {
  const [showScore, setShowScore] = useState(false);
  const news = newsMeta(c);
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
        {news ? (
          // No quotation mark: this is a publication, not a person speaking.
          <div className="min-w-0">
            {news.publisher && (
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--text-tertiary)" }}>
                {news.publisher}
              </p>
            )}
            <p className="text-sm font-bold leading-snug mt-0.5" style={{ color: "var(--text-primary)" }}>
              {news.headline ?? c.content.split("\n")[0]}
            </p>
            {news.summary && (
              <p className="text-xs leading-relaxed mt-1.5" style={{ color: "var(--text-secondary)" }}>{news.summary}</p>
            )}
          </div>
        ) : (
          <div className="flex gap-2.5 min-w-0">
            <span aria-hidden className="text-2xl leading-none flex-shrink-0 select-none" style={{ color: "var(--border-strong)" }}>&ldquo;</span>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{c.content}</p>
          </div>
        )}
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

      {/* WHAT KIND OF STATEMENT THIS IS. The single most important thing on a
          news card: it is what stops a brand's claim about its own activation
          reading as an established outcome, and what stops favourable coverage
          reading as fan approval. */}
      {news && <NewsProvenanceBlock meta={news} />}

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
          {/* An article's sentiment is the tone of the COVERAGE, never the
              audience's feeling, so it is never shown with a bare sentiment
              label that would read as fan sentiment. */}
          {c.sentiment && c.sentiment !== "Unknown" && (
            news
              ? <StatusBadge label={`${c.sentiment} coverage`} tone={SENTIMENT_TONE[c.sentiment]} size="sm" />
              : <StatusBadge label={c.sentiment} tone={SENTIMENT_TONE[c.sentiment]} size="sm" />
          )}
          {c.sentiment === "Unknown" && !news && <StatusBadge label={c.sentiment} tone={SENTIMENT_TONE[c.sentiment]} size="sm" />}
          {c.source_url && (
            <a href={c.source_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-xs font-semibold hover:underline" style={{ color: "var(--text-tertiary)" }}>
              {news ? "Read the article ↗" : "Source ↗"}
            </a>
          )}
        </span>
      </div>
    </div>
  );
}
