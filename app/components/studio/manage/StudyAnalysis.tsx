"use client";

// ── Manage → Study → Analysis ────────────────────────────────────────────────
// AI-assisted analysis: review AI-proposed interpretations of the Study evidence.
// Nothing is published; nothing becomes a Finding here. Proposals are Accept / Edit
// (prose only) / Dismiss. Evidence is rendered from the run's immutable snapshot and
// is visually subordinate to the proposal but clearly inspectable.

import { useCallback, useEffect, useState } from "react";
import { Card, Button, StatusBadge, Skeleton } from "@/app/components/workspace-ui";
import { ResearchIntelligenceView } from "@/app/components/studio/discover/ResearchIntelligenceView";
import type { ProductIntelligence } from "@/lib/research-intelligence/product";

type EvidenceItem = {
  ref: string; question: string; scope: "combined" | "survey"; surveyName: string | null;
  optionLabel: string; count: number; base: number; percentage: number | null; resultMode: string | null;
};
// Server-computed structural fact (leader/top-2/spread/consistency). The model cites these
// — it never computes them. Rendered by its self-contained label; `detail` is data, not copy.
type DerivedItem = { ref: string; kind: string; question: string; label: string };
type RefItem = EvidenceItem | DerivedItem;
const isDerived = (x: RefItem): x is DerivedItem => "label" in x && !("optionLabel" in x);
type Snapshot = { study: { completedResponses: number }; evidence: EvidenceItem[]; derived?: DerivedItem[]; segmentDerived?: DerivedItem[] };
type Run = { id: string; status: "running" | "completed" | "failed"; provider: string | null; model: string | null; prompt_version: string | null; evidence_snapshot: Snapshot; evidence_hash: string | null; proposal_count: number; error: string | null; created_at: string; completed_at: string | null };
type Proposal = { id: string; type: string; displayType?: string; priority: "key" | "supporting"; headline: string; explanation: string; evidence_refs: string[]; review_status: "proposed" | "accepted" | "dismissed"; findingId: string | null; reviewed_by: string | null; reviewed_at: string | null; updated_at: string | null };
type Narrative = { headline: string; summary: string; evidenceRefs: string[] };
type Theme = { id: string; title: string; interpretation: string; proposalIds: string[]; evidenceRefs: string[]; importance: "primary" | "secondary"; relationToObjective: string };
type Coverage = { surveys: number; questions: number; evidencePoints: number };
type Payload = { run: Run | null; proposals: Proposal[]; narrative: Narrative | null; themes: Theme[]; coverage: Coverage | null; history: { id: string; status: string; created_at: string; proposal_count: number }[]; stale: { objectiveChanged: boolean; membershipChanged: boolean } | null; researchIntelligence?: ProductIntelligence | null };

const pct = (p: number | null) => (p == null ? "—" : `${Math.round(p * 100)}%`);
const num = (n: number) => n.toLocaleString();
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
const TYPE_TONE: Record<string, "neutral" | "success"> = { observation: "neutral", comparison: "neutral", pattern: "success", tension: "neutral", synthesis: "success", implication: "success" };

// Obvious processing state — staged analysis can take 20s+. Human wording only; no
// Stage/LLM/token/candidate internals, and no fake percentage (progress is indeterminate).
const LOADING_STEPS = ["Reviewing study evidence…", "Looking for patterns and differences…", "Building the study analysis…"];
function AnalysisLoading() {
  const [step, setStep] = useState(0);
  useEffect(() => { const t = setInterval(() => setStep((s) => (s + 1) % LOADING_STEPS.length), 3500); return () => clearInterval(t); }, []);
  return (
    <Card padding="lg">
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Analysing study…</p>
      <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{LOADING_STEPS[step]}</p>
      <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: "var(--border-subtle, rgba(0,0,0,0.06))" }}>
        <div className="h-full rounded-full studio-indeterminate" style={{ width: "40%", background: "var(--accent-gold)" }} />
      </div>
      <style>{`@keyframes studioIndeterminate{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}.studio-indeterminate{animation:studioIndeterminate 1.4s ease-in-out infinite}`}</style>
    </Card>
  );
}

export function StudyAnalysis({ studyId, onViewFindings }: { studyId: string; onViewFindings?: () => void }) {
  const [data, setData] = useState<Payload | null | "error">(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/studio/studies/${studyId}/analysis`);
      if (!r.ok) { setData("error"); return; }
      setData(await r.json());
    } catch { setData("error"); }
  }, [studyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- memoised loader
  useEffect(() => { load(); }, [load]);

  const analyse = async () => {
    if (running) return;
    setRunning(true); setNote(null);
    try {
      const r = await fetch(`/api/studio/studies/${studyId}/analysis`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setNote(j?.error || "Analysis failed."); return; }
      if (j?.run?.status === "failed") setNote(j.run.error || "The analysis did not produce usable proposals. Try running again.");
      await load();
    } finally { setRunning(false); }
  };

  if (data == null) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-32" /></div>;
  if (data === "error") return <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>Analysis is unavailable for this study.</p></Card>;

  const { run, proposals } = data;
  const snapshot = run?.evidence_snapshot;
  const refMap = new Map<string, RefItem>([
    ...(snapshot?.evidence ?? []).map((e) => [e.ref, e] as [string, RefItem]),
    ...(snapshot?.derived ?? []).map((d) => [d.ref, d] as [string, RefItem]),
    ...(snapshot?.segmentDerived ?? []).map((d) => [d.ref, d] as [string, RefItem]),
  ]);
  const active = proposals.filter((p) => p.review_status !== "dismissed");
  const dismissed = proposals.filter((p) => p.review_status === "dismissed");
  const keyProps = active.filter((p) => p.priority !== "supporting");
  const supportingProps = active.filter((p) => p.priority === "supporting");

  // THEME HIERARCHY (Level 3): themes organise the governed avenues. A proposal may sit in
  // more than one theme; proposals in no theme fall to "Supporting analysis". If there are no
  // themes (older run or graceful degradation), we fall back to the Key/Supporting split.
  const byId = new Map(active.map((p) => [p.id, p]));
  const themes = (data.themes ?? []).map((t) => ({ ...t, members: t.proposalIds.map((id) => byId.get(id)).filter(Boolean) as Proposal[] })).filter((t) => t.members.length > 0);
  themes.sort((a, b) => (a.importance === b.importance ? 0 : a.importance === "primary" ? -1 : 1));
  const themedIds = new Set(themes.flatMap((t) => t.members.map((m) => m.id)));
  const standalone = active.filter((p) => !themedIds.has(p.id));
  const hasThemes = themes.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>AI-assisted analysis</h2>
          <p className="text-xs mt-1 max-w-xl" style={{ color: "var(--text-tertiary)" }}>Fanometrix reviews the evidence across this study and proposes candidate insights. Add the useful ones to your findings, edit the wording, or dismiss them. Nothing is published automatically.</p>
          {run && run.status !== "failed" && (
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>
              {data.coverage ? `Analysed ${data.coverage.surveys} survey${data.coverage.surveys === 1 ? "" : "s"} · ${data.coverage.questions} question${data.coverage.questions === 1 ? "" : "s"} · ${data.coverage.evidencePoints} evidence points · ` : ""}Last analysed {when(run.completed_at ?? run.created_at)}
            </p>
          )}
        </div>
        <Button onClick={analyse} variant="primary" size="sm" disabled={running}>{running ? "Analysing…" : run ? "Run analysis again" : "Analyse study"}</Button>
      </div>
      {note && <Card padding="md"><p className="text-sm" style={{ color: "#B4694C" }}>{note}</p></Card>}

      {/* Interpretation staleness — the DATA hasn't changed, the context for reading it has */}
      {data.stale && (data.stale.objectiveChanged || data.stale.membershipChanged) && run && run.status !== "failed" && (
        <Card padding="md">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{data.stale.objectiveChanged ? "Objective updated" : "Study surveys changed"}</p>
              <p className="text-xs mt-0.5 max-w-xl" style={{ color: "var(--text-secondary)" }}>
                This analysis was created {data.stale.objectiveChanged ? "using the previous objective" : "before the surveys changed"}. The results are unchanged, but the interpretation may be out of date. Run a fresh analysis to reflect the current {data.stale.objectiveChanged ? "objective" : "study"}. Existing findings are kept exactly as they are.
              </p>
            </div>
            <Button onClick={analyse} variant="primary" size="sm" disabled={running} className="flex-shrink-0">{running ? "Analysing…" : "Reanalyse study"}</Button>
          </div>
        </Card>
      )}

      {running && <AnalysisLoading />}

      {/* RESEARCH INTELLIGENCE (Stage C1) — the shared, VERIFIED reasoner read over this
          study's governed combined evidence, when a displayable artefact exists. Additive:
          it never removes the review workflow below, and when absent the existing
          deterministic analysis stands unchanged (no blank page). */}
      {!running && data.researchIntelligence && (
        <ResearchIntelligenceView
          intel={data.researchIntelligence}
          context="final"
          answers={run?.evidence_snapshot?.study?.completedResponses ?? 0}
          respondents={run?.evidence_snapshot?.study?.completedResponses ?? 0}
        />
      )}

      {/* WHAT THE RESEARCH SAYS — the AI's overall read, more prominent than any one card */}
      {!running && data.narrative && (
        <Card padding="lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--accent-gold)" }}>What the research says</p>
          <h3 className="text-[19px] font-bold tracking-[-0.02em] leading-snug mt-1.5" style={{ color: "var(--text-primary)" }}>{data.narrative.headline}</h3>
          <p className="text-sm leading-relaxed mt-2 max-w-2xl" style={{ color: "var(--text-secondary)" }}>{data.narrative.summary}</p>
          {data.narrative.evidenceRefs.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs cursor-pointer" style={{ color: "var(--text-tertiary)" }}>Grounded in {data.narrative.evidenceRefs.length} result{data.narrative.evidenceRefs.length === 1 ? "" : "s"}</summary>
              <div className="mt-2 space-y-1">
                {data.narrative.evidenceRefs.map((r) => { const e = refMap.get(r); if (!e) return null; return (
                  <p key={r} className="text-xs" style={{ color: "var(--text-tertiary)" }}>{isDerived(e) ? e.label : `${e.question} — ${e.optionLabel}: ${pct(e.percentage)} · ${num(e.count)} of ${num(e.base)} ${e.scope === "combined" ? "(combined)" : `(${e.surveyName})`}`}</p>
                ); })}
              </div>
            </details>
          )}
          <p className="text-[11px] mt-3" style={{ color: "var(--text-tertiary)" }}>AI-assisted interpretation of the evidence — not a published finding.</p>
        </Card>
      )}

      {running ? null : !run ? (
        <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>No analysis yet. Run one to see the research story and candidate insights grounded in this study&apos;s evidence.</p></Card>
      ) : active.length === 0 && run.status !== "failed" ? (
        <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>The latest analysis produced no current proposals.</p></Card>
      ) : active.length > 0 && hasThemes ? (
        <div className="space-y-6">
          {/* KEY THEMES — the major analytical conclusions; each groups its supporting avenues */}
          <div>
            <div className="mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Key themes · {themes.length}</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>The major conclusions the research points to. Each groups the analytical avenues beneath it — inspect and add the useful ones to your findings.</p>
            </div>
            <div className="space-y-5">
              {themes.map((t) => (
                <div key={t.id}>
                  <div className="mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge label={t.importance === "primary" ? "Primary theme" : "Theme"} tone={t.importance === "primary" ? "success" : "neutral"} dot />
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{t.members.length} avenue{t.members.length === 1 ? "" : "s"}</span>
                    </div>
                    <h4 className="text-[16px] font-bold tracking-[-0.01em] mt-1.5" style={{ color: "var(--text-primary)" }}>{t.title}</h4>
                    <p className="text-sm leading-relaxed mt-1 max-w-2xl" style={{ color: "var(--text-secondary)" }}>{t.interpretation}</p>
                    {t.relationToObjective && <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>Why it matters: {t.relationToObjective}</p>}
                  </div>
                  <div className="space-y-3 pl-3" style={{ borderLeft: "2px solid var(--border-subtle, rgba(0,0,0,0.08))" }}>
                    {t.members.slice(0, 3).map((p) => <ProposalCard key={`${t.id}:${p.id}`} studyId={studyId} proposal={p} refMap={refMap} onChanged={load} onViewFindings={onViewFindings} />)}
                    {t.members.length > 3 && (
                      <details>
                        <summary className="text-xs cursor-pointer py-1" style={{ color: "var(--accent-gold, #B4894C)" }}>View all {t.members.length} supporting insights</summary>
                        <div className="space-y-3 mt-3">
                          {t.members.slice(3).map((p) => <ProposalCard key={`${t.id}:${p.id}`} studyId={studyId} proposal={p} refMap={refMap} onChanged={load} onViewFindings={onViewFindings} />)}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {standalone.length > 0 && (
            <details open={standalone.length <= 8}>
              <summary className="text-[11px] font-semibold uppercase tracking-[0.06em] cursor-pointer" style={{ color: "var(--text-tertiary)" }}>Supporting analysis · {standalone.length}</summary>
              <p className="text-xs mt-1 mb-2" style={{ color: "var(--text-tertiary)" }}>Legitimate analytical avenues that stand on their own or add nuance beyond the main themes.</p>
              <div className="space-y-3">
                {standalone.map((p) => <ProposalCard key={p.id} studyId={studyId} proposal={p} refMap={refMap} onChanged={load} onViewFindings={onViewFindings} />)}
              </div>
            </details>
          )}
        </div>
      ) : active.length > 0 ? (
        /* GRACEFUL FALLBACK — no themes on this run: the prior Key/Supporting split */
        <div className="space-y-5">
          <div>
            <div className="mb-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Key insights · {keyProps.length}</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>AI-assisted interpretations for your review. Add the useful ones to your findings.</p>
            </div>
            <div className="space-y-3">
              {(keyProps.length ? keyProps : active).map((p) => <ProposalCard key={p.id} studyId={studyId} proposal={p} refMap={refMap} onChanged={load} onViewFindings={onViewFindings} />)}
            </div>
          </div>
          {keyProps.length > 0 && supportingProps.length > 0 && (
            <details open={supportingProps.length <= 8}>
              <summary className="text-[11px] font-semibold uppercase tracking-[0.06em] cursor-pointer" style={{ color: "var(--text-tertiary)" }}>Supporting insights · {supportingProps.length}</summary>
              <p className="text-xs mt-1 mb-2" style={{ color: "var(--text-tertiary)" }}>Legitimate secondary observations — useful context, less likely to become headline findings.</p>
              <div className="space-y-3">
                {supportingProps.map((p) => <ProposalCard key={p.id} studyId={studyId} proposal={p} refMap={refMap} onChanged={load} onViewFindings={onViewFindings} />)}
              </div>
            </details>
          )}
        </div>
      ) : null}

      {dismissed.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs cursor-pointer" style={{ color: "var(--text-tertiary)" }}>Dismissed ({dismissed.length})</summary>
          <div className="space-y-3 mt-2 opacity-60">
            {dismissed.map((p) => <ProposalCard key={p.id} studyId={studyId} proposal={p} refMap={refMap} onChanged={load} onViewFindings={onViewFindings} />)}
          </div>
        </details>
      )}
    </div>
  );
}

function ProposalCard({ studyId, proposal, refMap, onChanged, onViewFindings }: { studyId: string; proposal: Proposal; refMap: Map<string, RefItem>; onChanged: () => void; onViewFindings?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(proposal.headline);
  const [explanation, setExplanation] = useState(proposal.explanation);
  const [busy, setBusy] = useState(false);
  const [findingNote, setFindingNote] = useState<string | null>(null);
  const added = !!proposal.findingId;

  const act = async (body: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/studio/studies/${studyId}/analysis/proposals/${proposal.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) { setEditing(false); onChanged(); }
    } finally { setBusy(false); }
  };

  // "Add to findings" performs acceptance + Finding creation in one server action;
  // it is idempotent, and the UI already hides it once the proposal has a Finding.
  const addToFindings = async () => {
    if (busy) return;
    setBusy(true); setFindingNote(null);
    try {
      const r = await fetch(`/api/studio/studies/${studyId}/findings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ origin: "analysis_proposal", proposalId: proposal.id }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) onChanged(); else setFindingNote(j?.error || "Could not add to findings.");
    } finally { setBusy(false); }
  };

  const evidence = proposal.evidence_refs.map((r) => refMap.get(r)).filter(Boolean) as RefItem[];

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <StatusBadge label={proposal.displayType ?? proposal.type} tone={TYPE_TONE[proposal.displayType ?? proposal.type] ?? "neutral"} dot />
        {added && <StatusBadge label="Added to findings ✓" tone="success" dot />}
        {!added && proposal.review_status === "dismissed" && <StatusBadge label="Dismissed" tone="neutral" dot />}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full px-3 py-2 text-sm font-semibold rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
          <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={3} className="w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Only the wording is editable. The supporting evidence stays fixed.</p>
          <div className="flex items-center gap-2">
            <Button onClick={() => act({ action: "edit", headline, explanation })} variant="primary" size="sm" disabled={busy || (!headline.trim() && !explanation.trim())}>Save</Button>
            <Button onClick={() => { setEditing(false); setHeadline(proposal.headline); setExplanation(proposal.explanation); }} variant="ghost" size="sm" disabled={busy}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="text-[15px] font-bold tracking-[-0.01em] mt-2" style={{ color: "var(--text-primary)" }}>{proposal.headline}</h3>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{proposal.explanation}</p>
        </>
      )}

      {/* SUPPORTED BY — evidence subordinate but inspectable (no raw refs shown) */}
      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle, rgba(0,0,0,0.06))" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Supported by</p>
        <div className="space-y-1.5">
          {evidence.map((e, i) => isDerived(e) ? (
            <div key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{e.question}</span>
              {" — "}<span>{e.label}</span>
              <span style={{ color: "var(--text-tertiary)" }}> · computed</span>
            </div>
          ) : (
            <div key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{e.question}</span>
              {" — "}{e.optionLabel}: <span className="tabular-nums">{pct(e.percentage)} · {num(e.count)} of {num(e.base)} completed responses</span>
              <span style={{ color: "var(--text-tertiary)" }}> · {e.scope === "combined" ? "combined across surveys" : e.surveyName}</span>
            </div>
          ))}
        </div>
      </div>

      {!editing && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {added ? (
            <Button onClick={() => onViewFindings?.()} variant="secondary" size="sm">View finding</Button>
          ) : proposal.review_status !== "dismissed" ? (
            <>
              <Button onClick={addToFindings} variant="primary" size="sm" disabled={busy}>Add to findings</Button>
              <Button onClick={() => setEditing(true)} variant="ghost" size="sm" disabled={busy}>Edit</Button>
              <Button onClick={() => act({ action: "dismiss" })} variant="ghost" size="sm" disabled={busy}>Dismiss</Button>
            </>
          ) : null}
        </div>
      )}
      {findingNote && <p className="text-xs mt-2" style={{ color: "#B4694C" }}>{findingNote}</p>}
    </Card>
  );
}
