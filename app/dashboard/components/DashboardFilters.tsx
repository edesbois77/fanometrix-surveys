"use client";

import { useState } from "react";
import type { SurveyResponse } from "@/lib/types";
import { useSession } from "@/app/components/SessionProvider";

export type DashFilters = {
  // Scope filters (applied before dimension filters)
  group_id:    string;   // Campaign Group UUID
  survey_id:   string;   // Survey UUID
  campaign_id: string;   // Single campaign slug
  // Dimension filters
  publisher: string; placement: string; club: string;
  competition: string; country: string; fan_segment: string;
  device: string; browser: string; q1: string; q2: string; q3: string;
};

type SurveyOption = { id: string; name: string };
type GroupOption  = { id: string; group_id: string; name: string; campaign_ids: string[] };

export type DatePreset = "all" | "1h" | "6h" | "12h" | "24h" | "today" | "yesterday" | "7d" | "30d" | "campaign" | "custom";

export const EMPTY_DASH_FILTERS: DashFilters = {
  group_id: "", survey_id: "", campaign_id: "",
  publisher: "", placement: "", club: "",
  competition: "", country: "", fan_segment: "",
  device: "", browser: "", q1: "", q2: "", q3: "",
};

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all",      label: "All Time"      },
  { key: "1h",       label: "Last Hour"     },
  { key: "6h",       label: "Last 6 Hours"  },
  { key: "12h",      label: "Last 12 Hours" },
  { key: "24h",      label: "Last 24 Hours" },
  { key: "today",    label: "Today"         },
  { key: "yesterday", label: "Yesterday"    },
  { key: "7d",       label: "Last 7 Days"   },
  { key: "30d",      label: "Last 30 Days"  },
  { key: "campaign", label: "This Campaign" },
  { key: "custom",   label: "Custom Range"  },
];

const DIM_FIELDS: { key: keyof DashFilters; label: string }[] = [
  { key: "publisher",    label: "Publisher"   },
  { key: "placement",    label: "Placement"   },
  { key: "club",         label: "Club"        },
  { key: "competition",  label: "Competition" },
  { key: "country",      label: "Country"     },
  { key: "fan_segment",  label: "Fan Segment" },
  { key: "device",       label: "Device"      },
  { key: "browser",      label: "Browser"     },
];

const Q_LABELS: Partial<Record<keyof DashFilters, string>> = {
  q1: "Q1", q2: "Q2", q3: "Q3",
};

function uniqueVals(data: SurveyResponse[], field: keyof SurveyResponse): string[] {
  return [...new Set(data.map(r => r[field] as string).filter(Boolean))].sort();
}

type CampaignOption = { campaign_id: string; campaign_name: string; created_at: string; survey_id?: string | null; effective_survey_id?: string | null };

interface Props {
  allResponses: SurveyResponse[];
  campaigns:     CampaignOption[];
  surveyOptions: SurveyOption[];
  groupOptions:  GroupOption[];
  filters: DashFilters;
  setFilter: (field: keyof DashFilters, value: string) => void;
  clearFilters: () => void;
  datePreset: DatePreset;
  setDatePreset: (p: DatePreset) => void;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  campaignHasDates: boolean;
  filteredCount: number;
  totalCount: number;
}

export function DashboardFilters({
  allResponses, campaigns, surveyOptions, groupOptions, filters, setFilter, clearFilters,
  datePreset, setDatePreset, dateFrom, dateTo, setDateFrom, setDateTo,
  campaignHasDates, filteredCount, totalCount,
}: Props) {
  const { user } = useSession();
  // Filters are expanded on first load; experienced users collapse the panel to
  // a summary bar so the reporting below can fill the screen.
  const [collapsed, setCollapsed] = useState(false);
  // A publisher only ever sees their own campaigns' responses, so filtering
  // "by publisher" within that is meaningless — drop the dimension entirely
  // rather than show a dropdown with (at most) one real option.
  const dimFields = user?.role === "publisher" ? DIM_FIELDS.filter(f => f.key !== "publisher") : DIM_FIELDS;

  const sortedCampaigns = [...campaigns].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // When a survey is selected, restrict the campaign dropdown to campaigns using
  // that survey. Match on the EFFECTIVE survey — a campaign that inherits its
  // survey from the project has survey_id null, so keying on the raw survey_id
  // would wrongly hide every inherited campaign.
  const campaignDropdownOptions = filters.survey_id
    ? sortedCampaigns.filter(c => (c.effective_survey_id ?? c.survey_id) === filters.survey_id)
    : sortedCampaigns;

  // All active filter chips (dimensions + date + q answers)
  const chips: { label: string; field: keyof DashFilters | "__date__"; value: string }[] = [];

  dimFields.forEach(({ key, label }) => {
    if (filters[key]) chips.push({ label, field: key, value: filters[key] });
  });
  (["q1", "q2", "q3"] as (keyof DashFilters)[]).forEach(k => {
    if (filters[k]) chips.push({ label: Q_LABELS[k]!, field: k, value: filters[k] });
  });
  if (datePreset !== "all") {
    const dl = DATE_PRESETS.find(d => d.key === datePreset)?.label ?? datePreset;
    const dv = datePreset === "custom" ? `${dateFrom} → ${dateTo}` : dl;
    chips.push({ label: "Date", field: "__date__", value: dv });
  }

  const hasActiveFilters = chips.length > 0;

  // Summary shown in the header when the panel is collapsed. Includes the scope
  // selectors (resolved to friendly names) plus the same date/dimension chips.
  const scopeSummary: { label: string; value: string }[] = [];
  if (filters.survey_id)
    scopeSummary.push({ label: "Survey", value: surveyOptions.find(s => s.id === filters.survey_id)?.name ?? filters.survey_id });
  if (filters.campaign_id)
    scopeSummary.push({ label: "Campaign", value: sortedCampaigns.find(c => c.campaign_id === filters.campaign_id)?.campaign_name ?? filters.campaign_id });
  if (filters.group_id)
    scopeSummary.push({ label: "Group", value: groupOptions.find(g => g.id === filters.group_id)?.name ?? filters.group_id });
  const summaryChips = [...scopeSummary, ...chips.map(c => ({ label: c.label, value: c.value }))];
  const activeCount = summaryChips.length;

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm mb-4 overflow-hidden">

      {/* Header bar — always visible; carries the collapse toggle, an active-filter
          count, the response tally, and (when collapsed) a summary of what's applied. */}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 justify-between px-4 py-3 ${collapsed ? "" : "border-b border-gray-50"}`}>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 group"
          aria-expanded={!collapsed}
        >
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            className="transition-transform duration-300 text-gray-400"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
          >
            <path d="M1 3L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 group-hover:text-gray-700 transition-colors">
            Filters
          </span>
          {activeCount > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#D7B87A", color: "#0B1929" }}>
              {activeCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 tabular-nums">
            {filteredCount.toLocaleString()}
            {filteredCount !== totalCount && ` of ${totalCount.toLocaleString()}`} responses
          </span>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-xs font-medium text-gray-500 hover:text-[#0B1929] transition-colors"
          >
            {collapsed ? "Show filters" : "Collapse filters"}
          </button>
        </div>
      </div>

      {/* Collapsed summary — a compact read-only bar of the active filters. */}
      {collapsed && (
        <div className="px-4 pb-3 flex flex-wrap gap-2 items-center">
          {summaryChips.length > 0 ? (
            summaryChips.map(({ label, value }) => (
              <span
                key={`${label}-${value}`}
                className="flex items-center gap-1 text-xs bg-gray-100 text-[#0B1929] border border-[#E0E1DD] px-2 py-1 rounded-full"
              >
                <span className="text-gray-500 font-medium">{label}:</span> {value}
              </span>
            ))
          ) : (
            <span className="text-xs text-gray-400 italic">No filters applied — showing all responses</span>
          )}
        </div>
      )}

      {/* Collapsible body — smooth height animation via the grid 0fr↔1fr trick. */}
      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
      >
        <div className="overflow-hidden min-h-0">

      {/* Date range tabs — wrap on mobile so response count doesn't squish the presets */}
      <div className="flex flex-wrap items-center gap-y-2 justify-between px-4 pt-4 pb-3 border-b border-gray-50">
        <div className="flex gap-1 flex-wrap">
          {DATE_PRESETS.map(({ key, label }) => {
            const disabled = key === "campaign" && !campaignHasDates;
            return (
              <button
                key={key}
                onClick={() => !disabled && setDatePreset(key)}
                disabled={disabled}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  datePreset === key
                    ? "text-[#0B1929] font-semibold"
                    : disabled
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-500 hover:bg-gray-100"
                }}
                style={datePreset === key ? { background: "#D7B87A" } : {}
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom date inputs */}
      {datePreset === "custom" && (
        <div className="flex gap-3 px-4 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#D7B87A]" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#D7B87A]" />
          </div>
        </div>
      )}

      {/* Scope selectors — Survey (left) / Campaign (right) / Campaign Group */}
      <div className="px-4 py-3 border-b border-gray-50">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Surveys — the project's surveys; picking one scopes everything below
              (campaigns, charts, funnel) to that survey. */}
          {surveyOptions.length > 0 && (
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Surveys</label>
              <select
                value={filters.survey_id}
                onChange={e => {
                  setFilter("survey_id", e.target.value);
                  // A campaign picked under a different survey no longer applies.
                  if (filters.campaign_id) setFilter("campaign_id", "");
                }}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#D7B87A]"
              >
                <option value="">{surveyOptions.length > 1 ? `All Surveys (${surveyOptions.length})` : "All Surveys"}</option>
                {surveyOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Campaigns — restricted to the selected survey's campaigns, if any. */}
          <div className="space-y-1">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Campaigns</label>
            <select
              value={filters.campaign_id}
              onChange={e => setFilter("campaign_id", e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#D7B87A]"
            >
              <option value="">
                {filters.survey_id && campaignDropdownOptions.length > 0
                  ? `All Campaigns (${campaignDropdownOptions.length})`
                  : "All Campaigns"}
              </option>
              {campaignDropdownOptions.map(c => (
                <option key={c.campaign_id} value={c.campaign_id}>
                  {c.campaign_name || c.campaign_id}
                </option>
              ))}
            </select>
          </div>

          {/* Campaign Groups — only when the project has any. */}
          {groupOptions.length > 0 && (
            <div className="space-y-1">
              <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Campaign Groups</label>
              <select
                value={filters.group_id}
                onChange={e => setFilter("group_id", e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#D7B87A]"
              >
                <option value="">All Campaign Groups</option>
                {groupOptions.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Dimension dropdowns — 2 columns on mobile, 3 on sm+ */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {dimFields.map(({ key, label }) => (
          <div key={key}>
            <select
              value={filters[key]}
              onChange={e => setFilter(key, e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#D7B87A]"
            >
              <option value="">All {label}s</option>
              {key === "campaign_id"
                ? sortedCampaigns.map(c => (
                    <option key={c.campaign_id} value={c.campaign_id}>
                      {c.campaign_name || c.campaign_id}
                    </option>
                  ))
                : uniqueVals(allResponses, key as keyof SurveyResponse).map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))
              }
            </select>
          </div>
        ))}
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="px-4 pb-3 flex flex-wrap gap-2 items-center border-t border-gray-50 pt-3">
          {chips.map(({ label, field, value }) => (
            <span
              key={`${field}-${value}`}
              className="flex items-center gap-1 text-xs bg-gray-100 text-[#0B1929] border border-[#E0E1DD] px-2 py-1 rounded-full"
            >
              <span className="text-gray-500 font-medium">{label}:</span> {value}
              <button
                onClick={() => {
                  if (field === "__date__") { setDatePreset("all"); setDateFrom(""); setDateTo(""); }
                  else setFilter(field, "");
                }}
                className="ml-0.5 text-gray-400 hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
          <button
            onClick={() => { clearFilters(); setDatePreset("all"); setDateFrom(""); setDateTo(""); }}
            className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
          >
            Clear all
          </button>
        </div>
      )}

        </div>
      </div>
    </div>
  );
}
