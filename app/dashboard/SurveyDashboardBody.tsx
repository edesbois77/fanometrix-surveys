"use client";

// The Survey Dashboard body — the ENTIRE existing survey dashboard (filters,
// KPIs, response funnel, performance highlights, AI insights, charts, question
// results, CSV export, auto-refresh) lifted out of app/dashboard/page.tsx so the
// same implementation can mount in two hosts:
//
//   • Global  — app/dashboard/page.tsx wraps this in AdminShell and reads the
//               ?research_project_id / ?survey_id scope from the URL. Behaviour,
//               localStorage persistence and deep-link seeding are unchanged.
//   • Project — the Research Project's Dashboard › Survey Intelligence sub-page
//               passes a fixed `projectId`; every metric is then automatically
//               scoped to that project's campaigns (server-side via
//               research_project_id, which /api/responses & /api/campaigns
//               already support). It starts from clean filters and does NOT read
//               or write the global dash_filters, so the two hosts never
//               clobber each other.
//
// No calculations are re-implemented here — this is the same code, reused. The
// only behavioural difference between hosts is where the scope comes from.
import { useEffect, useState, useCallback, useMemo, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Papa from "papaparse";
import type { SurveyResponse } from "@/lib/types";
import { KpiCards, type EventCounts } from "./components/KpiCards";
import { ChartGrid, type SurveyLabels } from "./components/ChartGrid";
import { InsightsEngine } from "@/app/components/InsightsEngine";
import { PerformanceHighlights } from "./components/PerformanceHighlights";
import {
  DashboardFilters,
  EMPTY_DASH_FILTERS,
  type DashFilters,
  type DatePreset,
} from "./components/DashboardFilters";

// ─── Types ───────────────────────────────────────────────────────────────────

type CampaignInfo = {
  id:              string;   // UUID — needed for group membership lookup
  campaign_id:     string;
  campaign_name:   string;
  survey_id:       string | null;
  effective_survey_id: string | null;
  effective_survey_name: string | null;
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

// Reads the ?research_project_id=&survey_id= query params for the GLOBAL host.
// Isolated so only this leaf needs the useSearchParams() Suspense boundary.
function ProjectScopeReader({ onProjectId, onSurveyId }: { onProjectId: (id: string | null) => void; onSurveyId: (id: string | null) => void }) {
  const searchParams = useSearchParams();
  const researchProjectId = searchParams.get("research_project_id");
  const surveyId = searchParams.get("survey_id");
  useEffect(() => { onProjectId(researchProjectId); }, [researchProjectId, onProjectId]);
  useEffect(() => { onSurveyId(surveyId); }, [surveyId, onSurveyId]);
  return null;
}

// ─── Body ────────────────────────────────────────────────────────────────────

// Data is user-controlled: the dashboard loads once when opened and then stays
// static until the user clicks Refresh, changes a filter / date range / survey /
// campaign, or navigates away and back. There is no automatic polling — this
// keeps results stable while analysing (and during presentations) and removes
// the recurring server/database load a background refresh interval would incur.

// A static "Last refreshed" stamp so users know how current the data is. No
// timer — it only changes when a load actually happens, so it never re-renders
// the dashboard on its own.
function LastRefreshed({ lastUpdated, loading }: { lastUpdated: Date | null; loading: boolean }) {
  if (loading) {
    return <span className="text-xs text-gray-400 hidden sm:block">Updating…</span>;
  }
  if (!lastUpdated) return null;
  const t = lastUpdated.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  return (
    <span className="text-xs text-gray-400 hidden sm:block">Last refreshed: {t}</span>
  );
}

export function SurveyDashboardBody({ projectId }: { projectId?: string }) {
  const isProject = !!projectId;

  // undefined = not read from the URL yet, null = confirmed unscoped. In project
  // mode the scope is fixed from the start, so there is no "not read yet" state.
  const [scopeProjectId, setScopeProjectId] = useState<string | null | undefined>(projectId ?? undefined);
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
  // True once the first load has succeeded. The dashboard stays mounted with its
  // last-good data through subsequent refreshes/errors, so a failed refresh never
  // blanks the screen the user is analysing.
  const [hasLoaded,     setHasLoaded]     = useState(false);
  // Bumped by an explicit Refresh so the scoped fetches (events, labels) re-run
  // together with the main load — without depending on array identity.
  const [refreshNonce,  setRefreshNonce]  = useState(0);

  // Filter state — persisted in localStorage for the GLOBAL host only. The
  // project host starts clean so it never inherits (or overwrites) a global
  // filter that may target a campaign outside this project.
  const [filters,     setFilters]     = useState<DashFilters>(() => isProject ? EMPTY_DASH_FILTERS : loadLS("dash_filters", EMPTY_DASH_FILTERS));
  const [datePreset,  setDatePreset]  = useState<DatePreset>(() => isProject ? "all" : loadLS("dash_date_preset", "all"));
  const [dateFrom,    setDateFrom]    = useState<string>(() => isProject ? "" : loadLS("dash_date_from", ""));
  const [dateTo,      setDateTo]      = useState<string>(() => isProject ? "" : loadLS("dash_date_to", ""));

  // Persist filter state (global host only)
  useEffect(() => { if (!isProject) localStorage.setItem("dash_filters",     JSON.stringify(filters));    }, [filters, isProject]);
  useEffect(() => { if (!isProject) localStorage.setItem("dash_date_preset", JSON.stringify(datePreset)); }, [datePreset, isProject]);
  useEffect(() => { if (!isProject) localStorage.setItem("dash_date_from",   JSON.stringify(dateFrom));   }, [dateFrom, isProject]);
  useEffect(() => { if (!isProject) localStorage.setItem("dash_date_to",     JSON.stringify(dateTo));     }, [dateTo, isProject]);

  const load = useCallback(async (pid: string | null) => {
    setLoading(true);
    setError("");
    try {
      const scopeQS = pid ? `?research_project_id=${pid}` : "";
      const [rRes, cRes, gRes, pRes] = await Promise.all([
        fetch(`/api/responses${scopeQS}`),
        fetch(`/api/campaigns${scopeQS}`),
        fetch("/api/dashboard/groups"),
        pid ? fetch(`/api/research-projects/${pid}`) : Promise.resolve(null),
      ]);
      if (!rRes.ok) { setError("Failed to load responses."); setLoading(false); return; }
      const rJson = await rRes.json();
      const cJson = cRes.ok ? await cRes.json() : { data: [] };
      const gJson = gRes.ok ? await gRes.json() : { data: [] };
      const campaignRows: CampaignInfo[] = cJson.data ?? [];
      setResponses(rJson.data ?? []);
      setCampaigns(campaignRows);
      const allGroups: GroupOption[] = gJson.data ?? [];
      if (pid) {
        const scopedCampaignUUIDs = new Set(campaignRows.map(c => c.id));
        setGroupOptions(allGroups.filter(g => g.campaign_ids.some(id => scopedCampaignUUIDs.has(id))));
      } else {
        setGroupOptions(allGroups);
      }
      if (pid && pRes?.ok) {
        const pJson = await pRes.json();
        setScopeProject({ id: pid, project_name: pJson.data.project_name, research_mode: pJson.data.research_mode });
      } else {
        setScopeProject(null);
      }
      // Success only: stamp the "Last refreshed" time and mark the dashboard
      // ready. On failure we fall through to catch and leave the existing data
      // (and previous timestamp) untouched.
      setLastUpdated(new Date());
      setHasLoaded(true);
    } catch {
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (scopeProjectId !== undefined) load(scopeProjectId);
  }, [load, scopeProjectId]);

  // Seeds the Survey filter from a deep link (global host only) — applied once.
  useEffect(() => {
    if (scopeSurveyId && !scopeSurveyIdApplied.current) {
      scopeSurveyIdApplied.current = true;
      setFilters(f => ({ ...f, survey_id: scopeSurveyId }));
    }
  }, [scopeSurveyId]);

  // Explicit, user-triggered refresh: reloads the main data AND re-runs the
  // scoped fetches (events, labels) together, via the nonce. There is no timer
  // and no polling — data only changes when the user asks for it (or changes a
  // filter / date / survey / campaign, or remounts by navigating back).
  const refresh = useCallback(() => {
    load(scopeProjectId ?? null);
    setRefreshNonce(n => n + 1);
  }, [load, scopeProjectId]);

  // Stable content keys for campaigns / groups. The effects below derive their
  // fetch params from these arrays but must NOT re-run merely because a reload
  // handed back a new array *reference* with identical content — that was the
  // spurious-refire issue flagged in the compute audit. Keying on the content
  // (and the explicit refreshNonce) makes the scoped fetches fire only when the
  // selection, the underlying data, or an explicit Refresh actually changes.
  const campaignsKey = useMemo(
    () => campaigns.map(c => `${c.id}:${c.campaign_id}:${c.effective_survey_id ?? ""}:${c.created_at}`).join("|"),
    [campaigns],
  );
  const groupOptionsKey = useMemo(
    () => groupOptions.map(g => `${g.id}:${g.campaign_ids.join(",")}`).join("|"),
    [groupOptions],
  );

  // Fetch event counts — re-runs when filters, date bounds, campaign content,
  // or an explicit Refresh change (never on bare array-reference churn).
  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.campaign_id) {
      p.set("campaign_id", filters.campaign_id);
    } else if (filters.survey_id) {
      const ids = campaigns
        .filter(c => c.effective_survey_id === filters.survey_id)
        .map(c => c.campaign_id);
      if (ids.length) p.set("campaign_ids", ids.join(","));
    } else if (isProject) {
      // Project host, no in-page filter: scope the funnel to this project's
      // campaigns so the KPI event counts match the project-scoped responses.
      const ids = campaigns.map(c => c.campaign_id);
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
  }, [filters.campaign_id, filters.survey_id, filters.publisher, filters.placement, filters.country, filters.device, filters.browser, datePreset, dateFrom, dateTo, campaignsKey, refreshNonce]);

  const activeCampaign = useMemo(
    () => campaigns.find(c => c.campaign_id === filters.campaign_id) ?? null,
    [campaigns, filters.campaign_id],
  );

  const surveyOptions = useMemo<SurveyOption[]>(() => {
    const seen = new Map<string, string>();
    for (const c of campaigns) {
      const sid  = c.effective_survey_id;
      // Prefer the API-resolved effective survey name (covers project-inherited
      // campaigns whose own survey_id is null); fall back to the direct join.
      const name = c.effective_survey_name ?? (c as unknown as { surveys?: { name: string } }).surveys?.name;
      if (sid && name && !seen.has(sid)) seen.set(sid, name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [campaigns]);

  const scopedResponses = useMemo(() => {
    let base = responses;
    if (filters.group_id) {
      const group = groupOptions.find(g => g.id === filters.group_id);
      if (group) {
        const groupCampaignUUIDs = new Set(group.campaign_ids);
        const slugs = new Set(
          campaigns
            .filter(c => groupCampaignUUIDs.has((c as unknown as { id: string }).id))
            .map(c => c.campaign_id)
        );
        base = base.filter(r => slugs.has(r.campaign_id));
      }
    }
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
      const latest = [...campaigns].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      fetchLabels(`/api/embed/survey-labels?campaign_id=${encodeURIComponent(latest.campaign_id)}`);
    } else {
      setSurveyLabels(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.campaign_id, filters.survey_id, filters.group_id, campaignsKey, groupOptionsKey, refreshNonce]);

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

  const controls = (
    <div className="flex items-center gap-2">
      <LastRefreshed lastUpdated={lastUpdated} loading={loading} />
      <button onClick={refresh} disabled={loading} aria-busy={loading}
        className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
        {loading && (
          <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" aria-hidden />
        )}
        {loading ? "Refreshing…" : "Refresh"}
      </button>
      <button onClick={exportCSV} disabled={filtered.length === 0}
        className="text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        style={{ background: "#D7B87A", color: "#0B1929" }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#D7B87A"; }}>
        {isFiltered ? `Export ${filtered.length.toLocaleString()} rows` : "Export CSV"}
      </button>
    </div>
  );

  return (
    <div>
      {!isProject && (
        <Suspense fallback={null}>
          <ProjectScopeReader onProjectId={setScopeProjectId} onSurveyId={setScopeSurveyId} />
        </Suspense>
      )}

      {/* Header row. Global: full page header + controls. Project: the section
          shell already titles the page "Dashboard" and the sub-nav marks it
          "Survey Intelligence", so we show only a scope caption + controls. */}
      <div className="flex items-center justify-between mb-4">
        {isProject ? (
          <p className="text-xs text-gray-400">Every metric is automatically scoped to this project&apos;s campaigns.</p>
        ) : (
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
        )}
        {controls}
      </div>

      {/* Initial load only. Once the first load succeeds the dashboard stays
          mounted, so a later refresh (or a failed one) never blanks the view. */}
      {loading && !hasLoaded && <p className="text-gray-400 text-sm">Loading responses…</p>}

      {/* Non-destructive error state: a failed refresh shows a banner but keeps
          the last-good data on screen. Clears on the next successful load. */}
      {error && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <span className="text-sm text-red-600">{error}</span>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs font-semibold text-red-700 underline hover:text-red-800 disabled:opacity-50 disabled:no-underline"
          >
            {loading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}

      {hasLoaded && (
        <>
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

          <KpiCards
            responses={filtered}
            events={eventCounts}
            eventsLoading={eventsLoading}
          />

          {responses.length === 0 ? (
            <p className="text-gray-400 text-center mt-10 text-sm">
              {isProject ? "No responses collected for this project yet." : "No responses yet. Share your survey to get started!"}
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
              <InsightsEngine responses={filtered} onFilter={onChartFilter} />
              <PerformanceHighlights responses={filtered} />
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
    </div>
  );
}
