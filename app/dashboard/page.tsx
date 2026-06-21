"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Papa from "papaparse";
import type { SurveyResponse } from "@/lib/types";
import { AdminShell } from "@/app/components/AdminShell";
import { KpiCards } from "./components/KpiCards";
import { ResponseExplorer } from "./components/Explorer";
import { ChartGrid } from "./components/ChartGrid";
import { InsightsEngine } from "@/app/components/InsightsEngine";
import {
  DashboardFilters,
  EMPTY_DASH_FILTERS,
  type DashFilters,
  type DatePreset,
} from "./components/DashboardFilters";

// ─── Types ───────────────────────────────────────────────────────────────────

type CampaignInfo = {
  campaign_id: string;
  start_date: string | null;
  end_date: string | null;
};

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

export default function DashboardPage() {
  const [responses,  setResponses]  = useState<SurveyResponse[]>([]);
  const [campaigns,  setCampaigns]  = useState<CampaignInfo[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");

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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [rRes, cRes] = await Promise.all([
      fetch("/api/responses"),
      fetch("/api/campaigns"),
    ]);
    if (!rRes.ok) { setError("Failed to load responses."); setLoading(false); return; }
    const [rJson, cJson] = await Promise.all([rRes.json(), cRes.json()]);
    setResponses(rJson.data ?? []);
    setCampaigns(cJson.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive filtered dataset
  const activeCampaign = useMemo(
    () => campaigns.find(c => c.campaign_id === filters.campaign_id) ?? null,
    [campaigns, filters.campaign_id],
  );

  const dateBounds = useMemo(
    () => getDateBounds(datePreset, dateFrom, dateTo, activeCampaign),
    [datePreset, dateFrom, dateTo, activeCampaign],
  );

  const filtered = useMemo(
    () => applyFilters(responses, filters, dateBounds),
    [responses, filters, dateBounds],
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
      <div className="p-4 md:p-6 max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#0B1929" }}>Dashboard</h1>
            <p className="text-gray-400 text-xs mt-0.5">Dashboard</p>
          </div>
          <div className="flex gap-2">
            <button onClick={load}
              className="border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
              Refresh
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
              allResponses={responses}
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
              totalCount={responses.length}
            />

            {/* KPI cards */}
            <KpiCards responses={filtered} />

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
                {/* Insights */}
                <InsightsEngine responses={filtered} />

              {/* Charts */}
                <ChartGrid
                  responses={filtered}
                  filters={filters}
                  onFilter={onChartFilter}
                />

                {/* Response Explorer (independent filters) */}
                <ResponseExplorer responses={responses} />
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
