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
import { ConversationEvidenceCard, type Conversation } from "@/app/components/research-projects/ConversationEvidenceCard";
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  PageContainer, WorkspaceHeader, PageLoadingState, ErrorState, EmptyState, Card, Button, Icon,
} from "@/app/components/workspace-ui";
import type { AspectSynthesisReport, AspectSection } from "@/lib/intelligence/analysts/analyseAspectSynthesis";

type StoredRow = { content: AspectSynthesisReport; edited_content: AspectSynthesisReport | null; status: string; generated_at: string | null } | null;

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

function AspectBlock({ section, evidenceById }: { section: AspectSection; evidenceById: Map<string, Conversation> }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setOpen(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <Card padding="lg">
      {/* Aspect heading */}
      <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b" style={{ borderColor: "var(--border-default)" }}>
        <h2 className="text-lg font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{section.aspect}</h2>
        <span className="flex items-center gap-3">
          <SentimentDots s={section.sentiment} />
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {section.evidence_count.toLocaleString()} conversation{section.evidence_count === 1 ? "" : "s"}
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
              const evidence = f.evidence
                .filter(r => r.type === "conversation")
                .map(r => evidenceById.get(r.id))
                .filter((c): c is Conversation => !!c);
              const isOpen = open.has(i);
              return (
                <li key={i} className="border" style={{ borderRadius: "var(--radius-panel)", borderColor: "var(--border-subtle)", background: "var(--surface)" }}>
                  <button type="button" onClick={() => evidence.length && toggle(i)}
                    className="w-full flex items-start gap-3 text-left p-3.5"
                    style={{ cursor: evidence.length ? "pointer" : "default" }}>
                    <span className="fx-tabular-nums text-sm font-bold flex-shrink-0 mt-0.5" style={{ color: "var(--accent-ink)" }}>{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm leading-relaxed block" style={{ color: "var(--text-primary)" }}>{f.finding}</span>
                      {evidence.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold mt-1.5" style={{ color: "var(--accent-ink)" }}>
                          <span aria-hidden className="inline-flex" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}><Icon.chevronRight size={12} strokeWidth={2.5} /></span>
                          {isOpen ? "Hide" : "Show"} {evidence.length} supporting conversation{evidence.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                  </button>
                  {isOpen && evidence.length > 0 && (
                    <div className="px-3.5 pb-3.5 space-y-2.5">
                      {evidence.map(c => <ConversationEvidenceCard key={c.id} c={c} showAspect={false} />)}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
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
    </Card>
  );
}

export function AspectSynthesisReader() {
  const { projectId, project, loading, error } = useResearchProject();
  const [row, setRow] = useState<StoredRow>(null);
  const [loaded, setLoaded] = useState(false);
  const [evidenceById, setEvidenceById] = useState<Map<string, Conversation>>(new Map());
  const [keyFindings, setKeyFindings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [synthRes, evRes, kfRes] = await Promise.all([
      fetch(`/api/research-projects/${projectId}/aspect-synthesis`).then(r => (r.ok ? r.json() : { data: null })).catch(() => ({ data: null })),
      fetch(`/api/social/mentions?research_project_id=${projectId}&limit=500`).then(r => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      fetch(`/api/research-projects/${projectId}/findings-preview`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setRow(synthRes.data ?? null);
    const map = new Map<string, Conversation>();
    for (const c of (evRes.data ?? []) as Conversation[]) map.set(c.id, c);
    setEvidenceById(map);
    setKeyFindings(kfRes?.keyFindings?.findings ?? []);
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
              <AspectBlock key={section.aspect} section={section} evidenceById={evidenceById} />
            ))}
            {report.omitted_note && (
              <p className="text-xs px-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{report.omitted_note}</p>
            )}
            <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
              Synthesised from {report.evidence_total.toLocaleString()} relevant conversation{report.evidence_total === 1 ? "" : "s"} across {report.aspects.length} research aspect{report.aspects.length === 1 ? "" : "s"}.
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
