"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/app/components/AdminShell";

const BASE = typeof window !== "undefined" ? window.location.origin : "https://fanometrix-surveys.vercel.app";
const ENDPOINT = `${BASE}/api/reporting`;
const STATS_URL = `${BASE}/api/reporting/stats`;

const FIELDS = [
  {n:"response_id",t:"TEXT",d:"Unique response UUID"},
  {n:"campaign_slug",t:"TEXT",d:"Human-readable campaign ID (e.g. carlsberg_ucl_2026)"},
  {n:"campaign_id",t:"TEXT",d:"Campaign UUID"},
  {n:"campaign_name",t:"TEXT",d:"Campaign display name"},
  {n:"brand",t:"TEXT",d:"Brand name"},
  {n:"survey_id",t:"TEXT",d:"Survey UUID"},
  {n:"survey_name",t:"TEXT",d:"Survey display name"},
  {n:"publisher",t:"TEXT",d:"Publisher (normalised)"},
  {n:"placement",t:"TEXT",d:"Placement position (normalised)"},
  {n:"club",t:"TEXT",d:"Football club"},
  {n:"competition",t:"TEXT",d:"Competition / tournament"},
  {n:"country",t:"TEXT",d:"Country (full name, normalised)"},
  {n:"fan_segment",t:"TEXT",d:"Audience segment label"},
  {n:"device",t:"TEXT",d:"mobile / tablet / desktop"},
  {n:"browser",t:"TEXT",d:"Chrome / Safari / Firefox / Edge"},
  {n:"q1",t:"TEXT",d:"Answer to question 1"},
  {n:"q2",t:"TEXT",d:"Answer to question 2"},
  {n:"q3",t:"TEXT",d:"Answer to question 3"},
  {n:"response_duration_seconds",t:"INTEGER",d:"Time taken to complete survey"},
  {n:"is_complete",t:"INTEGER",d:"1 if all 3 questions answered, else 0"},
  {n:"is_demo",t:"BOOLEAN",d:"true = generated test data"},
  {n:"submitted_at",t:"TIMESTAMP",d:"Full submission timestamp (UTC)"},
  {n:"response_date",t:"DATE",d:"Submission date (YYYY-MM-DD)"},
  {n:"response_week",t:"DATE",d:"Start of ISO week"},
  {n:"response_month",t:"DATE",d:"Start of month"},
  {n:"response_year",t:"INTEGER",d:"Year (e.g. 2026)"},
  {n:"response_month_num",t:"INTEGER",d:"Month number 1–12"},
  {n:"response_month_label",t:"TEXT",d:"e.g. 2026-06"},
  {n:"response_day_of_week",t:"TEXT",d:"e.g. Monday"},
  {n:"response_hour",t:"INTEGER",d:"Hour of submission 0–23 (UTC)"},
  {n:"response_daypart",t:"TEXT",d:"Morning (05–11) · Afternoon (12–16) · Evening (17–21) · Night (22–04)"},
];

const MEASURES=[
  {n:"total_responses",f:"COUNT(response_id)",d:"Total survey responses"},
  {n:"completion_rate",f:"AVG(is_complete) × 100",d:"Percentage with all 3 answers"},
  {n:"avg_response_time",f:"AVG(response_duration_seconds)",d:"Average seconds to complete"},
];

type Stats={total_rows:number;last_response_at:string|null;api_key_configured:boolean;endpoint:string};

const card: React.CSSProperties={background:"rgba(255,255,255,0.03)",border:"1px solid rgba(215,184,122,0.12)",borderRadius:16,backdropFilter:"blur(8px)"};
const secLabel: React.CSSProperties={fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12};
const pre: React.CSSProperties={background:"#040D15",border:"1px solid rgba(215,184,122,0.1)",borderRadius:8,padding:12,fontSize:11,color:"#D7B87A",fontFamily:"monospace",overflowX:"auto",whiteSpace:"pre-wrap",flex:1};

export default function ReportingPage() {
  const [stats,  setStats]  = useState<Stats|null>(null);
  const [loading,setLoading]= useState(true);
  const [copied, setCopied] = useState<string|null>(null);

  useEffect(()=>{fetch(STATS_URL).then(r=>r.json()).then(setStats).finally(()=>setLoading(false));},[]);

  function copy(text:string,key:string){
    navigator.clipboard.writeText(text);setCopied(key);setTimeout(()=>setCopied(null),2000);
  }

  function copyBtn(text:string,key:string,label:string){
    return(
      <button onClick={()=>copy(text,key)} style={{fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,border:"1px solid rgba(215,184,122,0.25)",background:copied===key?"rgba(16,185,129,0.15)":"rgba(215,184,122,0.08)",color:copied===key?"#6ee7b7":"#D7B87A",cursor:"pointer"}}>
        {copied===key?"Copied!":label}
      </button>
    );
  }

  const APPSCRIPT=`function syncFanometrix() {
  const API_KEY = "YOUR_API_KEY";
  const url = "${ENDPOINT}?limit=10000&api_key=" + API_KEY;
  const res = UrlFetchApp.fetch(url);
  const json = JSON.parse(res.getContentText());
  const rows = json.data;
  if (!rows || !rows.length) return;
  const sheet = SpreadsheetApp.getActiveSheet();
  sheet.clearContents();
  sheet.appendRow(Object.keys(rows[0]));
  rows.forEach(r => sheet.appendRow(Object.values(r)));
}`;

  return (
    <AdminShell>
      <div style={{padding:"28px 28px 40px",maxWidth:960,margin:"0 auto"}}>
        <h1 style={{fontSize:26,fontWeight:700,color:"#FFFFFF",margin:0,letterSpacing:"-0.02em",marginBottom:4}}>Reporting</h1>
        <p style={{fontSize:11,color:"rgba(224,225,221,0.4)",marginBottom:28}}>Connect Fanometrix Pulse data to Google Looker Studio or any BI tool.</p>

        {/* Status cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
          {[
            {label:"Total Rows",value:loading?"—":(stats?.total_rows??0).toLocaleString(),sub:"in vw_campaign_responses",gold:true},
            {label:"Last Response",value:loading?"—":stats?.last_response_at?new Date(stats.last_response_at).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"No responses yet",sub:"most recent submission",gold:false},
          ].map(({label,value,sub,gold})=>(
            <div key={label} style={{...card,padding:20}}>
              <p style={secLabel}>{label}</p>
              <p style={{fontSize:gold?28:14,fontWeight:700,color:gold?"#D7B87A":"#FFFFFF",margin:"0 0 4px"}}>{value}</p>
              <p style={{fontSize:11,color:"rgba(224,225,221,0.35)"}}>{sub}</p>
            </div>
          ))}
          <div style={{...card,padding:20,borderColor:stats?.api_key_configured?"rgba(16,185,129,0.2)":"rgba(215,184,122,0.25)"}}>
            <p style={secLabel}>API Key</p>
            <p style={{fontSize:14,fontWeight:700,color:stats?.api_key_configured?"#6ee7b7":"#D7B87A",margin:"0 0 4px"}}>{loading?"—":stats?.api_key_configured?"Configured ✓":"Not configured"}</p>
            <p style={{fontSize:11,color:"rgba(224,225,221,0.35)"}}>{stats?.api_key_configured?"REPORTING_API_KEY active":"Set in Vercel env vars"}</p>
          </div>
        </div>

        {/* Endpoint */}
        <div style={{...card,padding:20,marginBottom:12}}>
          <p style={secLabel}>JSON API Endpoint</p>
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
            <code style={{...pre,margin:0,padding:"10px 14px",fontSize:12}}>{ENDPOINT}</code>
            {copyBtn(ENDPOINT,"endpoint","Copy")}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div>
              <p style={{fontSize:11,fontWeight:600,color:"#E0E1DD",marginBottom:8}}>Query parameters</p>
              {[["limit","rows per page (max 10,000)"],["offset","pagination offset"],["campaign_id","filter by campaign slug"],["publisher","filter by publisher"],["country","filter by country"],["date_from / date_to","YYYY-MM-DD"],["api_key","auth key (or use Authorization header)"]].map(([p,d])=>(
                <div key={p as string} style={{fontSize:11,color:"rgba(224,225,221,0.5)",marginBottom:4}}>
                  <code style={{color:"#D7B87A"}}>{p}</code> — {d}
                </div>
              ))}
            </div>
            <div>
              <p style={{fontSize:11,fontWeight:600,color:"#E0E1DD",marginBottom:8}}>Authentication</p>
              {[`Authorization: Bearer YOUR_API_KEY`,`?api_key=YOUR_API_KEY`].map(s=>(
                <code key={s} style={{display:"block",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(215,184,122,0.1)",borderRadius:6,padding:"8px 12px",fontSize:11,color:"#D7B87A",marginBottom:6}}>{s}</code>
              ))}
            </div>
          </div>
        </div>

        {/* Connection guide */}
        <div style={{...card,padding:20,marginBottom:12}}>
          <p style={secLabel}>Connect to Google Looker Studio</p>
          <div style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{width:20,height:20,borderRadius:"50%",background:"#D7B87A",color:"#07121D",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>1</span>
              <p style={{fontSize:13,fontWeight:600,color:"#FFFFFF",margin:0}}>PostgreSQL direct connection (recommended)</p>
            </div>
            <p style={{fontSize:12,color:"rgba(224,225,221,0.5)",marginBottom:8,marginLeft:28}}>Looker Studio connects directly to Supabase and queries <code style={{color:"#D7B87A"}}>vw_campaign_responses</code> in real time.</p>
            <ol style={{marginLeft:28,fontSize:11,color:"rgba(224,225,221,0.45)",lineHeight:1.8,paddingLeft:14}}>
              <li>In Supabase SQL Editor, create a read-only user (see supabase-migration-004.sql)</li>
              <li>Go to Supabase → Settings → Database → Connection Pooling → copy host and port</li>
              <li>In Looker Studio → Add Data Source → PostgreSQL</li>
              <li>Enter: host, port 6543, database postgres, username looker_reader</li>
              <li>Select table: <code style={{color:"#D7B87A"}}>vw_campaign_responses</code></li>
            </ol>
          </div>
          <div style={{borderTop:"1px solid rgba(215,184,122,0.08)",paddingTop:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{width:20,height:20,borderRadius:"50%",background:"rgba(215,184,122,0.15)",color:"#D7B87A",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>2</span>
              <p style={{fontSize:13,fontWeight:600,color:"#FFFFFF",margin:0}}>Google Sheets intermediary</p>
            </div>
            <p style={{fontSize:12,color:"rgba(224,225,221,0.5)",marginBottom:10,marginLeft:28}}>Use Apps Script to pull data into a Sheet, then connect Looker Studio to the Sheet.</p>
            <div style={{marginLeft:28,display:"flex",gap:10,alignItems:"flex-start"}}>
              <pre style={pre}>{APPSCRIPT}</pre>
              {copyBtn(APPSCRIPT,"appscript","Copy")}
            </div>
          </div>
        </div>

        {/* Measures */}
        <div style={{...card,padding:20,marginBottom:12}}>
          <p style={secLabel}>Calculated Measures (create in Looker Studio)</p>
          <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
            <thead><tr style={{borderBottom:"1px solid rgba(215,184,122,0.1)"}}>
              {["Measure","Formula","Description"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.08em",textTransform:"uppercase"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {MEASURES.map(m=>(
                <tr key={m.n} style={{borderBottom:"1px solid rgba(215,184,122,0.06)"}}>
                  <td style={{padding:"10px 12px",fontFamily:"monospace",color:"#D7B87A",fontSize:11}}>{m.n}</td>
                  <td style={{padding:"10px 12px",fontFamily:"monospace",color:"rgba(215,184,122,0.6)",fontSize:11}}>{m.f}</td>
                  <td style={{padding:"10px 12px",color:"rgba(224,225,221,0.5)",fontSize:11}}>{m.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Fields */}
        <div style={{...card,padding:20}}>
          <p style={secLabel}>View Fields — vw_campaign_responses ({FIELDS.length} columns)</p>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
              <thead><tr style={{borderBottom:"1px solid rgba(215,184,122,0.1)"}}>
                {["Field","Type","Description"].map(h=><th key={h} style={{textAlign:"left",padding:"7px 12px",fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.08em",textTransform:"uppercase"}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {FIELDS.map(f=>(
                  <tr key={f.n} style={{borderBottom:"1px solid rgba(215,184,122,0.04)"}}>
                    <td style={{padding:"7px 12px",fontFamily:"monospace",color:"#D7B87A",whiteSpace:"nowrap"}}>{f.n}</td>
                    <td style={{padding:"7px 12px",color:"rgba(224,225,221,0.35)",paddingLeft:16,whiteSpace:"nowrap"}}>{f.t}</td>
                    <td style={{padding:"7px 12px",color:"rgba(224,225,221,0.5)",paddingLeft:16}}>{f.d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
