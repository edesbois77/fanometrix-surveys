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
import { SOURCE_KIND_LABEL, SOURCE_KIND_ORDER, CONVERSATION_KINDS, type SourceKind } from "@/lib/analysis/source-findings/types";

type KindCounts = { candidate: number; approved: number; set_aside: number; total: number };
type BoardData = { findings: unknown[]; byKind: Record<string, KindCounts>; approvedTotal: number };

// Which review page a source kind is reviewed on.
function pageFor(kind: SourceKind): "survey" | "conversation" | "document" {
  if (kind === "survey") return "survey";
  if (kind === "document") return "document";
  return "conversation";
}

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

export function FindingsOverview() {
  const { projectId, project, loading, error } = useResearchProject();
  const [data, setData] = useState<BoardData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research-projects/${projectId}/source-findings`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setData(res?.data ?? { findings: [], byKind: {}, approvedTotal: 0 });
    setLoaded(true);
  }, [projectId]);

  useEffect(() => { load(); return () => { if (pollRef.current) clearTimeout(pollRef.current); }; }, [load]);

  const pollAfterExtract = useCallback((remaining: number) => {
    if (remaining <= 0) { setExtracting(false); return; }
    pollRef.current = setTimeout(async () => { await load(); pollAfterExtract(remaining - 1); }, 2500);
  }, [load]);

  async function extract() {
    setExtracting(true);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/source-findings/extract`, { method: "POST" });
      if (!res.ok) { setToast("Could not start extraction."); setExtracting(false); return; }
      await load();
      pollAfterExtract(8);
    } catch { setExtracting(false); }
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
      </Card>

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

          <Card padding="md">
            <div className="flex items-center gap-2 mb-1">
              <Icon.layers size={14} strokeWidth={2} />
              <p className="text-xs font-bold uppercase tracking-[0.06em]" style={{ color: "var(--text-secondary)" }}>Findings by source</p>
            </div>
            <div className="mt-2 divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {kinds.map(k => {
                const c = byKind[k]!;
                return (
                  <Link key={k} href={`/research-projects/${projectId}/findings/${pageFor(k)}`}
                    className="flex items-center justify-between gap-3 py-2.5 group">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{SOURCE_KIND_LABEL[k]}</span>
                    <span className="flex items-center gap-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      <span><span className="font-bold" style={{ color: "#2F7D55" }}>{c.approved}</span> approved</span>
                      <span><span className="font-bold" style={{ color: "#C79A3E" }}>{c.candidate}</span> to review</span>
                      <span>{c.set_aside} set aside</span>
                      <span className="group-hover:underline" style={{ color: "var(--accent-ink)" }}>Review →</span>
                    </span>
                  </Link>
                );
              })}
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
