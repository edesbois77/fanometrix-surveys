"use client";

// ── Manage → Study (container view) ──────────────────────────────────────────
// A Study's constituent Surveys + operational totals, with Add existing / Create
// new / Open / Remove. Admin/operator only. No Study analytics (deferred).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StudioContainer } from "../StudioContainer";
import { useStudioBreadcrumbLabel } from "../breadcrumb/StudioBreadcrumbContext";
import { StudioIcon } from "../studio-icons";
import { Eyebrow, Card, Button, StatusBadge, Skeleton } from "@/app/components/workspace-ui";
import { STUDY_STATUS_LABEL, type StudyStatus } from "@/lib/studio/study";
import { StudyOverview } from "./StudyOverview";
import { StudyResults } from "./StudyResults";
import { StudyAnalysis } from "./StudyAnalysis";
import { StudyFindings } from "./StudyFindings";
import { StudyReports } from "./StudyReports";

type StudyTab = "overview" | "results" | "analysis" | "findings" | "reports" | "surveys";

type Study = { id: string; name: string; objective: string | null; status: string; commissioning_organisation_id: string | null; research_request_id: string | null };
type ConstituentSurvey = { id: string; name: string | null; status: string; completedResponses: number; campaignCount: number; liveCampaigns: number };
type Detail = { study: Study; surveys: ConstituentSurvey[]; totals: { surveyCount: number; campaignCount: number; completedResponses: number } };
type Eligible = { id: string; name: string | null; status: string };

const TONE: Record<StudyStatus, "neutral" | "success"> = { draft: "neutral", active: "success", closed: "neutral" };
const num = (n: number) => n.toLocaleString();

export function ManageStudy({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null | "error">(null);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<StudyTab>("overview");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useStudioBreadcrumbLabel(studyId, data && data !== "error" ? data.study.name : null);

  const load = useCallback(async () => {
    const [dj, oj] = await Promise.all([
      fetch(`/api/survey-studio/studies/${studyId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/organisations").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]);
    const names: Record<string, string> = {};
    for (const o of (oj?.data ?? []) as { id: string; name: string }[]) names[o.id] = o.name;
    setOrgNames(names);
    setData(dj?.study ? (dj as Detail) : "error");
  }, [studyId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- memoised loader
  useEffect(() => { load(); }, [load]);

  const createSurvey = async () => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch("/api/surveys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Untitled survey", status: "draft", study_id: studyId }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.data?.id) { router.push(`/survey-studio/create/${json.data.id}?stage=about`); return; }
      setNote(json?.error || "Could not create the survey.");
    } finally { setBusy(false); }
  };

  const removeSurvey = async (surveyId: string) => {
    if (busy) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`/api/survey-studio/studies/${studyId}/surveys/${surveyId}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setNote(j?.error || "Could not remove the survey."); }
      else await load();
    } finally { setBusy(false); }
  };

  if (data == null) return <StudioContainer><Skeleton className="h-7 w-64 mb-4" /><Skeleton className="h-40 w-full max-w-2xl" /></StudioContainer>;
  if (data === "error") {
    return (
      <StudioContainer>
        <div className="max-w-md py-6">
          <Eyebrow className="mb-1.5">Survey Studio · Manage</Eyebrow>
          <h1 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>Study not found</h1>
          <Button href="/survey-studio/manage?view=studies" variant="secondary" size="sm" className="mt-4">← Back to Studies</Button>
        </div>
      </StudioContainer>
    );
  }

  const { study, surveys, totals } = data;
  const clientName = study.commissioning_organisation_id ? orgNames[study.commissioning_organisation_id] : null;

  return (
    <StudioContainer>
      <div className="max-w-3xl">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <Eyebrow>Survey Studio · Study</Eyebrow>
            <h1 className="mt-1 text-[22px] font-bold tracking-[-0.02em] leading-tight" style={{ color: "var(--text-primary)" }}>{study.name}</h1>
            {study.objective && <p className="text-sm mt-1.5 max-w-xl" style={{ color: "var(--text-secondary)" }}>{study.objective}</p>}
            <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
              {[clientName ? `For ${clientName}` : null, study.research_request_id ? "From a request" : null].filter(Boolean).join(" · ")}
            </p>
          </div>
          <StatusBadge label={STUDY_STATUS_LABEL[(study.status as StudyStatus)] ?? study.status} tone={TONE[(study.status as StudyStatus)] ?? "neutral"} dot size="md" />
        </div>

        {/* Tabs: Overview | Results | Surveys */}
        <div className="mt-5 flex items-center gap-1 overflow-x-auto no-scrollbar" style={{ borderBottom: "1px solid var(--border-default)" }}>
          {(["overview", "results", "analysis", "findings", "reports", "surveys"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className="whitespace-nowrap px-3 py-2 text-sm font-medium border-b-2 transition-colors capitalize"
              style={tab === t ? { color: "var(--text-primary)", borderColor: "var(--accent-gold)" } : { color: "var(--text-secondary)", borderColor: "transparent" }}>
              {t}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="mt-5">
            <StudyOverview studyId={studyId} study={study} totals={totals} clientName={clientName} onObjectiveSaved={load} />
          </div>
        )}

        {tab === "results" && <div className="mt-5"><StudyResults studyId={studyId} /></div>}

        {tab === "analysis" && <div className="mt-5"><StudyAnalysis studyId={studyId} onViewFindings={() => setTab("findings")} /></div>}

        {tab === "findings" && <div className="mt-5"><StudyFindings studyId={studyId} /></div>}

        {tab === "reports" && <div className="mt-5"><StudyReports studyId={studyId} /></div>}

        {tab === "surveys" && (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-tertiary)" }}>Surveys in this study</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>Add or remove surveys to change what this study covers. Removing detaches a survey — its responses, campaigns and results are untouched.</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button onClick={() => setAdding(true)} variant="secondary" size="sm" disabled={busy}>Add existing</Button>
                <Button onClick={createSurvey} variant="primary" size="sm" disabled={busy}><StudioIcon.create size={14} /> Create survey</Button>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {surveys.length === 0 ? (
                <Card><p className="text-sm" style={{ color: "var(--text-secondary)" }}>No surveys yet. Add an existing survey or create a new one inside this study.</p></Card>
              ) : surveys.map((s) => (
                <Card key={s.id} padding="md">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold tracking-[-0.01em] truncate" style={{ color: "var(--text-primary)" }}>{s.name || "Untitled survey"}</h3>
                      <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
                        {[`${num(s.completedResponses)} response${s.completedResponses === 1 ? "" : "s"}`, s.liveCampaigns > 0 ? `${s.liveCampaigns} live` : `${s.campaignCount} campaign${s.campaignCount === 1 ? "" : "s"}`].join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button href={`/survey-studio/manage/surveys/${s.id}`} variant="secondary" size="sm">Open</Button>
                      <Button onClick={() => removeSurvey(s.id)} variant="ghost" size="sm" disabled={busy}>Remove</Button>
                    </div>
                  </div>
                </Card>
              ))}
              {note && <p className="text-xs" style={{ color: "#B4694C" }}>{note}</p>}
            </div>
          </div>
        )}
      </div>

      {adding && <AddSurveyModal studyId={studyId} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
    </StudioContainer>
  );
}


function AddSurveyModal({ studyId, onClose, onAdded }: { studyId: string; onClose: () => void; onAdded: () => void }) {
  const [eligible, setEligible] = useState<Eligible[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/survey-studio/studies/${studyId}/surveys`).then((r) => (r.ok ? r.json() : { surveys: [] })).catch(() => ({ surveys: [] }))
      .then((j) => { if (!cancelled) setEligible((j.surveys ?? []) as Eligible[]); });
    return () => { cancelled = true; };
  }, [studyId]);

  const add = async (surveyId: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/survey-studio/studies/${studyId}/surveys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ surveyId }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j?.error || "Could not add the survey."); return; }
      onAdded();
    } catch { setError("Could not add the survey."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(11,25,41,0.5)" }} onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Add existing survey" className="w-full max-w-md rounded-[var(--radius-panel)] p-5" style={{ background: "var(--surface)", boxShadow: "var(--shadow-lg)", border: "1px solid var(--border-default)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Add existing survey</h3>
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>Only standalone surveys (not already in a study) are shown.</p>
        {error && <p className="text-xs mt-2" style={{ color: "#B4694C" }}>{error}</p>}
        <div className="mt-3 max-h-80 overflow-y-auto space-y-1.5">
          {eligible == null ? <Skeleton className="h-24" /> : eligible.length === 0 ? (
            <p className="text-sm py-3" style={{ color: "var(--text-tertiary)" }}>No standalone surveys available to add.</p>
          ) : eligible.map((s) => (
            <button key={s.id} type="button" onClick={() => add(s.id)} disabled={busy}
              className="block w-full text-left px-3 py-2 rounded-[var(--radius-control)] border transition-colors hover:bg-[var(--accent-wash)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7B87A]"
              style={{ borderColor: "var(--border-default)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{s.name || "Untitled survey"}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end"><Button onClick={onClose} variant="ghost" size="sm" disabled={busy}>Close</Button></div>
      </div>
    </div>
  );
}
