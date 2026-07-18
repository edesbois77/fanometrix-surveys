"use client";

// Analysis home — the research synthesis workspace. Structured evidence, grouped
// by the Research Aspect it informs, synthesised into Summary / Key Findings /
// Supporting Evidence / Recommended Actions. Every finding expands to the exact
// conversations behind it — the same cards the Evidence view shows — so the
// chain Research Question → Evidence → Aspect → Finding is visible end to end.
//
// Source-agnostic by construction: the synthesis is generated over generic
// evidence and each finding references evidence by {type,id}. Today those resolve
// to conversations; survey responses and documents will resolve here later with
// no change to this reader beyond another resolver.
//
// Reads like a research report, not an AI console: one "Synthesise" action, no
// prompts or scores on show, the restrained workspace visual language throughout.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { ConversationEvidenceCard, fetchAllProjectConversations, relevancePct, relevanceBand, type Conversation } from "@/app/components/research-projects/ConversationEvidenceCard";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, EmptyState, Card, Button, Icon,
} from "@/app/components/workspace-ui";
import type { AspectSynthesisReport, AspectSection, EvidenceItemRef, EvidenceSourceType, AspectContradiction, AspectGap } from "@/lib/intelligence/analysts/analyseAspectSynthesis";
import {
  deriveFindingConfidence, confidenceTone,
  type ConfidenceLevel, type FindingSourceType, type FindingConfidence, type ConfidenceFactor,
} from "@/lib/intelligence/finding-confidence";
import { NotesPanel, findingKey, type ResearcherNote } from "@/app/components/research-projects/analysis/ResearcherNotes";

type StoredRow = { content: AspectSynthesisReport; edited_content: AspectSynthesisReport | null; status: string; generated_at: string | null } | null;

// ── Richer finding presentation (derived, not generated) ─────────────────────

// The badge is a toggle: it shows the grade, and expands to reveal the
// deterministic breakdown behind it (never a black box).
function ConfidenceBadge({ level, expanded, onToggle }: { level: ConfidenceLevel; expanded: boolean; onToggle: () => void }) {
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

// "Why this confidence?" — the deterministic factors, spelled out. Each line is a
// fact from the confidence calculation; nothing here is inferred.
function FactorIcon({ state }: { state: ConfidenceFactor["state"] }) {
  if (state === "on") return <span aria-hidden style={{ color: "#3F5D42" }}><Icon.check size={12} strokeWidth={2.5} /></span>;
  if (state === "off") return <span aria-hidden className="inline-flex items-center justify-center" style={{ width: 12, height: 12, color: "var(--text-disabled)" }}>–</span>;
  return <span aria-hidden className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "var(--accent-gold)" }} />;
}

function ConfidenceExplain({ conf }: { conf: FindingConfidence }) {
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

// Source diversity — models all three sources now, even though only conversations
// contribute today, so the surface expands unchanged as surveys and documents
// begin classifying into aspects. Present sources read solid; absent ones ghost.
const SOURCE_META: { type: FindingSourceType; label: string; icon: "survey" | "conversation" | "document" }[] = [
  { type: "survey", label: "Survey", icon: "survey" },
  { type: "conversation", label: "Conversation", icon: "conversation" },
  { type: "document", label: "Document", icon: "document" },
];

function SourceDiversity({ sources }: { sources: FindingSourceType[] }) {
  return (
    <span className="inline-flex items-center gap-1" title="Which evidence sources support this finding — findings backed by more sources are stronger">
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

function SentimentDots({ s }: { s: { positive_pct: number; neutral_pct: number; negative_pct: number } }) {
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

// Evidence is shown GROUPED BY SOURCE so provenance stays explicit — a finding
// merges interpretation, never the evidence behind it.
const EVIDENCE_ORDER: EvidenceSourceType[] = ["conversation", "survey", "document"];
const GROUP_LABEL: Record<EvidenceSourceType, [string, string]> = {
  conversation: ["Conversation item", "Conversation items"],
  survey: ["Survey finding", "Survey findings"],
  document: ["Document finding", "Document findings"],
};
const GROUP_ICON: Record<EvidenceSourceType, "conversation" | "survey" | "document"> = {
  conversation: "conversation", survey: "survey", document: "document",
};

function groupBySource(items: EvidenceItemRef[]): Record<EvidenceSourceType, EvidenceItemRef[]> {
  const g: Record<EvidenceSourceType, EvidenceItemRef[]> = { conversation: [], survey: [], document: [] };
  for (const it of items) (g[it.type] ??= []).push(it);
  return g;
}

// A compact card for a survey/document evidence item (and the fallback for a
// conversation whose full record isn't loaded). Renders the captured snapshot —
// source, snippet, provenance, relevance — so it's traceable without a re-fetch.
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

// Renders a set of evidence items grouped by source, with counts — the shared
// "expand to the evidence, grouped by source" surface used by both findings and
// contradiction sides.
function EvidenceGroups({ items, evidenceById }: { items: EvidenceItemRef[]; evidenceById: Map<string, Conversation> }) {
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

// A contradiction, surfaced not averaged: the tension, then each side with its
// own evidence. Expands to show both sides' evidence, grouped by source.
function ContradictionCard({ c, evidenceById }: { c: AspectContradiction; evidenceById: Map<string, Conversation> }) {
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

// Research gaps — what's missing, stated plainly with the research that would fill it.
function GapList({ gaps }: { gaps: AspectGap[] }) {
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

function AspectBlock({ section, evidenceById, projectId, notes, onNotesChanged }: {
  section: AspectSection; evidenceById: Map<string, Conversation>;
  projectId: string; notes: ResearcherNote[]; onNotesChanged: () => void;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setOpen(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const [confOpen, setConfOpen] = useState<Set<number>>(new Set());
  const toggleConf = (i: number) => setConfOpen(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  // Notes for this aspect, and finding-note anchoring (finding-scoped notes whose
  // finding no longer exists are kept and surfaced here, flagged — never dropped).
  const aspectNotes = notes.filter(n => n.scope === "aspect" && n.scope_ref === section.aspect);
  const currentFindingKeys = new Set(section.key_findings.map(f => findingKey(section.aspect, f.finding)));
  const orphanedFindingNotes = notes.filter(n => n.scope === "finding" && n.scope_ref.startsWith(`${section.aspect}::`) && !currentFindingKeys.has(n.scope_ref));

  return (
    <Card padding="lg">
      {/* Aspect heading */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b" style={{ borderColor: "var(--border-default)" }}>
        <h2 className="text-lg font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{section.aspect}</h2>
        <span className="flex items-center gap-3 flex-wrap">
          {(section.source_types ?? []).length > 0 && <SourceDiversity sources={section.source_types} />}
          <SentimentDots s={section.sentiment} />
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {section.evidence_count.toLocaleString()} piece{section.evidence_count === 1 ? "" : "s"} of evidence
          </span>
        </span>
      </div>

      {/* Summary */}
      {section.summary && (
        <div className="mt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Summary</h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{section.summary}</p>
        </div>
      )}

      {/* Key findings — each expandable to its supporting evidence */}
      {section.key_findings.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] mb-2" style={{ color: "var(--text-tertiary)" }}>Key Findings</h3>
          <ol className="space-y-2.5">
            {section.key_findings.map((f, i) => {
              const items = f.evidence ?? [];
              // Confidence, source diversity and evidence count are DERIVED from
              // the finding's own supporting evidence (captured at synthesis) —
              // no second AI pass, no change to how the finding was generated.
              const conf = deriveFindingConfidence(items.map(e => ({
                type: e.type,
                relevanceScore: e.relevance ?? null,
                relevanceConfidence: e.confidence ?? null,
                sentiment: e.sentiment ?? null,
              })));
              const groups = groupBySource(items);
              const present = EVIDENCE_ORDER.filter(t => groups[t].length > 0);
              const breakdown = present.map(t => `${groups[t].length} ${GROUP_LABEL[t][groups[t].length === 1 ? 0 : 1].toLowerCase()}`).join(" · ");
              const isOpen = open.has(i);
              return (
                <li key={i} className="border" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--border-subtle)", background: "var(--surface)" }}>
                  <div className="flex items-start gap-3 p-3.5">
                    <span className="fx-tabular-nums text-sm font-bold flex-shrink-0 mt-0.5" style={{ color: "var(--accent-ink)" }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm leading-relaxed block" style={{ color: "var(--text-primary)" }}>{f.finding}</span>

                      {/* Trust signals — confidence (expandable), source diversity, evidence count */}
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <ConfidenceBadge level={conf.level} expanded={confOpen.has(i)} onToggle={() => toggleConf(i)} />
                        <SourceDiversity sources={conf.sources} />
                        <span className="text-[11px] fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>
                          {conf.evidenceCount.toLocaleString()} piece{conf.evidenceCount === 1 ? "" : "s"} of evidence
                        </span>
                      </div>

                      {/* Why this confidence — the deterministic breakdown, on demand */}
                      {confOpen.has(i) && <ConfidenceExplain conf={conf} />}

                      {/* Supporting evidence — expands GROUPED BY SOURCE, provenance intact */}
                      {items.length > 0 && (
                        <button type="button" onClick={() => toggle(i)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold mt-2 text-left" style={{ color: "var(--accent-ink)", cursor: "pointer" }}>
                          <span aria-hidden className="inline-flex flex-shrink-0" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><Icon.chevronRight size={12} strokeWidth={2.5} /></span>
                          {isOpen ? "Hide" : "Show"} supporting evidence — {breakdown}
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && items.length > 0 && (
                    <div className="px-3.5 pb-3.5">
                      <EvidenceGroups items={items} evidenceById={evidenceById} />
                    </div>
                  )}
                  {/* Finding-level researcher note — survives regeneration */}
                  {(() => {
                    const key = findingKey(section.aspect, f.finding);
                    const fNotes = notes.filter(n => n.scope === "finding" && n.scope_ref === key);
                    return (
                      <div className="px-3.5 pb-3.5">
                        <NotesPanel projectId={projectId} scope="finding" scopeRef={key} notes={fNotes} onChanged={onNotesChanged} compact />
                      </div>
                    );
                  })()}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Contradictions — surfaced where evidence genuinely diverges, not averaged */}
      {(section.contradictions ?? []).length > 0 && (
        <div className="mt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] mb-2 flex items-center gap-1.5" style={{ color: "#8A4B33" }}>
            <Icon.alert size={13} /> Contradictions
          </h3>
          <div className="space-y-2.5">
            {section.contradictions.map((c, i) => <ContradictionCard key={i} c={c} evidenceById={evidenceById} />)}
          </div>
        </div>
      )}

      {/* Research gaps — what's missing, stated rather than inferred */}
      {(section.gaps ?? []).length > 0 && (
        <div className="mt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] mb-2" style={{ color: "var(--text-tertiary)" }}>Research Gaps</h3>
          <GapList gaps={section.gaps} />
        </div>
      )}

      {/* Recommended actions */}
      {section.recommended_actions.length > 0 && (
        <div className="mt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] mb-2" style={{ color: "var(--text-tertiary)" }}>Recommended Actions</h3>
          <ul className="space-y-2.5">
            {section.recommended_actions.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span aria-hidden className="mt-1 flex-shrink-0" style={{ color: "var(--accent-ink)" }}><Icon.target size={14} /></span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{a.action}</p>
                  {a.rationale && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{a.rationale}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Aspect-level researcher notes (+ any notes whose finding changed) */}
      <div className="mt-5">
        {orphanedFindingNotes.length > 0 && (
          <p className="text-[10px] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            Notes below include {orphanedFindingNotes.length} kept from a finding that changed on a later regeneration.
          </p>
        )}
        <NotesPanel
          projectId={projectId} scope="aspect" scopeRef={section.aspect}
          notes={[...aspectNotes, ...orphanedFindingNotes]} onChanged={onNotesChanged}
        />
      </div>
    </Card>
  );
}

export function AspectSynthesisReader() {
  const { projectId, project, loading, error } = useResearchProject();
  const [row, setRow] = useState<StoredRow>(null);
  const [loaded, setLoaded] = useState(false);
  const [evidenceById, setEvidenceById] = useState<Map<string, Conversation>>(new Map());
  const [keyFindings, setKeyFindings] = useState<string[]>([]);
  const [notes, setNotes] = useState<ResearcherNote[]>([]);
  const [freshness, setFreshness] = useState<{ stale: boolean; new_since: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    const res = await fetch(`/api/research-projects/${projectId}/notes`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setNotes(res?.notes ?? []);
  }, [projectId]);

  const load = useCallback(async () => {
    const [synthRes, evRows, kfRes, notesRes] = await Promise.all([
      fetch(`/api/research-projects/${projectId}/aspect-synthesis`).then(r => (r.ok ? r.json() : { data: null })).catch(() => ({ data: null })),
      fetchAllProjectConversations(projectId).catch(() => [] as Conversation[]),
      fetch(`/api/research-projects/${projectId}/findings-preview`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/research-projects/${projectId}/notes`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setRow(synthRes.data ?? null);
    setFreshness(synthRes.freshness ?? null);
    const map = new Map<string, Conversation>();
    for (const c of evRows) map.set(c.id, c);
    setEvidenceById(map);
    setKeyFindings(kfRes?.keyFindings?.findings ?? []);
    setNotes(notesRes?.notes ?? []);
    setLoaded(true);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function synthesise() {
    setBusy(true); setGenError(null);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/aspect-synthesis`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setGenError(json.error ?? "Couldn't generate the analysis."); return; }
      await load();
      setToast("Analysis updated");
      setTimeout(() => setToast(null), 3500);
    } finally {
      setBusy(false);
    }
  }

  const report = useMemo(() => (row ? (row.edited_content ?? row.content) : null), [row]);

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return <PageContainer><ErrorState title="Research project not found" description={error || "We couldn't load this project."} /></PageContainer>;

  const generatedLabel = row?.generated_at ? formatRelativeTime(row.generated_at) : null;

  return (
    <>
      <PageContainer>
        <WorkspaceHeader
          title="Analysis"
          description="What the evidence means. Findings are synthesised from the collected evidence and organised by the research aspect they inform — expand any finding to see the conversations behind it."
          meta={generatedLabel ? <span>Synthesised {generatedLabel}</span> : undefined}
          primaryAction={
            <Button variant="primary" onClick={synthesise} disabled={busy}>
              {busy ? "Synthesising…" : report ? "Update analysis" : "Synthesise findings"}
            </Button>
          }
        />

        {genError && (
          <div className="flex items-start gap-2.5 px-4 py-3" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
            <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "#8A4B33" }}><Icon.alert size={15} /></span>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{genError}</p>
          </div>
        )}

        {/* Out of date — new evidence collected since this synthesis was generated.
            Never regenerated automatically; the researcher chooses to update. */}
        {report && freshness?.stale && (
          <div className="flex items-start justify-between gap-3 px-4 py-3.5 flex-wrap" style={{ borderRadius: "var(--radius-panel)", background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>
            <div className="flex items-start gap-2.5 min-w-0">
              <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "var(--accent-ink)" }}><Icon.alert size={15} /></span>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: "var(--accent-ink)" }}>Analysis out of date</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {freshness.new_since.toLocaleString()} new relevant conversation{freshness.new_since === 1 ? "" : "s"} {freshness.new_since === 1 ? "has" : "have"} been collected since this analysis was generated. Update it to include the latest evidence.
                </p>
              </div>
            </div>
            <Button variant="primary" onClick={synthesise} disabled={busy}>{busy ? "Updating…" : "Update Analysis"}</Button>
          </div>
        )}

        {/* Project Key Findings — the cross-aspect roll-up above the aspects. */}
        {keyFindings.length > 0 && (
          <Card padding="lg">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-bold uppercase tracking-[0.06em]" style={{ color: "var(--accent-ink)" }}>Project Key Findings</h2>
              <Link href={`/research-projects/${projectId}/analysis/key-findings`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>View full Key Findings →</Link>
            </div>
            <ul className="mt-3 space-y-2">
              {keyFindings.slice(0, 5).map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent-gold)" }} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Project-level researcher notes — the human layer over the whole analysis. */}
        {report && (
          <NotesPanel projectId={projectId} scope="project" scopeRef=""
            notes={notes.filter(n => n.scope === "project")} onChanged={loadNotes} />
        )}

        {/* Aspect sections — the synthesis itself. */}
        {!loaded ? (
          <PageLoadingState />
        ) : !report ? (
          <EmptyState
            icon="✦"
            title="No analysis yet"
            description="Once evidence has been collected and classified, synthesise it into findings organised by research aspect — each backed by the conversations that support it."
            action={<Button variant="primary" onClick={synthesise} disabled={busy}>{busy ? "Synthesising…" : "Synthesise findings"}</Button>}
          />
        ) : report.aspects.length === 0 ? (
          <EmptyState icon="✦" title="Nothing to synthesise yet" description="No relevant classified evidence was found. Collect more conversations, then synthesise." />
        ) : (
          <div className="space-y-4">
            {report.aspects.map(section => (
              <AspectBlock key={section.aspect} section={section} evidenceById={evidenceById}
                projectId={projectId} notes={notes} onNotesChanged={loadNotes} />
            ))}
            {report.omitted_note && (
              <p className="text-xs px-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{report.omitted_note}</p>
            )}
            <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
              Synthesised from {report.evidence_total.toLocaleString()} relevant evidence item{report.evidence_total === 1 ? "" : "s"} across {report.aspects.length} research aspect{report.aspects.length === 1 ? "" : "s"}.
              {" "}These findings package into deliverables in{" "}
              <Link href={`/research-projects/${projectId}/reports`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Reports →</Link>
            </p>
          </div>
        )}
      </PageContainer>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white bg-green-600">✓ {toast}</div>
      )}
    </>
  );
}
