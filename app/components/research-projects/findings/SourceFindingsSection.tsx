"use client";

// One source page of the Findings section (Survey / Conversation / Research
// Library). It renders the findings for a given set of source kinds, grouped by
// source, with individual + select-all selection, bulk approve / set aside, and
// structured + free-text feedback. The section furniture (page header, sub-nav)
// is owned by the Findings layout; this renders only its body.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useResearchProject } from "@/app/components/research-projects/ProjectProvider";
import { Card, Button, Icon, StatusBadge, PageLoadingState, ErrorState, EmptyState } from "@/app/components/workspace-ui";
import { SOURCE_KIND_LABEL, SOURCE_KIND_ORDER, type SourceKind } from "@/lib/analysis/source-findings/types";

type SourceFinding = {
  id: string; sourceKind: string; sourceRef: string; sourceLabel: string;
  statement: string; scope: string | null; evidenceStrength: string | null;
  status: string; analystNote: string | null;
  evidence: { snippet: string | null; provenance: string | null }[];
};
type BoardData = { findings: SourceFinding[]; byKind: Record<string, { candidate: number; approved: number; set_aside: number; total: number }>; approvedTotal: number };

const FEEDBACK_OPTIONS: { value: string; label: string }[] = [
  { value: "incorrect", label: "Incorrect" },
  { value: "weak_evidence", label: "Weak evidence" },
  { value: "duplicate", label: "Duplicate" },
  { value: "poorly_worded", label: "Poorly worded" },
  { value: "not_relevant", label: "Not relevant" },
  { value: "missing_context", label: "Missing context" },
  { value: "needs_more_evidence", label: "Needs more evidence" },
  { value: "other", label: "Other" },
];

const STRENGTH_TONE: Record<string, "success" | "info" | "neutral"> = { strong: "success", moderate: "info", limited: "neutral" };
const STATUS_META: Record<string, { label: string; tone: "success" | "neutral" | "warning" }> = {
  candidate: { label: "Candidate", tone: "neutral" },
  in_review: { label: "In review", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  set_aside: { label: "Set aside", tone: "warning" },
};

function EvidenceList({ evidence }: { evidence: SourceFinding["evidence"] }) {
  if (evidence.length === 0) return null;
  return (
    <ul className="mt-2.5 space-y-1.5">
      {evidence.map((e, i) => (
        <li key={i} className="text-xs p-2 rounded-lg" style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)" }}>
          {e.snippet && <p style={{ color: "var(--text-secondary)" }}>{e.snippet}</p>}
          {e.provenance && <p className="mt-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>{e.provenance}</p>}
        </li>
      ))}
    </ul>
  );
}

function FindingRow({ f, selected, onToggle, onApprove, onSetAside, busy }: {
  f: SourceFinding; selected: boolean; onToggle: () => void;
  onApprove: () => void; onSetAside: () => void; busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = STATUS_META[f.status] ?? STATUS_META.candidate;
  return (
    <div className="p-3 rounded-xl" style={{ background: "var(--surface)", border: `1px solid ${selected ? "var(--accent-gold)" : "var(--border-subtle)"}` }}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 flex-shrink-0 w-4 h-4 accent-[var(--accent-gold)]" aria-label="Select finding" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className="text-sm leading-relaxed min-w-0" style={{ color: "var(--text-primary)" }}>{f.statement}</p>
            <StatusBadge label={status.label} tone={status.tone} dot />
          </div>

          {f.sourceLabel && (
            <p className="mt-1.5 text-[11px] flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
              <Icon.layers size={11} strokeWidth={2} />
              <span className="font-medium">Source:</span> {f.sourceLabel}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2 flex-wrap text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {f.scope && <span>{f.scope}</span>}
            {f.evidenceStrength && <StatusBadge label={`${f.evidenceStrength} evidence`} tone={STRENGTH_TONE[f.evidenceStrength] ?? "neutral"} />}
            {f.evidence.length > 0 && (
              <button type="button" onClick={() => setOpen(o => !o)} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>
                {open ? "Hide evidence" : `Show evidence (${f.evidence.length})`}
              </button>
            )}
          </div>
          {open && <EvidenceList evidence={f.evidence} />}

          <div className="flex items-center gap-2 mt-2.5 pt-2.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <Button size="sm" variant="ghost" disabled={busy || f.status === "approved"} onClick={onApprove}>Approve</Button>
            <Button size="sm" variant="ghost" disabled={busy || f.status === "set_aside"} onClick={onSetAside}>Set aside…</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SourceFindingsSection({ kinds }: { kinds: SourceKind[] }) {
  const { projectId, project, loading, error } = useResearchProject();
  const [data, setData] = useState<BoardData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<string[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const kindSet = useMemo(() => new Set<string>(kinds), [kinds]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/research-projects/${projectId}/source-findings`).then(r => (r.ok ? r.json() : null)).catch(() => null);
    setData(res?.data ?? { findings: [], byKind: {}, approvedTotal: 0 });
    setLoaded(true);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const bulk = useCallback(async (action: "approve" | "set_aside", ids: string[], feedback?: { feedbackClass: string; note: string }) => {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/research-projects/${projectId}/source-findings/bulk`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ids, ...(feedback ?? {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setToast(json.error ?? "That action could not be completed."); return; }
      setToast(action === "approve" ? `Approved ${json.data?.moved ?? ids.length}` : `Set aside ${json.data?.moved ?? ids.length}`);
      setSelected(new Set());
      await load();
    } finally { setBusy(false); }
  }, [projectId, load]);

  const groups = useMemo(() => {
    const byKind = new Map<string, SourceFinding[]>();
    for (const f of data?.findings ?? []) {
      if (!kindSet.has(f.sourceKind)) continue;
      byKind.set(f.sourceKind, [...(byKind.get(f.sourceKind) ?? []), f]);
    }
    return SOURCE_KIND_ORDER.filter(k => byKind.has(k)).map(k => ({ kind: k as SourceKind, findings: byKind.get(k)! }));
  }, [data, kindSet]);

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedInGroup = (findings: SourceFinding[]) => findings.filter(f => selected.has(f.id)).map(f => f.id);

  if (loading && !project) return <PageLoadingState />;
  if (error || !project) return <ErrorState title="Research project not found" description={error || "We couldn't load this project."} />;
  if (!loaded) return <PageLoadingState />;

  const hasAny = groups.length > 0;

  return (
    <>
      {!hasAny ? (
        <EmptyState icon="✦" title="No findings for this source yet"
          description="Extract findings from the Findings overview, then return here to review and approve them."
          action={<Button href={`/research-projects/${projectId}/findings`} variant="secondary">Go to Findings overview →</Button>} />
      ) : (
        <>
          {groups.map(({ kind, findings }) => {
            const inGroup = selectedInGroup(findings);
            const allSelected = inGroup.length === findings.length && findings.length > 0;
            const counts = data?.byKind[kind];
            return (
              <section key={kind} className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={allSelected} onChange={() => setSelected(s => {
                      const n = new Set(s); const ids = findings.map(f => f.id);
                      if (allSelected) ids.forEach(i => n.delete(i)); else ids.forEach(i => n.add(i));
                      return n;
                    })} className="w-4 h-4 accent-[var(--accent-gold)]" aria-label={`Select all ${SOURCE_KIND_LABEL[kind]}`} />
                    <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>{SOURCE_KIND_LABEL[kind]}</h2>
                    {counts && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{counts.approved} approved · {counts.candidate} to review</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="primary" disabled={busy || inGroup.length === 0} onClick={() => bulk("approve", inGroup)}>Approve selected ({inGroup.length})</Button>
                    <Button size="sm" variant="secondary" disabled={busy || inGroup.length === 0} onClick={() => setFeedbackFor(inGroup)}>Set aside</Button>
                  </div>
                </div>
                {findings.map(f => (
                  <FindingRow key={f.id} f={f} selected={selected.has(f.id)} onToggle={() => toggle(f.id)}
                    busy={busy}
                    onApprove={() => bulk("approve", [f.id])}
                    onSetAside={() => setFeedbackFor([f.id])} />
                ))}
              </section>
            );
          })}

          <p className="text-xs px-1" style={{ color: "var(--text-tertiary)" }}>
            Approved findings feed the cross-source{" "}
            <Link href={`/research-projects/${projectId}/analysis`} className="font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>Analysis →</Link>
          </p>
        </>
      )}

      {feedbackFor && (
        <FeedbackModal count={feedbackFor.length} onCancel={() => setFeedbackFor(null)}
          onSubmit={(feedbackClass, note) => { const ids = feedbackFor; setFeedbackFor(null); bulk("set_aside", ids, { feedbackClass, note }); }} />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium"
          style={{ background: "var(--text-primary)", color: "var(--surface)" }}
          onAnimationEnd={() => setTimeout(() => setToast(null), 2500)}>{toast}</div>
      )}
    </>
  );
}

function FeedbackModal({ count, onCancel, onSubmit }: { count: number; onCancel: () => void; onSubmit: (feedbackClass: string, note: string) => void }) {
  const [cls, setCls] = useState("weak_evidence");
  const [note, setNote] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border-default)" }} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Set aside {count} finding{count === 1 ? "" : "s"}</h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>Your reason is stored for the later AI re-run. Nothing is retrained.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {FEEDBACK_OPTIONS.map(o => (
            <button key={o.value} type="button" onClick={() => setCls(o.value)}
              className="text-xs px-2.5 py-1.5 rounded-lg text-left" style={{
                background: cls === o.value ? "var(--accent-gold)" : "var(--surface-sunken)",
                color: cls === o.value ? "var(--brand-navy)" : "var(--text-secondary)",
                border: "1px solid var(--border-subtle)", fontWeight: cls === o.value ? 700 : 400,
              }}>{o.label}</button>
          ))}
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional instruction (e.g. what's missing, or what to check)"
          className="mt-3 w-full text-sm p-2.5 rounded-lg" rows={3}
          style={{ background: "var(--surface-sunken)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }} />
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => onSubmit(cls, note)}>Set aside</Button>
        </div>
      </div>
    </div>
  );
}
