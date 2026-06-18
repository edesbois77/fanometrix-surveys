"use client";

import { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import type { SurveyResponse } from "@/lib/types";
import type { DashFilters } from "./DashboardFilters";

const COLORS = ["#D7B87A", "#4F6B8A", "#5E7E67", "#7D617D", "rgba(255,255,255,0.25)", "#8FA8C4", "#7E9E7E", "#9E8A9E"];
const ACTIVE  = "#D7B87A";
const GRID    = "rgba(255,255,255,0.06)";
const TICK    = { fontSize: 9, fill: "rgba(224,225,221,0.4)" };

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(215,184,122,0.12)",
  borderRadius: 16,
  padding: "20px",
  backdropFilter: "blur(8px)",
};

const sectionLabel: React.CSSProperties = {
  color: "rgba(215,184,122,0.55)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: 14,
};

// ─── Responses over time ──────────────────────────────────────────────────────

function ResponsesOverTime({ responses }: { responses: SurveyResponse[] }) {
  const data = useMemo(() => {
    const m: Record<string,number> = {};
    responses.forEach(r => { const d = r.created_at.slice(0,10); m[d] = (m[d]??0)+1; });
    return Object.entries(m).sort().map(([date,count]) => ({ date, count }));
  }, [responses]);
  if (data.length < 2) return null;
  return (
    <div style={{ ...card, marginBottom: 12 }}>
      <p style={sectionLabel}>Responses Over Time</p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ left: -10, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="date" tick={TICK} interval="preserveStartEnd" axisLine={false} tickLine={false} />
          <YAxis tick={TICK} allowDecimals={false} axisLine={false} tickLine={false} />
          <RTooltip contentStyle={{ background: "#07121D", border: "1px solid rgba(215,184,122,0.25)", borderRadius: 8, fontSize: 11, color: "#E0E1DD" }} />
          <Line type="monotone" dataKey="count" stroke="#D7B87A" strokeWidth={2} dot={data.length < 20} activeDot={{ r: 4, fill: "#D7B87A" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Clickable Q-answer bar ───────────────────────────────────────────────────

function QChart({ responses, field, label, activeValue, onFilter }: {
  responses: SurveyResponse[]; field: "q1"|"q2"|"q3";
  label: string; activeValue: string; onFilter: (v: string) => void;
}) {
  const counts = useMemo(() => {
    const m: Record<string,number> = {};
    for (const r of responses) { const v = r[field] ?? "Not answered"; m[v] = (m[v]??0)+1; }
    return Object.entries(m).sort((a,b) => b[1]-a[1]);
  }, [responses, field]);
  const total = responses.length;
  if (!counts.length) return null;
  return (
    <div style={card}>
      <p style={sectionLabel}>{label}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {counts.map(([opt, count]) => {
          const pct = Math.round(count / total * 100);
          const active = activeValue === opt;
          return (
            <button key={opt} onClick={() => onFilter(opt)} style={{
              background: active ? "rgba(215,184,122,0.08)" : "none",
              border: "none", borderRadius: 8, padding: "4px 4px",
              cursor: "pointer", textAlign: "left", width: "100%",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: active ? "#D7B87A" : "#E0E1DD", fontWeight: active ? 600 : 400 }}>{opt}</span>
                <span style={{ color: "rgba(224,225,221,0.4)" }}>{count} ({pct}%)</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: active ? "#D7B87A" : "rgba(215,184,122,0.4)", borderRadius: 2 }} />
              </div>
            </button>
          );
        })}
      </div>
      {activeValue && (
        <button onClick={() => onFilter("")} style={{ fontSize: 10, color: "rgba(215,184,122,0.5)", background: "none", border: "none", cursor: "pointer", marginTop: 8 }}>
          ✕ Clear filter
        </button>
      )}
    </div>
  );
}

// ─── Clickable dimension bar ──────────────────────────────────────────────────

function DimChart({ responses, field, label, activeValue, onFilter, colorOffset = 0 }: {
  responses: SurveyResponse[]; field: keyof SurveyResponse; label: string;
  activeValue: string; onFilter: (v: string) => void; colorOffset?: number;
}) {
  const data = useMemo(() => {
    const m: Record<string,number> = {};
    for (const r of responses) { const v = r[field] as string || "Unknown"; m[v] = (m[v]??0)+1; }
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([fullName,value]) => ({
      name: fullName.length > 18 ? fullName.slice(0,17)+"…" : fullName, fullName, value,
    }));
  }, [responses, field]);

  if (!data.length) return (
    <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 100 }}>
      <p style={{ fontSize: 11, color: "rgba(224,225,221,0.2)" }}>No {label.toLowerCase()} data</p>
    </div>
  );

  return (
    <div style={card}>
      <p style={sectionLabel}>{label}</p>
      <ResponsiveContainer width="100%" height={Math.max(80, data.length * 26 + 20)}>
        <BarChart layout="vertical" data={data} margin={{ left: 0, right: 36, top: 0, bottom: 0 }}>
          <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={TICK} width={92} axisLine={false} tickLine={false} />
          <RTooltip contentStyle={{ background: "#07121D", border: "1px solid rgba(215,184,122,0.25)", borderRadius: 8, fontSize: 11, color: "#E0E1DD" }}
            formatter={(v) => [v, "Responses"]} />
          <Bar dataKey="value" radius={[0,4,4,0]} cursor="pointer" label={{ position: "right", fontSize: 9, fill: "rgba(224,225,221,0.35)" }}>
            {data.map((d, i) => (
              <Cell key={d.fullName}
                fill={d.fullName === activeValue ? ACTIVE : COLORS[(i + colorOffset) % COLORS.length]}
                opacity={activeValue && d.fullName !== activeValue ? 0.35 : 1}
                onClick={() => onFilter(activeValue === d.fullName ? "" : d.fullName)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {activeValue && (
        <button onClick={() => onFilter("")} style={{ fontSize: 10, color: "rgba(215,184,122,0.5)", background: "none", border: "none", cursor: "pointer", marginTop: 8 }}>
          ✕ Clear filter
        </button>
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

export function ChartGrid({ responses, filters, onFilter }: {
  responses: SurveyResponse[]; filters: DashFilters;
  onFilter: (field: keyof DashFilters, value: string) => void;
}) {
  if (!responses.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
      <ResponsesOverTime responses={responses} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {Q_LABELS.map(({ field, label }) => (
          <QChart key={field} label={label} responses={responses} field={field}
            activeValue={filters[field]} onFilter={v => onFilter(field, v)} />
        ))}
      </div>

      {DIM_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {row.map(({ field, label, filterKey }, ci) => (
            <DimChart key={String(field)} label={label} responses={responses} field={field}
              activeValue={filters[filterKey]} colorOffset={ri*3+ci}
              onFilter={v => onFilter(filterKey, v)} />
          ))}
        </div>
      ))}
    </div>
  );
}
