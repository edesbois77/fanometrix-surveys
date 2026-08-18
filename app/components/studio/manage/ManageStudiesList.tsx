"use client";

// ── Manage → Studies (Fanometrix operational list) ───────────────────────────
// Admin/operator-only list of research Studies (Studio-native containers grouping
// Surveys) with factual totals, plus Create Study. No Study analytics.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, StatusBadge, Skeleton } from "@/app/components/workspace-ui";
import { StudioIcon } from "../studio-icons";
import { STUDY_STATUS_LABEL, type StudyStatus } from "@/lib/studio/study";

type StudyCard = {
  id: string; name: string; objective: string | null; status: string; commissioningOrgId: string | null;
  fromRequest: boolean; surveyCount: number; completedResponses: number; createdAt: string;
};
const TONE: Record<StudyStatus, "neutral" | "success"> = { draft: "neutral", active: "success", closed: "neutral" };
const num = (n: number) => n.toLocaleString();
const fmtDate = (iso: string) => { const t = new Date(iso).getTime(); return Number.isNaN(t) ? "" : new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); };

export function ManageStudiesList() {
  const router = useRouter();
  const [studies, setStudies] = useState<StudyCard[] | null>(null);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const load = () => {
    Promise.all([
      fetch("/api/survey-studio/studies").then((r) => (r.ok ? r.json() : { studies: [] })).catch(() => ({ studies: [] })),
      fetch("/api/organisations").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]).then(([sj, oj]) => {
      const names: Record<string, string> = {};
      for (const o of (oj?.data ?? []) as { id: string; name: string }[]) names[o.id] = o.name;
      setOrgNames(names);
      setStudies((sj.studies ?? []) as StudyCard[]);
    });
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <Button onClick={() => setCreating(true)} variant="primary" size="sm"><StudioIcon.create size={14} /> Create study</Button>
      </div>

      {studies == null ? (
        <div className="space-y-3"><Skeleton className="h-[76px]" /><Skeleton className="h-[76px]" /></div>
      ) : studies.length === 0 ? (
        <Card>
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>No studies yet</h2>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>A Study groups the Surveys of one research initiative. Create one, then add or create Surveys inside it.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {studies.map((s) => (
            <button key={s.id} type="button" onClick={() => router.push(`/survey-studio/manage/studies/${s.id}`)}
              className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A] rounded-[var(--radius-panel)]">
              <Card interactive>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-[15px] font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{s.name}</h3>
                      <StatusBadge label={STUDY_STATUS_LABEL[(s.status as StudyStatus)] ?? s.status} tone={TONE[(s.status as StudyStatus)] ?? "neutral"} dot />
                    </div>
                    {s.objective?.trim() && (
                      <p className="text-[13px] mt-1 leading-snug line-clamp-2" style={{ color: "var(--text-secondary)" }}>{s.objective.trim()}</p>
                    )}
                    <p className="text-xs mt-1 truncate" style={{ color: "var(--text-tertiary)" }}>
                      {[
                        s.commissioningOrgId ? `For ${orgNames[s.commissioningOrgId] ?? "client"}` : null,
                        `${s.surveyCount} survey${s.surveyCount === 1 ? "" : "s"}`,
                        `${num(s.completedResponses)} response${s.completedResponses === 1 ? "" : "s"}`,
                        s.fromRequest ? "From a request" : null,
                        `Created ${fmtDate(s.createdAt)}`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="pt-1" style={{ color: "var(--text-tertiary)" }} aria-hidden><StudioIcon.arrowRight size={16} /></span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      {creating && <CreateStudyModal onClose={() => setCreating(false)} onCreated={(id) => router.push(`/survey-studio/manage/studies/${id}`)} />}
    </div>
  );
}

function CreateStudyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (saving || !name.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/survey-studio/studies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, objective }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.study?.id) { setError(json?.error || "Could not create the study."); return; }
      onCreated(json.study.id);
    } catch { setError("Could not create the study."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={() => !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Create study" className="w-full max-w-md rounded-[var(--radius-panel)] p-5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Create study</h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>A research initiative that groups one or more surveys. You can add surveys after creating it.</p>
        <div className="mt-4">
          <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Study name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Women's World Cup 2027" className="mt-1.5 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>
        <div className="mt-3">
          <label className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Working objective <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>(optional)</span></label>
          <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} placeholder="What is this research trying to understand overall?" className="mt-1.5 w-full px-3 py-2 text-sm rounded-[var(--radius-control)] border resize-y leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]" style={{ background: "var(--surface)", borderColor: "var(--border-default)", color: "var(--text-primary)" }} />
        </div>
        {error && <p className="text-xs mt-2" style={{ color: "#B4694C" }}>{error}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button onClick={onClose} variant="ghost" size="sm" disabled={saving}>Cancel</Button>
          <Button onClick={submit} variant="primary" size="sm" disabled={saving || !name.trim()}>{saving ? "Creating…" : "Create study"}</Button>
        </div>
      </div>
    </div>
  );
}
