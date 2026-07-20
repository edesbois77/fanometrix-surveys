"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import type { SurveyResponse } from "@/lib/types";
import type { DashFilters } from "./DashboardFilters";

export type SurveyLabels = {
  questions: {
    index:   number;
    text:    string;
    options: Record<string, string>; // option ID → display label
  }[];
};

// ─── Fanometrix chart palette ─────────────────────────────────────────────────
// Premium, muted tones that work on white cards and remain distinguishable
// for colour-blind users. Navy (#0B1929) and Gold (#D7B87A) stay dominant.
const GOLD    = "#D7B87A"; // Q1 · By Placement · Trend line
const TEAL    = "#4FA3A5"; // Q2 · By Club
const SLATE   = "#6B7A99"; // Q3 · By Competition
const INDIGO  = "#5B6CFA"; // Q4 · By Publisher
const EMERALD = "#4FAF7B"; // By Country
const PURPLE  = "#7A63D1"; // By Fan Segment

// Cycling palette for any future chart that doesn't have a named colour
export const CHART_PALETTE = [GOLD, TEAL, SLATE, INDIGO, EMERALD, PURPLE];

// Helper — convert 6-digit hex to rgba string
function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Responses Over Time ─────────────────────────────────────────────────────
// Line: Gold  |  Area fill: 15% Gold  |  Dots: Navy with Gold border

function ResponsesOverTime({ responses }: { responses: SurveyResponse[] }) {
  // Short date ranges are bucketed by HOUR so a single day of collection doesn't
  // collapse to one or two daily points; wider ranges stay daily. The threshold
  // is driven by the actual span of the data in view (≤ 48h → hourly).
  const { data, granularity } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const r of responses) {
      const t = new Date(r.created_at).getTime();
      if (Number.isNaN(t)) continue;
      if (t < min) min = t;
      if (t > max) max = t;
    }
    const spanHours = Number.isFinite(min) && Number.isFinite(max) ? (max - min) / 3_600_000 : 0;
    const byHour = spanHours <= 48;

    const m: Record<string, number> = {};
    for (const r of responses) {
      // ISO created_at ("YYYY-MM-DDTHH:mm:ss…"): slice to the hour or to the day.
      const key = byHour ? r.created_at.slice(0, 13) : r.created_at.slice(0, 10);
      m[key] = (m[key] ?? 0) + 1;
    }
    const rows = Object.entries(m).sort().map(([bucket, count]) => ({ bucket, count }));
    return { data: rows, granularity: byHour ? ("hour" as const) : ("day" as const) };
  }, [responses]);

  if (data.length < 2) return null;

  // Axis ticks stay compact; the tooltip carries the full date + time. Daily
  // labels are unchanged from before ("YYYY-MM-DD"); hourly show "HH:00".
  const fmtTick  = (v: string) => granularity === "hour" ? `${v.slice(11, 13)}:00` : v;
  const fmtLabel = (v: unknown) => {
    const s = String(v ?? "");
    return granularity === "hour" ? `${s.slice(0, 10)} · ${s.slice(11, 13)}:00` : s;
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 mb-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Responses Over Time
        <span className="ml-2 normal-case tracking-normal font-normal text-gray-300">· {granularity === "hour" ? "hourly" : "daily"}</span>
      </h3>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="goldAreaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={GOLD} stopOpacity={0.15} />
              <stop offset="95%" stopColor={GOLD} stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8eaf0" />
          <XAxis dataKey="bucket" tick={{ fontSize: 9 }} interval="preserveStartEnd" tickFormatter={fmtTick} />
          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
          <RTooltip contentStyle={{ fontSize: 11 }} labelFormatter={fmtLabel} />
          <Area
            type="monotone"
            dataKey="count"
            stroke={GOLD}
            strokeWidth={2}
            fill="url(#goldAreaFill)"
            dot={data.length < 20
              ? { fill: "#0B1929", stroke: GOLD, strokeWidth: 1.5, r: 3 }
              : false
            }
            activeDot={{ r: 4, fill: GOLD, stroke: "#0B1929", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Q answer chart ───────────────────────────────────────────────────────────
// color prop determines the progress bar and active-row tint for each question.

function QChart({
  label, responses, field, color, activeValue, onFilter, optionMap,
}: {
  label: string;
  responses: SurveyResponse[];
  field: "q1" | "q2" | "q3" | "q4";
  color: string;
  activeValue: string;
  onFilter: (value: string) => void;
  optionMap?: Record<string, string>; // option ID → display label
}) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of responses) {
      const raw = (r[field as keyof SurveyResponse] as string) ?? "Not answered";
      // Resolve stored ID to display label if optionMap provided
      const v = (optionMap && optionMap[raw]) ? optionMap[raw] : raw;
      m[v] = (m[v] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [responses, field, optionMap]);

  const total = responses.length;
  if (!total) return null;

  const activeBg = rgba(color, 0.08);

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 flex flex-col h-full overflow-x-hidden">
      {/* Colour accent bar at top — visual section identity */}
      <div className="h-0.5 rounded-full mb-3 flex-shrink-0" style={{ background: color }} />
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex-shrink-0">
        {label}
      </h3>

      {/* Answer list */}
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[280px] md:max-h-none">
        {counts.map(([opt, count]) => {
          const pct    = Math.round((count / total) * 100);
          const active = activeValue === opt;
          return (
            <button
              key={opt}
              onClick={() => onFilter(opt)}
              className="w-full text-left rounded px-1 py-1 transition-colors block"
              style={{ background: active ? activeBg : undefined }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#f9fafb"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div className="flex items-center gap-2 text-xs w-full overflow-hidden">
                <span
                  className={`flex-1 min-w-0 truncate ${
                    active ? "font-semibold text-[#0B1929]" : "text-gray-700"
                  }`}
                  title={opt}
                >
                  {opt}
                </span>
                <span className="text-gray-400 whitespace-nowrap flex-shrink-0 tabular-nums">
                  {count} ({pct}%)
                </span>
              </div>
              <div className="h-1 md:h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: color,
                    opacity: active ? 1 : 0.75,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {activeValue && (
        <p
          className="text-xs mt-2 text-center cursor-pointer flex-shrink-0 hover:opacity-75 transition-opacity"
          style={{ color }}
          onClick={() => onFilter("")}
        >
          ✕ Clear filter
        </p>
      )}
    </div>
  );
}

// ─── Chart metric types ───────────────────────────────────────────────────────

export type ChartMetric =
  | "responses"
  | "completed"
  | "completion_rate";

export const CHART_METRICS: { key: ChartMetric; label: string }[] = [
  { key: "responses",       label: "Responses"           },
  { key: "completed",       label: "Completed Responses" },
  { key: "completion_rate", label: "Completion Rate"     },
];

// ─── Dimension bar chart ──────────────────────────────────────────────────────

function DimChart({
  label, responses, field, color, activeValue, onFilter, metric = "responses",
}: {
  label: string;
  responses: SurveyResponse[];
  field: keyof SurveyResponse;
  color: string;
  activeValue: string;
  onFilter: (value: string) => void;
  metric?: ChartMetric;
}) {
  const data = useMemo(() => {
    const totals:    Record<string, number> = {};
    const completed: Record<string, number> = {};
    for (const r of responses) {
      const v = (r[field] as string) || "Unknown";
      totals[v]    = (totals[v]    ?? 0) + 1;
      if (r.q1 && r.q2 && r.q3) completed[v] = (completed[v] ?? 0) + 1;
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([fullName, total]) => {
        const done  = completed[fullName] ?? 0;
        const value = metric === "completion_rate"
          ? (total > 0 ? Math.round((done / total) * 100) : 0)
          : metric === "completed"
          ? done
          : total;
        return {
          name: fullName.length > 16 ? fullName.slice(0, 15) + "…" : fullName,
          fullName,
          value,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [responses, field, metric]);

  if (!data.length) return null;

  const chartH = Math.max(80, data.length * 26 + 24);

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 md:p-5 flex flex-col h-full overflow-x-hidden">
      <div className="h-0.5 rounded-full mb-3 flex-shrink-0" style={{ background: color }} />
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex-shrink-0">
        {label}
      </h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ left: 0, right: 28, top: 0, bottom: 0 }}
          >
            <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 9 }}
              width={80}
              axisLine={false}
              tickLine={false}
            />
            <RTooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(v) => [
                metric === "completion_rate" ? `${v}%` : v,
                metric === "completion_rate" ? "Completion Rate"
                  : metric === "completed"   ? "Completed"
                  : "Responses",
              ]}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer"
              label={{ position: "right", fontSize: 9, fill: "#9ca3af" }}>
              {data.map((d) => (
                <Cell
                  key={d.fullName}
                  fill={color}
                  fillOpacity={activeValue && d.fullName !== activeValue ? 0.25 : 0.85}
                  onClick={() => onFilter(activeValue === d.fullName ? "" : d.fullName)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {activeValue && (
        <p
          className="text-xs mt-2 text-center cursor-pointer flex-shrink-0 hover:opacity-75 transition-opacity"
          style={{ color }}
          onClick={() => onFilter("")}
        >
          ✕ Clear filter
        </p>
      )}
    </div>
  );
}

// ─── Horizontal scroll row ────────────────────────────────────────────────────

function HScrollRow({
  children, cols = 3, minCardW = 300, title, className = "",
}: {
  children: React.ReactNode;
  cols?: 2 | 3;
  minCardW?: number;
  title?: string;
  className?: string;
}) {
  const items = Array.isArray(children) ? children : (children != null ? [children] : []);
  const hasMultiple = items.length > 1;
  const scrollRef   = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const step = minCardW + 12;
    const idx  = Math.min(Math.round(el.scrollLeft / step), items.length - 1);
    setActiveIdx(idx);
  }

  return (
    <div className={className}>
      <div className="md:hidden mb-2">
        {title && <p className="text-sm font-semibold text-gray-800 mb-0.5">{title}</p>}
        {hasMultiple && <p className="text-xs text-gray-400">Swipe cards →</p>}
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="overflow-x-auto snap-x snap-mandatory pb-2 md:pb-0"
        >
          <div className={`flex items-stretch gap-3 md:gap-4 ${
            cols === 3 ? "md:grid md:grid-cols-3" : "md:grid md:grid-cols-2"
          }`}>
            {items.map((child, i) => (
              <div
                key={i}
                className="flex-shrink-0 snap-start md:min-w-0 flex flex-col"
                style={{ minWidth: minCardW, width: minCardW }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>
        {hasMultiple && activeIdx < items.length - 1 && (
          <div className="md:hidden pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-gray-50/95 to-transparent" />
        )}
      </div>

      {hasMultiple && (
        <div className="md:hidden flex items-center justify-center gap-2 mt-2">
          {items.map((_, i) => (
            <button
              key={i}
              aria-label={`Card ${i + 1}`}
              onClick={() => {
                const el = scrollRef.current;
                if (!el) return;
                el.scrollTo({ left: i * (minCardW + 12), behavior: "smooth" });
                setActiveIdx(i);
              }}
              className={`rounded-full transition-all duration-200 ${
                i === activeIdx
                  ? "w-5 h-1.5 bg-[#0B1929]"
                  : "w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Data definitions with semantic colours ───────────────────────────────────

const Q_LABELS = [
  { field: "q1" as const, label: "Q1 · Live Event Attendance",   color: GOLD   },
  { field: "q2" as const, label: "Q2 · Fan Experience Rating",   color: TEAL   },
  { field: "q3" as const, label: "Q3 · Likelihood to Recommend", color: SLATE  },
];

const DIM_ROWS: {
  field: keyof SurveyResponse;
  label: string;
  filterKey: keyof DashFilters;
  color: string;
}[][] = [
  [
    { field: "country",    label: "By Country",    filterKey: "country",   color: EMERALD },
    { field: "publisher",  label: "By Publisher",  filterKey: "publisher", color: INDIGO  },
    { field: "placement",  label: "By Placement",  filterKey: "placement", color: GOLD    },
  ],
  [
    { field: "club",        label: "By Club",        filterKey: "club",        color: TEAL   },
    { field: "competition", label: "By Competition", filterKey: "competition", color: SLATE  },
    { field: "fan_segment", label: "By Fan Segment", filterKey: "fan_segment", color: PURPLE },
  ],
  // Creative Lab groupings — creative_id and device enable A/B and cross-device analysis
  [
    { field: "creative_id", label: "By Creative",  filterKey: "placement", color: INDIGO  },
    { field: "device",      label: "By Device",    filterKey: "device",    color: TEAL    },
    { field: "browser",     label: "By Browser",   filterKey: "browser",   color: SLATE   },
  ],
];

const DIM_TITLES = ["Geographic & Publisher", "Club, Competition & Audience", "Creative & Device"];

// ─── Main ChartGrid ───────────────────────────────────────────────────────────

export function ChartGrid({
  responses,
  filters,
  onFilter,
  surveyLabels,
}: {
  responses: SurveyResponse[];
  filters: DashFilters;
  onFilter: (field: keyof DashFilters, value: string) => void;
  surveyLabels?: SurveyLabels | null;
}) {
  const [metric, setMetric] = useState<ChartMetric>("responses");

  if (!responses.length) return null;

  const hasScope = !!(filters.campaign_id || filters.survey_id || filters.group_id);

  const qLabels = Q_LABELS.map((q, i) => {
    const sq = surveyLabels?.questions[i];
    return {
      ...q,
      label: sq ? `Q${i + 1} · ${sq.text}` : q.label,
      optionMap: sq?.options,
    };
  });

  return (
    <div className="space-y-6">

      {/* ── What Fans Are Saying — the research itself ───────────────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          What Fans Are Saying
        </h2>
        {hasScope ? (
          <HScrollRow cols={3} minCardW={320}>
            {qLabels.map(({ field, label, color, optionMap }) => (
              <QChart
                key={field}
                label={label}
                color={color}
                responses={responses}
                field={field}
                activeValue={filters[field]}
                onFilter={(v) => onFilter(field, v)}
                optionMap={optionMap}
              />
            ))}
          </HScrollRow>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
            <p className="text-sm text-gray-400">
              Select a campaign, survey or campaign group above to see question-level results.
              Q1/Q2/Q3 answers differ between surveys, mixing them across all campaigns produces meaningless data.
            </p>
          </div>
        )}
      </div>

      {/* ── Explore The Data — trend + distribution breakdowns ───────────── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Explore The Data
        </h2>

        <ResponsesOverTime responses={responses} />

        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Distribution Charts
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1">Metric:</span>
            {CHART_METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className="text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
                style={{
                  background: metric === m.key ? "#0B1929" : "#F3F4F6",
                  color:      metric === m.key ? "#D7B87A" : "#6B7280",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {DIM_ROWS.map((row, ri) => (
            <HScrollRow key={ri} title={DIM_TITLES[ri]} cols={3} minCardW={300}>
              {row.map(({ field, label, filterKey, color }) => (
                <DimChart
                  key={field as string}
                  label={label}
                  color={color}
                  responses={responses}
                  field={field}
                  metric={metric}
                  activeValue={filters[filterKey] ?? ""}
                  onFilter={(v) => onFilter(filterKey, v)}
                />
              ))}
            </HScrollRow>
          ))}
        </div>
      </div>
    </div>
  );
}
