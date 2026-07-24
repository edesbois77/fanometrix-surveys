"use client";

// The Findings overview — the section landing page. It answers "where do the
// findings stand?" at a glance: how many each source produced, how many are
// approved, awaiting review or set aside, and how many are ready to feed the
// cross-source Analysis. Extraction is launched here (project-wide); the per-
// source pages are for the actual review.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { Card, Button, Icon, PageLoadingState, ErrorState } from "@/app/components/workspace-ui";
import { SOURCE_KIND_ORDER, CONVERSATION_KINDS, type SourceKind } from "@/lib/analysis/source-findings/types";

type KindCounts = { candidate: number; approved: number; set_aside: number; total: number };
type BoardData = { findings: unknown[]; byKind: Record<string, KindCounts>; approvedTotal: number };
type PopStats = {
  campaigns: number;
  usingAnswerStore: boolean;
  findings: { total: number; q1: number; q2: number; q3: number };
  reach: { q1: number; q2: number; q3: number };
  completedTotal: number;
  surveys: { surveyId: string; name: string; completed: number }[];
};
type SourceStage = {
  key: string; label: string;
  evidenceCollected: number; evidenceUnit: string;
  awaitingApproval: number; awaitingExtraction: number; awaitingReview: number; approved: number;
  blockingReason: string | null;
  nextAction: { label: string; href: string } | null;
};

// The three families the Analysis reasons over. A family is "ready" once it has
// at least one approved finding.
const FAMILIES: { key: string; label: string; page: string; kinds: SourceKind[] }[] = [
  { key: "survey", label: "Survey", page: "survey", kinds: ["survey"] },
  { key: "conversation", label: "Conversation", page: "conversation", kinds: CONVERSATION_KINDS },
  { key: "document", label: "Research Library", page: "document", kinds: ["document"] },
];

const approvedIn = (byKind: Record<string, KindCounts>, kinds: SourceKind[]) =>
  kinds.reduce((n, k) => n + (byKind[k]?.approved ?? 0), 0);
const totalIn = (byKind: Record<string, KindCounts>, kinds: SourceKind[]) =>
  kinds.reduce((n, k) => n + (byKind[k]?.total ?? 0), 0);

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="p-3 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
      <p className="text-2xl font-bold tabular-nums" style={{ color: tone ?? "var(--text-primary)" }}>{value}</p>
      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{label}</p>
    </div>
  );
}

// One source's pipeline: the five stages, the blocking reason, and the next
// action — so a source with evidence is never a silent "no findings yet".
function StageRow({ s }: { s: SourceStage }) {
  const stages: { value: string; label: string; tone?: string }[] = [
    { value: s.evidenceCollected.toLocaleString(), label: `${s.evidenceUnit} collected` },
    { value: s.awaitingApproval.toLocaleString(), label: "awaiting approval", tone: s.awaitingApproval > 0 ? "#8A4B33" : undefined },
    { value: s.awaitingExtraction.toLocaleString(), label: "awaiting extraction" },
    { value: s.awaitingReview.toLocaleString(), label: "awaiting review", tone: s.awaitingReview > 0 ? "#C79A3E" : undefined },
    { value: s.approved.toLocaleString(), label: "approved", tone: s.approved > 0 ? "#2F7D55" : undefined },
  ];
  return (
    <div className="p-3 rounded-xl" style={{ border: "1px solid var(--border-subtle)", background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{s.label}</p>
        {s.nextAction && <Button href={s.nextAction.href} size="sm" variant="secondary">{s.nextAction.label} →</Button>}
      </div>
      <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-1.5">
        {stages.map((st, i) => (
          <div key={i} className="text-center p-1.5 rounded-lg" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
            <p className="text-sm font-bold tabular-nums" style={{ color: st.tone ?? "var(--text-primary)" }}>{st.value}</p>
            <p className="text-[9px] leading-tight mt-0.5" style={{ color: "var(--text-tertiary)" }}>{st.label}</p>
          </div>
        ))}
      </div>
      {s.blockingReason && (
        <div className="mt-2 flex items-start gap-1.5 p-2 rounded-lg text-[11px]" style={{ background: "var(--surface-sunken)", color: "#8A4B33" }}>
          <span className="flex-shrink-0 mt-px"><Icon.alert size={12} /></span>
          <span>{s.blockingReason}</span>
        </div>
      )}
    </div>
  );
}

function PipelineCard({ sources }: { sources: SourceStage[] }) {
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 mb-1">
        <Icon.layers size={14} strokeWidth={2} />
        <p className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: "var(--text-secondary)" }}>Evidence pipeline</p>
      </div>
      <p className="text-[11px] mb-2.5" style={{ color: "var(--text-tertiary)" }}>
        Where each source&apos;s evidence is, and — if nothing has reached Findings or Analysis — exactly why, with the next step to unblock it.
      </p>
      <div className="space-y-2.5">
        {sources.map(s => <StageRow key={s.key} s={s} />)}
      </div>
    </Card>
  );
}

export function FindingsOverview() {
  const { projectId, project, loading, error } = useResearchProject();
  const [data, setData] = useState<BoardData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [pop, setPop] = useState<PopStats | null>(null);
  const [pipeline, setPipeline] = useState<SourceStage[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research-projects/${projectId}/source-findings`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setData(res?.data ?? { findings: [], byKind: {}, approvedTotal: 0 });
    setLoaded(true);
    return (res?.data ?? { findings: [], byKind: {}, approvedTotal: 0 }) as BoardData;
  }, [projectId]);

  const loadPopulations = useCallback(async () => {
    const res = await fetch(`/api/research-projects/${projectId}/source-findings/populations`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setPop((res?.data ?? null) as PopStats | null);
  }, [projectId]);

  const loadPipeline = useCallback(async () => {
    const res = await fetch(`/api/research-projects/${projectId}/source-findings/pipeline`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setPipeline((res?.data?.sources ?? null) as SourceStage[] | null);
  }, [projectId]);

  useEffect(() => { load(); loadPopulations(); loadPipeline(); return () => { if (pollRef.current) clearTimeout(pollRef.current); }; }, [load, loadPopulations, loadPipeline]);

  const pollAfterExtract = useCallback((remaining: number) => {
    if (remaining <= 0) {
      // Done: refresh the diagnostic and post a top-line summary of what changed.
      setExtracting(false);
      Promise.all([load(), loadPopulations(), loadPipeline()]).then(([d]) => {
        const total = Object.values(d.byKind).reduce((n, c) => n + c.total, 0);
        setSummary(`Extraction complete — ${total} finding${total === 1 ? "" : "s"} across ${Object.keys(d.byKind).length} source${Object.keys(d.byKind).length === 1 ? "" : "s"}.`);
      });
      return;
    }
    pollRef.current = setTimeout(async () => { await load(); pollAfterExtract(remaining - 1); }, 2500);
  }, [load, loadPopulations, loadPipeline]);

  async function extract() {
    setExtracting(true);
    setSummary(null);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/source-findings/extract`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setToast("Could not start extraction."); setExtracting(false); return; }
      const { enqueued = 0, units = 0 } = json.data ?? {};
      setToast(enqueued > 0 ? `Re-extracting ${enqueued} source${enqueued === 1 ? "" : "s"}…` : `Extraction already running for ${units} source${units === 1 ? "" : "s"}…`);
      await load();
      pollAfterExtract(10);
    } catch { setToast("Could not start extraction."); setExtracting(false); }
  }

  if (loading && !project) return <PageLoadingState />;
  if (error || !project) return <ErrorState title="Research project not found" description={error || "We couldn't load this project."} />;
  if (!loaded) return <PageLoadingState />;

  const byKind = data?.byKind ?? {};
  const kinds = SOURCE_KIND_ORDER.filter(k => (byKind[k]?.total ?? 0) > 0);
  const totals = kinds.reduce((a, k) => {
    const c = byKind[k]!;
    return { total: a.total + c.total, approved: a.approved + c.approved, awaiting: a.awaiting + c.candidate, setAside: a.setAside + c.set_aside };
  }, { total: 0, approved: 0, awaiting: 0, setAside: 0 });
  const hasFindings = totals.total > 0;

  return (
    <>
      <Card padding="md">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Extract findings from every source</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
              Runs one bounded job per survey, document and eligible search. Deterministic and quick, so it never stalls the way the old single Analysis did.
            </p>
          </div>
          <Button variant={hasFindings ? "secondary" : "primary"} onClick={extract} disabled={extracting}>
            {extracting ? "Extracting…" : hasFindings ? "Re-extract findings" : "Extract findings"}
          </Button>
        </div>

        {extracting && (
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--surface-sunken)" }}>
              <div style={{ height: "100%", width: "40%", borderRadius: 9999, background: "var(--accent-gold)", animation: "fx-indeterminate 1.2s ease-in-out infinite" }} />
            </div>
            <style>{`@keyframes fx-indeterminate { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }`}</style>
            <p className="text-[11px] mt-1.5" style={{ color: "var(--text-tertiary)" }}>Extracting findings from every source… this usually takes under a minute. The counts below update as each source completes.</p>
          </div>
        )}
        {!extracting && summary && (
          <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "#2F7D55" }}>
            <Icon.check size={13} strokeWidth={2.5} /> {summary}
          </div>
        )}
      </Card>

      {pop && (pop.completedTotal > 0 || pop.reach.q1 > 0) && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-1">
            <Icon.layers size={14} strokeWidth={2} />
            <p className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: "var(--text-secondary)" }}>Question reach</p>
          </div>
          <p className="text-[11px] mb-2.5" style={{ color: "var(--text-tertiary)" }}>
            How many people answered each question, partial respondents included (from the survey event stream, across the project&apos;s {pop.campaigns} deployment campaign{pop.campaigns === 1 ? "" : "s"}).
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([["Q1", "answered", pop.reach.q1], ["Q2", "answered", pop.reach.q2], ["Q3", "completed", pop.reach.q3]] as [string, string, number][]).map(([lbl, verb, v]) => (
              <div key={lbl} className="p-2.5 rounded-lg text-center" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
                <p className="text-xl font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{v.toLocaleString()}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{lbl} {verb}</p>
              </div>
            ))}
          </div>
          <div className="mt-2.5 pt-2.5 text-[11px]" style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-tertiary)" }}>
            {pop.usingAnswerStore ? (
              <p>
                <span style={{ color: "#2F7D55" }}>✓</span> Findings count each question from every answer given:
                {" "}Q1 <span className="font-bold" style={{ color: "var(--text-primary)" }}>{pop.findings.q1.toLocaleString()}</span> ·
                {" "}Q2 <span className="font-bold" style={{ color: "var(--text-primary)" }}>{pop.findings.q2.toLocaleString()}</span> ·
                {" "}Q3 <span className="font-bold" style={{ color: "var(--text-primary)" }}>{pop.findings.q3.toLocaleString()}</span>.
                Completion metrics still use the {pop.completedTotal.toLocaleString()} completed responses.
              </p>
            ) : (
              <div className="flex items-start gap-2 p-2.5 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border-subtle)" }}>
                <span className="flex-shrink-0 mt-0.5" style={{ color: "#C79A3E" }}><Icon.alert size={13} /></span>
                <p style={{ color: "var(--text-secondary)" }}>
                  Findings are based on <span className="font-bold" style={{ color: "var(--text-primary)" }}>{pop.completedTotal.toLocaleString()}</span> completed responses. Partial-response option choices were not retained for surveys collected before per-answer persistence was introduced. Historical findings therefore use completed responses only, while question reach is shown separately (above). New responses now persist every answer as it is given.
                </p>
              </div>
            )}
            {pop.surveys.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {pop.surveys.map(s => (
                  <li key={s.surveyId} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{s.name}</span>
                    <span className="flex-shrink-0"><span className="font-semibold" style={{ color: "var(--text-secondary)" }}>{s.completed.toLocaleString()}</span> completed</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      {/* The evidence pipeline — always shown, so a source with evidence never
          silently reads "no findings yet". */}
      {pipeline && pipeline.length > 0 && <PipelineCard sources={pipeline} />}

      {hasFindings && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Approved findings" value={totals.approved} tone="#2F7D55" />
            <Tile label="Awaiting review" value={totals.awaiting} tone="#C79A3E" />
            <Tile label="Set aside" value={totals.setAside} />
            <Tile label="Ready for Analysis" value={data?.approvedTotal ?? 0} tone="#2F7D55" />
          </div>

          {/* Readiness: which sources are ready to feed Analysis, and the gate. */}
          <Card padding="md">
            <div className="flex items-center gap-2 mb-2">
              <Icon.check size={14} strokeWidth={2.5} />
              <p className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: "var(--text-secondary)" }}>Ready for Analysis</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {FAMILIES.map(fam => {
                const approved = approvedIn(byKind, fam.kinds);
                const total = totalIn(byKind, fam.kinds);
                const ready = approved > 0;
                return (
                  <Link key={fam.key} href={`/research-projects/${projectId}/findings/${fam.page}`}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
                    <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold"
                      style={{ background: ready ? "#2F7D55" : "transparent", color: ready ? "white" : "var(--text-disabled)", border: ready ? "none" : "1.5px solid var(--border-default)" }}>
                      {ready ? "✓" : ""}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{fam.label}</span>
                      <span className="block text-[11px]" style={{ color: ready ? "#2F7D55" : "var(--text-tertiary)" }}>
                        {total === 0 ? "no findings yet" : ready ? `${approved} approved` : `${approved} approved · ${total} to review`}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-3 pt-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Total approved findings: <span className="font-bold" style={{ color: "var(--text-primary)" }}>{data?.approvedTotal ?? 0}</span>
              </p>
              {(data?.approvedTotal ?? 0) > 0 ? (
                <Button href={`/research-projects/${projectId}/analysis`} variant="primary" size="sm">Analyse approved findings →</Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Approve at least one finding to enable</span>
                  <Button variant="primary" size="sm" disabled>Analyse approved findings →</Button>
                </div>
              )}
            </div>
          </Card>

          <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
            <span className="font-bold" style={{ color: "var(--text-primary)" }}>{data?.approvedTotal ?? 0}</span> approved findings are ready to feed the cross-source{" "}
            <Link href={`/research-projects/${projectId}/analysis`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Analysis →</Link>
          </p>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium"
          style={{ background: "var(--text-primary)", color: "var(--surface)" }}
          onAnimationEnd={() => setTimeout(() => setToast(null), 2500)}>{toast}</div>
      )}
    </>
  );
}
