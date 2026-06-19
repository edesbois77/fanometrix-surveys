"use client";

import { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import type { SurveyResponse } from "@/lib/types";
import type { DashFilters } from "./DashboardFilters";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981", "#f43f5e", "#84cc16", "#ec4899"];
const ACTIVE  = "#312e81";

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
          <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={data.length < 20} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Clickable simple bar (Q answers) ────────────────────────────────────────

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
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</h3>
      <div className="space-y-2">
        {counts.map(([opt, count]) => {
          const pct = Math.round((count / total) * 100);
          const active = activeValue === opt;
          return (
            <button
              key={opt}
              onClick={() => onFilter(opt)}
              className={`w-full text-left space-y-1 group rounded-lg px-1 py-0.5 transition-colors ${active ? "bg-[rgba(215,184,122,0.08)]" : "hover:bg-gray-50"}`}
            >
              <div className="flex justify-between text-xs">
                <span className={active ? "font-semibold text-[#0B1929]" : "text-gray-700"}>{opt}</span>
                <span className="text-gray-400">{count} ({pct}%)</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: active ? ACTIVE : "#6366f1" }}
                />
              </div>
            </button>
          );
        })}
      </div>
      {activeValue && (
        <p className="text-xs mt-2 text-center cursor-pointer text-[#D7B87A] hover:text-[#C9A766]"
          onClick={() => onFilter("")}>
          ✕ Clear filter
        </p>
      )}
    </div>
  );
}

// ─── Clickable dimension chart ────────────────────────────────────────────────

function DimChart({
  label, responses, field, activeValue, onFilter, colorOffset = 0,
}: {
  label: string;
  responses: SurveyResponse[];
  field: keyof SurveyResponse;
  activeValue: string;
  onFilter: (value: string) => void;
  colorOffset?: number;
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
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</h3>
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ left: 0, right: 32, top: 0, bottom: 0 }}
          // bar clicks handled via Cell onClick below
        >
          <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={90} axisLine={false} tickLine={false} />
          <RTooltip
            contentStyle={{ fontSize: 11 }}
            formatter={(v) => [v, "Responses"]}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            label={{ position: "right", fontSize: 9, fill: "#9ca3af" }}
          >
            {data.map((d, i) => (
              <Cell
                key={d.fullName}
                fill={d.fullName === activeValue ? ACTIVE : COLORS[(i + colorOffset) % COLORS.length]}
                opacity={activeValue && d.fullName !== activeValue ? 0.45 : 1}
                onClick={() => onFilter(activeValue === d.fullName ? "" : d.fullName)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {activeValue && (
        <p className="text-xs mt-2 text-center cursor-pointer text-[#D7B87A] hover:text-[#C9A766]"
          onClick={() => onFilter("")}>
          ✕ Clear filter
        </p>
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
      {/* Responses over time */}
      <ResponsesOverTime responses={responses} />

      {/* Q1 / Q2 / Q3 */}
      <div className="grid grid-cols-3 gap-4">
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
      </div>

      {/* Dimension charts */}
      {DIM_ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-3 gap-4">
          {row.map(({ field, label, filterKey }, ci) => (
            <DimChart
              key={field as string}
              label={label}
              responses={responses}
              field={field}
              activeValue={filters[filterKey]}
              onFilter={(v) => onFilter(filterKey, v)}
              colorOffset={ri * 3 + ci}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
