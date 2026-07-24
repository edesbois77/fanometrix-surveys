"use client";

// The analyst surface. Findings organised by Research Requirement, then by
// Information Need, leading with the rank-1 candidate and keeping the rivals one
// click away. The unit of work is the requirement, not the finding: a person
// asks "is this requirement answered, and how well", and the candidates are the
// material they work with. That is what makes it a research workspace rather than
// an approval queue.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import {
  PageContainer, WorkspaceHeader, Card, Button, Icon, StatusBadge, Eyebrow,
  PageLoadingState, ErrorState, EmptyState,
} from "@/app/components/workspace-ui";
import { FindingCard } from "./FindingCard";
import { effectiveConfidence, type NeedGroup, type RunStatus } from "./finding-view";
import type { EvidenceLedger } from "@/lib/analysis/ledger";

type RunView = {
  id: string; status: RunStatus;
  candidates_written: number; needs_reasoned: number;
  coverage: { level?: string; statement?: string } | null;
  unexamined: { need: string }[]; error: string | null;
  evidence_consumption?: EvidenceLedger | null;
} | null;

type BoardData = { run: RunView; needs: NeedGroup[] };

// A requirement gathers the needs that serve it. The design records this on each
// need; grouping here keeps the API a flat list and the shape decision in one
// place.
type RequirementGroup = { requirement: string; aspect: string | null; needs: NeedGroup[] };

function groupByRequirement(needs: NeedGroup[]): RequirementGroup[] {
  const byReq = new Map<string, RequirementGroup>();
  for (const n of needs) {
    const g = byReq.get(n.requirement) ?? { requirement: n.requirement, aspect: n.aspect, needs: [] };
    g.needs.push(n);
    byReq.set(n.requirement, g);
  }
  return [...byReq.values()];
}

// The Evidence Consumption Report — proof of exactly what reached reasoning, and
// what did not and why. Collapsed by default: it is a diagnostic the analyst
// opens to answer "did Analysis actually read my documents", not part of the
// finding read. Every figure is computed by gather before the model runs.
function EvidenceConsumptionPanel({ ledger }: { ledger: EvidenceLedger }) {
  const [open, setOpen] = useState(false);
  return (
    <Card padding="md">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Icon.layers size={15} strokeWidth={2} />
          <div>
            <Eyebrow>Evidence consumed</Eyebrow>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>{ledger.totalSupplied}</span> evidence objects supplied to reasoning across {ledger.sources.length} sources.
            </p>
          </div>
        </div>
        <span className="text-xs flex-shrink-0" style={{ color: "var(--text-tertiary)" }}>{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {ledger.sources.map(source => (
            <div key={source.key} className="p-3 rounded-lg" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: "var(--text-secondary)" }}>{source.label}</p>
                <span className="text-[11px] font-semibold" style={{ color: source.supplied > 0 ? "#3F5D42" : "var(--text-disabled)" }}>{source.supplied} supplied</span>
              </div>
              <ul className="mt-2 space-y-1">
                {source.lines.map((l, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span>{l.label}</span>
                    <span className="font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{l.count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              {source.exclusions.length > 0 && (
                <ul className="mt-2.5 pt-2.5 space-y-1" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  {source.exclusions.map((e, i) => (
                    <li key={i} className="flex items-start justify-between gap-2 text-[11px]" style={{ color: "#8A4B33" }}>
                      <span>{e.reason}</span>
                      <span className="font-semibold tabular-nums flex-shrink-0">{e.count.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {ledger.notes.length > 0 && (
            <div className="md:col-span-2">
              <ul className="space-y-1">
                {ledger.notes.map((n, i) => (
                  <li key={i} className="text-[11px] flex items-start gap-1.5" style={{ color: "var(--text-tertiary)" }}>
                    <span className="mt-1 w-1 h-1 rounded-full flex-shrink-0" style={{ background: "var(--accent-gold)" }} aria-hidden />{n}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function CoverageBar({ needs }: { needs: NeedGroup[] }) {
  const total = needs.length;
  const approved = needs.filter(n => n.candidate?.status === "approved").length;
  const answered = needs.filter(n => n.candidate && !n.candidate.is_null && effectiveConfidence(n.candidate) !== "Low").length;
  const open = needs.filter(n => !n.candidate).length;
  return (
    <div className="flex items-center gap-4 flex-wrap text-xs" style={{ color: "var(--text-tertiary)" }}>
      <span><span className="font-bold" style={{ color: "var(--text-primary)" }}>{approved}</span> approved</span>
      <span><span className="font-bold" style={{ color: "var(--text-primary)" }}>{answered}</span> of {total} answered</span>
      {open > 0 && <span><span className="font-bold" style={{ color: "#8A4B33" }}>{open}</span> not yet examined</span>}
    </div>
  );
}

export function FindingsBoard() {
  const { projectId, project, loading, error } = useResearchProject();
  const [data, setData] = useState<BoardData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (): Promise<RunStatus | undefined> => {
    const res = await fetch(`/api/research-projects/${projectId}/findings`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setData(res?.data ?? { run: null, needs: [] });
    setLoaded(true);
    return res?.data?.run?.status as RunStatus | undefined;
  }, [projectId]);

  // Poll while a run is in flight, then stop. `load` is held in a ref so the
  // scheduler is a stable callback that never references itself before it is
  // declared, and the effect drives everything through an async IIFE (the
  // codebase's fetch-in-effect pattern) so no setState runs synchronously.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  const schedulePoll = useCallback(function poll() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(async () => {
      const status = await loadRef.current();
      if (status === "queued" || status === "running") poll();
      else if (status === "completed") setToast("Analysis complete");
    }, 2500);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await loadRef.current();
      if (!cancelled && (status === "queued" || status === "running")) schedulePoll();
    })();
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current); };
  }, [schedulePoll]);

  async function runAnalysis() {
    setStarting(true);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/analysis/run`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setToast(json.error ?? "Could not start the analysis."); return; }
      await load();
      schedulePoll();
    } finally { setStarting(false); }
  }

  const act = useCallback(async (findingId: string, action: string, body: Record<string, unknown> = {}) => {
    // Approving a rival is approving a different finding by id.
    const target = action === "approve_rival" ? String(body.rivalId) : findingId;
    const realAction = action === "approve_rival" ? "approve" : action;
    setBusyId(findingId);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/findings/${target}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: realAction, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setToast(json.error ?? "That action could not be completed."); return; }
      await load();
    } finally { setBusyId(null); }
  }, [projectId, load]);

  const requirements = useMemo(() => (data ? groupByRequirement(data.needs) : []), [data]);
  const run = data?.run ?? null;
  const isRunning = run?.status === "queued" || run?.status === "running";
  const hasFindings = (data?.needs.length ?? 0) > 0;

  if (loading && !project) return <PageContainer><PageLoadingState /></PageContainer>;
  if (error || !project) return <PageContainer><ErrorState title="Research project not found" description={error || "We couldn't load this project."} /></PageContainer>;

  return (
    <>
      <PageContainer>
        <WorkspaceHeader
          title="Analysis"
          description="Candidate findings the evidence supports, for you to review. Every claim leads with the judgement, shows the evidence behind it, and states plainly where it is weak or unresolved."
          primaryAction={
            <Button variant="primary" onClick={runAnalysis} disabled={starting || isRunning}>
              {isRunning ? "Analysing…" : starting ? "Starting…" : hasFindings ? "Re-run analysis" : "Run analysis"}
            </Button>
          }
        />

        {isRunning && (
          <Card padding="md">
            <div className="flex items-center gap-3">
              <span className="inline-block w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--accent-gold)", borderTopColor: "transparent" }} aria-hidden />
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Reasoning over the evidence</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Proposing readings, testing each against the evidence, and grading what survives. This can take a couple of minutes.</p>
              </div>
            </div>
          </Card>
        )}

        {run?.status === "failed" && (
          <Card padding="md">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex-shrink-0" style={{ color: "#8A4B33" }}><Icon.alert size={16} /></span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>The analysis did not complete</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{run.error ?? "Something went wrong. Try running it again."}</p>
              </div>
            </div>
          </Card>
        )}

        {!loaded ? (
          <PageLoadingState />
        ) : !hasFindings ? (
          <EmptyState icon="✦" title={isRunning ? "Analysing…" : "No findings yet"}
            description={isRunning ? "The first candidate findings will appear here as soon as the reasoning finishes."
              : "Run the analysis to turn this project's approved evidence into candidate findings, each organised by the question it answers and backed by the evidence behind it."}
            action={!isRunning ? <Button variant="primary" onClick={runAnalysis} disabled={starting}>Run analysis</Button> : undefined} />
        ) : (
          <>
            {run?.coverage?.statement && (
              <Card padding="md">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <Eyebrow>Coverage</Eyebrow>
                    <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{run.coverage.statement}</p>
                  </div>
                  {run.unexamined.length > 0 && (
                    <StatusBadge label={`${run.unexamined.length} question${run.unexamined.length === 1 ? "" : "s"} not yet examined`} tone="warning" />
                  )}
                </div>
              </Card>
            )}

            {run?.evidence_consumption && <EvidenceConsumptionPanel ledger={run.evidence_consumption} />}

            {requirements.map((req, ri) => (
              <section key={ri} className="space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap pt-2">
                  <div className="min-w-0">
                    <Eyebrow>Research Requirement</Eyebrow>
                    <h2 className="text-lg font-bold tracking-[-0.01em] mt-1 leading-snug" style={{ color: "var(--text-primary)" }}>{req.requirement}</h2>
                  </div>
                  <CoverageBar needs={req.needs} />
                </div>

                {req.needs.map(need => (
                  <div key={need.needId} className="space-y-2.5">
                    <div className="flex items-center gap-2 px-1">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent-gold)" }} aria-hidden />
                      <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>{need.need}</p>
                    </div>
                    {need.candidate ? (
                      <FindingCard
                        finding={need.candidate}
                        rivals={need.rivals}
                        busy={busyId === need.candidate.id}
                        onAction={(action, body) => need.candidate && act(need.candidate.id, action, body)}
                      />
                    ) : (
                      <Card padding="md">
                        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No reading was proposed for this question. The evidence collected does not yet bear on it.</p>
                      </Card>
                    )}
                  </div>
                ))}
              </section>
            ))}

            <p className="text-xs px-1 leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Approved findings flow into{" "}
              <Link href={`/research-projects/${projectId}/reports`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Reports →</Link>
            </p>
          </>
        )}
      </PageContainer>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium"
          style={{ background: "var(--text-primary)", color: "var(--surface)" }}
          onAnimationEnd={() => setTimeout(() => setToast(null), 2500)}>
          {toast}
        </div>
      )}
    </>
  );
}
