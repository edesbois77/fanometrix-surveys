"use client";

import type { SurveyResponse } from "@/lib/types";

export type DashFilters = {
  campaign_id: string; publisher: string; placement: string; club: string;
  competition: string; country: string; fan_segment: string;
  device: string; browser: string; q1: string; q2: string; q3: string;
};

export type DatePreset = "all" | "today" | "7d" | "30d" | "campaign" | "custom";

export const EMPTY_DASH_FILTERS: DashFilters = {
  campaign_id: "", publisher: "", placement: "", club: "",
  competition: "", country: "", fan_segment: "",
  device: "", browser: "", q1: "", q2: "", q3: "",
};

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all",      label: "All Time"      },
  { key: "today",    label: "Today"         },
  { key: "7d",       label: "Last 7 Days"   },
  { key: "30d",      label: "Last 30 Days"  },
  { key: "campaign", label: "This Campaign" },
  { key: "custom",   label: "Custom Range"  },
];

const DIM_FIELDS: { key: keyof DashFilters; label: string }[] = [
  { key: "campaign_id",  label: "Campaign"    },
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

type CampaignOption = { campaign_id: string; campaign_name: string; created_at: string };

interface Props {
  allResponses: SurveyResponse[];
  campaigns: CampaignOption[];
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
  allResponses, campaigns, filters, setFilter, clearFilters,
  datePreset, setDatePreset, dateFrom, dateTo, setDateFrom, setDateTo,
  campaignHasDates, filteredCount, totalCount,
}: Props) {
  // Campaigns sorted most recent first — always shown regardless of response count
  const sortedCampaigns = [...campaigns].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // All active filter chips (dimensions + date + q answers)
  const chips: { label: string; field: keyof DashFilters | "__date__"; value: string }[] = [];

  DIM_FIELDS.forEach(({ key, label }) => {
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

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm mb-4 overflow-hidden">

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
        <span className="text-xs text-gray-400 ml-4 flex-shrink-0">
          {filteredCount.toLocaleString()}
          {filteredCount !== totalCount && ` of ${totalCount.toLocaleString()}`} responses
        </span>
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

      {/* Dimension dropdowns — 2 columns on mobile, 3 on sm+ */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {DIM_FIELDS.map(({ key, label }) => (
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
  );
}
