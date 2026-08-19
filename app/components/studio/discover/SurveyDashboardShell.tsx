"use client";

// ── Discover → Dashboards → [surveyId] — the Survey Dashboard ────────────────
// One authorised survey: identity + status, an optional Study grouping row (All
// surveys | this | siblings — intersect-only), the Performance | Results |
// Campaigns view switch (Performance + Results live), entitlement-aware filters,
// and the active view's analytics. Authorisation is re-checked server-side; an
// unauthorised/non-existent survey fails closed to a safe "unavailable" state.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  WorkspaceHeader, EmptyState, ErrorState, PageLoadingState,
  FilterSelect, type Tone,
} from "@/app/components/workspace-ui";
import { StudioIcon } from "@/app/components/studio/studio-icons";
import { useStudioBreadcrumbLabel } from "@/app/components/studio/breadcrumb/StudioBreadcrumbContext";
import { DISCOVER_BASE } from "@/lib/studio/discover-nav";
import { manifestToFilterControls } from "@/lib/studio/dashboard-filter-controls";
import { useSurveyPerformance } from "./useSurveyPerformance";
import { useSurveyResults } from "./useSurveyResults";
import { useSurveyFindings } from "./useSurveyFindings";
import { PerformanceSections } from "./PerformanceView";
import { ResultsView } from "./ResultsView";
import { SurveyFindingsView } from "./SurveyFindingsView";
import type { DiscoverResults } from "@/lib/studio/dashboard-results";
import type { FindingsResponse } from "@/app/api/survey-studio/discover/dashboards/[surveyId]/findings/route";

const SURVEYS_HREF = `${DISCOVER_BASE}/surveys`; // survey detail + index (was /dashboards)
type View = "performance" | "results" | "findings";

function surveyStatusBadge(status: string | null): { label: string; tone: Tone; dot?: boolean } | null {
  if (!status) return null;
  const m: Record<string, { label: string; tone: Tone; dot?: boolean }> = {
    live: { label: "Live", tone: "success", dot: true }, ready: { label: "Ready", tone: "info" },
    scheduled: { label: "Scheduled", tone: "info" }, draft: { label: "Draft", tone: "neutral" },
    completed: { label: "Completed", tone: "neutral" }, archived: { label: "Archived", tone: "neutral" },
  };
  return m[status] ?? { label: status, tone: "neutral" };
}

function ViewTabs({ view, onView }: { view: View; onView: (v: View) => void }) {
  // "Dashboard" is the renamed Performance view (same analytics; the URL key stays
  // "performance" — the default view — so existing ?view= deep links are unaffected).
  const tabs: { key: View | "campaigns"; label: string; live: boolean }[] = [
    { key: "performance", label: "Dashboard", live: true },
    { key: "results", label: "Results", live: true },
    { key: "findings", label: "Findings", live: true },
    { key: "campaigns", label: "Campaigns", live: false },
  ];
  return (
    <div className="flex items-center gap-1 border-b overflow-x-auto" role="tablist" aria-label="Survey dashboard views" style={{ borderColor: "var(--border-subtle)" }}>
      {tabs.map((t) => {
        const active = t.live && t.key === view;
        return (
          <button
            key={t.key} role="tab" aria-selected={active} aria-disabled={!t.live} disabled={!t.live}
            onClick={() => t.live && onView(t.key as View)}
            className="text-sm font-medium px-3 py-2 border-b-2 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors"
            style={active ? { color: "var(--text-primary)", borderColor: "var(--accent-gold)" }
              : t.live ? { color: "var(--text-tertiary)", borderColor: "transparent" }
              : { color: "var(--text-disabled)", borderColor: "transparent", cursor: "default" }}
          >
            {t.label}
            {!t.live && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "var(--surface-sunken)", color: "var(--text-tertiary)" }}>Soon</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SurveyDashboardShell({
  surveyId, initialFilters = {}, initialView = "performance", previewData, previewResults, previewFindings,
}: {
  surveyId: string;
  initialFilters?: Record<string, string>;
  initialView?: View;
  previewData?: import("@/lib/studio/dashboard-performance").PerformanceResponse;
  previewResults?: DiscoverResults;
  previewFindings?: Extract<FindingsResponse, { authorised: true }>;
}) {
  const router = useRouter();
  const isPreview = previewData != null;
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [view, setView] = useState<View>(initialView);
  const live = useSurveyPerformance(surveyId, filters, !isPreview);
  const { loading, error, data } = isPreview ? { loading: false, error: false, data: previewData! } : live;
  // Results are fetched once and shared: a preview on Performance + the full Results tab.
  const liveResults = useSurveyResults(surveyId, filters, !isPreview);
  const resultsData: DiscoverResults | undefined = isPreview ? previewResults : (liveResults.data && liveResults.data.authorised ? liveResults.data.results : undefined);
  // Findings — fetched lazily (only when the tab is active) so an unopened tab costs nothing.
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisReloadKey, setAnalysisReloadKey] = useState(0);
  const liveFindings = useSurveyFindings(surveyId, filters, !isPreview && view === "findings", analysisReloadKey);
  // Generate analysis via the GOVERNED endpoint (re-authorises server-side); the page
  // never invokes the model on render. On completion, refetch so the synthesis shows.
  async function generateAnalysis() {
    setAnalysisBusy(true);
    try { await fetch(`/api/studio/surveys/${encodeURIComponent(surveyId)}/analysis`, { method: "POST" }); } catch { /* refetch surfaces the state */ }
    setAnalysisBusy(false); setAnalysisReloadKey((k) => k + 1);
  }
  // Feed the breadcrumb the real Survey name for the /dashboards/[surveyId] leaf.
  useStudioBreadcrumbLabel(surveyId, data && data.authorised ? data.survey.name : null);

  const pushUrl = (next: Record<string, string>, v: View = view) => {
    if (isPreview) return;
    const qs = new URLSearchParams({ ...next, ...(v !== "performance" ? { view: v } : {}) }).toString();
    router.replace(`${SURVEYS_HREF}/${encodeURIComponent(surveyId)}${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  const setFilter = (key: string, value: string) => {
    setFilters((prev) => { const next = { ...prev }; if (value) next[key] = value; else delete next[key]; pushUrl(next); return next; });
  };
  const clearFilters = () => { setFilters({}); pushUrl({}); };
  const changeView = (v: View) => { setView(v); pushUrl(filters, v); };

  const backHeader = (title: string, description?: string, status?: { label: string; tone: Tone; dot?: boolean }) => (
    <WorkspaceHeader eyebrow="Dashboard" title={title} description={description} status={status} />
  );

  if (loading) return <>{backHeader("Loading…")}<div className="mt-8"><PageLoadingState lines={2} /></div></>;
  if (error || !data) return <>{backHeader("Dashboard")}<div className="mt-8"><ErrorState title="We couldn't load this dashboard" description="Something went wrong on our side. Please try again in a moment." backHref={SURVEYS_HREF} backLabel="Back to surveys" /></div></>;
  if (data.authorised === false) {
    return (
      <>
        {backHeader("Dashboard unavailable")}
        <div className="mt-8">
          <EmptyState icon={<StudioIcon.discover size={22} />} title="This dashboard isn't available" description="It may not exist, or your organisation isn't entitled to its data."
            action={<Link href={SURVEYS_HREF} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent-ink)" }}>← Back to surveys</Link>} />
        </div>
      </>
    );
  }

  const badge = surveyStatusBadge(data.survey.status);
  const controls = manifestToFilterControls(data.filterManifest);
  const hasActiveFilters = Object.keys(filters).length > 0;

  return (
    <>
      <WorkspaceHeader eyebrow="Dashboard" title={data.survey.name}
        description={view === "results" ? "What did respondents tell us?" : view === "findings" ? "What does this research tell me?" : "How is this survey performing?"} status={badge ?? undefined} />

      <div className="mt-4"><ViewTabs view={view} onView={changeView} /></div>

      {/* Findings is a synthesis of the WHOLE survey (its research read is fixed-
          scope and cached), so the per-campaign filter bar is hidden there —
          filtered exploration lives in Results/Performance. */}
      {controls.length > 0 && view !== "findings" && (
        <div className="mt-4" role="search">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--text-tertiary)" }}>Filters</p>
          <div className="flex items-center gap-2 flex-wrap md:flex-nowrap text-xs">
            {controls.map((c) => (
              <div key={c.key} className="flex-1 min-w-[7.5rem]">
                <FilterSelect dense fullWidth label={c.label} value={filters[c.key] ?? ""} onChange={(v) => setFilter(c.key, v)} options={c.options} />
              </div>
            ))}
            {hasActiveFilters && (
              <button onClick={clearFilters} className="font-semibold px-1.5 py-1 rounded-md transition-colors hover:bg-[var(--surface-sunken)] flex-shrink-0" style={{ color: "var(--accent-ink)" }}>Clear</button>
            )}
          </div>
          {data.filterRejected && <p className="text-xs mt-2" role="alert" style={{ color: "#8A4B33" }}>That filter isn&rsquo;t available for your data. Showing an empty result.</p>}
        </div>
      )}

      <div className="mt-6">
        {view === "performance" ? (
          <PerformanceSections data={data} onInsightFilter={setFilter} results={resultsData} onViewResults={() => changeView("results")} />
        ) : view === "findings" ? (
          isPreview ? (
            previewFindings ? (
              <SurveyFindingsView findings={previewFindings.findings} context={previewFindings.context} answers={previewFindings.counts.answers} respondents={previewFindings.counts.respondents} mode={previewFindings.mode} analysis={previewFindings.analysis} coreIntelligence={previewFindings.coreIntelligence} researchIntelligence={previewFindings.researchIntelligence} canGenerate={previewFindings.canGenerate} onAnalyse={() => {}} onViewResults={() => changeView("results")} />
            ) : <EmptyState title="No findings" description="No findings to preview." />
          ) : liveFindings.loading ? (
            <PageLoadingState lines={2} />
          ) : liveFindings.error || !liveFindings.data ? (
            <ErrorState title="We couldn't load findings" description="Please try again in a moment." backHref={null} />
          ) : liveFindings.data.authorised === false ? (
            <EmptyState title="Findings aren't available" description="Your organisation isn't entitled to this survey's data." />
          ) : (
            <SurveyFindingsView findings={liveFindings.data.findings} context={liveFindings.data.context} answers={liveFindings.data.counts.answers} respondents={liveFindings.data.counts.respondents} mode={liveFindings.data.mode} analysis={liveFindings.data.analysis} coreIntelligence={liveFindings.data.coreIntelligence} researchIntelligence={liveFindings.data.researchIntelligence} canGenerate={liveFindings.data.canGenerate} analyseBusy={analysisBusy} onAnalyse={generateAnalysis} onViewResults={() => changeView("results")} />
          )
        ) : isPreview ? (
          resultsData ? <ResultsView results={resultsData} /> : <EmptyState title="No results" description="No answers have been collected yet." />
        ) : liveResults.loading ? (
          <PageLoadingState lines={2} />
        ) : liveResults.error || !liveResults.data ? (
          <ErrorState title="We couldn't load results" description="Please try again in a moment." backHref={null} />
        ) : liveResults.data.authorised === false ? (
          <EmptyState title="Results aren't available" description="Your organisation isn't entitled to this survey's data." />
        ) : (
          <ResultsView results={liveResults.data.results} />
        )}
      </div>
    </>
  );
}
