"use client";

import { useState, useMemo, useEffect } from "react";
import Papa from "papaparse";
import {
  PieChart, Pie, Cell,
  Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import type { SurveyResponse } from "@/lib/types";

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#f43f5e", "#84cc16", "#ec4899"];

const GROUP_OPTIONS = [
  { label: "Campaign",    field: "campaign_id"  },
  { label: "Publisher",   field: "publisher"    },
  { label: "Placement",   field: "placement"    },
  { label: "Club",        field: "club"         },
  { label: "Competition", field: "competition"  },
  { label: "Country",     field: "country"      },
  { label: "Fan Segment", field: "fan_segment"  },
  { label: "Device",      field: "device"       },
  { label: "Browser",     field: "browser"      },
] as const;

const FILTER_FIELDS: { label: string; field: keyof SurveyResponse }[] = [
  { label: "Campaign",    field: "campaign_id"  },
  { label: "Publisher",   field: "publisher"    },
  { label: "Placement",   field: "placement"    },
  { label: "Club",        field: "club"         },
  { label: "Competition", field: "competition"  },
  { label: "Country",     field: "country"      },
  { label: "Fan Segment", field: "fan_segment"  },
  { label: "Device",      field: "device"       },
  { label: "Browser",     field: "browser"      },
];

const DIM_COLS: (keyof SurveyResponse)[] = [
  "campaign_id", "publisher", "placement", "club", "competition", "country", "fan_segment",
];

const DIM_LABELS: Partial<Record<keyof SurveyResponse, string>> = {
  campaign_id: "Campaign", publisher: "Publisher", placement: "Placement",
  club: "Club", competition: "Competition", country: "Country", fan_segment: "Fan Segment",
};

const PAGE_SIZE = 10;

// ─── Types ───────────────────────────────────────────────────────────────────

type Filters = {
  campaign_id: string; publisher: string; placement: string; club: string;
  competition: string; country: string; fan_segment: string;
  device: string; browser: string; date_from: string; date_to: string;
};

type SortCol = "key" | "responses" | "completionRate" | "avgDuration";

type GroupedRow = {
  key: string;
  dims: Partial<Record<keyof SurveyResponse, string>>;
  responses: number;
  completionRate: number;
  avgDuration: number | null;
  rows: SurveyResponse[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: Filters = {
  campaign_id: "", publisher: "", placement: "", club: "",
  competition: "", country: "", fan_segment: "",
  device: "", browser: "", date_from: "", date_to: "",
};

function applyFilters(data: SurveyResponse[], f: Filters): SurveyResponse[] {
  return data.filter(r => {
    for (const { field } of FILTER_FIELDS) {
      const fv = f[field as keyof Filters];
      if (fv && r[field] !== fv) return false;
    }
    if (f.date_from && r.created_at < f.date_from) return false;
    if (f.date_to   && r.created_at > f.date_to + "T23:59:59") return false;
    return true;
  });
}

function buildGroups(data: SurveyResponse[], field: string): GroupedRow[] {
  const map = new Map<string, SurveyResponse[]>();
  for (const r of data) {
    const key = (r[field as keyof SurveyResponse] as string) || "Unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries()).map(([key, rows]) => {
    const durations = rows.map(r => r.response_duration_seconds).filter((n): n is number => n !== null);
    const dims: Partial<Record<keyof SurveyResponse, string>> = {};
    for (const col of DIM_COLS) {
      const vals = [...new Set(rows.map(r => r[col] as string).filter(Boolean))];
      if (vals.length === 0) dims[col] = "—";
      else if (vals.length === 1) dims[col] = vals[0];
      else if (vals.length === 2) dims[col] = `${vals[0]} (+1)`;
      else dims[col] = `Multiple (${vals.length})`;
    }
    return {
      key, dims,
      responses: rows.length,
      completionRate: rows.filter(r => r.q1 && r.q2 && r.q3).length / rows.length,
      avgDuration: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
      rows,
    };
  });
}

function tallyField(rows: SurveyResponse[], field: keyof SurveyResponse) {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const v = (r[field] as string) ?? "Not answered";
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));
}

function dailyTrend(rows: SurveyResponse[]) {
  const map: Record<string, number> = {};
  for (const r of rows) {
    const d = r.created_at.slice(0, 10);
    map[d] = (map[d] ?? 0) + 1;
  }
  return Object.entries(map).sort().map(([date, count]) => ({ date, count }));
}

function uniqueVals(data: SurveyResponse[], field: keyof SurveyResponse): string[] {
  return [...new Set(data.map(r => r[field] as string).filter(Boolean))].sort();
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-600 mb-1 text-center">{title}</p>
      <div className="flex justify-center">
        <PieChart width={170} height={140}>
          <Pie data={data} cx={85} cy={65} innerRadius={35} outerRadius={58} dataKey="value" paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <RTooltip formatter={(v) => [`${v} (${Math.round(Number(v) / total * 100)}%)`, ""]} contentStyle={{ fontSize: 11 }} />
        </PieChart>
      </div>
      <div className="space-y-1 mt-1">
        {data.slice(0, 4).map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs text-gray-600 px-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="truncate">{d.name}</span>
            <span className="ml-auto text-gray-400 flex-shrink-0">{Math.round(d.value / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ row, groupLabel, onClose }: { row: GroupedRow; groupLabel: string; onClose: () => void }) {
  const q1Data   = tallyField(row.rows, "q1");
  const q2Data   = tallyField(row.rows, "q2");
  const q3Data   = tallyField(row.rows, "q3");
  const trend    = dailyTrend(row.rows);
  const ctyData  = tallyField(row.rows, "country").slice(0, 8);

  return (
    <div className="mt-4 bg-gray-50 border border-[#E0E1DD] rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#D7B87A]">{groupLabel}</p>
          <h3 className="text-xl font-bold mt-0.5 text-[#0B1929]">{row.key}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {row.responses.toLocaleString()} responses
            &nbsp;·&nbsp;{Math.round(row.completionRate * 100)}% completion rate
            {row.avgDuration !== null && <>&nbsp;·&nbsp;{row.avgDuration}s avg response time</>}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none ml-4">×</button>
      </div>

      {/* Dimension tags */}
      <div className="flex flex-wrap gap-2 mb-5">
        {DIM_COLS.filter(d => row.dims[d] && row.dims[d] !== "—").map(d => (
          <span key={d} className="bg-white border border-[#E0E1DD] text-[#0B1929] text-xs px-2 py-1 rounded-full">
            <span className="text-gray-400">{DIM_LABELS[d]}: </span>{row.dims[d]}
          </span>
        ))}
      </div>

      {/* Donut charts */}
      <div className="grid grid-cols-3 gap-4 mb-6 bg-white rounded-xl p-4 border border-[#E0E1DD]">
        <DonutChart title="Q1 · Live event attendance" data={q1Data} />
        <DonutChart title="Q2 · Fan experience rating" data={q2Data} />
        <DonutChart title="Q3 · Likely to recommend"   data={q3Data} />
      </div>

      {/* Trend + country bar */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 border border-[#E0E1DD]">
          <p className="text-xs font-semibold text-gray-600 mb-3">Responses over time</p>
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={trend} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
                <RTooltip contentStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400 pt-4 text-center">Not enough data for a trend</p>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 border border-[#E0E1DD]">
          <p className="text-xs font-semibold text-gray-600 mb-3">Responses by country</p>
          {ctyData.length ? (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart layout="vertical" data={ctyData} margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
                <RTooltip contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                  {ctyData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-gray-400 pt-4 text-center">No country data</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Explorer ─────────────────────────────────────────────────────────────

function loadLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

export function ResponseExplorer({ responses }: { responses: SurveyResponse[] }) {
  const [filters,      setFilters]      = useState<Filters>(() => loadLS("fp_filters", EMPTY_FILTERS));
  const [groupByField, setGroupByField] = useState<string>(() => loadLS("fp_groupBy", "campaign_id"));
  const [search,       setSearch]       = useState<string>(() => loadLS("fp_search", ""));
  const [showPct,      setShowPct]      = useState(false);
  const [sortCol,      setSortCol]      = useState<SortCol>("responses");
  const [sortAsc,      setSortAsc]      = useState(false);
  const [page,         setPage]         = useState(0);
  const [selected,     setSelected]     = useState<GroupedRow | null>(null);

  useEffect(() => { localStorage.setItem("fp_filters",  JSON.stringify(filters));      }, [filters]);
  useEffect(() => { localStorage.setItem("fp_groupBy",  JSON.stringify(groupByField)); }, [groupByField]);
  useEffect(() => { localStorage.setItem("fp_search",   JSON.stringify(search));       }, [search]);

  function setFilter(field: string, value: string) {
    setFilters(f => ({ ...f, [field]: value }));
    setPage(0);
    setSelected(null);
  }

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(false); }
    setPage(0);
  }

  const filtered = useMemo(() => applyFilters(responses, filters), [responses, filters]);

  const grouped = useMemo(() => buildGroups(filtered, groupByField), [filtered, groupByField]);

  const searched = useMemo(
    () => search ? grouped.filter(r => r.key.toLowerCase().includes(search.toLowerCase())) : grouped,
    [grouped, search],
  );

  const sorted = useMemo(() => [...searched].sort((a, b) => {
    let cmp = 0;
    if (sortCol === "key")            cmp = a.key.localeCompare(b.key);
    if (sortCol === "responses")      cmp = a.responses - b.responses;
    if (sortCol === "completionRate") cmp = a.completionRate - b.completionRate;
    if (sortCol === "avgDuration")    cmp = (a.avgDuration ?? -1) - (b.avgDuration ?? -1);
    return sortAsc ? cmp : -cmp;
  }), [searched, sortCol, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged      = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const groupLabel       = GROUP_OPTIONS.find(o => o.field === groupByField)?.label ?? groupByField;
  const activeFilters    = Object.values(filters).filter(Boolean).length;
  const barData          = sorted.slice(0, 12).map(r => ({
    name:  r.key.length > 18 ? r.key.slice(0, 17) + "…" : r.key,
    value: r.responses,
  }));

  function exportCSV() {
    const csv = Papa.unparse(filtered.map(r => ({
      id: r.id, submitted_at: r.created_at, campaign_id: r.campaign_id,
      publisher: r.publisher, placement: r.placement, club: r.club, competition: r.competition,
      q1: r.q1, q2: r.q2, q3: r.q3, country: r.country, fan_segment: r.fan_segment,
      device: r.device, browser: r.browser,
      response_duration_seconds: r.response_duration_seconds,
    })));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `fanometrix-explorer-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function SortArrow({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-[#D7B87A] ml-1">{sortAsc ? "↑" : "↓"}</span>;
  }

  return (
    <section className="mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Response Explorer</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {filtered.length.toLocaleString()} of {responses.length.toLocaleString()} responses
            {activeFilters > 0 && (
              <span className="ml-2 text-[#D7B87A]">{activeFilters} filter{activeFilters > 1 ? "s" : ""} active</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-xs">
            <button onClick={() => setShowPct(false)}
              className={`px-3 py-1.5 font-medium transition-colors ${!showPct ? "text-[#0B1929]" : "text-gray-500 hover:bg-gray-50"}`}
              style={!showPct ? { background: "#D7B87A" } : {}}>
              Count
            </button>
            <button onClick={() => setShowPct(true)}
              className={`px-3 py-1.5 font-medium transition-colors ${showPct ? "text-[#0B1929]" : "text-gray-500 hover:bg-gray-50"}`}
              style={showPct ? { background: "#D7B87A" } : {}}>
              %
            </button>
          </div>
          {activeFilters > 0 && (
            <button
              onClick={() => { setFilters(EMPTY_FILTERS); setPage(0); setSelected(null); }}
              className="text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
            >
              Clear filters
            </button>
          )}
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            style={{ background: "#D7B87A", color: "#0B1929" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#D7B87A"; }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
        <div className="grid grid-cols-3 gap-3">
          {FILTER_FIELDS.map(({ label, field }) => (
            <div key={field}>
              <label className="text-xs text-gray-400 font-medium block mb-1">{label}</label>
              <select
                value={filters[field as keyof Filters]}
                onChange={e => setFilter(field, e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#D7B87A]"
              >
                <option value="">All</option>
                {uniqueVals(responses, field).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1">Date from</label>
            <input type="date" value={filters.date_from}
              onChange={e => setFilter("date_from", e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#D7B87A]" />
          </div>
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1">Date to</label>
            <input type="date" value={filters.date_to}
              onChange={e => setFilter("date_to", e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#D7B87A]" />
          </div>
        </div>
      </div>

      {/* Group by + comparison bar chart */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex items-end gap-4 mb-4">
          <div>
            <label className="text-xs text-gray-400 font-medium block mb-1">Group by</label>
            <select
              value={groupByField}
              onChange={e => { setGroupByField(e.target.value); setPage(0); setSelected(null); }}
              className="text-sm border border-[#E0E1DD] bg-gray-50 text-[#0B1929] font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#D7B87A]"
            >
              {GROUP_OPTIONS.map(o => <option key={o.field} value={o.field}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 font-medium block mb-1">Search</label>
            <input
              type="text"
              placeholder={`Search by ${groupLabel}…`}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:border-[#D7B87A]"
            />
          </div>
          <p className="text-xs text-gray-400 pb-1.5">{searched.length} group{searched.length !== 1 ? "s" : ""}</p>
        </div>

        {barData.length > 0 && (
          <ResponsiveContainer width="100%" height={Math.max(80, barData.length * 24)}>
            <BarChart layout="vertical" data={barData} margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
              <RTooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}
                label={{ position: "right", fontSize: 10, fill: "#6b7280" }}>
                {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Summary table */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("key")}
                >
                  {groupLabel} <SortArrow col="key" />
                </th>
                {DIM_COLS.filter(d => d !== groupByField).map(d => (
                  <th key={String(d)} className="text-left px-3 py-3 text-xs font-semibold text-gray-400 whitespace-nowrap hidden xl:table-cell">
                    {DIM_LABELS[d]}
                  </th>
                ))}
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("responses")}>
                  Responses <SortArrow col="responses" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("completionRate")}>
                  Completion <SortArrow col="completionRate" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 cursor-pointer select-none whitespace-nowrap"
                  onClick={() => toggleSort("avgDuration")}>
                  Avg Time <SortArrow col="avgDuration" />
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr>
                  <td colSpan={20} className="text-center py-12 text-gray-400 text-sm">
                    No data matches your current filters.
                  </td>
                </tr>
              )}
              {paged.map(row => (
                <tr
                  key={row.key}
                  onClick={() => setSelected(selected?.key === row.key ? null : row)}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${
                    selected?.key === row.key ? "bg-[rgba(215,184,122,0.06)]" : "hover:bg-gray-50"
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{row.key}</td>
                  {DIM_COLS.filter(d => d !== groupByField).map(d => (
                    <td key={String(d)} className="px-3 py-3 text-xs text-gray-400 whitespace-nowrap hidden xl:table-cell">
                      {row.dims[d] || "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                    {showPct
                      ? `${filtered.length > 0 ? Math.round(row.responses / filtered.length * 100) : 0}%`
                      : row.responses.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {Math.round(row.completionRate * 100)}%
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                    {row.avgDuration !== null ? `${row.avgDuration}s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="w-7 h-7 flex items-center justify-center text-xs border border-gray-200 rounded-md disabled:opacity-30 hover:bg-white">‹</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i : Math.max(0, Math.min(page - 3, totalPages - 7)) + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-7 h-7 flex items-center justify-center text-xs border rounded-md transition-colors ${
                      page === p ? "text-[#0B1929] border-[#D7B87A]" : "border-gray-200 hover:bg-white"
                    }
                    style={page === p ? { background: "#D7B87A" } : {}
                    }`}>
                    {p + 1}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="w-7 h-7 flex items-center justify-center text-xs border border-gray-200 rounded-md disabled:opacity-30 hover:bg-white">›</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <DetailPanel
          row={selected}
          groupLabel={groupLabel}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
