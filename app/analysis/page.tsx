"use client";

import { useState, useCallback, useMemo } from "react";
import { useEffect } from "react";
import { AdminShell } from "@/app/components/AdminShell";
import { ResponseExplorer } from "@/app/dashboard/components/Explorer";
import {
  DashboardFilters,
  EMPTY_DASH_FILTERS,
  type DashFilters,
  type DatePreset,
} from "@/app/dashboard/components/DashboardFilters";
import type { SurveyResponse } from "@/lib/types";

type CampaignInfo = {
  id:            string;
  campaign_id:   string;
  campaign_name: string;
  survey_id:     string | null;
  start_date:    string | null;
  end_date:      string | null;
  created_at:    string;
};

type GroupOption = { id: string; group_id: string; name: string; campaign_ids: string[] };
type SurveyOption = { id: string; name: string };

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export default function AnalysisPage() {
  const [responses,    setResponses]    = useState<SurveyResponse[]>([]);
  const [campaigns,    setCampaigns]    = useState<CampaignInfo[]>([]);
  const [groupOptions, setGroupOptions] = useState<GroupOption[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  const [filters,    setFilters]    = useState<DashFilters>(() => loadLS("analysis_filters", EMPTY_DASH_FILTERS));
  const [datePreset, setDatePreset] = useState<DatePreset>(() => loadLS("analysis_date_preset", "all" as DatePreset));
  const [dateFrom,   setDateFrom]   = useState<string>(() => loadLS("analysis_date_from", ""));
  const [dateTo,     setDateTo]     = useState<string>(() => loadLS("analysis_date_to", ""));

  useEffect(() => { localStorage.setItem("analysis_filters",      JSON.stringify(filters));    }, [filters]);
  useEffect(() => { localStorage.setItem("analysis_date_preset",  JSON.stringify(datePreset)); }, [datePreset]);
  useEffect(() => { localStorage.setItem("analysis_date_from",    JSON.stringify(dateFrom));   }, [dateFrom]);
  useEffect(() => { localStorage.setItem("analysis_date_to",      JSON.stringify(dateTo));     }, [dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rRes, cRes, gRes] = await Promise.all([
        fetch("/api/responses"),
        fetch("/api/campaigns"),
        fetch("/api/dashboard/groups"),
      ]);
      if (!rRes.ok) { setError("Failed to load responses."); setLoading(false); return; }
      const rJson = await rRes.json();
      const cJson = cRes.ok ? await cRes.json() : { data: [] };
      const gJson = gRes.ok ? await gRes.json() : { data: [] };
      setResponses(rJson.data ?? []);
      setCampaigns(cJson.data ?? []);
      setGroupOptions(gJson.data ?? []);
    } catch {
      setError("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const surveyOptions = useMemo<SurveyOption[]>(() => {
    const seen = new Map<string, string>();
    for (const c of campaigns) {
      const sid  = (c as unknown as { survey_id?: string }).survey_id;
      const name = (c as unknown as { surveys?: { name: string } }).surveys?.name;
      if (sid && name && !seen.has(sid)) seen.set(sid, name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [campaigns]);

  const activeCampaign = useMemo(
    () => campaigns.find(c => c.campaign_id === filters.campaign_id) ?? null,
    [campaigns, filters.campaign_id],
  );

  function setFilter(field: keyof DashFilters, value: string) {
    setFilters(f => ({ ...f, [field]: value }));
  }

  function clearFilters() {
    setFilters(EMPTY_DASH_FILTERS);
  }

  return (
    <AdminShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#0B1929" }}>Analysis</h1>
            <p className="text-gray-400 text-xs mt-0.5">
              Filter, group and export response data
            </p>
          </div>
          <button
            onClick={load}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>

        {loading && <p className="text-gray-400 text-sm">Loading responses…</p>}
        {error   && <p className="text-red-500 text-sm">{error}</p>}

        {!loading && !error && (
          <>
            <DashboardFilters
              allResponses={responses}
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
              campaignHasDates={!!(activeCampaign?.start_date && activeCampaign?.end_date)}
              filteredCount={responses.length}
              totalCount={responses.length}
            />

            <ResponseExplorer responses={responses} />
          </>
        )}

      </div>
    </AdminShell>
  );
}
