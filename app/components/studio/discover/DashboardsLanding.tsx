"use client";

// ── Discover → Dashboards — landing (Studies-first) ──────────────────────────
// Research exercises (Studies) are first-class objects, shown ahead of standalone
// surveys. A Study is a complete research exercise that may contain several surveys;
// a standalone survey is one questionnaire. The two are visually distinct so the
// user knows which level they are entering. All data comes from the governed
// context endpoint — no client-side discovery, no architecture jargon in the UI.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  WorkspaceHeader, SectionHeading, Card, StatusBadge, Eyebrow, EmptyState, ErrorState, PageLoadingState,
  FilterSearch, Button, type Tone,
} from "@/app/components/workspace-ui";
import { StudioIcon } from "@/app/components/studio/studio-icons";
import { DISCOVER_BASE } from "@/lib/studio/discover-nav";
import { useDashboardsContext } from "./useDashboardsContext";
import type { LandingStudy, LandingSurvey } from "@/app/api/survey-studio/discover/dashboards/context/route";

// Research OBJECTS now live at their own top-level Discover destinations (not under
// a "Dashboards" container): a survey opens at /discover/surveys/[id], a study at
// /discover/studies/[id].
const SURVEYS_HREF = `${DISCOVER_BASE}/surveys`;
const STUDIES_HREF = `${DISCOVER_BASE}/studies`;
const nf = (n: number) => n.toLocaleString();

function statusBadge(status: string | null): { label: string; tone: Tone; dot?: boolean } | null {
  if (!status) return null;
  const m: Record<string, { label: string; tone: Tone; dot?: boolean }> = {
    live: { label: "Live", tone: "success", dot: true }, ready: { label: "Ready", tone: "info" },
    scheduled: { label: "Scheduled", tone: "info" }, draft: { label: "Draft", tone: "neutral" },
    completed: { label: "Completed", tone: "neutral" }, archived: { label: "Archived", tone: "neutral" },
  };
  return m[status] ?? { label: status, tone: "neutral" };
}

function context(parts: (string | null)[]): string {
  return parts.filter(Boolean).join(" · ");
}

function StudyCard({ study }: { study: LandingStudy }) {
  return (
    <Link href={`${STUDIES_HREF}/${encodeURIComponent(study.studyId)}`} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] rounded-[var(--radius-panel)]">
      <Card interactive className="h-full" tone="info">
        <Eyebrow>Study</Eyebrow>
        <h3 className="text-base font-bold leading-snug mt-1" style={{ color: "var(--text-primary)" }}>{study.studyName ?? "Study"}</h3>
        <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
          {context([
            `${study.surveyCount} survey${study.surveyCount === 1 ? "" : "s"}`,
            study.publisherCount > 1 ? `${study.publisherCount} publishers` : null,
            study.marketCount > 1 ? `${study.marketCount} markets` : null,
          ])}
        </p>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <p className="fx-tabular-nums text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{nf(study.answersCollected)}</p>
            <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>questions answered</p>
          </div>
          <span className="text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>Open study →</span>
        </div>
      </Card>
    </Link>
  );
}

function SurveyCard({ survey, scope }: { survey: LandingSurvey; scope: Record<string, string> }) {
  const badge = statusBadge(survey.status);
  const qs = new URLSearchParams(Object.entries(scope).filter(([, v]) => v)).toString();
  const href = `${SURVEYS_HREF}/${encodeURIComponent(survey.id)}${qs ? `?${qs}` : ""}`;
  return (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] rounded-[var(--radius-panel)]">
      <Card interactive className="h-full">
        <div className="flex items-start justify-between gap-3">
          {/* Reserve a consistent TWO-LINE title area so metadata aligns across cards.
              Real names are untouched; long ones clamp at two lines. */}
          <h3 className="text-sm font-semibold leading-snug min-w-0 line-clamp-2 min-h-[2.75em]" style={{ color: "var(--text-primary)" }}>{survey.name}</h3>
          {badge && <StatusBadge label={badge.label} tone={badge.tone} dot={badge.dot} />}
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
          {context([`${survey.questionCount} question${survey.questionCount === 1 ? "" : "s"}`, `${survey.campaignCount} campaign${survey.campaignCount === 1 ? "" : "s"}`])}
        </p>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="fx-tabular-nums text-lg font-bold" style={{ color: "var(--text-primary)" }}>{nf(survey.answersCollected)}</p>
            <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>questions answered</p>
          </div>
          <span className="text-xs font-semibold" style={{ color: "var(--accent-ink)" }}>Open dashboard →</span>
        </div>
      </Card>
    </Link>
  );
}

export function DashboardsLanding({ previewData, section = "all" }: {
  previewData?: import("@/app/api/survey-studio/discover/dashboards/context/route").DashboardContext;
  /** Which research objects to list: the Surveys index, the Studies index, or both. */
  section?: "all" | "surveys" | "studies";
} = {}) {
  const live = useDashboardsContext(undefined, previewData == null);
  const { loading, error, data } = previewData != null ? { loading: false, error: false, data: previewData } : live;
  const [query, setQuery] = useState("");
  const showStudies = section !== "surveys";
  const showSurveys = section !== "studies";

  const HEADER = {
    all: { title: "Dashboards", description: "Monitor research performance and explore what respondents are telling you." },
    surveys: { title: "Surveys", description: "Every survey you can access." },
    studies: { title: "Studies", description: "Studies you can access — grouped surveys analysed together." },
  }[section];
  const header = <WorkspaceHeader eyebrow="Discover" title={HEADER.title} description={HEADER.description} />;

  // Search filters the SURVEY grid only (that's what the box sits next to). Studies
  // are the caller's own groupings and stay listed.
  const q = query.trim().toLowerCase();
  const studies = data?.studies ?? [];
  const surveys = useMemo(() => (data?.surveys ?? []).filter((s) => !q || s.name.toLowerCase().includes(q)), [data, q]);

  if (loading) return <>{header}<div className="mt-8"><PageLoadingState lines={2} /></div></>;
  if (error || !data) return <>{header}<div className="mt-8"><ErrorState title="We couldn't load your dashboards" description="Something went wrong on our side. Please try again in a moment." backHref={null} /></div></>;

  const relevantEmpty = section === "studies" ? data.studies.length === 0
    : section === "surveys" ? data.surveys.length === 0
    : data.studies.length === 0 && data.surveys.length === 0;
  if (relevantEmpty && !(section !== "surveys" && data.canCreateStudy)) {
    const emptyCopy = section === "surveys" ? "When surveys you're entitled to see start collecting responses, they'll appear here."
      : section === "studies" ? "When you can access a study, it will appear here."
      : "When research you're entitled to see starts collecting responses, it will appear here.";
    return <>{header}<div className="mt-8"><EmptyState icon={<StudioIcon.discover size={22} />} title="Nothing available yet" description={emptyCopy} /></div></>;
  }

  const showSearch = data.surveys.length > 4;

  return (
    <>
      {header}

      {showStudies && (studies.length > 0 || data.canCreateStudy) && (
        <section className="mt-6">
          <SectionHeading title="Studies" description="Group surveys you can access to analyse their performance and results together."
            action={data.canCreateStudy ? <Button variant="primary" size="sm" href={`${STUDIES_HREF}/create`}>+ Create study</Button> : undefined} className="mb-4" />
          {studies.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {studies.map((s) => <StudyCard key={s.studyId} study={s} />)}
            </div>
          ) : (
            <Card><p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Group two or more of your surveys into a study to analyse them together.</p></Card>
          )}
        </section>
      )}

      {showSurveys && data.surveys.length > 0 && (
        <section className={showStudies ? "mt-10" : "mt-6"}>
          {/* Custom header so the search stacks BELOW the heading on mobile and sits
              to the RIGHT on desktop (SectionHeading keeps its action on one row). */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-bold tracking-[-0.01em]" style={{ color: "var(--text-primary)" }}>Surveys</h2>
              <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>Every survey you can access.</p>
            </div>
            {showSearch && <div className="flex-shrink-0"><FilterSearch value={query} onChange={setQuery} placeholder="Search surveys…" width={240} /></div>}
          </div>
          {surveys.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {surveys.map((s) => <SurveyCard key={s.id} survey={s} scope={{}} />)}
            </div>
          ) : (
            <div className="mt-2"><EmptyState compact title="No surveys match your search" description="Try a different name." /></div>
          )}
        </section>
      )}
    </>
  );
}
