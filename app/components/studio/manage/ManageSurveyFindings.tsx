"use client";

// ── Manage → Survey → Findings (Fanometrix editorial layer) ──────────────────
// Admin/operator-only curation list: Draft / Published cards showing the headline,
// the frozen key result, its source question/answer + filters, n, and dates. Draft
// → editorial edit + Publish (publication re-resolves + freezes the snapshot
// server-side). Published → editorial corrections allowed; provenance never
// mutates. No AI, no auto-generation.

import { useCallback, useEffect, useState } from "react";
import { Card, Button, StatusBadge, Skeleton } from "@/app/components/workspace-ui";

type FindingCard = {
  id: string; status: string; headline: string;
  questionIndex: number; optionLabel: string; percentage: number | null; baseN: number;
  filters: Record<string, string | null>; createdAt: string; publishedAt: string | null;
};
type FindingDetail = FindingCard & { commentary: string | null };

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? "" : new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const chips = (f: Record<string, string | null>) => Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`);

export function ManageSurveyFindings({ surveyId }: { surveyId: string }) {
  const [findings, setFindings] = useState<FindingCard[] | null | "error">(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/studio/surveys/${surveyId}/findings`);
      if (!res.ok) { setFindings("error"); return; }
      const j = await res.json();
      setFindings((j.findings ?? []) as FindingCard[]);
    } catch { setFindings("error"); }
  }, [surveyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- memoised loader
  useEffect(() => { load(); }, [load]);

  const publish = async (id: string) => {
    if (busyId) return;
    setBusyId(id); setNote(null);
    try {
      const res = await fetch(`/api/studio/surveys/${surveyId}/findings/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ _action: "publish" }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setNote(j?.error || "Could not publish."); }
      else await load();
    } finally { setBusyId(null); }
  };

  if (findings == null) return <div className="mt-6 space-y-3"><Skeleton className="h-24 w-full max-w-2xl" /><Skeleton className="h-24 w-full max-w-2xl" /></div>;
  if (findings === "error") return <Card className="mt-6"><p className="text-sm" style={{ color: "var(--text-secondary)" }}>Could not load Findings.</p></Card>;

  return (
    <div className="mt-6 max-w-2xl">
      {findings.length === 0 ? (
        <Card>
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>No Findings yet</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Open <strong style={{ color: "var(--text-primary)" }}>Results</strong>, hover an answer and choose <strong style={{ color: "var(--text-primary)" }}>+ Finding</strong> to curate one.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {findings.map((f) => (
            <Card key={f.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge label={f.status === "published" ? "Published" : "Draft"} tone={f.status === "published" ? "success" : "neutral"} dot />
                    <h3 className="text-[15px] font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>{f.headline}</h3>
                  </div>
                  <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>
                    <span className="font-bold" style={{ color: "var(--accent-ink)" }}>{pct(f.percentage)}</span> {f.optionLabel}
                    <span className="text-xs ml-1" style={{ color: "var(--text-tertiary)" }}>· n = {f.baseN.toLocaleString()}</span>
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                    {["Q" + (f.questionIndex + 1), ...chips(f.filters), f.status === "published" ? `Published ${fmtDate(f.publishedAt)}` : `Created ${fmtDate(f.createdAt)}`].join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button onClick={() => setEditing(editing === f.id ? null : f.id)} variant="ghost" size="sm">Edit</Button>
                  {f.status !== "published" && <Button onClick={() => publish(f.id)} variant="primary" size="sm" disabled={busyId === f.id}>{busyId === f.id ? "Publishing…" : "Publish"}</Button>}
                </div>
              </div>
              {editing === f.id && <EditForm surveyId={surveyId} findingId={f.id} onDone={() => { setEditing(null); load(); }} />}
            </Card>
          ))}
          {note && <p className="text-xs" style={{ color: "#B4694C" }}>{note}</p>}
        </div>
      )}
    </div>
  );
}

// Editorial-only edit form (headline/commentary). Provenance/snapshot never change.
function EditForm({ surveyId, findingId, onDone }: { surveyId: string; findingId: string; onDone: () => void }) {
  const [detail, setDetail] = useState<FindingDetail | null>(null);
  const [headline, setHeadline] = useState("");
  const [commentary, setCommentary] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/studio/surveys/${surveyId}/findings/${findingId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.finding) { setDetail(j.finding); setHeadline(j.finding.headline ?? ""); setCommentary(j.finding.commentary ?? ""); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [surveyId, findingId]);

  const save = async () => {
    if (saving || !headline.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/studio/surveys/${surveyId}/findings/${findingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ headline, commentary }),
      });
      onDone();
    } finally { setSaving(false); }
  };

  if (!detail) return <div className="mt-3"><Skeleton className="h-24 w-full" /></div>;
  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <label className="block text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>Headline</label>
      <input type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} className="mt-1 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
      <label className="block text-xs font-semibold mt-2" style={{ color: "var(--text-tertiary)" }}>Commentary</label>
      <textarea value={commentary} onChange={(e) => setCommentary(e.target.value)} rows={3} className="mt-1 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button onClick={onDone} variant="ghost" size="sm">Cancel</Button>
        <Button onClick={save} variant="primary" size="sm" disabled={saving || !headline.trim()}>{saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
