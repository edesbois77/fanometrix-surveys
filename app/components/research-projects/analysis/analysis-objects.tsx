"use client";

// The reusable Analysis "object" renderers + roll-up helpers, lifted out of the
// page so the redesigned Analysis workspace composes them without rebuilding
// anything. Each renderer is pure/controlled and layout-independent; the page
// decides where they go. Nothing here generates intelligence — it presents the
// objects the engine already produced (confidence, source diversity,
// contradictions, gaps, evidence), all still tracing to approved evidence.
import { useState } from "react";
import { ConversationEvidenceCard, relevancePct, relevanceBand, type Conversation } from "@/app/components/research-projects/ConversationEvidenceCard";
import { Icon } from "@/app/components/workspace-ui";
import type { AspectSection, EvidenceItemRef, EvidenceSourceType, AspectContradiction, AspectGap } from "@/lib/intelligence/analysts/analyseAspectSynthesis";
import {
  deriveFindingConfidence, confidenceTone,
  type ConfidenceLevel, type FindingSourceType, type FindingConfidence, type ConfidenceFactor, type EvidenceForConfidence,
} from "@/lib/intelligence/finding-confidence";

// ── Confidence ───────────────────────────────────────────────────────────────

export function ConfidenceBadge({ level, expanded, onToggle }: { level: ConfidenceLevel; expanded: boolean; onToggle: () => void }) {
  const t = confidenceTone(level);
  return (
    <button type="button" onClick={onToggle} aria-expanded={expanded}
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ color: t.ink, background: t.bg, border: `1px solid ${t.border}`, cursor: "pointer" }}
      title="Why this confidence? — see the evidence behind the grade">
      <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
      {level} confidence
      <span aria-hidden className="inline-flex ml-0.5" style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><Icon.chevronDown size={12} strokeWidth={2.5} /></span>
    </button>
  );
}

function FactorIcon({ state }: { state: ConfidenceFactor["state"] }) {
  if (state === "on") return <span aria-hidden style={{ color: "#3F5D42" }}><Icon.check size={12} strokeWidth={2.5} /></span>;
  if (state === "off") return <span aria-hidden className="inline-flex items-center justify-center" style={{ width: 12, height: 12, color: "var(--text-disabled)" }}>–</span>;
  return <span aria-hidden className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "var(--accent-gold)" }} />;
}

export function ConfidenceExplain({ conf }: { conf: FindingConfidence }) {
  return (
    <div className="mt-2 p-3 rounded-lg" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Why this confidence?</p>
      <ul className="space-y-1.5">
        {conf.factors.map((factor, i) => (
          <li key={i} className="flex items-center gap-2 text-xs" style={{ color: factor.state === "off" ? "var(--text-tertiary)" : "var(--text-secondary)" }}>
            <span className="flex-shrink-0 inline-flex items-center justify-center" style={{ width: 14 }}><FactorIcon state={factor.state} /></span>
            {factor.label}
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed mt-2.5 pt-2.5 border-t" style={{ color: "var(--text-tertiary)", borderColor: "var(--border-subtle)" }}>{conf.rationale}</p>
    </div>
  );
}

// A confidence badge that owns its own expand state — for standalone use.
export function Confidence({ conf }: { conf: FindingConfidence }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <ConfidenceBadge level={conf.level} expanded={open} onToggle={() => setOpen(o => !o)} />
      {open && <ConfidenceExplain conf={conf} />}
    </div>
  );
}

// ── Source diversity ─────────────────────────────────────────────────────────

const SOURCE_META: { type: FindingSourceType; label: string; icon: "survey" | "conversation" | "document" }[] = [
  { type: "survey", label: "Survey", icon: "survey" },
  { type: "conversation", label: "Conversation", icon: "conversation" },
  { type: "document", label: "Document", icon: "document" },
];

export function SourceDiversity({ sources }: { sources: FindingSourceType[] }) {
  return (
    <span className="inline-flex items-center gap-1" title="Which evidence sources support this — more sources means stronger triangulation">
      {SOURCE_META.map(s => {
        const on = sources.includes(s.type);
        const IconEl = Icon[s.icon];
        return (
          <span key={s.type} className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full"
            style={on
              ? { color: "var(--text-secondary)", background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }
              : { color: "var(--text-disabled)", background: "transparent", border: "1px dashed var(--border-subtle)" }}>
            <span aria-hidden style={{ opacity: on ? 1 : 0.5 }}><IconEl size={11} /></span>
            {s.label}
          </span>
        );
      })}
    </span>
  );
}

export function SentimentDots({ s }: { s: { positive_pct: number; neutral_pct: number; negative_pct: number } }) {
  return (
    <span className="text-xs fx-tabular-nums" title="Sentiment of this aspect's evidence">
      <span style={{ color: "#3F5D42" }}>{s.positive_pct}%</span>
      <span style={{ color: "var(--text-disabled)" }}> · </span>
      <span style={{ color: "#6B6459" }}>{s.neutral_pct}%</span>
      <span style={{ color: "var(--text-disabled)" }}> · </span>
      <span style={{ color: "#8A4B33" }}>{s.negative_pct}%</span>
    </span>
  );
}

// ── Supporting evidence (grouped by source) ──────────────────────────────────

export const EVIDENCE_ORDER: EvidenceSourceType[] = ["conversation", "survey", "document"];
export const GROUP_LABEL: Record<EvidenceSourceType, [string, string]> = {
  conversation: ["Conversation item", "Conversation items"],
  survey: ["Survey finding", "Survey findings"],
  document: ["Document finding", "Document findings"],
};
const GROUP_ICON: Record<EvidenceSourceType, "conversation" | "survey" | "document"> = {
  conversation: "conversation", survey: "survey", document: "document",
};

export function groupBySource(items: EvidenceItemRef[]): Record<EvidenceSourceType, EvidenceItemRef[]> {
  const g: Record<EvidenceSourceType, EvidenceItemRef[]> = { conversation: [], survey: [], document: [] };
  for (const it of items) (g[it.type] ??= []).push(it);
  return g;
}

function SourceEvidenceCard({ item }: { item: EvidenceItemRef }) {
  const pct = relevancePct(item.relevance);
  const band = pct !== null ? relevanceBand(pct) : null;
  const IconEl = Icon[GROUP_ICON[item.type]];
  return (
    <div className="p-3 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold min-w-0" style={{ color: "var(--text-secondary)" }}>
          <span aria-hidden style={{ color: "var(--accent-ink)" }}><IconEl size={13} /></span>
          <span className="truncate">{item.source_label}</span>
          {item.provenance && <span className="truncate font-normal" style={{ color: "var(--text-tertiary)" }}>· {item.provenance}</span>}
        </span>
        {band && pct !== null && (
          <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ color: band.ink, background: band.bg, border: `1px solid ${band.border}` }} title="Relevance to the research question">
            {pct}%{item.confidence ? ` · ${item.confidence}` : ""}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{item.snippet}</p>
    </div>
  );
}

export function EvidenceGroups({ items, evidenceById }: { items: EvidenceItemRef[]; evidenceById: Map<string, Conversation> }) {
  const groups = groupBySource(items);
  const present = EVIDENCE_ORDER.filter(t => groups[t].length > 0);
  return (
    <div className="space-y-3">
      {present.map(type => (
        <div key={type}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            {GROUP_LABEL[type][groups[type].length === 1 ? 0 : 1]} ({groups[type].length})
          </p>
          <div className="space-y-2.5">
            {groups[type].map((e, j) => {
              const conv = type === "conversation" ? evidenceById.get(e.id) : undefined;
              return conv
                ? <ConversationEvidenceCard key={e.id} c={conv} showAspect={false} />
                : <SourceEvidenceCard key={`${e.id}-${j}`} item={e} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Contradictions ───────────────────────────────────────────────────────────

export function ContradictionCard({ c, evidenceById }: { c: AspectContradiction; evidenceById: Map<string, Conversation> }) {
  const [open, setOpen] = useState(false);
  const total = c.sides.reduce((n, s) => n + s.evidence.length, 0);
  return (
    <div className="rounded-lg p-3.5" style={{ background: "#F6EEEA", border: "1px solid #E4D2C8" }}>
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "#8A4B33" }}><Icon.alert size={15} /></span>
        <p className="text-sm font-semibold leading-relaxed" style={{ color: "#6E3D2A" }}>{c.tension}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-2.5 mt-3">
        {c.sides.map((s, i) => {
          const types = EVIDENCE_ORDER.filter(t => s.evidence.some(e => e.type === t));
          return (
            <div key={i} className="rounded-lg p-2.5" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-primary)" }}>{s.position}</p>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
                {types.map(t => `${s.evidence.filter(e => e.type === t).length} ${GROUP_LABEL[t][1].toLowerCase()}`).join(" · ")}
              </p>
            </div>
          );
        })}
      </div>
      {total > 0 && (
        <button type="button" onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold mt-2.5" style={{ color: "#8A4B33", cursor: "pointer" }}>
          <span aria-hidden className="inline-flex" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><Icon.chevronRight size={12} strokeWidth={2.5} /></span>
          {open ? "Hide" : "Show"} the evidence on both sides
        </button>
      )}
      {open && (
        <div className="mt-2.5 space-y-3">
          {c.sides.map((s, i) => (
            <div key={i}>
              <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>{s.position}</p>
              <EvidenceGroups items={s.evidence} evidenceById={evidenceById} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Research gaps ────────────────────────────────────────────────────────────

export function GapList({ gaps }: { gaps: AspectGap[] }) {
  return (
    <ul className="space-y-2">
      {gaps.map((g, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span aria-hidden className="mt-0.5 flex-shrink-0 inline-flex items-center justify-center" style={{ width: 14, color: g.kind === "low_confidence" ? "#8A4B33" : "var(--text-disabled)" }}>
            {g.kind === "low_confidence" ? <Icon.alert size={13} /> : <span style={{ fontWeight: 700 }}>–</span>}
          </span>
          <span className="min-w-0">
            <span className="text-sm block" style={{ color: "var(--text-secondary)" }}>{g.message}</span>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{g.suggested_action}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Roll-up helpers (pure, derived) ──────────────────────────────────────────

const toConfInput = (items: EvidenceItemRef[]): EvidenceForConfidence[] =>
  items.map(e => ({ type: e.type, relevanceScore: e.relevance ?? null, relevanceConfidence: e.confidence ?? null, sentiment: e.sentiment ?? null }));

/** Unique evidence across a set (by type+id) — evidence cited by multiple
 *  findings counts once at the aspect/project level. */
export function dedupeEvidence(items: EvidenceItemRef[]): EvidenceItemRef[] {
  const seen = new Set<string>();
  const out: EvidenceItemRef[] = [];
  for (const e of items) { const k = `${e.type}:${e.id}`; if (!seen.has(k)) { seen.add(k); out.push(e); } }
  return out;
}

/** The evidence pool an aspect is built on — the union of its findings' evidence. */
export function aspectEvidence(section: AspectSection): EvidenceItemRef[] {
  return dedupeEvidence((section.key_findings ?? []).flatMap(f => f.evidence ?? []));
}

/** Confidence for a finding's/aspect's/project's evidence pool. */
export function confidenceForEvidence(items: EvidenceItemRef[]): FindingConfidence {
  return deriveFindingConfidence(toConfInput(items));
}

export { deriveFindingConfidence, confidenceForEvidence as deriveConfidence };
