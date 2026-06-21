"use client";

import { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import type { SurveyResponse } from "@/lib/types";
import type { DashFilters } from "./DashboardFilters";

// ─── Responses Over Time ─────────────────────────────────────────────────────

function ResponsesOverTime({ responses }: { responses: SurveyResponse[] }) {
  const data = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of responses) {
      const d = r.created_at.slice(0, 10);
      m[d] = (m[d] ?? 0) + 1;
    }
    return Object.entries(m).sort().map(([date, count]) => ({ date, count }));
  }, [responses]);

  if (data.length < 2) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 mb-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Responses Over Time</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" />
          <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9 }} allowDecimals={false} />
          <RTooltip contentStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="count" stroke="#D7B87A" strokeWidth={2}
            dot={data.length < 20 ? { fill: "#D7B87A", stroke: "#D7B87A", r: 3 } : false}
            activeDot={{ r: 4, fill: "#D7B87A", stroke: "#D7B87A" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Q answer chart ───────────────────────────────────────────────────────────
// On mobile: compact spacing, internal scroll if many options, h-full for row alignment.
// On desktop: unchanged spacing.

function QChart({
  label, responses, field, activeValue, onFilter,
}: {
  label: string;
  responses: SurveyResponse[];
  field: "q1" | "q2" | "q3";
  activeValue: string;
  onFilter: (value: string) => void;
}) {
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of responses) {
      const v = (r[field] as string) ?? "Not answered";
      m[v] = (m[v] ?? 0) + 1;
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [responses, field]);

  const total = responses.length;
  if (!total) return null;

  return (
    // h-full lets items-stretch in the scroll row keep all Q cards the same height.
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 flex flex-col h-full">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex-shrink-0">
        {label}
      </h3>

      {/* Answer list — capped height on mobile with internal scroll if > 4 options */}
      <div className="flex-1 overflow-y-auto space-y-1.5 md:space-y-2 max-h-[300px] md:max-h-none">
        {counts.map(([opt, count]) => {
          const pct    = Math.round((count / total) * 100);
          const active = activeValue === opt;
          return (
            <button
              key={opt}
              onClick={() => onFilter(opt)}
              className={`w-full text-left rounded px-1 py-0.5 transition-colors ${
                active ? "bg-[rgba(215,184,122,0.08)]" : "hover:bg-gray-50"
              }`}
            >
              {/* Label + count — wraps cleanly if text is long */}
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs mb-0.5">
                <span className={`break-words min-w-0 ${active ? "font-semibold text-[#0B1929]" : "text-gray-700"}`}>
                  {opt}
                </span>
                <span className="text-gray-400 whitespace-nowrap flex-shrink-0">
                  {count} ({pct}%)
                </span>
              </div>
              {/* Slightly thinner bar on mobile */}
              <div className="h-1 md:h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: "#D7B87A" }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {activeValue && (
        <p className="text-xs mt-2 text-center cursor-pointer text-[#D7B87A] hover:text-[#C9A766] flex-shrink-0"
          onClick={() => onFilter("")}>
          ✕ Clear filter
        </p>
      )}
    </div>
  );
}

// ─── Dimension bar chart ──────────────────────────────────────────────────────

function DimChart({
  label, responses, field, activeValue, onFilter,
}: {
  label: string;
  responses: SurveyResponse[];
  field: keyof SurveyResponse;
  activeValue: string;
  onFilter: (value: string) => void;
}) {
  const data = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of responses) {
      const v = (r[field] as string) || "Unknown";
      m[v] = (m[v] ?? 0) + 1;
    }
    return Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([fullName, value]) => ({
        name: fullName.length > 18 ? fullName.slice(0, 17) + "…" : fullName,
        fullName,
        value,
      }));
  }, [responses, field]);

  if (!data.length) return null;

  const chartH = Math.max(80, data.length * 26 + 24);

  return (
    // h-full for consistent row height via items-stretch
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 flex flex-col h-full">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex-shrink-0">
        {label}
      </h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart
            layout="vertical"
            data={data}
            margin={{ left: 0, right: 32, top: 0, bottom: 0 }}
          >
            <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} axisLine={false} tickLine={false} />
            <RTooltip contentStyle={{ fontSize: 11 }} formatter={(v) => [v, "Responses"]} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} cursor="pointer"
              label={{ position: "right", fontSize: 9, fill: "#9ca3af" }}>
              {data.map((d) => (
                <Cell
                  key={d.fullName}
                  fill="#D7B87A"
                  opacity={activeValue && d.fullName !== activeValue ? 0.35 : 1}
                  onClick={() => onFilter(activeValue === d.fullName ? "" : d.fullName)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {activeValue && (
        <p className="text-xs mt-2 text-center cursor-pointer text-[#D7B87A] hover:text-[#C9A766] flex-shrink-0"
          onClick={() => onFilter("")}>
          ✕ Clear filter
        </p>
      )}
    </div>
  );
}

// ─── Horizontal scroll row ────────────────────────────────────────────────────
/*
  Mobile:  overflow-x-auto + snap-x, cards at minCardW, swipe hint + right gradient.
  Desktop: switches to standard CSS grid (md:grid md:grid-cols-N).

  Right-edge gradient: indicates more content without UI chrome.
  Swipe hint: simple "Swipe to see more →" text, hidden on md+.
  items-stretch on the flex row keeps all cards in a row the same height.
*/
function HScrollRow({
  children,
  cols = 3,
  minCardW = 260,
  className = "",
}: {
  children: React.ReactNode;
  cols?: 2 | 3;
  minCardW?: number;
  className?: string;
}) {
  const items = Array.isArray(children) ? children : (children != null ? [children] : []);
  const hasMultiple = items.length > 1;

  return (
    <div className={`relative ${className}`}>
      {/* Swipe hint — mobile only, only when there's something to scroll to */}
      {hasMultiple && (
        <p className="md:hidden text-xs text-gray-400 mb-1.5 flex items-center justify-end gap-1 select-none">
          Swipe to see more →
        </p>
      )}

      {/* Scroll container */}
      <div className="overflow-x-auto snap-x snap-mandatory pb-2 md:pb-0">
        <div
          className={`flex items-stretch gap-3 md:gap-4 ${
            cols === 3 ? "md:grid md:grid-cols-3" : "md:grid md:grid-cols-2"
          }`}
        >
          {items.map((child, i) => (
            <div
              key={i}
              className="flex-shrink-0 snap-start md:min-w-0 flex flex-col"
              style={{ minWidth: minCardW }}
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {/* Right-edge gradient fade — tells users there's more to swipe to */}
      {hasMultiple && (
        <div
          className="md:hidden pointer-events-none absolute right-0 bottom-2 w-12 bg-gradient-to-l from-gray-50/90 to-transparent"
          // top offset accounts for the hint text above the scroll area
          style={{ top: "1.5rem" }}
        />
      )}
    </div>
  );
}

// ─── Main ChartGrid ───────────────────────────────────────────────────────────

const Q_LABELS = [
  { field: "q1" as const, label: "Q1 · Live Event Attendance" },
  { field: "q2" as const, label: "Q2 · Fan Experience Rating" },
  { field: "q3" as const, label: "Q3 · Likelihood to Recommend" },
];

const DIM_ROWS: { field: keyof SurveyResponse; label: string; filterKey: keyof DashFilters }[][] = [
  [
    { field: "country",     label: "By Country",     filterKey: "country"     },
    { field: "publisher",   label: "By Publisher",   filterKey: "publisher"   },
    { field: "placement",   label: "By Placement",   filterKey: "placement"   },
  ],
  [
    { field: "club",        label: "By Club",        filterKey: "club"        },
    { field: "competition", label: "By Competition", filterKey: "competition" },
    { field: "fan_segment", label: "By Fan Segment", filterKey: "fan_segment" },
  ],
];

export function ChartGrid({
  responses,
  filters,
  onFilter,
}: {
  responses: SurveyResponse[];
  filters: DashFilters;
  onFilter: (field: keyof DashFilters, value: string) => void;
}) {
  if (!responses.length) return null;

  return (
    <div className="space-y-4">
      {/* Responses over time — full width, no horizontal scroll */}
      <ResponsesOverTime responses={responses} />

      {/* Q1 / Q2 / Q3 result cards — 280px min on mobile, snap scroll */}
      <HScrollRow cols={3} minCardW={280}>
        {Q_LABELS.map(({ field, label }) => (
          <QChart
            key={field}
            label={label}
            responses={responses}
            field={field}
            activeValue={filters[field]}
            onFilter={(v) => onFilter(field, v)}
          />
        ))}
      </HScrollRow>

      {/* Dimension breakdown rows — 260px min on mobile */}
      {DIM_ROWS.map((row, ri) => (
        <HScrollRow key={ri} cols={3} minCardW={260}>
          {row.map(({ field, label, filterKey }) => (
            <DimChart
              key={field as string}
              label={label}
              responses={responses}
              field={field}
              activeValue={filters[filterKey]}
              onFilter={(v) => onFilter(filterKey, v)}
            />
          ))}
        </HScrollRow>
      ))}
    </div>
  );
}
