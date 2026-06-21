"use client";

import { useMemo, useRef, useState } from "react";
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
/*
  Mobile-specific changes:
  - overflow-x-hidden on the card prevents any child from expanding the card width
  - Each answer row uses a non-wrapping flex layout: label truncates, count stays right
  - Progress bar is full-width inside the card (not inside the label row)
  - max-h on the answer list with internal overflow-y-auto for many options
*/
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
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 flex flex-col h-full overflow-x-hidden">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex-shrink-0">
        {label}
      </h3>

      {/* Answer list — internal scroll on mobile if > 5 options */}
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[280px] md:max-h-none">
        {counts.map(([opt, count]) => {
          const pct    = Math.round((count / total) * 100);
          const active = activeValue === opt;
          return (
            <button
              key={opt}
              onClick={() => onFilter(opt)}
              className={`w-full text-left rounded px-1 py-1 transition-colors block ${
                active ? "bg-[rgba(215,184,122,0.08)]" : "hover:bg-gray-50"
              }`}
            >
              {/*
                Single-line label + count row.
                label: truncates if too long (min-w-0 + truncate allow this in flex)
                count: never wraps, always visible on the right
              */}
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
              {/* Full-width progress bar — always below the label row */}
              <div className="h-1 md:h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
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
        <p
          className="text-xs mt-2 text-center cursor-pointer text-[#D7B87A] hover:text-[#C9A766] flex-shrink-0"
          onClick={() => onFilter("")}
        >
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
        name: fullName.length > 16 ? fullName.slice(0, 15) + "…" : fullName,
        fullName,
        value,
      }));
  }, [responses, field]);

  if (!data.length) return null;

  const chartH = Math.max(80, data.length * 26 + 24);

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-4 md:p-5 flex flex-col h-full overflow-x-hidden">
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
        <p
          className="text-xs mt-2 text-center cursor-pointer text-[#D7B87A] hover:text-[#C9A766] flex-shrink-0"
          onClick={() => onFilter("")}
        >
          ✕ Clear filter
        </p>
      )}
    </div>
  );
}

// ─── Horizontal scroll row with section header + pagination dots ──────────────
/*
  Mobile:
  - Section title ("Question Results") + "Swipe cards →" hint immediately above
    the row it controls — no ambiguity about which section is scrollable
  - snap-x scroll with scroll-position tracking
  - Pagination dots update as the user scrolls (active dot = pill, others = circles)
  - Right-edge gradient fades when not at the last card
  - Card wrappers have fixed mobile width (min = max = minCardW) so card content
    cannot expand the card

  Desktop (md+):
  - Standard CSS grid, everything above hidden, unchanged behaviour
*/
function HScrollRow({
  children,
  cols = 3,
  minCardW = 300,
  title,
  className = "",
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
    // card + gap-3 (12px)
    const step = minCardW + 12;
    const idx  = Math.min(Math.round(el.scrollLeft / step), items.length - 1);
    setActiveIdx(idx);
  }

  return (
    <div className={className}>
      {/* ── Mobile-only section header ── */}
      <div className="md:hidden mb-2">
        {title && (
          <p className="text-sm font-semibold text-gray-800 mb-0.5">{title}</p>
        )}
        {hasMultiple && (
          <p className="text-xs text-gray-400">Swipe cards →</p>
        )}
      </div>

      {/* ── Scroll container ── */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="overflow-x-auto snap-x snap-mandatory pb-2 md:pb-0"
        >
          <div
            className={`flex items-stretch gap-3 md:gap-4 ${
              cols === 3 ? "md:grid md:grid-cols-3" : "md:grid md:grid-cols-2"
            }`}
          >
            {items.map((child, i) => (
              <div
                key={i}
                className="flex-shrink-0 snap-start md:min-w-0 flex flex-col"
                /*
                  Both min and max set on mobile so the card wrapper is a fixed-width
                  box. If card content is wider, overflow-x-hidden on the card clips it.
                  On desktop (md:min-w-0) the grid cell handles sizing — the inline
                  maxWidth is overridden by the grid item's sizing algorithm.
                */
                style={{ minWidth: minCardW, width: minCardW }}
              >
                {child}
              </div>
            ))}
          </div>
        </div>

        {/* Right-edge gradient — only when there are more cards to the right */}
        {hasMultiple && activeIdx < items.length - 1 && (
          <div className="md:hidden pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-gray-50/95 to-transparent" />
        )}
      </div>

      {/* ── Pagination dots ── */}
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
                  ? "w-5 h-1.5 bg-[#0B1929]"    // active: pill
                  : "w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400"  // inactive: circle
              }`}
            />
          ))}
        </div>
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

const DIM_ROWS: {
  field: keyof SurveyResponse;
  label: string;
  filterKey: keyof DashFilters;
}[][] = [
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

const DIM_TITLES = ["Geographic & Publisher", "Club, Competition & Audience"];

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

      {/* Q result cards — 320px on mobile, snap scroll */}
      <HScrollRow title="Question Results" cols={3} minCardW={320}>
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

      {/* Dimension breakdown rows — 300px on mobile */}
      {DIM_ROWS.map((row, ri) => (
        <HScrollRow key={ri} title={DIM_TITLES[ri]} cols={3} minCardW={300}>
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
