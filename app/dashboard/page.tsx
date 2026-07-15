"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Papa from "papaparse";
import type { SurveyResponse } from "@/lib/types";
import { AdminShell } from "@/app/components/AdminShell";
import { KpiCards } from "./components/KpiCards";
import { ChartGrid, type SurveyLabels } from "./components/ChartGrid";
import { InsightsEngine } from "@/app/components/InsightsEngine";
import { PerformanceHighlights } from "./components/PerformanceHighlights";
import {
  DashboardFilters,
  EMPTY_DASH_FILTERS,
  type DashFilters,
  type DatePreset,
} from "./components/DashboardFilters";
import type { EventCounts } from "./components/KpiCards";

// ─── Types ───────────────────────────────────────────────────────────────────

type CampaignInfo = {
  id:              string;   // UUID — needed for group membership lookup
  campaign_id:     string;
  campaign_name:   string;
  survey_id:       string | null;
  // Resolved by /api/campaigns as survey_id ?? the campaign's research
  // project's own legacy survey_id — a campaign created before a project
  // could hold multiple Surveys often has survey_id itself null but still
  // effectively belongs to one Survey. The Survey filter below matches on
  // this, not the raw column, so a Survey-scoped deep link (or the filter
  // dropdown) isn't silently empty for those campaigns.
  effective_survey_id: string | null;
  start_date:      string | null;
  end_date:        string | null;
  created_at:      string;
};

type SurveyOption  = { id: string; name: string };
type GroupOption   = { id: string; group_id: string; name: string; campaign_ids: string[] };
type ScopeProject  = { id: string; project_name: string; research_mode: "real" | "simulated" };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

function fmt(d: Date): string { return d.toISOString().slice(0, 10); }
function sub(d: Date, days: number): Date { return new Date(d.getTime() - days * 86_400_000); }

function getDateBounds(
  preset: DatePreset,
  from: string,
  to: string,
  campaign?: CampaignInfo | null,
): { from: string; to: string } | null {
  const today = new Date();
  switch (preset) {
    case "today":    return { from: fmt(today),      to: fmt(today)         };
    case "7d":       return { from: fmt(sub(today, 6)), to: fmt(today)      };
    case "30d":      return { from: fmt(sub(today, 29)), to: fmt(today)     };
    case "campaign": return campaign?.start_date && campaign?.end_date
                       ? { from: campaign.start_date, to: campaign.end_date }
                       : null;
    case "custom":   return from && to ? { from, to } : null;
    default:         return null;
  }
}

function applyFilters(
  data: SurveyResponse[],
  f: DashFilters,
  dateBounds: { from: string; to: string } | null,
): SurveyResponse[] {
  return data.filter(r => {
    if (f.campaign_id  && r.campaign_id  !== f.campaign_id ) return false;
    if (f.publisher    && r.publisher    !== f.publisher   ) return false;
    if (f.placement    && r.placement    !== f.placement   ) return false;
    if (f.club         && r.club         !== f.club        ) return false;
    if (f.competition  && r.competition  !== f.competition ) return false;
    if (f.country      && r.country      !== f.country     ) return false;
    if (f.fan_segment  && r.fan_segment  !== f.fan_segment ) return false;
    if (f.device       && r.device       !== f.device      ) return false;
    if (f.browser      && r.browser      !== f.browser     ) return false;
    if (f.q1           && r.q1           !== f.q1          ) return false;
    if (f.q2           && r.q2           !== f.q2          ) return false;
    if (f.q3           && r.q3           !== f.q3          ) return false;
    if (dateBounds) {
      const d = r.created_at.slice(0, 10);
      if (d < dateBounds.from || d > dateBounds.to) return false;
    }
    return true;
  });
}

// ─── Page ────────────────────────────────────────────────────────────────────

// Reads the ?research_project_id=&survey_id= query params a Research
// Project Workspace's "Open Full Dashboard" / a Survey's own Source
// Performance card navigates here with — isolated in its own leaf
// component so only this needs the useSearchParams() Suspense boundary, not
// the whole (otherwise statically-rendered) page. `null` from searchParams
// means "no scope" (the platform-wide dashboard); the sentinel `undefined`
// default on the parent's state means "not read yet", so the parent's first
// data load waits for this instead of racing it and briefly showing
// unscoped data.
function ProjectScopeReader({ onProjectId, onSurveyId }: { onProjectId: (id: string | null) => void; onSurveyId: (id: string | null) => void }) {
  const searchParams = useSearchParams();
  const researchProjectId = searchParams.get("research_project_id");
  const surveyId = searchParams.get("survey_id");
  useEffect(() => { onProjectId(researchProjectId); }, [researchProjectId, onProjectId]);
  useEffect(() => { onSurveyId(surveyId); }, [surveyId, onSurveyId]);
  return null;
}

export default function DashboardPage() {
  // undefined = not read from the URL yet, null = confirmed unscoped
  const [scopeProjectId, setScopeProjectId] = useState<string | null | undefined>(undefined);
  // Seeds the existing Survey filter from the URL — applied once (see the
  // effect below), so it doesn't fight the user if they change or clear
  // the filter afterward within the same visit.
  const [scopeSurveyId,  setScopeSurveyId]  = useState<string | null | undefined>(undefined);
  const scopeSurveyIdApplied = useRef(false);
  const [scopeProject,   setScopeProject]   = useState<ScopeProject | null>(null);
  const [responses,     setResponses]     = useState<SurveyResponse[]>([]);
  const [campaigns,     setCampaigns]     = useState<CampaignInfo[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [surveyLabels,  setSurveyLabels]  = useState<SurveyLabels | null>(null);
  const [groupOptions,  setGroupOptions]  = useState<GroupOption[]>([]);
  const [eventCounts,   setEventCounts]   = useState<EventCounts | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null);
  const [secondsAgo,    setSecondsAgo]    = useState(0);

  // Filter state — persisted in localStorage
  const [filters,     setFilters]     = useState<DashFilters>(() => loadLS("dash_filters", EMPTY_DASH_FILTERS));
  const [datePreset,  setDatePreset]  = useState<DatePreset>(() => loadLS("dash_date_preset", "all"));
  const [dateFrom,    setDateFrom]    = useState<string>(() => loadLS("dash_date_from", ""));
  const [dateTo,      setDateTo]      = useState<string>(() => loadLS("dash_date_to", ""));

  // Persist filter state
  useEffect(() => { localStorage.setItem("dash_filters",      JSON.stringify(filters));     }, [filters]);
  useEffect(() => { localStorage.setItem("dash_date_preset",  JSON.stringify(datePreset));  }, [datePreset]);
  useEffect(() => { localStorage.setItem("dash_date_from",    JSON.stringify(dateFrom));    }, [dateFrom]);
  useEffect(() => { localStorage.setItem("dash_date_to",      JSON.stringify(dateTo));      }, [dateTo]);

  const load = useCallback(async (projectId: string | null) => {
    setLoading(true);
    setError("");
    try {
      const scopeQS = projectId ? `?research_project_id=${projectId}` : "";
      const [rRes, cRes, gRes, pRes] = await Promise.all([
        fetch(`/api/responses${scopeQS}`),
        fetch(`/api/campaigns${scopeQS}`),
        fetch("/api/dashboard/groups"),
        projectId ? fetch(`/api/research-projects/${projectId}`) : Promise.resolve(null),
      ]);
      if (!rRes.ok) { setError("Failed to load responses."); setLoading(false); return; }
      const rJson = await rRes.json();
      const cJson = cRes.ok ? await cRes.json() : { data: [] };
      const gJson = gRes.ok ? await gRes.json() : { data: [] };
      const campaignRows: CampaignInfo[] = cJson.data ?? [];
      setResponses(rJson.data ?? []);
      setCampaigns(campaignRows);
      // Scoped to one project — only offer Campaign Groups that actually
      // contain one of this project's own campaigns, so the selector never
      // dead-ends into an empty result for a group that belongs elsewhere.
      const allGroups: GroupOption[] = gJson.data ?? [];
      if (projectId) {
        const scopedCampaignUUIDs = new Set(campaignRows.map(c => c.id));
        setGroupOptions(allGroups.filter(g => g.campaign_ids.some(id => scopedCampaignUUIDs.has(id))));
      } else {
        setGroupOptions(allGroups);
      }
      if (projectId && pRes?.ok) {
        const pJson = await pRes.json();
        setScopeProject({ id: projectId, project_name: pJson.data.project_name, research_mode: pJson.data.research_mode });
      } else {
        setScopeProject(null);
      }
    } catch {
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Waits for ProjectScopeReader to report the URL's scope (undefined = not
  // read yet) so the first fetch is already correctly scoped, rather than
  // loading unscoped data and immediately refetching.
  useEffect(() => {
    if (scopeProjectId !== undefined) load(scopeProjectId);
  }, [load, scopeProjectId]);

  // Seeds the Survey filter from a Source Performance card's deep link —
  // applied once per visit, so it doesn't override a filter the user
  // deliberately changes or clears afterward.
  useEffect(() => {
    if (scopeSurveyId && !scopeSurveyIdApplied.current) {
      scopeSurveyIdApplied.current = true;
      setFilters(f => ({ ...f, survey_id: scopeSurveyId }));
    }
  }, [scopeSurveyId]);

  // Record timestamp after each load completes
  useEffect(() => {
    if (!loading) setLastUpdated(new Date());
  }, [loading]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (scopeProjectId === undefined) return;
    const interval = setInterval(() => load(scopeProjectId), 60_000);
    return () => clearInterval(interval);
  }, [load, scopeProjectId]);

  // Tick the "X seconds ago" counter every second
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0);
    }, 1000);
    return () => clearInterval(tick);
  }, [lastUpdated]);

  // Fetch event counts — re-runs when filters or date bounds change
  useEffect(() => {
    const p = new URLSearchParams();

    // Campaign scope: a single campaign takes priority; otherwise scope by survey's campaigns
    if (filters.campaign_id) {
      p.set("campaign_id", filters.campaign_id);
    } else if (filters.survey_id) {
      const ids = campaigns
        .filter(c => c.effective_survey_id === filters.survey_id)
        .map(c => c.campaign_id);
      if (ids.length) p.set("campaign_ids", ids.join(","));
    }

    if (filters.publisher) p.set("publisher", filters.publisher);
    if (filters.placement) p.set("placement", filters.placement);
    if (filters.country)   p.set("country",   filters.country);
    if (filters.device)    p.set("device",    filters.device);
    if (filters.browser)   p.set("browser",   filters.browser);

    const activeCamp = campaigns.find(c => c.campaign_id === filters.campaign_id) ?? null;
    const bounds = getDateBounds(datePreset, dateFrom, dateTo, activeCamp);
    if (bounds) {
      p.set("date_from", bounds.from);
      p.set("date_to",   bounds.to);
    }
    setEventsLoading(true);
    fetch(`/api/dashboard/events?${p.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setEventCounts(data ?? null))
      .catch(() => setEventCounts(null))
      .finally(() => setEventsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.campaign_id, filters.survey_id, filters.publisher, filters.placement, filters.country, filters.device, filters.browser, datePreset, dateFrom, dateTo, campaigns]);

  // Derive filtered dataset
  const activeCampaign = useMemo(
    () => campaigns.find(c => c.campaign_id === filters.campaign_id) ?? null,
    [campaigns, filters.campaign_id],
  );

  // Derive unique survey options from the loaded campaigns
  const surveyOptions = useMemo<SurveyOption[]>(() => {
    const seen = new Map<string, string>();
    for (const c of campaigns) {
      const sid  = c.effective_survey_id;
      const name = (c as unknown as { surveys?: { name: string } }).surveys?.name;
      if (sid && name && !seen.has(sid)) seen.set(sid, name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [campaigns]);

  // Pre-filter responses by Campaign Group or Survey before applying dimension filters
  const scopedResponses = useMemo(() => {
    let base = responses;

    // Group filter: keep only responses from campaigns in this group
    if (filters.group_id) {
      const group = groupOptions.find(g => g.id === filters.group_id);
      if (group) {
        const groupCampaignUUIDs = new Set(group.campaign_ids);
        // Map campaign UUIDs → text slugs via the campaigns list
        const slugs = new Set(
          campaigns
            .filter(c => groupCampaignUUIDs.has((c as unknown as { id: string }).id))
            .map(c => c.campaign_id)
        );
        base = base.filter(r => slugs.has(r.campaign_id));
      }
    }

    // Survey filter: keep only responses from campaigns using this survey
    if (filters.survey_id) {
      const surveyCampaignSlugs = new Set(
        campaigns
          .filter(c => c.effective_survey_id === filters.survey_id)
          .map(c => c.campaign_id)
      );
      base = base.filter(r => surveyCampaignSlugs.has(r.campaign_id));
    }

    return base;
  }, [responses, filters.group_id, filters.survey_id, groupOptions, campaigns]);

  // Load survey labels — resolves question/option text for the active scope.
  // When no scope filter is set, uses the most recently created campaign as context
  // so Q1/Q2/Q3 always show real question text rather than hardcoded defaults.
  useEffect(() => {
    const campaignId = filters.campaign_id;
    const surveyId   = filters.survey_id;
    const groupId    = filters.group_id;

    const fetchLabels = (url: string) =>
      fetch(url).then(r => r.ok ? r.json() : null)
        .then(json => setSurveyLabels(json ?? null))
        .catch(() => setSurveyLabels(null));

    if (campaignId) {
      fetchLabels(`/api/embed/survey-labels?campaign_id=${encodeURIComponent(campaignId)}`);
    } else if (surveyId) {
      fetchLabels(`/api/embed/survey-labels?survey_id=${encodeURIComponent(surveyId)}`);
    } else if (groupId) {
      const group = groupOptions.find(g => g.id === groupId);
      const first = group
        ? campaigns.find(c => group.campaign_ids.includes((c as unknown as { id: string }).id))
        : null;
      if (first) fetchLabels(`/api/embed/survey-labels?campaign_id=${encodeURIComponent(first.campaign_id)}`);
      else setSurveyLabels(null);
    } else if (campaigns.length > 0) {
      // No filter active — use the most recently created campaign for question labels
      const latest = [...campaigns].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      fetchLabels(`/api/embed/survey-labels?campaign_id=${encodeURIComponent(latest.campaign_id)}`);
    } else {
      setSurveyLabels(null);
    }
  }, [filters.campaign_id, filters.survey_id, filters.group_id, groupOptions, campaigns]);

  const dateBounds = useMemo(
    () => getDateBounds(datePreset, dateFrom, dateTo, activeCampaign),
    [datePreset, dateFrom, dateTo, activeCampaign],
  );

  const filtered = useMemo(
    () => applyFilters(scopedResponses, filters, dateBounds),
    [scopedResponses, filters, dateBounds],
  );

  function setFilter(field: keyof DashFilters, value: string) {
    setFilters(f => ({ ...f, [field]: value }));
  }

  function clearFilters() {
    setFilters(EMPTY_DASH_FILTERS);
  }

  // Toggle a filter from a chart click
  function onChartFilter(field: keyof DashFilters, value: string) {
    setFilters(f => ({ ...f, [field]: f[field] === value ? "" : value }));
  }

  function exportCSV() {
    const csv = Papa.unparse(
      filtered.map(r => ({
        id: r.id, submitted_at: r.created_at,
        campaign_id: r.campaign_id, survey_id: r.survey_id,
        publisher: r.publisher, placement: r.placement,
        club: r.club, competition: r.competition,
        q1: r.q1, q2: r.q2, q3: r.q3,
        country: r.country, fan_segment: r.fan_segment,
        device: r.device, browser: r.browser,
        response_duration_seconds: r.response_duration_seconds,
      }))
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `fanometrix-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const campaignHasDates = !!(activeCampaign?.start_date && activeCampaign?.end_date);
  const isFiltered = filtered.length !== responses.length;

  return (
    <AdminShell>
      <Suspense fallback={null}>
        <ProjectScopeReader onProjectId={setScopeProjectId} onSurveyId={setScopeSurveyId} />
      </Suspense>
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            {scopeProject && (
              <Link
                href={scopeProject.research_mode === "simulated" ? `/product-walkthrough/${scopeProject.id}` : `/research-projects/${scopeProject.id}`}
                className="text-xs font-semibold text-gray-400 hover:text-[#D7B87A] transition-colors"
              >
                ← Back to {scopeProject.project_name}
              </Link>
            )}
            <h1 className="text-2xl font-bold" style={{ color: "#0B1929" }}>
              {scopeProject ? `Dashboard, ${scopeProject.project_name}` : "Dashboard"}
            </h1>
            <p className="text-gray-400 text-xs mt-0.5">
              {scopeProject ? "Scoped to this Research Project only" : "Dashboard"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-gray-400 hidden sm:block">
                {loading ? "Updating…" : `Updated ${secondsAgo}s ago`}
              </span>
            )}
            <button onClick={() => load(scopeProjectId ?? null)}
              className="border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
              {loading ? "…" : "Refresh"}
            </button>
            <button onClick={exportCSV} disabled={filtered.length === 0}
              className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{ background: "#D7B87A", color: "#0B1929" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#D7B87A"; }}>
              {isFiltered ? `Export ${filtered.length.toLocaleString()} rows` : "Export CSV"}
            </button>
          </div>
        </div>

        {loading && <p className="text-gray-400 text-sm">Loading responses…</p>}
        {error   && <p className="text-red-500 text-sm">{error}</p>}

        {!loading && !error && (
          <>
            {/* Filters */}
            <DashboardFilters
              allResponses={scopedResponses}
              campaigns={campaigns}
              surveyOptions={surveyOptions}
              groupOptions={groupOptions}
              filters={filters}
              setFilter={setFilter}
              clearFilters={clearFilters}
              datePreset={datePreset}
              setDatePreset={setDatePreset}
              dateFrom={dateFrom}
              dateTo={dateTo}
              setDateFrom={setDateFrom}
              setDateTo={setDateTo}
              campaignHasDates={campaignHasDates}
              filteredCount={filtered.length}
              totalCount={scopedResponses.length}
            />

            {/* KPI cards */}
            <KpiCards
              responses={filtered}
              events={eventCounts}
              eventsLoading={eventsLoading}
            />

            {responses.length === 0 ? (
              <p className="text-gray-400 text-center mt-10 text-sm">
                No responses yet. Share your survey to get started!
              </p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-gray-400">No responses match the current filters.</p>
                <button onClick={clearFilters} className="mt-3 text-sm hover:underline text-[#D7B87A]">
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                {/* Performance Highlights */}
                <PerformanceHighlights responses={filtered} />

                {/* Insights */}
                <InsightsEngine responses={filtered} onFilter={onChartFilter} />

                {/* Charts */}
                <ChartGrid
                  responses={filtered}
                  filters={filters}
                  onFilter={onChartFilter}
                  surveyLabels={surveyLabels}
                />
              </>
            )}
          </>
        )}

        <footer className="mt-12 pt-6 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-400">
          <span>Fanometrix</span>
          <Link href="/privacy" className="hover:text-[#D7B87A] transition-colors">ⓘ Privacy Policy</Link>
          <Link href="/publisher-guide" className="hover:text-[#D7B87A] transition-colors">☰ Publisher Guide</Link>
        </footer>
      </div>
    </AdminShell>
  );
}
