"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/app/components/AdminShell";

const BASE = typeof window !== "undefined" ? window.location.origin : "https://fanometrix-surveys.vercel.app";
const ENDPOINT  = `${BASE}/api/reporting`;
const STATS_URL = `${BASE}/api/reporting/stats`;

const FIELDS = [
  {n:"response_id",t:"TEXT",d:"Unique response UUID"},{n:"campaign_slug",t:"TEXT",d:"Human-readable campaign ID"},{n:"campaign_id",t:"TEXT",d:"Campaign UUID"},{n:"campaign_name",t:"TEXT",d:"Campaign display name"},{n:"brand",t:"TEXT",d:"Brand name"},{n:"survey_id",t:"TEXT",d:"Survey UUID"},{n:"survey_name",t:"TEXT",d:"Survey display name"},{n:"publisher",t:"TEXT",d:"Publisher (normalised)"},{n:"placement",t:"TEXT",d:"Placement position (normalised)"},{n:"club",t:"TEXT",d:"Football club"},{n:"competition",t:"TEXT",d:"Competition / tournament"},{n:"country",t:"TEXT",d:"Country (full name, normalised)"},{n:"fan_segment",t:"TEXT",d:"Audience segment label"},{n:"device",t:"TEXT",d:"mobile / tablet / desktop"},{n:"browser",t:"TEXT",d:"Chrome / Safari / Firefox / Edge"},{n:"q1",t:"TEXT",d:"Answer to Q1"},{n:"q2",t:"TEXT",d:"Answer to Q2"},{n:"q3",t:"TEXT",d:"Answer to Q3"},{n:"response_duration_seconds",t:"INTEGER",d:"Time taken (seconds)"},{n:"is_complete",t:"INTEGER",d:"1 = all 3 answered, 0 = partial"},{n:"is_demo",t:"BOOLEAN",d:"true = generated test data"},{n:"submitted_at",t:"TIMESTAMP",d:"Full submission timestamp (UTC)"},{n:"response_date",t:"DATE",d:"YYYY-MM-DD"},{n:"response_week",t:"DATE",d:"Start of ISO week"},{n:"response_month",t:"DATE",d:"Start of month"},{n:"response_year",t:"INTEGER",d:"e.g. 2026"},{n:"response_month_num",t:"INTEGER",d:"1–12"},{n:"response_month_label",t:"TEXT",d:"e.g. 2026-06"},{n:"response_day_of_week",t:"TEXT",d:"e.g. Monday"},{n:"response_hour",t:"INTEGER",d:"0–23 (UTC)"},{n:"response_daypart",t:"TEXT",d:"Morning / Afternoon / Evening / Night"},
];

const MEASURES=[{n:"total_responses",f:"COUNT(response_id)",d:"Total survey responses"},{n:"completion_rate",f:"AVG(is_complete) × 100",d:"Percentage with all 3 answers"},{n:"avg_response_time",f:"AVG(response_duration_seconds)",d:"Average seconds to complete"}];

type Stats={total_rows:number;last_response_at:string|null;api_key_configured:boolean};

const card: React.CSSProperties={background:"#FFFFFF",border:"1px solid rgba(11,25,41,0.08)",borderRadius:16,boxShadow:"0 4px 20px rgba(11,25,41,0.06)"};
const sLabel: React.CSSProperties={fontSize:9,fontWeight:700,color:"#D7B87A",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:12,display:"block"};
const code: React.CSSProperties={background:"#F7F6F2",border:"1px solid rgba(11,25,41,0.08)",borderRadius:6,padding:"2px 7px",fontSize:11,fontFamily:"monospace",color:"#0B1929"};

export default function ReportingPage(){
  const [stats,  setStats]  =useState<Stats|null>(null);
  const [loading,setLoading]=useState(true);
  const [copied, setCopied] =useState<string|null>(null);

  useEffect(()=>{fetch(STATS_URL).then(r=>r.json()).then(setStats).finally(()=>setLoading(false));},[]);
  function copy(text:string,key:string){navigator.clipboard.writeText(text);setCopied(key);setTimeout(()=>setCopied(null),2000);}
  function btn(text:string,key:string,label:string){return<button onClick={()=>copy(text,key)} style={{fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,border:`1px solid ${copied===key?"rgba(16,185,129,0.3)":"rgba(11,25,41,0.12)"}`,background:copied===key?"rgba(16,185,129,0.08)":"#FFFFFF",color:copied===key?"#059669":"#5F6670",cursor:"pointer",flexShrink:0}}>{copied===key?"Copied!":label}</button>;}

  const APPSCRIPT=`function syncFanometrix() {\n  const API_KEY = "YOUR_API_KEY";\n  const url = "${ENDPOINT}?limit=10000&api_key=" + API_KEY;\n  const res = UrlFetchApp.fetch(url);\n  const json = JSON.parse(res.getContentText());\n  const rows = json.data;\n  if (!rows || !rows.length) return;\n  const sheet = SpreadsheetApp.getActiveSheet();\n  sheet.clearContents();\n  sheet.appendRow(Object.keys(rows[0]));\n  rows.forEach(r => sheet.appendRow(Object.values(r)));\n}`;

  return(
    <AdminShell>
      <div style={{padding:"32px 32px 48px",maxWidth:960,margin:"0 auto"}}>
        <p style={{fontSize:10,color:"#D7B87A",fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:5}}>Fanometrix Pulse</p>
        <h1 style={{fontSize:28,fontWeight:700,color:"#0B1929",margin:0,letterSpacing:"-0.02em",marginBottom:4}}>Reporting</h1>
        <p style={{fontSize:12,color:"#5F6670",marginBottom:28}}>Connect to Google Looker Studio or any BI tool.</p>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
          <div style={{...card,padding:20}}>
            <span style={sLabel}>Total Rows</span>
            <p style={{fontSize:30,fontWeight:700,color:"#0B1929",margin:"0 0 4px"}}>{loading?"—":(stats?.total_rows??0).toLocaleString()}</p>
            <p style={{fontSize:11,color:"#5F6670"}}>in vw_campaign_responses</p>
          </div>
          <div style={{...card,padding:20}}>
            <span style={sLabel}>Last Response</span>
            <p style={{fontSize:13,fontWeight:600,color:"#0B1929",margin:"0 0 4px"}}>{loading?"—":stats?.last_response_at?new Date(stats.last_response_at).toLocaleString("en-GB",{dateStyle:"medium",timeStyle:"short"}):"No responses yet"}</p>
            <p style={{fontSize:11,color:"#5F6670"}}>most recent submission</p>
          </div>
          <div style={{...card,padding:20,borderColor:stats?.api_key_configured?"rgba(16,185,129,0.2)":"rgba(215,184,122,0.25)"}}>
            <span style={sLabel}>API Key</span>
            <p style={{fontSize:13,fontWeight:700,color:stats?.api_key_configured?"#059669":"#D7B87A",margin:"0 0 4px"}}>{loading?"—":stats?.api_key_configured?"Configured ✓":"Not configured"}</p>
            <p style={{fontSize:11,color:"#5F6670"}}>{stats?.api_key_configured?"REPORTING_API_KEY active":"Set in Vercel env vars"}</p>
          </div>
        </div>

        <div style={{...card,padding:20,marginBottom:12}}>
          <span style={sLabel}>JSON API Endpoint</span>
          <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
            <code style={{...code,padding:"10px 14px",fontSize:12,flex:1,display:"block",overflowX:"auto",whiteSpace:"nowrap"}}>{ENDPOINT}</code>
            {btn(ENDPOINT,"endpoint","Copy")}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <div>
              <p style={{fontSize:11,fontWeight:600,color:"#0B1929",marginBottom:8}}>Query parameters</p>
              {[["limit","rows per page (max 10,000)"],["offset","pagination offset"],["campaign_id","filter by campaign slug"],["date_from / date_to","YYYY-MM-DD"],["api_key","auth (or Authorization header)"]].map(([p,d])=>(
                <p key={p as string} style={{fontSize:11,color:"#5F6670",marginBottom:4}}><span style={code}>{p}</span> — {d}</p>
              ))}
            </div>
            <div>
              <p style={{fontSize:11,fontWeight:600,color:"#0B1929",marginBottom:8}}>Authentication</p>
              {["Authorization: Bearer YOUR_API_KEY","?api_key=YOUR_API_KEY"].map(s=>(
                <code key={s} style={{...code,display:"block",padding:"8px 12px",marginBottom:6,fontSize:11,whiteSpace:"nowrap"}}>{s}</code>
              ))}
            </div>
          </div>
        </div>

        <div style={{...card,padding:20,marginBottom:12}}>
          <span style={sLabel}>Connect to Google Looker Studio</span>
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
              <span style={{width:20,height:20,borderRadius:"50%",background:"#D7B87A",color:"#0B1929",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>1</span>
              <p style={{fontSize:13,fontWeight:600,color:"#0B1929",margin:0}}>PostgreSQL direct connection (recommended)</p>
            </div>
            <ol style={{marginLeft:28,fontSize:12,color:"#5F6670",lineHeight:1.9,paddingLeft:16}}>
              <li>Create a read-only user in Supabase SQL Editor (see supabase-migration-004.sql)</li>
              <li>Go to Supabase → Settings → Database → Connection Pooling → copy host and port</li>
              <li>In Looker Studio → Add Data Source → PostgreSQL → enter credentials</li>
              <li>Select table: <span style={code}>vw_campaign_responses</span></li>
            </ol>
          </div>
          <div style={{borderTop:"1px solid rgba(11,25,41,0.06)",paddingTop:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{width:20,height:20,borderRadius:"50%",background:"rgba(11,25,41,0.06)",color:"#5F6670",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>2</span>
              <p style={{fontSize:13,fontWeight:600,color:"#0B1929",margin:0}}>Google Sheets intermediary</p>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-start",marginLeft:28}}>
              <pre style={{...code,display:"block",padding:12,fontSize:11,overflowX:"auto",whiteSpace:"pre",flex:1}}>{APPSCRIPT}</pre>
              {btn(APPSCRIPT,"appscript","Copy")}
            </div>
          </div>
        </div>

        <div style={{...card,padding:20,marginBottom:12}}>
          <span style={sLabel}>Calculated Measures (create in Looker Studio)</span>
          <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
            <thead><tr style={{borderBottom:"1px solid rgba(11,25,41,0.06)"}}>{["Measure","Formula","Description"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:9,fontWeight:700,color:"#D7B87A",letterSpacing:"0.08em",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{MEASURES.map(m=><tr key={m.n} style={{borderBottom:"1px solid rgba(11,25,41,0.04)"}}><td style={{padding:"9px 12px"}}><span style={code}>{m.n}</span></td><td style={{padding:"9px 12px",color:"#5F6670"}}><span style={code}>{m.f}</span></td><td style={{padding:"9px 12px",color:"#5F6670"}}>{m.d}</td></tr>)}</tbody>
          </table>
        </div>

        <div style={{...card,padding:20}}>
          <span style={sLabel}>View Fields — vw_campaign_responses ({FIELDS.length} columns)</span>
          <table style={{width:"100%",fontSize:11,borderCollapse:"collapse"}}>
            <thead><tr style={{borderBottom:"1px solid rgba(11,25,41,0.06)"}}>{["Field","Type","Description"].map(h=><th key={h} style={{textAlign:"left",padding:"6px 12px",fontSize:9,fontWeight:700,color:"#D7B87A",letterSpacing:"0.08em",textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{FIELDS.map(f=><tr key={f.n} style={{borderBottom:"1px solid rgba(11,25,41,0.04)"}}><td style={{padding:"6px 12px",fontFamily:"monospace",color:"#0B1929",whiteSpace:"nowrap"}}>{f.n}</td><td style={{padding:"6px 12px",color:"rgba(11,25,41,0.35)",paddingLeft:16,whiteSpace:"nowrap"}}>{f.t}</td><td style={{padding:"6px 12px",color:"#5F6670",paddingLeft:16}}>{f.d}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
