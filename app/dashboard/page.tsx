"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Papa from "papaparse";
import type { SurveyResponse } from "@/lib/types";
import { AdminShell } from "@/app/components/AdminShell";
import { KpiCards } from "./components/KpiCards";
import { ResponseExplorer } from "./components/Explorer";
import { ChartGrid } from "./components/ChartGrid";
import { InsightsEngine } from "@/app/components/InsightsEngine";
import {
  DashboardFilters, EMPTY_DASH_FILTERS,
  type DashFilters, type DatePreset,
} from "./components/DashboardFilters";

type CampaignInfo = { campaign_id: string; start_date: string|null; end_date: string|null };

function loadLS<T>(k: string, fb: T): T {
  if (typeof window === "undefined") return fb;
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; }
}

function fmt(d: Date) { return d.toISOString().slice(0,10); }
function sub(d: Date, n: number) { return new Date(d.getTime()-n*86_400_000); }

function getDateBounds(p: DatePreset, from: string, to: string, c?: CampaignInfo|null) {
  const t=new Date();
  if(p==="today")    return {from:fmt(t),to:fmt(t)};
  if(p==="7d")       return {from:fmt(sub(t,6)),to:fmt(t)};
  if(p==="30d")      return {from:fmt(sub(t,29)),to:fmt(t)};
  if(p==="campaign") return c?.start_date&&c?.end_date?{from:c.start_date,to:c.end_date}:null;
  if(p==="custom")   return from&&to?{from,to}:null;
  return null;
}

function applyFilters(data: SurveyResponse[], f: DashFilters, db: {from:string;to:string}|null) {
  return data.filter(r=>{
    if(f.campaign_id &&r.campaign_id !==f.campaign_id) return false;
    if(f.publisher   &&r.publisher   !==f.publisher  ) return false;
    if(f.placement   &&r.placement   !==f.placement  ) return false;
    if(f.club        &&r.club        !==f.club       ) return false;
    if(f.competition &&r.competition !==f.competition) return false;
    if(f.country     &&r.country     !==f.country    ) return false;
    if(f.fan_segment &&r.fan_segment !==f.fan_segment) return false;
    if(f.device      &&r.device      !==f.device     ) return false;
    if(f.browser     &&r.browser     !==f.browser    ) return false;
    if(f.q1&&r.q1!==f.q1) return false;
    if(f.q2&&r.q2!==f.q2) return false;
    if(f.q3&&r.q3!==f.q3) return false;
    if(db){const d=r.created_at.slice(0,10);if(d<db.from||d>db.to)return false;}
    return true;
  });
}

// ─── Simple bar chart (Q answers) ────────────────────────────────────────────

function QBarChart({ label, counts, total }: { label:string; counts:Record<string,number>; total:number }) {
  return (
    <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(215,184,122,0.12)",borderRadius:16,padding:20,backdropFilter:"blur(8px)" }}>
      <p style={{ fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.55)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14 }}>{label}</p>
      <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
        {Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([opt,count])=>{
          const pct=total>0?Math.round(count/total*100):0;
          return (
            <div key={opt}>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4 }}>
                <span style={{ color:"#E0E1DD" }}>{opt}</span>
                <span style={{ color:"rgba(224,225,221,0.4)" }}>{count} ({pct}%)</span>
              </div>
              <div style={{ height:4,background:"rgba(255,255,255,0.07)",borderRadius:2,overflow:"hidden" }}>
                <div style={{ height:"100%",width:`${pct}%`,background:"rgba(215,184,122,0.5)",borderRadius:2 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function tally(responses: SurveyResponse[], field: keyof SurveyResponse) {
  const m: Record<string,number>={};
  for(const r of responses){const v=(r[field] as string)??"Not answered";m[v]=(m[v]??0)+1;}
  return m;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");

  const [filters,    setFilters]    = useState<DashFilters>(()=>loadLS("dash_filters",EMPTY_DASH_FILTERS));
  const [datePreset, setDatePreset] = useState<DatePreset>(()=>loadLS("dash_date_preset","all"));
  const [dateFrom,   setDateFrom]   = useState<string>(()=>loadLS("dash_date_from",""));
  const [dateTo,     setDateTo]     = useState<string>(()=>loadLS("dash_date_to",""));

  useEffect(()=>{localStorage.setItem("dash_filters",JSON.stringify(filters));},[filters]);
  useEffect(()=>{localStorage.setItem("dash_date_preset",JSON.stringify(datePreset));},[datePreset]);
  useEffect(()=>{localStorage.setItem("dash_date_from",JSON.stringify(dateFrom));},[dateFrom]);
  useEffect(()=>{localStorage.setItem("dash_date_to",JSON.stringify(dateTo));},[dateTo]);

  const load = useCallback(async()=>{
    setLoading(true); setError("");
    const [rRes,cRes]=await Promise.all([fetch("/api/responses"),fetch("/api/campaigns")]);
    if(!rRes.ok){setError("Failed to load.");setLoading(false);return;}
    const [rJ,cJ]=await Promise.all([rRes.json(),cRes.json()]);
    setResponses(rJ.data??[]);
    setCampaigns(cJ.data??[]);
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  const activeCampaign=useMemo(()=>campaigns.find(c=>c.campaign_id===filters.campaign_id)??null,[campaigns,filters.campaign_id]);
  const dateBounds=useMemo(()=>getDateBounds(datePreset,dateFrom,dateTo,activeCampaign),[datePreset,dateFrom,dateTo,activeCampaign]);
  const filtered=useMemo(()=>applyFilters(responses,filters,dateBounds),[responses,filters,dateBounds]);

  function setFilter(f: keyof DashFilters,v: string){setFilters(p=>({...p,[f]:v}));}
  function clearFilters(){setFilters(EMPTY_DASH_FILTERS);}
  function onChartFilter(f: keyof DashFilters,v: string){setFilters(p=>({...p,[f]:p[f]===v?"":v}));}

  function exportCSV() {
    const csv=Papa.unparse(filtered.map(r=>({id:r.id,submitted_at:r.created_at,campaign_id:r.campaign_id,publisher:r.publisher,placement:r.placement,club:r.club,competition:r.competition,q1:r.q1,q2:r.q2,q3:r.q3,country:r.country,fan_segment:r.fan_segment,device:r.device,browser:r.browser,response_duration_seconds:r.response_duration_seconds})));
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    a.download=`fanometrix-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  const campaignHasDates=!!(activeCampaign?.start_date&&activeCampaign?.end_date);
  const isFiltered=filtered.length!==responses.length;
  const total=filtered.length;

  return (
    <AdminShell>
      <div style={{ padding:"28px 28px 40px", maxWidth:960, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24 }}>
          <div>
            <h1 style={{ fontSize:26,fontWeight:700,color:"#FFFFFF",margin:0,letterSpacing:"-0.02em" }}>Dashboard</h1>
            <p style={{ fontSize:11,color:"rgba(215,184,122,0.5)",marginTop:4,letterSpacing:"0.04em" }}>THE FOOTBALL COLLECTIVE · FAN INSIGHT PLATFORM</p>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={load} style={{ fontSize:12,border:"1px solid rgba(215,184,122,0.25)",color:"rgba(215,184,122,0.7)",background:"none",cursor:"pointer",padding:"8px 16px",borderRadius:10 }}>
              Refresh
            </button>
            <button onClick={exportCSV} disabled={total===0} style={{
              fontSize:12,fontWeight:700,background:"#D7B87A",color:"#07121D",border:"none",
              cursor:"pointer",padding:"8px 18px",borderRadius:10,opacity:total===0?0.4:1,
            }}>
              {isFiltered?`Export ${total.toLocaleString()} rows`:"Export CSV"}
            </button>
          </div>
        </div>

        {loading&&<p style={{ color:"rgba(224,225,221,0.4)",fontSize:13 }}>Loading responses…</p>}
        {error&&<p style={{ color:"#f87171",fontSize:13 }}>{error}</p>}

        {!loading&&!error&&(
          <>
            <DashboardFilters
              allResponses={responses} filters={filters} setFilter={setFilter} clearFilters={clearFilters}
              datePreset={datePreset} setDatePreset={setDatePreset}
              dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
              campaignHasDates={campaignHasDates} filteredCount={filtered.length} totalCount={responses.length}
            />

            <KpiCards responses={filtered} />

            {responses.length===0?(
              <p style={{ color:"rgba(224,225,221,0.3)",textAlign:"center",marginTop:48,fontSize:13 }}>No responses yet. Share your survey to get started!</p>
            ):filtered.length===0?(
              <div style={{ textAlign:"center",padding:"48px 0" }}>
                <p style={{ color:"rgba(224,225,221,0.3)",fontSize:13 }}>No responses match the current filters.</p>
                <button onClick={clearFilters} style={{ marginTop:12,fontSize:12,color:"#D7B87A",background:"none",border:"none",cursor:"pointer",textDecoration:"underline" }}>Clear filters</button>
              </div>
            ):(
              <>
                {/* Insights */}
                <InsightsEngine responses={filtered} />

                {/* Q charts */}
                <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12 }}>
                  <QBarChart label="Q1 · Live Event Attendance"    counts={tally(filtered,"q1")} total={total} />
                  <QBarChart label="Q2 · Fan Experience Rating"    counts={tally(filtered,"q2")} total={total} />
                  <QBarChart label="Q3 · Likelihood to Recommend"  counts={tally(filtered,"q3")} total={total} />
                  <QBarChart label="Responses by Country"          counts={tally(filtered,"country")} total={total} />
                </div>

                {/* Advanced charts */}
                <ChartGrid responses={filtered} filters={filters} onFilter={onChartFilter} />

                {/* Response Explorer */}
                <ResponseExplorer responses={responses} />
              </>
            )}
          </>
        )}

        <footer style={{ marginTop:48,paddingTop:20,borderTop:"1px solid rgba(215,184,122,0.08)",display:"flex",gap:20,alignItems:"center" }}>
          <span style={{ fontSize:11,color:"rgba(215,184,122,0.3)",letterSpacing:"0.06em" }}>FANOMETRIX PULSE</span>
          {[{href:"/privacy",label:"ⓘ Privacy"},{href:"/publisher-guide",label:"☰ Publisher Guide"}].map(({href,label})=>(
            <Link key={href} href={href} style={{ fontSize:11,color:"rgba(215,184,122,0.3)",textDecoration:"none" }}>{label}</Link>
          ))}
        </footer>
      </div>
    </AdminShell>
  );
}
