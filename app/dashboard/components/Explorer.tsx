"use client";

import { useState, useMemo, useEffect } from "react";
import Papa from "papaparse";
import {
  PieChart, Pie, Cell, Tooltip as RTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  BarChart, Bar,
} from "recharts";
import type { SurveyResponse } from "@/lib/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = ["#D7B87A","#4F6B8A","#5E7E67","#7D617D","rgba(255,255,255,0.25)","#8FA8C4","#7E9E7E","#9E8A9E"];
const ACTIVE  = "#D7B87A";
const GRID    = "rgba(255,255,255,0.06)";
const TICK    = { fontSize: 9, fill: "rgba(224,225,221,0.4)" };
const TT      = { background:"#07121D", border:"1px solid rgba(215,184,122,0.25)", borderRadius:8, fontSize:11, color:"#E0E1DD" };

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
  "campaign_id","publisher","placement","club","competition","country","fan_segment",
];
const DIM_LABELS: Partial<Record<keyof SurveyResponse,string>> = {
  campaign_id:"Campaign", publisher:"Publisher", placement:"Placement",
  club:"Club", competition:"Competition", country:"Country", fan_segment:"Fan Segment",
};
const PAGE_SIZE = 10;

// ─── Styles ──────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(215,184,122,0.12)",
  borderRadius: 16,
  backdropFilter: "blur(8px)",
  overflow: "hidden",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(215,184,122,0.15)",
  borderRadius: 8, padding: "6px 10px",
  fontSize: 11, color: "#E0E1DD", outline: "none",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type Filters = {
  campaign_id: string; publisher: string; placement: string; club: string;
  competition: string; country: string; fan_segment: string;
  device: string; browser: string; date_from: string; date_to: string;
};
type SortCol = "key"|"responses"|"completionRate"|"avgDuration";
type GroupedRow = {
  key: string; dims: Partial<Record<keyof SurveyResponse,string>>;
  responses: number; completionRate: number; avgDuration: number|null;
  rows: SurveyResponse[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: Filters = {
  campaign_id:"",publisher:"",placement:"",club:"",competition:"",country:"",
  fan_segment:"",device:"",browser:"",date_from:"",date_to:"",
};

function loadLS<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch { return fb; }
}

function applyFilters(data: SurveyResponse[], f: Filters): SurveyResponse[] {
  return data.filter(r => {
    for (const { field } of FILTER_FIELDS) {
      const fv = f[field as keyof Filters]; if (fv && r[field] !== fv) return false;
    }
    if (f.date_from && r.created_at < f.date_from) return false;
    if (f.date_to   && r.created_at > f.date_to + "T23:59:59") return false;
    return true;
  });
}

function buildGroups(data: SurveyResponse[], field: string): GroupedRow[] {
  const map = new Map<string,SurveyResponse[]>();
  for (const r of data) {
    const key = (r[field as keyof SurveyResponse] as string) || "Unknown";
    if (!map.has(key)) map.set(key,[]);
    map.get(key)!.push(r);
  }
  return Array.from(map.entries()).map(([key,rows]) => {
    const dur = rows.map(r=>r.response_duration_seconds).filter((n):n is number=>n!==null);
    const dims: Partial<Record<keyof SurveyResponse,string>> = {};
    for (const col of DIM_COLS) {
      const vals=[...new Set(rows.map(r=>r[col] as string).filter(Boolean))];
      dims[col]=vals.length===0?"—":vals.length===1?vals[0]:vals.length===2?`${vals[0]} (+1)`:`Multiple (${vals.length})`;
    }
    return { key, dims, responses:rows.length,
      completionRate: rows.filter(r=>r.q1&&r.q2&&r.q3).length/rows.length,
      avgDuration: dur.length ? Math.round(dur.reduce((a,b)=>a+b,0)/dur.length) : null,
      rows };
  });
}

function tallyField(rows: SurveyResponse[], field: keyof SurveyResponse) {
  const m: Record<string,number>={};
  for(const r of rows){const v=(r[field] as string)??"Not answered";m[v]=(m[v]??0)+1;}
  return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
}

function dailyTrend(rows: SurveyResponse[]) {
  const m: Record<string,number>={};
  for(const r of rows){const d=r.created_at.slice(0,10);m[d]=(m[d]??0)+1;}
  return Object.entries(m).sort().map(([date,count])=>({date,count}));
}

function uniqueVals(data: SurveyResponse[], field: keyof SurveyResponse): string[] {
  return [...new Set(data.map(r=>r[field] as string).filter(Boolean))].sort();
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function DonutChart({ title, data }: { title:string; data:{name:string;value:number}[] }) {
  const total = data.reduce((s,d)=>s+d.value,0);
  if (!total) return null;
  return (
    <div>
      <p style={{ fontSize:10,fontWeight:700,color:"rgba(215,184,122,0.55)",textTransform:"uppercase",letterSpacing:"0.08em",textAlign:"center",marginBottom:4 }}>{title}</p>
      <div style={{ display:"flex",justifyContent:"center" }}>
        <PieChart width={170} height={140}>
          <Pie data={data} cx={85} cy={65} innerRadius={35} outerRadius={58} dataKey="value" paddingAngle={2}>
            {data.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
          </Pie>
          <RTooltip contentStyle={TT} formatter={(v)=>[`${v} (${Math.round(Number(v)/total*100)}%)`,"",]} />
        </PieChart>
      </div>
      <div style={{ display:"flex",flexDirection:"column",gap:4,marginTop:4 }}>
        {data.slice(0,4).map((d,i)=>(
          <div key={d.name} style={{ display:"flex",alignItems:"center",gap:6,fontSize:10,color:"#E0E1DD",padding:"0 4px" }}>
            <span style={{ width:7,height:7,borderRadius:"50%",background:COLORS[i%COLORS.length],flexShrink:0 }} />
            <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{d.name}</span>
            <span style={{ marginLeft:"auto",color:"rgba(224,225,221,0.4)",flexShrink:0 }}>{Math.round(d.value/total*100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function DetailPanel({ row, groupLabel, onClose }: { row:GroupedRow; groupLabel:string; onClose:()=>void }) {
  const q1=tallyField(row.rows,"q1"), q2=tallyField(row.rows,"q2"), q3=tallyField(row.rows,"q3");
  const trend=dailyTrend(row.rows);
  const ctyData=tallyField(row.rows,"country").slice(0,8);

  return (
    <div style={{ marginTop:12, background:"rgba(215,184,122,0.04)", border:"1px solid rgba(215,184,122,0.2)", borderRadius:16, padding:24 }}>
      <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20 }}>
        <div>
          <p style={{ fontSize:9,color:"rgba(215,184,122,0.5)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4 }}>{groupLabel}</p>
          <h3 style={{ fontSize:20,fontWeight:700,color:"#FFFFFF",margin:0 }}>{row.key}</h3>
          <p style={{ fontSize:11,color:"rgba(224,225,221,0.5)",marginTop:4 }}>
            {row.responses.toLocaleString()} responses · {Math.round(row.completionRate*100)}% completion
            {row.avgDuration!==null&&` · ${row.avgDuration}s avg`}
          </p>
        </div>
        <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:"rgba(215,184,122,0.5)",fontSize:22,lineHeight:1,padding:0 }}>×</button>
      </div>

      {/* Dimension tags */}
      <div style={{ display:"flex",flexWrap:"wrap",gap:6,marginBottom:20 }}>
        {DIM_COLS.filter(d=>row.dims[d]&&row.dims[d]!=="—").map(d=>(
          <span key={String(d)} style={{ background:"rgba(215,184,122,0.08)",border:"1px solid rgba(215,184,122,0.15)",color:"#D7B87A",fontSize:10,padding:"3px 10px",borderRadius:20 }}>
            <span style={{ color:"rgba(215,184,122,0.4)" }}>{DIM_LABELS[d]}: </span>{row.dims[d]}
          </span>
        ))}
      </div>

      {/* Donut charts */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,background:"rgba(255,255,255,0.03)",borderRadius:12,padding:16,border:"1px solid rgba(215,184,122,0.1)",marginBottom:16 }}>
        <DonutChart title="Q1 · Live event attendance" data={q1} />
        <DonutChart title="Q2 · Fan experience rating" data={q2} />
        <DonutChart title="Q3 · Likely to recommend"   data={q3} />
      </div>

      {/* Trend + country */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
        <div style={{ background:"rgba(255,255,255,0.03)",borderRadius:12,padding:16,border:"1px solid rgba(215,184,122,0.1)" }}>
          <p style={{ fontSize:9,color:"rgba(215,184,122,0.5)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10 }}>Responses Over Time</p>
          {trend.length>1 ? (
            <ResponsiveContainer width="100%" height={110}>
              <LineChart data={trend} margin={{left:-10,right:8,top:4,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="date" tick={TICK} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                <YAxis tick={TICK} allowDecimals={false} axisLine={false} tickLine={false} />
                <RTooltip contentStyle={TT} />
                <Line type="monotone" dataKey="count" stroke="#D7B87A" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <p style={{fontSize:11,color:"rgba(224,225,221,0.25)",paddingTop:16,textAlign:"center"}}>Not enough data</p>}
        </div>

        <div style={{ background:"rgba(255,255,255,0.03)",borderRadius:12,padding:16,border:"1px solid rgba(215,184,122,0.1)" }}>
          <p style={{ fontSize:9,color:"rgba(215,184,122,0.5)",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10 }}>Responses by Country</p>
          {ctyData.length ? (
            <ResponsiveContainer width="100%" height={110}>
              <BarChart layout="vertical" data={ctyData} margin={{left:0,right:24,top:0,bottom:0}}>
                <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={TICK} width={80} axisLine={false} tickLine={false} />
                <RTooltip contentStyle={TT} />
                <Bar dataKey="value" radius={[0,3,3,0]}>
                  {ctyData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p style={{fontSize:11,color:"rgba(224,225,221,0.25)",paddingTop:16,textAlign:"center"}}>No country data</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Explorer ────────────────────────────────────────────────────────────

export function ResponseExplorer({ responses }: { responses: SurveyResponse[] }) {
  const [filters,      setFilters]      = useState<Filters>(()=>loadLS("fp_filters",EMPTY_FILTERS));
  const [groupByField, setGroupByField] = useState<string>(()=>loadLS("fp_groupBy","campaign_id"));
  const [search,       setSearch]       = useState<string>(()=>loadLS("fp_search",""));
  const [showPct,      setShowPct]      = useState(false);
  const [sortCol,      setSortCol]      = useState<SortCol>("responses");
  const [sortAsc,      setSortAsc]      = useState(false);
  const [page,         setPage]         = useState(0);
  const [selected,     setSelected]     = useState<GroupedRow|null>(null);

  useEffect(()=>{localStorage.setItem("fp_filters",JSON.stringify(filters));},[filters]);
  useEffect(()=>{localStorage.setItem("fp_groupBy",JSON.stringify(groupByField));},[groupByField]);
  useEffect(()=>{localStorage.setItem("fp_search",JSON.stringify(search));},[search]);

  function setFilter(f: string, v: string) { setFilters(p=>({...p,[f]:v})); setPage(0); setSelected(null); }
  function toggleSort(c: SortCol) { if(sortCol===c)setSortAsc(a=>!a); else{setSortCol(c);setSortAsc(false);} setPage(0); }

  const filtered = useMemo(()=>applyFilters(responses,filters),[responses,filters]);
  const grouped  = useMemo(()=>buildGroups(filtered,groupByField),[filtered,groupByField]);
  const searched = useMemo(()=>search?grouped.filter(r=>r.key.toLowerCase().includes(search.toLowerCase())):grouped,[grouped,search]);
  const sorted   = useMemo(()=>[...searched].sort((a,b)=>{
    let cmp=0;
    if(sortCol==="key")cmp=a.key.localeCompare(b.key);
    if(sortCol==="responses")cmp=a.responses-b.responses;
    if(sortCol==="completionRate")cmp=a.completionRate-b.completionRate;
    if(sortCol==="avgDuration")cmp=(a.avgDuration??-1)-(b.avgDuration??-1);
    return sortAsc?cmp:-cmp;
  }),[searched,sortCol,sortAsc]);

  const totalPages = Math.max(1,Math.ceil(sorted.length/PAGE_SIZE));
  const paged      = sorted.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  const groupLabel = GROUP_OPTIONS.find(o=>o.field===groupByField)?.label??groupByField;
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const isFiltered = filtered.length !== responses.length;

  const barData = sorted.slice(0,12).map(r=>({
    name:r.key.length>18?r.key.slice(0,17)+"…":r.key, value:r.responses,
  }));

  function exportCSV() {
    const csv=Papa.unparse(filtered.map(r=>({
      id:r.id, submitted_at:r.created_at, campaign_id:r.campaign_id,
      publisher:r.publisher, placement:r.placement, club:r.club, competition:r.competition,
      q1:r.q1, q2:r.q2, q3:r.q3, country:r.country, fan_segment:r.fan_segment,
      device:r.device, browser:r.browser, response_duration_seconds:r.response_duration_seconds,
    })));
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`fanometrix-explorer-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  function SortArrow({ col }: { col:SortCol }) {
    if(sortCol!==col) return <span style={{color:"rgba(215,184,122,0.25)",marginLeft:4}}>↕</span>;
    return <span style={{color:"#D7B87A",marginLeft:4}}>{sortAsc?"↑":"↓"}</span>;
  }

  const secLabel: React.CSSProperties = {
    fontSize:9,color:"rgba(215,184,122,0.5)",fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10,
  };

  return (
    <section style={{ marginTop:32 }}>
      {/* Section header */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
        <div>
          <h2 style={{ fontSize:16,fontWeight:700,color:"#FFFFFF",margin:0 }}>Response Explorer</h2>
          <p style={{ fontSize:11,color:"rgba(224,225,221,0.4)",marginTop:3 }}>
            {filtered.length.toLocaleString()} of {responses.length.toLocaleString()} responses
            {activeFilters>0&&<span style={{color:"#D7B87A",marginLeft:8}}>{activeFilters} filter{activeFilters>1?"s":""} active</span>}
          </p>
        </div>
        <div style={{ display:"flex",gap:8 }}>
          <div style={{ display:"flex",border:"1px solid rgba(215,184,122,0.2)",borderRadius:8,overflow:"hidden" }}>
            {["Count","%"].map((lbl,i)=>(
              <button key={lbl} onClick={()=>setShowPct(i===1)} style={{
                fontSize:11,fontWeight:600,padding:"6px 14px",border:"none",cursor:"pointer",
                background:(i===1)===showPct?"#D7B87A":"rgba(255,255,255,0.03)",
                color:(i===1)===showPct?"#07121D":"rgba(224,225,221,0.6)",
              }}>{lbl}</button>
            ))}
          </div>
          {activeFilters>0&&(
            <button onClick={()=>{setFilters(EMPTY_FILTERS);setPage(0);setSelected(null);}} style={{
              fontSize:11,border:"1px solid rgba(215,184,122,0.2)",color:"rgba(215,184,122,0.6)",
              background:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8,
            }}>Clear filters</button>
          )}
          <button onClick={exportCSV} disabled={filtered.length===0} style={{
            fontSize:11,fontWeight:700,background:"#D7B87A",color:"#07121D",border:"none",
            cursor:"pointer",padding:"6px 14px",borderRadius:8,opacity:filtered.length===0?0.4:1,
          }}>
            {isFiltered?`Export ${filtered.length.toLocaleString()} rows`:"Export CSV"}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ ...card, padding:16, marginBottom:12 }}>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12 }}>
          {FILTER_FIELDS.map(({label,field})=>(
            <div key={String(field)}>
              <label style={{ display:"block",fontSize:9,color:"rgba(215,184,122,0.5)",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3 }}>{label}</label>
              <select value={filters[field as keyof Filters]} onChange={e=>setFilter(String(field),e.target.value)} style={inputStyle}>
                <option value="">All</option>
                {uniqueVals(responses,field).map(v=><option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,paddingTop:12,borderTop:"1px solid rgba(215,184,122,0.08)" }}>
          {[["Date from",filters.date_from,"date_from"],["Date to",filters.date_to,"date_to"]].map(([lbl,val,fld])=>(
            <div key={fld as string}>
              <label style={{ display:"block",fontSize:9,color:"rgba(215,184,122,0.5)",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3 }}>{lbl as string}</label>
              <input type="date" value={val as string} onChange={e=>setFilter(fld as string,e.target.value)} style={inputStyle} />
            </div>
          ))}
        </div>
      </div>

      {/* Group by + bar chart */}
      <div style={{ ...card, padding:16, marginBottom:12 }}>
        <div style={{ display:"flex",alignItems:"flex-end",gap:12,marginBottom:16 }}>
          <div>
            <label style={{ ...secLabel,display:"block" }}>Group by</label>
            <select value={groupByField} onChange={e=>{setGroupByField(e.target.value);setPage(0);setSelected(null);}} style={{
              ...inputStyle, width:"auto", fontWeight:700, color:"#D7B87A", border:"1px solid rgba(215,184,122,0.3)", background:"rgba(215,184,122,0.06)",
            }}>
              {GROUP_OPTIONS.map(o=><option key={o.field} value={o.field}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ flex:1 }}>
            <label style={{ ...secLabel,display:"block" }}>Search</label>
            <input type="text" placeholder={`Search by ${groupLabel}…`} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} style={inputStyle} />
          </div>
          <p style={{ fontSize:11,color:"rgba(224,225,221,0.35)",paddingBottom:2 }}>{searched.length} group{searched.length!==1?"s":""}</p>
        </div>

        {barData.length>0&&(
          <ResponsiveContainer width="100%" height={Math.max(80,barData.length*24)}>
            <BarChart layout="vertical" data={barData} margin={{left:0,right:44,top:0,bottom:0}}>
              <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={TICK} width={110} axisLine={false} tickLine={false} />
              <RTooltip contentStyle={TT} />
              <Bar dataKey="value" radius={[0,4,4,0]} label={{position:"right",fontSize:9,fill:"rgba(224,225,221,0.35)"}}>
                {barData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Table */}
      <div style={{ ...card }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%",fontSize:12,borderCollapse:"collapse",minWidth:640 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid rgba(215,184,122,0.1)" }}>
                <th onClick={()=>toggleSort("key")} style={{ textAlign:"left",padding:"12px 16px",fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.55)",letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",background:"rgba(255,255,255,0.02)",whiteSpace:"nowrap" }}>
                  {groupLabel}<SortArrow col="key" />
                </th>
                {DIM_COLS.filter(d=>d!==groupByField).map(d=>(
                  <th key={String(d)} style={{ textAlign:"left",padding:"12px 10px",fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.3)",letterSpacing:"0.08em",textTransform:"uppercase",background:"rgba(255,255,255,0.02)",whiteSpace:"nowrap" }}>
                    {DIM_LABELS[d]}
                  </th>
                ))}
                {([["responses","Responses"],["completionRate","Completion"],["avgDuration","Avg Time"]] as [SortCol,string][]).map(([col,lbl])=>(
                  <th key={col} onClick={()=>toggleSort(col)} style={{ textAlign:"right",padding:"12px 16px",fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.55)",letterSpacing:"0.1em",textTransform:"uppercase",cursor:"pointer",background:"rgba(255,255,255,0.02)",whiteSpace:"nowrap" }}>
                    {lbl}<SortArrow col={col} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length===0&&(
                <tr><td colSpan={20} style={{ textAlign:"center",padding:"48px",fontSize:13,color:"rgba(224,225,221,0.25)" }}>No data matches your filters.</td></tr>
              )}
              {paged.map(row=>(
                <tr key={row.key} onClick={()=>setSelected(selected?.key===row.key?null:row)}
                  style={{
                    borderBottom:"1px solid rgba(215,184,122,0.06)",cursor:"pointer",
                    background:selected?.key===row.key?"rgba(215,184,122,0.05)":"transparent",
                    transition:"background 0.15s",
                  }}
                  onMouseEnter={e=>{if(selected?.key!==row.key)(e.currentTarget as HTMLTableRowElement).style.background="rgba(215,184,122,0.03)";}}
                  onMouseLeave={e=>{if(selected?.key!==row.key)(e.currentTarget as HTMLTableRowElement).style.background="transparent";}}
                >
                  <td style={{ padding:"11px 16px",fontWeight:600,color:selected?.key===row.key?"#D7B87A":"#FFFFFF",whiteSpace:"nowrap" }}>{row.key}</td>
                  {DIM_COLS.filter(d=>d!==groupByField).map(d=>(
                    <td key={String(d)} style={{ padding:"11px 10px",fontSize:11,color:"rgba(224,225,221,0.35)",whiteSpace:"nowrap" }}>{row.dims[d]||"—"}</td>
                  ))}
                  <td style={{ padding:"11px 16px",textAlign:"right",fontWeight:700,color:"#FFFFFF",whiteSpace:"nowrap" }}>
                    {showPct
                      ? `${filtered.length>0?Math.round(row.responses/filtered.length*100):0}%`
                      : row.responses.toLocaleString()}
                  </td>
                  <td style={{ padding:"11px 16px",textAlign:"right",color:"rgba(224,225,221,0.6)",whiteSpace:"nowrap" }}>{Math.round(row.completionRate*100)}%</td>
                  <td style={{ padding:"11px 16px",textAlign:"right",color:"rgba(224,225,221,0.6)",whiteSpace:"nowrap" }}>{row.avgDuration!==null?`${row.avgDuration}s`:"—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages>1&&(
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderTop:"1px solid rgba(215,184,122,0.08)",background:"rgba(255,255,255,0.02)" }}>
            <p style={{ fontSize:11,color:"rgba(224,225,221,0.35)" }}>
              Showing {page*PAGE_SIZE+1}–{Math.min((page+1)*PAGE_SIZE,sorted.length)} of {sorted.length}
            </p>
            <div style={{ display:"flex",gap:4 }}>
              {[{lbl:"‹",pg:Math.max(0,page-1),dis:page===0},{lbl:"›",pg:Math.min(totalPages-1,page+1),dis:page>=totalPages-1}].map(({lbl,pg,dis},idx)=>(
                <button key={idx} onClick={()=>setPage(pg)} disabled={dis} style={{
                  width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:13,border:"1px solid rgba(215,184,122,0.15)",borderRadius:6,
                  background:"rgba(255,255,255,0.03)",color:dis?"rgba(224,225,221,0.2)":"#E0E1DD",
                  cursor:dis?"not-allowed":"pointer",
                }}>{lbl}</button>
              ))}
              {Array.from({length:Math.min(totalPages,7)},(_,i)=>{
                const p=totalPages<=7?i:Math.max(0,Math.min(page-3,totalPages-7))+i;
                return (
                  <button key={p} onClick={()=>setPage(p)} style={{
                    width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:11,border:"1px solid rgba(215,184,122,0.15)",borderRadius:6,cursor:"pointer",
                    background:page===p?"#D7B87A":"rgba(255,255,255,0.03)",
                    color:page===p?"#07121D":"#E0E1DD",fontWeight:page===p?700:400,
                  }}>{p+1}</button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected&&<DetailPanel row={selected} groupLabel={groupLabel} onClose={()=>setSelected(null)} />}
    </section>
  );
}
