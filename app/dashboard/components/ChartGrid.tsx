"use client";

import { useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
} from "recharts";
import type { SurveyResponse } from "@/lib/types";
import type { DashFilters } from "./DashboardFilters";

// Navy primary, grey secondaries, gold only for active/selected
const COLORS  = ["#0B1929","#4F6B8A","#6B8A6B","#8A6B8A","#8899A6","#A8B8C4","#B8C8D4","#C4B4C4"];
const ACTIVE  = "#D7B87A"; // gold for selected items only
const GRID    = "rgba(11,25,41,0.05)";
const TICK    = { fontSize: 9, fill: "rgba(11,25,41,0.4)" };
const TT      = { background:"#FFFFFF", border:"1px solid rgba(11,25,41,0.12)", borderRadius:8, fontSize:11, color:"#0B1929", boxShadow:"0 4px 16px rgba(11,25,41,0.1)" };

const card: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid rgba(11,25,41,0.08)",
  borderRadius: 16,
  padding: "20px",
  boxShadow: "0 4px 20px rgba(11,25,41,0.06)",
};

const sLabel: React.CSSProperties = {
  color: "#D7B87A", fontSize: 9, fontWeight: 700,
  letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 14,
};

// ─── Responses Over Time ──────────────────────────────────────────────────────

function ResponsesOverTime({ responses }: { responses: SurveyResponse[] }) {
  const data = useMemo(() => {
    const m: Record<string,number> = {};
    responses.forEach(r => { const d = r.created_at.slice(0,10); m[d] = (m[d]??0)+1; });
    return Object.entries(m).sort().map(([date,count]) => ({ date, count }));
  }, [responses]);
  if (data.length < 2) return null;
  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <p style={sLabel}>Responses Over Time</p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data} margin={{ left:-10, right:8, top:4, bottom:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
          <XAxis dataKey="date" tick={TICK} interval="preserveStartEnd" axisLine={false} tickLine={false} />
          <YAxis tick={TICK} allowDecimals={false} axisLine={false} tickLine={false} />
          <RTooltip contentStyle={TT} />
          <Line type="monotone" dataKey="count" stroke="#0B1929" strokeWidth={2}
            dot={data.length < 20} activeDot={{ r: 4, fill: "#D7B87A", stroke: "#D7B87A" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Clickable Q bar ─────────────────────────────────────────────────────────

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
      <p style={sLabel}>{label}</p>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {counts.map(([opt, count]) => {
          const pct = Math.round(count / total * 100);
          const active = activeValue === opt;
          return (
            <button key={opt} onClick={() => onFilter(opt)} style={{
              background: active ? "rgba(215,184,122,0.08)" : "none", border:"none",
              borderRadius:8, padding:"4px 4px", cursor:"pointer", textAlign:"left", width:"100%",
            }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                <span style={{ color:active?"#0B1929":"#5F6670", fontWeight:active?600:400 }}>{opt}</span>
                <span style={{ color:"#5F6670" }}>{count} ({pct}%)</span>
              </div>
              <div style={{ height:4, background:"rgba(11,25,41,0.07)", borderRadius:2, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background: active ? "#D7B87A" : "#0B1929", borderRadius:2, opacity: active ? 1 : 0.7 }} />
              </div>
            </button>
          );
        })}
      </div>
      {activeValue && (
        <button onClick={() => onFilter("")} style={{ fontSize:10, color:"#D7B87A", background:"none", border:"none", cursor:"pointer", marginTop:8 }}>
          ✕ Clear filter
        </button>
      )}
    </div>
  );
}

// ─── Clickable dimension chart ────────────────────────────────────────────────

function DimChart({ responses, field, label, activeValue, onFilter, colorOffset=0 }: {
  responses: SurveyResponse[]; field: keyof SurveyResponse; label: string;
  activeValue: string; onFilter: (v: string) => void; colorOffset?: number;
}) {
  const data = useMemo(() => {
    const m: Record<string,number> = {};
    for (const r of responses) { const v = r[field] as string || "Unknown"; m[v] = (m[v]??0)+1; }
    return Object.entries(m).sort((a,b) => b[1]-a[1]).slice(0,10).map(([fullName, value]) => ({
      name: fullName.length > 18 ? fullName.slice(0,17)+"…" : fullName, fullName, value,
    }));
  }, [responses, field]);

  if (!data.length) return (
    <div style={{ ...card, display:"flex", alignItems:"center", justifyContent:"center", minHeight:100 }}>
      <p style={{ fontSize:11, color:"rgba(11,25,41,0.25)" }}>No {label.toLowerCase()} data</p>
    </div>
  );

  return (
    <div style={card}>
      <p style={sLabel}>{label}</p>
      <ResponsiveContainer width="100%" height={Math.max(80, data.length * 26 + 20)}>
        <BarChart layout="vertical" data={data} margin={{ left:0, right:36, top:0, bottom:0 }}>
          <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={TICK} width={90} axisLine={false} tickLine={false} />
          <RTooltip contentStyle={TT} formatter={v => [v, "Responses"]} />
          <Bar dataKey="value" radius={[0,4,4,0]} cursor="pointer"
            label={{ position:"right", fontSize:9, fill:"rgba(11,25,41,0.3)" }}>
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
        <button onClick={() => onFilter("")} style={{ fontSize:10, color:"#D7B87A", background:"none", border:"none", cursor:"pointer", marginTop:8 }}>
          ✕ Clear filter
        </button>
      )}
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

const Q_LABELS = [
  { field: "q1" as const, label: "Q1 · Live Event Attendance"    },
  { field: "q2" as const, label: "Q2 · Fan Experience Rating"    },
  { field: "q3" as const, label: "Q3 · Likelihood to Recommend"  },
];

const DIM_ROWS: { field: keyof SurveyResponse; label: string; filterKey: keyof DashFilters }[][] = [
  [
    { field:"country",     label:"By Country",     filterKey:"country"     },
    { field:"publisher",   label:"By Publisher",   filterKey:"publisher"   },
    { field:"placement",   label:"By Placement",   filterKey:"placement"   },
  ],
  [
    { field:"club",        label:"By Club",        filterKey:"club"        },
    { field:"competition", label:"By Competition", filterKey:"competition" },
    { field:"fan_segment", label:"By Fan Segment", filterKey:"fan_segment" },
  ],
];

export function ChartGrid({ responses, filters, onFilter }: {
  responses: SurveyResponse[]; filters: DashFilters;
  onFilter: (field: keyof DashFilters, value: string) => void;
}) {
  if (!responses.length) return null;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:20 }}>
      <ResponsesOverTime responses={responses} />

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
        {Q_LABELS.map(({ field, label }) => (
          <QChart key={field} label={label} responses={responses} field={field}
            activeValue={filters[field]} onFilter={v => onFilter(field, v)} />
        ))}
      </div>

      {DIM_ROWS.map((row, ri) => (
        <div key={ri} style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
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
