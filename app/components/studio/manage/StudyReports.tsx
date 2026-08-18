"use client";

// ── Manage → Study → Reports (V1 Slice 1) ────────────────────────────────────
// Compose a client-ready report from the Study's approved Findings. This is a client
// DELIVERABLE, not the analyst workspace: create a draft, then open it in the premium
// report view. Editing/publishing/sharing are deliberately out of this slice.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, StatusBadge, Skeleton } from "@/app/components/workspace-ui";

type ReportCard = { id: string; title: string; status: string; report_type: string; created_at: string; stale: boolean };
type Finding = { id: string; headline: string; status: string };
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function StudyReports({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [reports, setReports] = useState<ReportCard[] | null>(null);
  const [readiness, setReadiness] = useState<{ ok: boolean; reason?: string; findingCount: number } | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/studio/studies/${studyId}/reports`).then((r) => (r.ok ? r.json() : { reports: [] })).catch(() => ({ reports: [] })),
      fetch(`/api/studio/studies/${studyId}/reports?readiness=1`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([list, rd]) => { setReports((list.reports ?? []) as ReportCard[]); setReadiness(rd?.readiness ?? null); });
  }, [studyId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Reports</h2>
          <p className="text-xs mt-1 max-w-xl" style={{ color: "var(--text-tertiary)" }}>Compose a client-ready report from this study&apos;s approved findings. Fanometrix writes the story and builds the charts from governed evidence — it never re-analyses the study.</p>
        </div>
        <Button onClick={() => setCreating(true)} variant="primary" size="sm" disabled={!!readiness && !readiness.ok}>Create report</Button>
      </div>

      {readiness && !readiness.ok && (
        <Card padding="md"><p className="text-sm" style={{ color: "#B4694C" }}>{readiness.reason}</p></Card>
      )}

      {reports == null ? (
        <div className="space-y-3"><Skeleton className="h-16" /></div>
      ) : reports.length === 0 ? (
        <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>No reports yet. Create one to turn this study&apos;s findings into a polished client report.</p></Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <button key={r.id} type="button" onClick={() => router.push(`/survey-studio/manage/studies/${studyId}/reports/${r.id}`)} className="block w-full text-left rounded-[var(--radius-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]">
              <Card interactive>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[15px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{r.title}</h3>
                  <StatusBadge label={r.status === "published" ? "Published" : "Draft"} tone={r.status === "published" ? "success" : "neutral"} dot />
                  {r.stale && <StatusBadge label="Findings changed" tone="neutral" dot />}
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>Report · Created {when(r.created_at)}{r.stale ? " · the study has changed since this report was generated — regenerate to refresh" : ""}</p>
              </Card>
            </button>
          ))}
        </div>
      )}

      {creating && <CreateReportModal studyId={studyId} onClose={() => setCreating(false)} onCreated={(rid) => router.push(`/survey-studio/manage/studies/${studyId}/reports/${rid}`)} />}
    </div>
  );
}

function CreateReportModal({ studyId, onClose, onCreated }: { studyId: string; onClose: () => void; onCreated: (reportId: string) => void }) {
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/studio/studies/${studyId}/findings`).then((r) => (r.ok ? r.json() : { findings: [] })).catch(() => ({ findings: [] }))
      .then((j) => { const fs = (j.findings ?? []) as Finding[]; setFindings(fs); setSelected(new Set(fs.map((f) => f.id))); });
  }, [studyId]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const generate = async () => {
    if (busy || selected.size === 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/studio/studies/${studyId}/reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim() || undefined, selectedFindingIds: [...selected], editorialBrief: brief.trim() || null }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.report?.id) { setError(json?.error || "Could not generate the report."); return; }
      onCreated(json.report.id);
    } catch { setError("Could not generate the report."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Create report" className="w-full max-w-lg rounded-[var(--radius-panel)] p-5 max-h-[85vh] overflow-y-auto" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Create report</h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>Fanometrix composes a client report from the findings you include. Every claim rests on an approved finding; every figure is a governed survey result.</p>

        <div className="mt-4">
          <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Report title <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span></label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fanometrix suggests one from the study" className="mt-1.5 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>

        <div className="mt-3">
          <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Findings to include</label>
          {findings == null ? <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>Loading…</p> : findings.length === 0 ? (
            <p className="text-xs mt-1" style={{ color: "#B4694C" }}>Add at least one insight to Findings before generating a report.</p>
          ) : (
            <div className="mt-1.5 space-y-1.5">
              {findings.map((f) => (
                <label key={f.id} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="mt-0.5" />
                  <span style={{ color: "var(--text-secondary)" }}>{f.headline}</span>
                </label>
              ))}
              <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>{selected.size} of {findings.length} selected — these are the approved claims that will feed the report.</p>
            </div>
          )}
        </div>

        <div className="mt-3">
          <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Editorial brief <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span></label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={2} placeholder="e.g. Keep this concise for a senior sponsorship audience, focused on activation." className="mt-1.5 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
          <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>Affects emphasis and tone only — it can never change the evidence or invent conclusions.</p>
        </div>

        {error && <p className="text-xs mt-2" style={{ color: "#B4694C" }}>{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button onClick={onClose} variant="ghost" size="sm" disabled={busy}>Cancel</Button>
          <Button onClick={generate} variant="primary" size="sm" disabled={busy || selected.size === 0}>{busy ? "Composing…" : "Generate report"}</Button>
        </div>
      </div>
    </div>
  );
}
