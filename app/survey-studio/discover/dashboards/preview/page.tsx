"use client";

// ── Dashboard review harness ─────────────────────────────────────────────────
// Renders the REAL Dashboard components with fixture data (no auth, no API) so
// every state is reviewable across viewports:
//   ?landing=<state>  — Dashboards landing (Studies-first)
//   ?study=<state>    — Study Dashboard
//   ?state=<state>    — Survey Dashboard (Performance + Results)

import { useEffect, useState } from "react";
import { DashboardsLanding } from "@/app/components/studio/discover/DashboardsLanding";
import { SurveyDashboardShell } from "@/app/components/studio/discover/SurveyDashboardShell";
import { StudyDashboard } from "@/app/components/studio/discover/StudyDashboard";
import { CreateStudyWorkflow } from "@/app/components/studio/discover/CreateStudyWorkflow";
import {
  performancePreview, resultsPreview, findingsPreview, studyPreview, landingPreview, createStudyPreview, createStudyEditPreview,
  PREVIEW_STATES, STUDY_PREVIEW_STATES, LANDING_PREVIEW_STATES, CREATE_STUDY_PREVIEW_STATES,
  type PreviewState, type StudyPreviewState, type LandingPreviewState, type CreateStudyPreviewState,
} from "@/app/components/studio/discover/performance-fixtures";

type Selection =
  | { kind: "landing"; state: LandingPreviewState }
  | { kind: "study"; state: StudyPreviewState }
  | { kind: "survey"; state: PreviewState }
  | { kind: "create"; state: CreateStudyPreviewState };

function readSelection(): Selection {
  if (typeof window !== "undefined") {
    const sp = new URLSearchParams(window.location.search);
    const landing = sp.get("landing"); if (landing && (LANDING_PREVIEW_STATES as readonly string[]).includes(landing)) return { kind: "landing", state: landing as LandingPreviewState };
    const study = sp.get("study"); if (study && (STUDY_PREVIEW_STATES as readonly string[]).includes(study)) return { kind: "study", state: study as StudyPreviewState };
    const create = sp.get("create"); if (create && (CREATE_STUDY_PREVIEW_STATES as readonly string[]).includes(create)) return { kind: "create", state: create as CreateStudyPreviewState };
    const state = sp.get("state"); if (state && (PREVIEW_STATES as readonly string[]).includes(state)) return { kind: "survey", state: state as PreviewState };
  }
  return { kind: "landing", state: "studies-and-standalone" };
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a href={href} className="text-xs font-medium px-2.5 py-1 rounded-md border transition-colors"
      style={active ? { background: "var(--accent-wash)", color: "var(--accent-ink)", borderColor: "#ECDCB8" } : { background: "var(--surface)", color: "var(--text-secondary)", borderColor: "var(--border-default)" }}>
      {children}
    </a>
  );
}
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] mr-1 w-14" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      {children}
    </div>
  );
}

export default function DashboardPreviewPage() {
  const [mounted, setMounted] = useState(false);
  const [sel, setSel] = useState<Selection>({ kind: "landing", state: "studies-and-standalone" });
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read URL after mount to avoid hydration mismatch
  useEffect(() => { setSel(readSelection()); setMounted(true); }, []);
  if (!mounted) return null;

  return (
    <>
      <div className="mb-5 flex flex-col gap-2">
        <Group label="Landing">{LANDING_PREVIEW_STATES.map((s) => <Chip key={s} href={`?landing=${s}`} active={sel.kind === "landing" && sel.state === s}>{s}</Chip>)}</Group>
        <Group label="Study">{STUDY_PREVIEW_STATES.map((s) => <Chip key={s} href={`?study=${s}`} active={sel.kind === "study" && sel.state === s}>{s}</Chip>)}</Group>
        <Group label="Create">{CREATE_STUDY_PREVIEW_STATES.map((s) => <Chip key={s} href={`?create=${s}`} active={sel.kind === "create" && sel.state === s}>{s}</Chip>)}</Group>
        <Group label="Survey">{PREVIEW_STATES.map((s) => <Chip key={s} href={`?state=${s}`} active={sel.kind === "survey" && sel.state === s}>{s}</Chip>)}</Group>
      </div>
      {sel.kind === "landing" ? <DashboardsLanding previewData={landingPreview(sel.state)} />
        : sel.kind === "study" ? <StudyDashboard studyId="preview" previewData={studyPreview(sel.state)} />
        : sel.kind === "create" ? ((sel.state === "edit-preselected" || sel.state === "edit-crossorg")
            ? (() => { const p = createStudyEditPreview(sel.state === "edit-crossorg"); return <CreateStudyWorkflow previewContext={p.context} previewEditing={p.editing} />; })()
            : <CreateStudyWorkflow previewContext={createStudyPreview(sel.state)} />)
        : <SurveyDashboardShell surveyId="preview" previewData={performancePreview(sel.state)} previewResults={resultsPreview(sel.state)} previewFindings={findingsPreview(sel.state)} />}
    </>
  );
}
