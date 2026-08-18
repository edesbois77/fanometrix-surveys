"use client";

// ── Manage → Study → Overview ────────────────────────────────────────────────
// Executive operational summary of the Study — NOT the survey-management list (that
// lives under Surveys). Shows the research pipeline (surveys → campaigns → responses),
// analysis status, and findings progress at a glance. No analytical aggregation.

import { useEffect, useState } from "react";
import { Card } from "@/app/components/workspace-ui";
import { StudyObjective } from "./StudyObjective";

type Totals = { surveyCount: number; campaignCount: number; completedResponses: number };
type Study = { objective: string | null; status: string };
const num = (n: number) => n.toLocaleString();
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null);

export function StudyOverview({ studyId, study, totals, clientName, onObjectiveSaved }: { studyId: string; study: Study; totals: Totals; clientName: string | null; onObjectiveSaved: () => void }) {
  const [analysis, setAnalysis] = useState<{ lastAnalysed: string | null; proposalCount: number; added: number; stale: boolean; narrative: { headline: string; summary: string } | null; themeTitles: string[] } | null>(null);
  const [findings, setFindings] = useState<{ draft: number; published: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [a, f] = await Promise.all([
        fetch(`/api/studio/studies/${studyId}/analysis`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/studio/studies/${studyId}/findings`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (cancelled) return;
      if (a) {
        const run = a.run && a.run.status !== "failed" ? a.run : null;
        const proposals = (a.proposals ?? []) as { findingId: string | null; review_status: string }[];
        const stale = !!(a.stale && (a.stale.objectiveChanged || a.stale.membershipChanged));
        const narrative = run && a.narrative && typeof a.narrative.headline === "string" ? { headline: a.narrative.headline, summary: a.narrative.summary } : null;
        const themeTitles = run && Array.isArray(a.themes) ? (a.themes as { title?: string; importance?: string }[]).filter((t) => t.importance === "primary").map((t) => t.title).filter((x): x is string => !!x) : [];
        setAnalysis({ lastAnalysed: run ? (run.completed_at ?? run.created_at) : null, proposalCount: run ? proposals.length : 0, added: proposals.filter((p) => p.findingId).length, stale, narrative, themeTitles });
      } else setAnalysis({ lastAnalysed: null, proposalCount: 0, added: 0, stale: false, narrative: null, themeTitles: [] });
      const list = (f?.findings ?? []) as { status: string }[];
      setFindings({ draft: list.filter((x) => x.status === "draft").length, published: list.filter((x) => x.status === "published").length });
    })();
    return () => { cancelled = true; };
  }, [studyId]);

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Objective — the most important framing for the study */}
      <StudyObjective studyId={studyId} objective={study.objective} onSaved={onObjectiveSaved} />

      {/* What the research says — objective → story → themes, surfaced FIRST (Part 17) */}
      {analysis?.narrative && (
        <div>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>What the research says</h2>
          <Card padding="lg">
            <h3 className="text-[18px] font-bold tracking-[-0.02em] leading-snug" style={{ color: "var(--text-primary)" }}>{analysis.narrative.headline}</h3>
            <p className="text-sm leading-relaxed mt-2 max-w-2xl" style={{ color: "var(--text-secondary)" }}>{analysis.narrative.summary}</p>
            {analysis.themeTitles.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Key themes</p>
                <ul className="mt-1 space-y-0.5">
                  {analysis.themeTitles.map((t, i) => <li key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>• {t}</li>)}
                </ul>
              </div>
            )}
            {analysis.stale && <p className="text-xs mt-2" style={{ color: "#B4694C" }}>The study has changed since this analysis — re-run analysis to refresh.</p>}
            <p className="text-[11px] mt-3" style={{ color: "var(--text-tertiary)" }}>AI-assisted interpretation of the evidence — not a published finding.</p>
          </Card>
        </div>
      )}

      {/* Research pipeline — the study composition, below the story (Part 17) */}
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Research pipeline</h2>
        <Card padding="lg">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <Stat label="Surveys" value={num(totals.surveyCount)} />
            <Stat label="Campaigns" value={num(totals.campaignCount)} />
            <Stat label="Completed responses" value={num(totals.completedResponses)} />
          </div>
          {clientName && <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>Commissioned for {clientName}</p>}
        </Card>
      </div>

      {/* Intelligence: analysis + findings */}
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--text-tertiary)" }}>Intelligence</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card padding="lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Analysis</p>
            {analysis == null ? (
              <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>Loading…</p>
            ) : analysis.lastAnalysed ? (
              <>
                <p className="text-[20px] font-bold tracking-[-0.02em] mt-0.5" style={{ color: "var(--text-primary)" }}>{num(analysis.proposalCount)} proposal{analysis.proposalCount === 1 ? "" : "s"}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{analysis.added} added to findings · last run {when(analysis.lastAnalysed)}</p>
                {analysis.stale && <p className="text-xs mt-1" style={{ color: "#B4694C" }}>The study has changed since this analysis — a fresh analysis is recommended.</p>}
              </>
            ) : (
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>Not yet analysed. Run analysis to generate candidate insights.</p>
            )}
          </Card>
          <Card padding="lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>Findings</p>
            {findings == null ? (
              <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>Loading…</p>
            ) : findings.draft + findings.published === 0 ? (
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>No findings yet.</p>
            ) : (
              <>
                <p className="text-[20px] font-bold tracking-[-0.02em] mt-0.5" style={{ color: "var(--text-primary)" }}>{num(findings.published)} published</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{findings.draft} draft{findings.draft === 1 ? "" : "s"} in review</p>
              </>
            )}
          </Card>
        </div>
      </div>

    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="text-[24px] font-bold tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}
