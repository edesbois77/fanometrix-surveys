"use client";

// Analysis — the Research Intelligence workspace. Reads like a professional
// research report, top to bottom: Executive Summary → Research Confidence →
// Project Key Findings → Research Aspects → Researcher Notes. A composition over
// the objects the engine already produced (docs/analysis-workspace-blueprint.md):
// nothing is generated here, every statement traces to approved evidence, and
// weak/conflicting/missing evidence is surfaced honestly rather than averaged.
//
// This is a COMPOSITION redesign: every object renderer (confidence, source
// diversity, contradictions, gaps, evidence, notes) is reused from
// analysis-objects.tsx / ResearcherNotes.tsx — the layout is reorganised so each
// Research Aspect reads like a chapter, not a stack of widgets.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { fetchAllProjectConversations, type Conversation } from "@/app/components/research-projects/ConversationEvidenceCard";
import { NotesPanel, findingKey, type ResearcherNote } from "@/app/components/research-projects/analysis/ResearcherNotes";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, EmptyState, Card, Button, Icon } from "@/app/components/workspace-ui";
import type { AspectSynthesisReport, AspectSection, EvidenceSourceType } from "@/lib/intelligence/analysts/analyseAspectSynthesis";
import type { FindingConfidence } from "@/lib/intelligence/finding-confidence";
import {
  Confidence, SourceDiversity, SentimentDots, EvidenceGroups, ContradictionCard, GapList,
  aspectEvidence, dedupeEvidence, confidenceForEvidence, EVIDENCE_ORDER, GROUP_LABEL, groupBySource,
} from "@/app/components/research-projects/analysis/analysis-objects";

type StoredRow = { content: AspectSynthesisReport; edited_content: AspectSynthesisReport | null; status: string; generated_at: string | null } | null;

const SECTIONS = [
  { id: "summary", label: "Executive Summary" },
  { id: "confidence", label: "Research Confidence" },
  { id: "findings", label: "Key Findings" },
  { id: "aspects", label: "Research Aspects" },
  { id: "notes", label: "Researcher Notes" },
] as const;

// ── Sticky in-page section nav (anchor jumps + scroll-spy) ───────────────────
function SectionNav({ available }: { available: Set<string> }) {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    const ids = SECTIONS.filter(s => available.has(s.id)).map(s => s.id);
    const obs = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -60% 0px", threshold: 0 },
    );
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [available]);

  return (
    <div className="sticky top-0 z-20 -mx-1 px-1 py-2 flex gap-1 flex-wrap"
      style={{ background: "var(--surface-canvas, var(--surface))", backdropFilter: "blur(6px)", borderBottom: "1px solid var(--border-subtle)" }}>
      {SECTIONS.filter(s => available.has(s.id)).map(s => (
        <a key={s.id} href={`#${s.id}`}
          className="text-[12px] font-semibold px-2.5 py-1 rounded-full transition-colors"
          style={active === s.id
            ? { color: "var(--accent-ink)", background: "var(--accent-wash)", border: "1px solid #ECDCB8" }
            : { color: "var(--text-tertiary)", border: "1px solid transparent" }}>
          {s.label}
        </a>
      ))}
    </div>
  );
}

const EMPTY_EVIDENCE: AspectSection["key_findings"][number]["evidence"] = [];

// A gold "token" number — the old readers' briefing texture, in workspace tokens.
function TokenNumber({ n }: { n: number }) {
  return (
    <span aria-hidden className="fx-tabular-nums flex-shrink-0 inline-flex items-center justify-center text-[11px] font-bold rounded-full"
      style={{ width: 22, height: 22, color: "var(--accent-ink)", background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>{n}</span>
  );
}

// A chapter sub-section: a hairline rule, a small-caps eyebrow with a tone tick,
// and optional one-line micro-copy that says what the section is — the editorial
// cadence the old Intelligence reports had and the flat stack lost.
function ChapterSection({ eyebrow, tone, hint, children }: { eyebrow: ReactNode; tone?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-6 pt-5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center gap-2">
        <span aria-hidden className="rounded-full" style={{ width: 3, height: 14, background: tone ?? "var(--accent-gold)" }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.11em]" style={{ color: tone ?? "var(--text-tertiary)" }}>{eyebrow}</h3>
      </div>
      {hint && <p className="text-[11px] leading-relaxed mt-1.5 mb-3" style={{ color: "var(--text-tertiary)", marginLeft: 11 }}>{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-sm font-bold fx-tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</span>
      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{label}</span>
    </span>
  );
}

// ── Executive Summary — the 10-second read ───────────────────────────────────
function ExecutiveSummary({
  answer, rationale, researchQuestion, conf, generatedLabel, evidenceTotal, aspectCount, sourceTypes,
}: {
  answer: string | null; rationale: string | null; researchQuestion: string | null;
  conf: FindingConfidence; generatedLabel: string | null; evidenceTotal: number; aspectCount: number; sourceTypes: EvidenceSourceType[];
}) {
  return (
    <section id="summary" className="scroll-mt-24">
      <Card padding="lg">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] mb-2" style={{ color: "var(--accent-ink)" }}>Executive Summary</p>
        {researchQuestion && <p className="text-xs mb-2.5 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{researchQuestion}</p>}
        <p className="text-lg leading-relaxed font-semibold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>
          {answer || "The evidence has been synthesised into the research aspects below. Publish a conclusion to headline the answer here."}
        </p>
        {rationale && <p className="text-sm mt-2.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{rationale}</p>}
        <div className="flex items-center gap-4 flex-wrap mt-4 pt-4 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <Confidence conf={conf} />
          <SourceDiversity sources={sourceTypes} />
          <StatChip value={aspectCount.toLocaleString()} label={`aspect${aspectCount === 1 ? "" : "s"}`} />
          <StatChip value={evidenceTotal.toLocaleString()} label={`evidence item${evidenceTotal === 1 ? "" : "s"}`} />
          {generatedLabel && <span className="text-[11px] ml-auto" style={{ color: "var(--text-tertiary)" }}>Synthesised {generatedLabel}</span>}
        </div>
      </Card>
    </section>
  );
}

// ── Research Confidence — how strong the evidence is, before interpreting it ──
function ResearchConfidence({
  conf, sourceTypes, contradictions, gaps, evidenceById,
}: {
  conf: FindingConfidence; sourceTypes: EvidenceSourceType[];
  contradictions: { aspect: string; c: AspectSection["contradictions"][number] }[];
  gaps: AspectSection["gaps"]; evidenceById: Map<string, Conversation>;
}) {
  return (
    <section id="confidence" className="scroll-mt-24">
      <Card padding="lg">
        <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b" style={{ borderColor: "var(--border-default)" }}>
          <div>
            <h2 className="text-lg font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Research Confidence</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>How strong the evidence is — before you interpret it.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <SourceDiversity sources={sourceTypes} />
          </div>
        </div>

        <div className="mt-4"><Confidence conf={conf} /></div>

        {/* Contradictions across the project */}
        <div className="mt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2 flex items-center gap-1.5" style={{ color: "#8A4B33" }}>
            <Icon.alert size={13} /> Contradictions
          </h3>
          {contradictions.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No contradictions detected across the evidence.</p>
          ) : (
            <div className="space-y-2.5">
              {contradictions.map((x, i) => (
                <div key={i}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.07em] mb-1" style={{ color: "var(--text-tertiary)" }}>{x.aspect}</p>
                  <ContradictionCard c={x.c} evidenceById={evidenceById} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Research gaps across the project */}
        <div className="mt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Research Gaps</h3>
          {gaps.length === 0
            ? <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Every aspect is supported across the available sources.</p>
            : <GapList gaps={gaps} />}
        </div>
      </Card>
    </section>
  );
}

// ── One finding — statement + trust signals + its own evidence + note ────────
function FindingCard({
  aspect, index, finding, projectId, notes, onNotesChanged, evidenceById,
}: {
  aspect: string; index: number; finding: AspectSection["key_findings"][number];
  projectId: string; notes: ResearcherNote[]; onNotesChanged: () => void; evidenceById: Map<string, Conversation>;
}) {
  const [open, setOpen] = useState(false);
  const items = finding.evidence ?? EMPTY_EVIDENCE;
  const conf = useMemo(() => confidenceForEvidence(items), [items]);
  const groups = groupBySource(items);
  const present = EVIDENCE_ORDER.filter(t => groups[t].length > 0);
  const breakdown = present.map(t => `${groups[t].length} ${GROUP_LABEL[t][groups[t].length === 1 ? 0 : 1].toLowerCase()}`).join(" · ");
  const key = findingKey(aspect, finding.finding);
  const fNotes = notes.filter(n => n.scope === "finding" && n.scope_ref === key);

  return (
    <li>
      <div className="flex items-start gap-3">
        <div className="pt-0.5"><TokenNumber n={index + 1} /></div>
        <div className="flex-1 min-w-0">
          {/* The finding statement leads — it is the sentence, not a widget. */}
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-primary)" }}>{finding.finding}</p>
          {/* Trust signals sit quietly beneath the claim. */}
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <Confidence conf={conf} />
            <SourceDiversity sources={conf.sources} />
            <span className="text-[11px] fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>{conf.evidenceCount.toLocaleString()} piece{conf.evidenceCount === 1 ? "" : "s"} of evidence</span>
          </div>
          {items.length > 0 && (
            <button type="button" onClick={() => setOpen(o => !o)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold mt-1.5 text-left" style={{ color: "var(--accent-ink)", cursor: "pointer" }}>
              <span aria-hidden className="inline-flex flex-shrink-0" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><Icon.chevronRight size={12} strokeWidth={2.5} /></span>
              {open ? "Hide" : "Show"} the evidence — {breakdown}
            </button>
          )}
          {open && items.length > 0 && <div className="mt-2.5"><EvidenceGroups items={items} evidenceById={evidenceById} /></div>}
          <div className="mt-2"><NotesPanel projectId={projectId} scope="finding" scopeRef={key} notes={fNotes} onChanged={onNotesChanged} compact /></div>
        </div>
      </div>
    </li>
  );
}

// ── One Research Aspect — a self-contained research chapter ───────────────────
function AspectChapter({
  section, evidenceById, projectId, notes, onNotesChanged,
}: {
  section: AspectSection; evidenceById: Map<string, Conversation>;
  projectId: string; notes: ResearcherNote[]; onNotesChanged: () => void;
}) {
  const [evOpen, setEvOpen] = useState(false);
  const pool = useMemo(() => aspectEvidence(section), [section]);
  const conf = useMemo(() => confidenceForEvidence(pool), [pool]);
  // A representative peek so provenance stays visible, the way the old Document
  // report always kept citations on the page — the two most-relevant items.
  const peek = useMemo(() => [...pool].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0)).slice(0, 2), [pool]);

  const aspectNotes = notes.filter(n => n.scope === "aspect" && n.scope_ref === section.aspect);
  const currentKeys = new Set(section.key_findings.map(f => findingKey(section.aspect, f.finding)));
  const orphanedNotes = notes.filter(n => n.scope === "finding" && n.scope_ref.startsWith(`${section.aspect}::`) && !currentKeys.has(n.scope_ref));
  const contradictions = section.contradictions ?? [];
  const gaps = section.gaps ?? [];

  return (
    <Card padding="lg">
      {/* Chapter header — the aspect, opened with its verdict (confidence + sources). */}
      <header className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b" style={{ borderColor: "var(--border-default)" }}>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.11em]" style={{ color: "var(--text-tertiary)" }}>Research Aspect</p>
          <h2 className="text-[22px] font-bold tracking-[-0.02em] mt-0.5 leading-tight" style={{ color: "var(--text-primary)" }}>{section.aspect}</h2>
          <div className="flex items-center gap-2 mt-2">
            <SentimentDots s={section.sentiment} />
            <span className="text-[11px]" style={{ color: "var(--text-disabled)" }}>·</span>
            <span className="text-[11px] fx-tabular-nums" style={{ color: "var(--text-tertiary)" }}>{section.evidence_count.toLocaleString()} piece{section.evidence_count === 1 ? "" : "s"} of evidence</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap flex-shrink-0 pt-0.5">
          <Confidence conf={conf} />
          <SourceDiversity sources={section.source_types ?? []} />
        </div>
      </header>

      {/* Lead — the chapter's thesis sentence. */}
      {section.summary && <p className="text-[15px] leading-7 mt-4" style={{ color: "var(--text-secondary)" }}>{section.summary}</p>}

      {/* Contradictions (only if present) */}
      {contradictions.length > 0 && (
        <ChapterSection eyebrow={<span className="inline-flex items-center gap-1.5"><Icon.alert size={12} /> Contradictions</span>} tone="#8A4B33"
          hint="Where the evidence disagrees — shown with both sides, not averaged away.">
          <div className="space-y-2.5">{contradictions.map((c, i) => <ContradictionCard key={i} c={c} evidenceById={evidenceById} />)}</div>
        </ChapterSection>
      )}

      {/* Research Gaps (only if present) */}
      {gaps.length > 0 && (
        <ChapterSection eyebrow="Research Gaps" hint="What the evidence does not yet cover, and the research that would close it.">
          <GapList gaps={gaps} />
        </ChapterSection>
      )}

      {/* Key Findings — numbered prose, the claim leading. */}
      {section.key_findings.length > 0 && (
        <ChapterSection eyebrow="Key Findings">
          <ol className="space-y-4">
            {section.key_findings.map((f, i) => (
              <FindingCard key={i} aspect={section.aspect} index={i} finding={f}
                projectId={projectId} notes={notes} onNotesChanged={onNotesChanged} evidenceById={evidenceById} />
            ))}
          </ol>
        </ChapterSection>
      )}

      {/* Supporting Evidence — a peek stays on the page; expand for the full base. */}
      {pool.length > 0 && (
        <ChapterSection eyebrow="Supporting Evidence" hint="The evidence these findings rest on, grouped by source and traceable to where it came from.">
          <EvidenceGroups items={evOpen ? pool : peek} evidenceById={evidenceById} />
          {pool.length > peek.length && (
            <button type="button" onClick={() => setEvOpen(o => !o)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold mt-3" style={{ color: "var(--accent-ink)", cursor: "pointer" }}>
              <span aria-hidden className="inline-flex" style={{ transform: evOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><Icon.chevronRight size={12} strokeWidth={2.5} /></span>
              {evOpen ? "Show less" : `Show all ${pool.length} evidence items behind this aspect`}
            </button>
          )}
        </ChapterSection>
      )}

      {/* Recommended Actions */}
      {section.recommended_actions.length > 0 && (
        <ChapterSection eyebrow="Recommended Actions" hint="What the evidence above supports doing.">
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
        </ChapterSection>
      )}

      {/* Researcher Notes */}
      <section className="mt-6 pt-5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        {orphanedNotes.length > 0 && (
          <p className="text-[10px] mb-1.5" style={{ color: "var(--text-tertiary)" }}>
            Includes {orphanedNotes.length} note{orphanedNotes.length === 1 ? "" : "s"} kept from a finding that changed on a later regeneration.
          </p>
        )}
        <NotesPanel projectId={projectId} scope="aspect" scopeRef={section.aspect} notes={[...aspectNotes, ...orphanedNotes]} onChanged={onNotesChanged} />
      </section>
    </Card>
  );
}

export function AnalysisWorkspace() {
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
    setKeyFindings(kfRes?.keyFindings?.findings ?? kfRes?.data?.keyFindings?.findings ?? []);
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
    } finally { setBusy(false); }
  }

  const report = useMemo(() => (row ? (row.edited_content ?? row.content) : null), [row]);

  // Project-level roll-ups — pure reductions over the aspects (no new API).
  const rollup = useMemo(() => {
    if (!report) return null;
    const aspects = report.aspects;
    const projectPool = dedupeEvidence(aspects.flatMap(aspectEvidence));
    const conf = confidenceForEvidence(projectPool);
    const sourceTypes = (["conversation", "survey", "document"] as EvidenceSourceType[]).filter(t => aspects.some(a => (a.source_types ?? []).includes(t)));
    const contradictions = aspects.flatMap(a => (a.contradictions ?? []).map(c => ({ aspect: a.aspect, c })));

    // Project gaps: which sources are missing across how many aspects + thin aspects.
    const total = aspects.length;
    const gaps: AspectSection["gaps"] = [];
    const GAP_ACTION: Record<string, string> = {
      survey: "Run surveys on these aspects to measure them directly.",
      conversation: "Collect conversations for these aspects to hear unprompted views.",
      document: "Add research documents to corroborate these aspects.",
    };
    const LABELS: Record<EvidenceSourceType, string> = { survey: "Survey", conversation: "Conversation", document: "Document" };
    for (const t of ["survey", "conversation", "document"] as EvidenceSourceType[]) {
      const missing = aspects.filter(a => !(a.source_types ?? []).includes(t)).length;
      if (missing > 0) gaps.push({ kind: "missing_source", message: `${LABELS[t]} evidence missing in ${missing} of ${total} aspect${total === 1 ? "" : "s"}`, suggested_action: GAP_ACTION[t] });
    }
    const thin = aspects.filter(a => (a.gaps ?? []).some(g => g.kind === "low_confidence")).length;
    if (thin > 0) gaps.push({ kind: "low_confidence", message: `${thin} aspect${thin === 1 ? "" : "s"} rest on thin or lower-relevance evidence`, suggested_action: "Gather more evidence for these aspects before relying on them." });

    return { conf, sourceTypes, contradictions, gaps };
  }, [report]);

  const available = useMemo(() => new Set<string>(report ? ["summary", "confidence", "findings", "aspects", "notes"] : []), [report]);

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return <PageContainer><ErrorState title="Research project not found" description={error || "We couldn't load this project."} /></PageContainer>;

  const generatedLabel = row?.generated_at ? formatRelativeTime(row.generated_at) : null;
  const conclusion = project.published_conclusion;

  return (
    <>
      <PageContainer>
        <WorkspaceHeader
          title="Analysis"
          description="What the evidence means — the project understood as one research report. Every statement traces to approved evidence; nothing here is generated on this page."
          meta={generatedLabel ? <span>Synthesised {generatedLabel}</span> : undefined}
          primaryAction={<Button variant="primary" onClick={synthesise} disabled={busy}>{busy ? "Synthesising…" : report ? "Update analysis" : "Synthesise findings"}</Button>}
        />

        {genError && (
          <div className="flex items-start gap-2.5 px-4 py-3" style={{ borderRadius: "var(--radius-panel)", background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
            <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "#8A4B33" }}><Icon.alert size={15} /></span>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{genError}</p>
          </div>
        )}

        {report && freshness?.stale && (
          <div className="flex items-start justify-between gap-3 px-4 py-3.5 flex-wrap" style={{ borderRadius: "var(--radius-panel)", background: "var(--accent-wash)", border: "1px solid #ECDCB8" }}>
            <div className="flex items-start gap-2.5 min-w-0">
              <span aria-hidden className="mt-0.5 flex-shrink-0" style={{ color: "var(--accent-ink)" }}><Icon.alert size={15} /></span>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: "var(--accent-ink)" }}>Analysis out of date</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {freshness.new_since.toLocaleString()} new relevant evidence item{freshness.new_since === 1 ? "" : "s"} {freshness.new_since === 1 ? "has" : "have"} been collected since this analysis was generated. Update it to include the latest evidence.
                </p>
              </div>
            </div>
            <Button variant="primary" onClick={synthesise} disabled={busy}>{busy ? "Updating…" : "Update Analysis"}</Button>
          </div>
        )}

        {!loaded ? (
          <PageLoadingState />
        ) : !report ? (
          <EmptyState icon="✦" title="No analysis yet"
            description="Once evidence has been collected, approved and classified, synthesise it into a research report organised by aspect — each finding backed by the evidence that supports it."
            action={<Button variant="primary" onClick={synthesise} disabled={busy}>{busy ? "Synthesising…" : "Synthesise findings"}</Button>} />
        ) : report.aspects.length === 0 ? (
          <EmptyState icon="✦" title="Nothing to synthesise yet" description="No relevant classified evidence was found. Collect and approve more evidence, then synthesise." />
        ) : rollup ? (
          <>
            <SectionNav available={available} />

            <ExecutiveSummary
              answer={conclusion?.answer ?? null} rationale={conclusion?.rationale ?? null}
              researchQuestion={project.research_question ?? conclusion?.research_question ?? null}
              conf={rollup.conf} generatedLabel={generatedLabel}
              evidenceTotal={report.evidence_total} aspectCount={report.aspects.length} sourceTypes={rollup.sourceTypes} />

            <ResearchConfidence conf={rollup.conf} sourceTypes={rollup.sourceTypes}
              contradictions={rollup.contradictions} gaps={rollup.gaps} evidenceById={evidenceById} />

            {/* Project Key Findings */}
            <section id="findings" className="scroll-mt-24">
              <Card padding="lg">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-lg font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Project Key Findings</h2>
                  <Link href={`/research-projects/${projectId}/analysis/key-findings`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>View full Key Findings →</Link>
                </div>
                {keyFindings.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {keyFindings.slice(0, 6).map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent-gold)" }} aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm mt-2" style={{ color: "var(--text-tertiary)" }}>The cross-source roll-up appears once per-source findings are approved.</p>
                )}
              </Card>
            </section>

            {/* Research Aspects — the heart of the page */}
            <section id="aspects" className="scroll-mt-24 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] px-1" style={{ color: "var(--text-tertiary)" }}>Research Aspects</p>
              {report.aspects.map(section => (
                <AspectChapter key={section.aspect} section={section} evidenceById={evidenceById}
                  projectId={projectId} notes={notes} onNotesChanged={loadNotes} />
              ))}
              {report.omitted_note && <p className="text-xs px-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{report.omitted_note}</p>}
            </section>

            {/* Project-level Researcher Notes */}
            <section id="notes" className="scroll-mt-24">
              <p className="text-[11px] font-semibold uppercase tracking-[0.09em] px-1 mb-2" style={{ color: "var(--text-tertiary)" }}>Researcher Notes</p>
              <NotesPanel projectId={projectId} scope="project" scopeRef="" notes={notes.filter(n => n.scope === "project" && n.scope_ref === "")} onChanged={loadNotes} />
            </section>

            <p className="text-xs px-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Synthesised from {report.evidence_total.toLocaleString()} relevant evidence item{report.evidence_total === 1 ? "" : "s"} across {report.aspects.length} research aspect{report.aspects.length === 1 ? "" : "s"}.
              {" "}These findings package into deliverables in{" "}
              <Link href={`/research-projects/${projectId}/reports`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Reports →</Link>
            </p>
          </>
        ) : null}
      </PageContainer>

      {toast && <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white bg-green-600">✓ {toast}</div>}
    </>
  );
}
