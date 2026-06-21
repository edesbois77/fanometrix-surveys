"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Papa from "papaparse";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import { AdminShell } from "@/app/components/AdminShell";
import { InsightsEngine } from "@/app/components/InsightsEngine";
import type { SurveyResponse } from "@/lib/types";
import { EMPTY_DASH_FILTERS } from "@/app/dashboard/components/DashboardFilters";

// ─── Types ───────────────────────────────────────────────────────────────────

type Campaign = {
  id: string; campaign_id: string; brand_name: string; campaign_name: string;
  campaign_description: string | null; start_date: string | null; end_date: string | null;
  survey_id: string | null; surveys?: { name: string } | null;
  publisher: string | null; status: string; effective_status: string;
  response_count: number; target_responses: number | null;
  created_at: string;
};

type CampaignFilters = {
  publisher: string; placement: string; club: string;
  competition: string; country: string; fan_segment: string;
  device: string; browser: string;
};

type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS  = ["#6366f1","#8b5cf6","#06b6d4","#f59e0b","#10b981","#f43f5e","#84cc16","#ec4899"];
const ACTIVE  = "#312e81";

const STATUS_COLOURS: Record<string, string> = {
  draft:     "bg-amber-50 text-amber-700",
  scheduled: "bg-blue-50 text-blue-700",
  live:      "bg-green-50 text-green-700",
  paused:    "bg-orange-50 text-orange-700",
  closed:    "bg-gray-100 text-gray-600",
  archived:  "bg-gray-50 text-gray-400",
};

const FILTER_FIELDS: { key: keyof CampaignFilters; label: string }[] = [
  { key: "publisher",   label: "Publisher"   },
  { key: "placement",   label: "Placement"   },
  { key: "club",        label: "Club"        },
  { key: "competition", label: "Competition" },
  { key: "country",     label: "Country"     },
  { key: "fan_segment", label: "Fan Segment" },
  { key: "device",      label: "Device"      },
  { key: "browser",     label: "Browser"     },
];

const EMPTY_FILTERS: CampaignFilters = {
  publisher: "", placement: "", club: "", competition: "",
  country: "", fan_segment: "", device: "", browser: "",
};

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "all",    label: "All Time"     },
  { key: "today",  label: "Today"        },
  { key: "7d",     label: "7 Days"       },
  { key: "30d",    label: "30 Days"      },
  { key: "custom", label: "Custom"       },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function sub(d: Date, n: number) { return new Date(d.getTime() - n * 86_400_000); }

function getDateBounds(preset: DatePreset, from: string, to: string) {
  const t = new Date();
  if (preset === "today")  return { from: fmt(t),       to: fmt(t)        };
  if (preset === "7d")     return { from: fmt(sub(t,6)), to: fmt(t)       };
  if (preset === "30d")    return { from: fmt(sub(t,29)), to: fmt(t)      };
  if (preset === "custom") return from && to ? { from, to } : null;
  return null;
}

function applyFilters(
  data: SurveyResponse[],
  f: CampaignFilters,
  db: { from: string; to: string } | null,
): SurveyResponse[] {
  return data.filter(r => {
    if (f.publisher   && r.publisher   !== f.publisher  ) return false;
    if (f.placement   && r.placement   !== f.placement  ) return false;
    if (f.club        && r.club        !== f.club       ) return false;
    if (f.competition && r.competition !== f.competition) return false;
    if (f.country     && r.country     !== f.country    ) return false;
    if (f.fan_segment && r.fan_segment !== f.fan_segment) return false;
    if (f.device      && r.device      !== f.device     ) return false;
    if (f.browser     && r.browser     !== f.browser    ) return false;
    if (db) { const d = r.created_at.slice(0,10); if (d < db.from || d > db.to) return false; }
    return true;
  });
}

function tally(data: SurveyResponse[], field: keyof SurveyResponse) {
  const m: Record<string, number> = {};
  for (const r of data) { const v = r[field] as string; if (v) m[v] = (m[v] ?? 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

function avgNum(nums: (number | null)[]): number {
  const v = nums.filter((n): n is number => n !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
}

function uniqueVals(data: SurveyResponse[], field: keyof SurveyResponse) {
  return [...new Set(data.map(r => r[field] as string).filter(Boolean))].sort();
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

function CampaignKpis({ responses }: { responses: SurveyResponse[] }) {
  const total      = responses.length;
  const complete   = responses.filter(r => r.q1 && r.q2 && r.q3).length;
  const completion = total > 0 ? Math.round(complete / total * 100) : 0;
  const avgTime    = avgNum(responses.map(r => r.response_duration_seconds));
  const countries  = new Set(responses.map(r => r.country).filter(Boolean)).size;
  const publishers = new Set(responses.map(r => r.publisher).filter(Boolean)).size;
  const placements = new Set(responses.map(r => r.placement).filter(Boolean)).size;

  const cards = [
    { label: "Total Responses",     value: total.toLocaleString(),            sub: "for this campaign" },
    { label: "Completion Rate",      value: `${completion}%`,                  sub: "all 3 questions"   },
    { label: "Avg Response Time",    value: avgTime > 0 ? `${avgTime}s` : "—", sub: "seconds"           },
    { label: "Countries",            value: countries || "—",                   sub: "represented"       },
    { label: "Publishers Running",   value: publishers || "—",                  sub: "media partners"    },
    { label: "Active Placements",    value: placements || "—",                  sub: "positions"         },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
      {cards.map(({ label, value, sub }) => (
        <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 font-medium leading-tight">{label}</p>
          <p className="text-xl font-bold mt-1 text-[#0B1929]">{value}</p>
          <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Chart Components ─────────────────────────────────────────────────────────

function TimeLine({ responses }: { responses: SurveyResponse[] }) {
  const data = useMemo(() => {
    const m: Record<string,number> = {};
    responses.forEach(r => { const d = r.created_at.slice(0,10); m[d] = (m[d]??0)+1; });
    return Object.entries(m).sort().map(([date,count]) => ({ date, count }));
  }, [responses]);
  if (data.length < 2) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm mb-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Responses Over Time</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
          <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
          <RTooltip contentStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={data.length < 20} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function QBar({ responses, field, label }: { responses: SurveyResponse[]; field: "q1"|"q2"|"q3"; label: string }) {
  const counts = tally(responses, field);
  const total  = responses.length;
  if (!counts.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</h3>
      <div className="space-y-2">
        {counts.map(([opt, count]) => {
          const pct = Math.round(count / total * 100);
          return (
            <div key={opt} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-700">{opt}</span>
                <span className="text-gray-400">{count} ({pct}%)</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#0B1929] rounded-full opacity-70" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DimBar({
  responses, field, label, active, onFilter, colorOffset = 0,
}: {
  responses: SurveyResponse[]; field: keyof SurveyResponse; label: string;
  active: string; onFilter: (v: string) => void; colorOffset?: number;
}) {
  const data = useMemo(() =>
    tally(responses, field).slice(0, 8).map(([fullName, value]) => ({
      name: fullName.length > 16 ? fullName.slice(0, 15) + "…" : fullName, fullName, value,
    })),
  [responses, field]);

  if (!data.length) return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm flex items-center justify-center text-xs text-gray-300 min-h-[100px]">
      No {label.toLowerCase()} data
    </div>
  );

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</h3>
      <ResponsiveContainer width="100%" height={Math.max(80, data.length * 26 + 20)}>
        <BarChart layout="vertical" data={data} margin={{ left: 0, right: 32, top: 0, bottom: 0 }}>
          <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={88} axisLine={false} tickLine={false} />
          <RTooltip contentStyle={{ fontSize: 11 }} formatter={(v) => [v, "Responses"]} />
          <Bar dataKey="value" radius={[0,4,4,0]} cursor="pointer"
            label={{ position: "right", fontSize: 9, fill: "#9ca3af" }}>
            {data.map((d, i) => (
              <Cell key={d.fullName}
                fill={d.fullName === active ? ACTIVE : COLORS[(i + colorOffset) % COLORS.length]}
                opacity={active && d.fullName !== active ? 0.4 : 1}
                onClick={() => onFilter(active === d.fullName ? "" : d.fullName)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {active && (
        <button onClick={() => onFilter("")} className="block text-xs text-[#D7B87A] hover:text-[#C9A766] mt-2 mx-auto">
          ✕ Clear filter
        </button>
      )}
    </div>
  );
}

// ─── Recent Responses Table ───────────────────────────────────────────────────

const TABLE_COLS = [
  { key: "created_at",                label: "Submitted",    fmt: (v: string) => v ? new Date(v).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—" },
  { key: "country",                   label: "Country",      fmt: (v: string) => v || "—" },
  { key: "publisher",                 label: "Publisher",    fmt: (v: string) => v || "—" },
  { key: "placement",                 label: "Placement",    fmt: (v: string) => v || "—" },
  { key: "club",                      label: "Club",         fmt: (v: string) => v || "—" },
  { key: "competition",               label: "Competition",  fmt: (v: string) => v || "—" },
  { key: "fan_segment",               label: "Segment",      fmt: (v: string) => v || "—" },
  { key: "q1",                        label: "Q1",           fmt: (v: string) => v || "—" },
  { key: "q2",                        label: "Q2",           fmt: (v: string) => v || "—" },
  { key: "q3",                        label: "Q3",           fmt: (v: string) => v || "—" },
  { key: "response_duration_seconds", label: "Time (s)",     fmt: (v: string) => v ? `${v}s` : "—" },
];

function RecentTable({ responses }: { responses: SurveyResponse[] }) {
  const [show, setShow] = useState(20);
  const rows = responses.slice(0, show);
  if (!responses.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden mt-4">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Responses</h2>
        <span className="text-xs text-gray-400">Showing {rows.length} of {responses.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {TABLE_COLS.map(c => (
                <th key={c.key} className="text-left px-3 py-2.5 font-semibold text-gray-500 whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                {TABLE_COLS.map(col => (
                  <td key={col.key} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[140px] truncate">
                    {col.fmt(r[col.key as keyof SurveyResponse] as string)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {responses.length > show && (
        <div className="px-5 py-3 border-t border-gray-50 text-center">
          <button onClick={() => setShow(s => s + 20)}
            className="text-xs text-[#D7B87A] hover:text-[#C9A766] font-medium">
            Load more ({responses.length - show} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [campaign,  setCampaign]  = useState<Campaign | null>(null);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  const [filters,    setFilters]    = useState<CampaignFilters>(EMPTY_FILTERS);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [copied,     setCopied]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [cRes, rRes] = await Promise.all([
      fetch(`/api/campaigns/${id}`),
      fetch("/api/responses"),        // all loaded; filtered client-side by campaign_id
    ]);
    if (!cRes.ok) { setError("Campaign not found."); setLoading(false); return; }
    const [cJson, rJson] = await Promise.all([cRes.json(), rRes.json()]);
    setCampaign(cJson.data);
    const allResponses: SurveyResponse[] = rJson.data ?? [];
    // filter to this campaign
    setResponses(allResponses.filter(r => r.campaign_id === cJson.data.campaign_id));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const dateBounds = useMemo(() => getDateBounds(datePreset, dateFrom, dateTo), [datePreset, dateFrom, dateTo]);
  const filtered   = useMemo(() => applyFilters(responses, filters, dateBounds), [responses, filters, dateBounds]);

  function setFilter(field: keyof CampaignFilters, value: string) {
    setFilters(f => ({ ...f, [field]: value }));
  }

  function toggleFilter(field: keyof CampaignFilters, value: string) {
    setFilters(f => ({ ...f, [field]: f[field] === value ? "" : value }));
  }

  function exportCSV() {
    const csv = Papa.unparse(filtered.map(r => ({
      id: r.id, submitted_at: r.created_at, campaign_id: r.campaign_id,
      publisher: r.publisher, placement: r.placement, club: r.club, competition: r.competition,
      q1: r.q1, q2: r.q2, q3: r.q3, country: r.country, fan_segment: r.fan_segment,
      device: r.device, browser: r.browser, response_duration_seconds: r.response_duration_seconds,
    })));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${campaign?.campaign_id ?? "campaign"}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  function openDashboard() {
    localStorage.setItem("dash_filters", JSON.stringify({ ...EMPTY_DASH_FILTERS, campaign_id: campaign?.campaign_id ?? "" }));
    router.push("/dashboard");
  }

  async function handleArchive() {
    if (!confirm("Archive this campaign? It will be read-only.")) return;
    await fetch(`/api/campaigns/${id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive" }),
    });
    load();
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (datePreset !== "all" ? 1 : 0);
  const isFiltered = filtered.length !== responses.length;

  if (loading) return (
    <AdminShell>
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-gray-400 text-sm">Loading campaign…</p>
      </div>
    </AdminShell>
  );

  if (error || !campaign) return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto text-center py-20">
        <p className="text-gray-400 mb-4">{error || "Campaign not found."}</p>
        <Link href="/campaigns" className="text-[#D7B87A] hover:underline text-sm">← Back to Campaigns</Link>
      </div>
    </AdminShell>
  );

  return (
    <AdminShell>
      <div className="p-6 max-w-5xl mx-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
          <Link href="/campaigns" className="hover:text-[#D7B87A]">Campaigns</Link>
          <span>›</span>
          <span className="text-gray-700">{campaign.brand_name} · {campaign.campaign_name}</span>
        </div>

        {/* Campaign Header */}
        <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-xl font-bold text-gray-900">{campaign.brand_name}</h1>
                <span className="text-gray-300">·</span>
                <span className="text-lg text-gray-700">{campaign.campaign_name}</span>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${STATUS_COLOURS[campaign.effective_status ?? campaign.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {campaign.effective_status ?? campaign.status}
                </span>
              </div>
              <p className="text-xs font-mono text-[#0B1929] mb-3">{campaign.campaign_id}</p>
              {campaign.campaign_description && (
                <p className="text-sm text-gray-500 mb-3">{campaign.campaign_description}</p>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-4">
                {campaign.start_date && (
                  <span>
                    <span className="text-gray-400">Duration </span>
                    {campaign.start_date} → {campaign.end_date ?? "ongoing"}
                  </span>
                )}
                {campaign.surveys?.name && (
                  <span>
                    <span className="text-gray-400">Survey </span>
                    {campaign.surveys.name}
                  </span>
                )}
                {campaign.publisher && (
                  <span className="flex items-center gap-1">
                    <span className="text-gray-400">Publisher </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{campaign.publisher}</span>
                  </span>
                )}
              </div>

              {/* Progress */}
              {(() => {
                const target = campaign.target_responses;
                const count  = campaign.response_count ?? 0;
                const hasTarget = target !== null && target > 0;
                const pct = hasTarget ? Math.min(100, Math.round((count / target!) * 100)) : null;
                const now = new Date();
                const end = campaign.end_date ? new Date(campaign.end_date) : null;
                const daysLeft = end ? Math.ceil((end.getTime() - now.getTime()) / 86_400_000) : null;

                return (
                  <div className="space-y-2">
                    {hasTarget && (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 font-medium">
                            {count.toLocaleString()} / {target!.toLocaleString()} responses
                            <span className="text-gray-400 ml-2">{pct}% complete</span>
                          </span>
                          {daysLeft !== null && (
                            <span className="text-gray-400">
                              {daysLeft > 0 ? `${daysLeft} days remaining` : "Ended"}
                            </span>
                          )}
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden w-full max-w-sm">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${pct}%`,
                              background: pct! >= 100 ? "#10b981" : pct! >= 75 ? "#D7B87A" : "#0B1929",
                            }}
                          />
                        </div>
                      </>
                    )}
                    {!hasTarget && count > 0 && (
                      <p className="text-xs text-gray-500">
                        {count.toLocaleString()} responses collected
                        {daysLeft !== null && ` · ${daysLeft > 0 ? `${daysLeft} days remaining` : "Ended"}`}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Link href={`/campaign-deployment?campaign=${campaign.id}`}
                className="text-xs text-center border border-[#E0E1DD] text-[#0B1929] hover:bg-gray-50 px-3 py-1.5 rounded-lg font-medium transition-colors">
                Generate Embed
              </Link>
              <button onClick={openDashboard}
                className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                Open Dashboard
              </button>
              <button onClick={exportCSV} disabled={filtered.length === 0}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                style={{ background: "#D7B87A", color: "#0B1929" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#C9A766"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#D7B87A"; }}>
                {isFiltered ? `Export ${filtered.length} rows` : "Export CSV"}
              </button>
              <button onClick={copyUrl}
                className={`text-xs border px-3 py-1.5 rounded-lg transition-colors ${copied ? "border-green-200 text-green-600 bg-green-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {copied ? "URL Copied!" : "Copy URL"}
              </button>
              {(campaign.effective_status ?? campaign.status) !== "archived" && (
                <button onClick={handleArchive}
                  className="text-xs border border-amber-100 text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors">
                  Archive
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-center gap-3 mb-3">
            {DATE_PRESETS.map(({ key, label }) => (
              <button key={key} onClick={() => setDatePreset(key)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${datePreset === key ? "text-[#0B1929]" : "text-gray-500 hover:bg-gray-100"}`}
                style={datePreset === key ? { background: "#D7B87A" } : {}}>
                {label}
              </button>
            ))}
            {activeFilterCount > 0 && (
              <button onClick={() => { setFilters(EMPTY_FILTERS); setDatePreset("all"); setDateFrom(""); setDateTo(""); }}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline">
                Clear all ({activeFilterCount})
              </button>
            )}
          </div>
          {datePreset === "custom" && (
            <div className="flex gap-3 mb-3">
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
          <div className="grid grid-cols-4 gap-2">
            {FILTER_FIELDS.map(({ key, label }) => (
              <select key={key} value={filters[key]} onChange={e => setFilter(key, e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 focus:outline-none focus:border-[#D7B87A]">
                <option value="">All {label}s</option>
                {uniqueVals(responses, key as keyof SurveyResponse).map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ))}
          </div>
          {isFiltered && (
            <p className="text-xs text-[#D7B87A] mt-2">
              Showing {filtered.length.toLocaleString()} of {responses.length.toLocaleString()} responses
            </p>
          )}
        </div>

        {responses.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">◎</p>
            <p className="text-gray-400">No responses yet for this campaign.</p>
            <Link href={`/campaign-deployment?campaign=${campaign.id}`}
              className="mt-3 inline-block text-sm text-[#D7B87A] hover:underline">
              Generate embed code →
            </Link>
          </div>
        ) : (
          <>
            {/* KPI cards */}
            <CampaignKpis responses={filtered} />

            {/* Responses over time */}
            <TimeLine responses={filtered} />

            {/* Q1/Q2/Q3 */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <QBar responses={filtered} field="q1" label="Q1 · Live Event Attendance" />
              <QBar responses={filtered} field="q2" label="Q2 · Fan Experience Rating" />
              <QBar responses={filtered} field="q3" label="Q3 · Likely to Recommend" />
            </div>

            {/* Dimension charts row 1 */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <DimBar responses={filtered} field="country"   label="By Country"   active={filters.country}   onFilter={v => toggleFilter("country",   v)} colorOffset={0} />
              <DimBar responses={filtered} field="publisher" label="By Publisher" active={filters.publisher} onFilter={v => toggleFilter("publisher", v)} colorOffset={1} />
              <DimBar responses={filtered} field="placement" label="By Placement" active={filters.placement} onFilter={v => toggleFilter("placement", v)} colorOffset={2} />
            </div>

            {/* Dimension charts row 2 */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <DimBar responses={filtered} field="club"        label="By Club"        active={filters.club}        onFilter={v => toggleFilter("club",        v)} colorOffset={3} />
              <DimBar responses={filtered} field="competition" label="By Competition" active={filters.competition} onFilter={v => toggleFilter("competition", v)} colorOffset={4} />
              <DimBar responses={filtered} field="fan_segment" label="By Fan Segment" active={filters.fan_segment} onFilter={v => toggleFilter("fan_segment", v)} colorOffset={5} />
            </div>

            {/* Insights */}
            <InsightsEngine responses={filtered} />

            {/* Recent responses table */}
            <RecentTable responses={filtered} />
          </>
        )}

        <footer className="mt-10 pt-6 border-t border-gray-200 flex items-center gap-4 text-xs text-gray-400">
          <span>Fanometrix</span>
          <Link href="/privacy" className="hover:text-[#D7B87A]">ⓘ Privacy Policy</Link>
          <Link href="/publisher-guide" className="hover:text-[#D7B87A]">☰ Publisher Guide</Link>
        </footer>
      </div>
    </AdminShell>
  );
}
