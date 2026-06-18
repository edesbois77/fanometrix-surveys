"use client";

import { useState, useEffect, useMemo } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type Campaign = { id:string; campaign_id:string; brand_name:string; campaign_name:string; survey_id:string|null; surveys?:{name:string}|null; publishers:string[] };

const BASE = "https://fanometrix-surveys.vercel.app";

const GEO_MACROS: Record<string,string> = {
  "Google Ad Manager / DV360": "%%COUNTRY%%",
  "Xandr (AppNexus)":          "${GEO_COUNTRY}",
  "Freewheel":                 "[country]",
  "The Trade Desk":            "##COUNTRY##",
  "Direct / Hardcoded":        "GB",
};

const PLACEMENT_OPTIONS = [
  "homepage-mpu","match-centre-mpu","lineups-mpu","article-inline",
  "article-footer","team-page-mpu","league-page-mpu","Custom…",
];

const INSTRUCTIONS = `1. Place the iframe inside a 300x250 MPU creative slot.
2. Replace the country macro with your ad server macro (e.g. %%COUNTRY%% for GAM).
3. Populate publisher and placement values before trafficking.
4. Do not pass personal identifiers in any URL parameter.
5. Test the preview URL before going live.`;

const card: React.CSSProperties = {background:"rgba(255,255,255,0.03)",border:"1px solid rgba(215,184,122,0.12)",borderRadius:16,padding:20,backdropFilter:"blur(8px)"};
const input: React.CSSProperties = {width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(215,184,122,0.15)",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#E0E1DD",outline:"none"};
const secLabel: React.CSSProperties = {fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10,display:"block"};
const fieldLabel: React.CSSProperties = {display:"block",fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.4)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4};

export default function EmbedGeneratorPage() {
  const [campaigns,      setCampaigns]      = useState<Campaign[]>([]);
  const [selectedId,     setSelectedId]     = useState("");
  const [publisher,      setPublisher]      = useState("");
  const [placementPreset,setPlacementPreset]= useState("");
  const [placementCustom,setPlacementCustom]= useState("");
  const [club,           setClub]           = useState("");
  const [competition,    setCompetition]    = useState("");
  const [segment,        setSegment]        = useState("");
  const [adServer,       setAdServer]       = useState("Google Ad Manager / DV360");
  const [copied,         setCopied]         = useState<"iframe"|"script"|"instructions"|null>(null);

  useEffect(()=>{
    fetch("/api/campaigns").then(r=>r.json()).then(j=>{
      const data: Campaign[]=j.data??[];
      setCampaigns(data);
      const preselect=new URLSearchParams(window.location.search).get("campaign");
      if(preselect){const m=data.find(c=>c.id===preselect);if(m)setSelectedId(m.id);}
    });
  },[]);

  useEffect(()=>{setPublisher("");},[selectedId]);

  const campaign=campaigns.find(c=>c.id===selectedId)??null;
  const placement=placementPreset==="Custom…"?placementCustom:placementPreset;
  const countryMacro=GEO_MACROS[adServer]??"%%COUNTRY%%";
  const campaignIdValue=campaign?.campaign_id??"";
  const surveyName=campaign?.surveys?.name??null;

  const params=useMemo(()=>{
    const p=new URLSearchParams();
    if(campaignIdValue)        p.set("campaign",campaignIdValue);
    if(campaign?.survey_id)    p.set("survey",campaign.survey_id);
    if(publisher)              p.set("publisher",publisher);
    if(placement)              p.set("placement",placement);
    if(club)                   p.set("club",club);
    if(competition)            p.set("competition",competition);
    if(segment)                p.set("segment",segment);
    p.set("country",countryMacro);
    return p.toString();
  },[campaignIdValue,campaign,publisher,placement,club,competition,segment,countryMacro]);

  const previewParams=useMemo(()=>{
    const p=new URLSearchParams();
    if(campaignIdValue)     p.set("campaign",campaignIdValue);
    if(campaign?.survey_id) p.set("survey",campaign.survey_id);
    if(publisher)           p.set("publisher",publisher);
    if(placement)           p.set("placement",placement);
    if(club)                p.set("club",club);
    if(competition)         p.set("competition",competition);
    if(segment)             p.set("segment",segment);
    p.set("country","GB");
    return p.toString();
  },[campaignIdValue,campaign,publisher,placement,club,competition,segment]);

  const iframeCode=[`<iframe`,`  src="${BASE}/embed?${params}"`,`  width="300" height="250"`,`  frameborder="0" scrolling="no"`,`  style="border:0;overflow:hidden;display:block;"`,`  title="Fanometrix Pulse Fan Survey"`,`></iframe>`].join("\n");

  const scriptCode=[`<script`,`  src="${BASE}/embed.js"`,campaignIdValue?`  data-campaign="${campaignIdValue}"`:null,campaign?.survey_id?`  data-survey="${campaign.survey_id}"`:null,publisher?`  data-publisher="${publisher}"`:null,placement?`  data-placement="${placement}"`:null,club?`  data-club="${club}"`:null,competition?`  data-competition="${competition}"`:null,segment?`  data-segment="${segment}"`:null,`  data-country="${countryMacro}"`,`><\/script>`].filter(Boolean).join("\n");

  function copy(text:string,type:typeof copied){navigator.clipboard.writeText(text);setCopied(type);setTimeout(()=>setCopied(null),2000);}

  function copyBtn(text:string,type:typeof copied,label:string){
    const active=copied===type;
    return(
      <button onClick={()=>copy(text,type)} style={{fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,border:"1px solid rgba(215,184,122,0.25)",background:active?"rgba(16,185,129,0.15)":"rgba(215,184,122,0.08)",color:active?"#6ee7b7":"#D7B87A",cursor:"pointer",flexShrink:0}}>
        {active?"Copied!":label}
      </button>
    );
  }

  return (
    <AdminShell>
      <div style={{padding:"28px 28px 40px",maxWidth:1040,margin:"0 auto"}}>
        <h1 style={{fontSize:26,fontWeight:700,color:"#FFFFFF",margin:0,letterSpacing:"-0.02em",marginBottom:4}}>Embed Generator</h1>
        <p style={{fontSize:11,color:"rgba(224,225,221,0.4)",marginBottom:28}}>Configure your embed and copy the tag to your ad server.</p>

        <div style={{display:"grid",gridTemplateColumns:"240px 1fr",gap:20}}>
          {/* Config */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Campaign */}
            <div style={card}>
              <span style={secLabel}>Campaign</span>
              <label style={fieldLabel}>Select Campaign</label>
              <select value={selectedId} onChange={e=>setSelectedId(e.target.value)} style={{...input,marginBottom:campaign?12:0}}>
                <option value="">— select —</option>
                {campaigns.map(c=><option key={c.id} value={c.id}>{c.brand_name} · {c.campaign_name}</option>)}
              </select>
              {campaign&&(
                <div style={{paddingTop:12,borderTop:"1px solid rgba(215,184,122,0.08)",display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                    <span style={{color:"rgba(215,184,122,0.4)"}}>Campaign ID</span>
                    <code style={{color:"#D7B87A",fontSize:10}}>{campaign.campaign_id}</code>
                  </div>
                  {surveyName&&<div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                    <span style={{color:"rgba(215,184,122,0.4)"}}>Survey</span>
                    <span style={{color:"rgba(224,225,221,0.7)"}}>{surveyName}</span>
                  </div>}
                </div>
              )}
            </div>

            {/* Placement */}
            <div style={card}>
              <span style={secLabel}>Placement</span>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div>
                  <label style={fieldLabel}>Publisher</label>
                  {campaign&&campaign.publishers.length>0?(
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {campaign.publishers.map(p=>(
                        <button key={p} onClick={()=>setPublisher(publisher===p?"":p)} style={{fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:20,border:`1px solid ${publisher===p?"rgba(215,184,122,0.6)":"rgba(215,184,122,0.15)"}`,background:publisher===p?"rgba(215,184,122,0.15)":"transparent",color:publisher===p?"#D7B87A":"rgba(215,184,122,0.5)",cursor:"pointer"}}>
                          {p}
                        </button>
                      ))}
                    </div>
                  ):<input value={publisher} onChange={e=>setPublisher(e.target.value)} placeholder="e.g. sky-sports" style={input} />}
                </div>
                <div>
                  <label style={fieldLabel}>Placement</label>
                  <select value={placementPreset} onChange={e=>{setPlacementPreset(e.target.value);if(e.target.value!=="Custom…")setPlacementCustom("");}} style={input}>
                    <option value="">— select —</option>
                    {PLACEMENT_OPTIONS.map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  {placementPreset==="Custom…"&&<input value={placementCustom} onChange={e=>setPlacementCustom(e.target.value)} placeholder="Custom placement" style={{...input,marginTop:6}} autoFocus />}
                </div>
                {[["Club",club,setClub,"e.g. Arsenal"],["Competition",competition,setCompetition,"e.g. Premier League"],["Fan Segment",segment,setSegment,"e.g. season-ticket"]].map(([l,v,s,ph])=>(
                  <div key={l as string}>
                    <label style={fieldLabel}>{l as string}</label>
                    <input value={v as string} onChange={e=>(s as (v:string)=>void)(e.target.value)} placeholder={ph as string} style={input} />
                  </div>
                ))}
              </div>
            </div>

            {/* Ad server */}
            <div style={card}>
              <span style={secLabel}>Ad Server</span>
              <select value={adServer} onChange={e=>setAdServer(e.target.value)} style={input} />
              {Object.keys(GEO_MACROS).map(s=><option key={s} value={s}>{s}</option>)}
              <p style={{fontSize:10,color:"rgba(215,184,122,0.4)",marginTop:8}}>Country macro: <code style={{color:"#D7B87A"}}>{countryMacro}</code></p>
            </div>

            {/* Metadata */}
            <div style={card}>
              <span style={secLabel}>Response Metadata Preview</span>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[["Campaign",campaignIdValue||"—"],["Survey",surveyName||"—"],["Publisher",publisher||"—"],["Placement",placement||"—"],["Club",club||"—"],["Competition",competition||"—"],["Fan Segment",segment||"—"],["Country",<code key="c" style={{color:"#D7B87A",fontSize:10}}>{countryMacro}</code>]].map(([l,v])=>(
                  <div key={l as string} style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:10,color:"rgba(215,184,122,0.4)"}}>{l as string}</span>
                    <span style={{fontSize:10,color:"rgba(224,225,221,0.65)",textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Output */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Preview */}
            <div style={card}>
              <span style={secLabel}>Preview <span style={{color:"rgba(224,225,221,0.25)",fontWeight:400,textTransform:"none",letterSpacing:0}}>(country = GB)</span></span>
              <div style={{display:"flex",justifyContent:"center",background:"rgba(7,18,29,0.6)",borderRadius:10,padding:20,border:"1px solid rgba(215,184,122,0.06)"}}>
                {campaignIdValue?(
                  <iframe key={previewParams} src={`${BASE}/embed?${previewParams}`} width={300} height={250} style={{border:0,borderRadius:8,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}} title="Preview" />
                ):(
                  <div style={{width:300,height:250,background:"rgba(255,255,255,0.02)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(215,184,122,0.06)"}}>
                    <p style={{fontSize:11,color:"rgba(215,184,122,0.3)",textAlign:"center",padding:20}}>Select a campaign to preview</p>
                  </div>
                )}
              </div>
            </div>

            {/* Iframe */}
            <div style={card}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{...secLabel,margin:0}}>Iframe Tag</span>
                {copyBtn(iframeCode,"iframe","Copy")}
              </div>
              <pre style={{background:"#040D15",border:"1px solid rgba(215,184,122,0.1)",borderRadius:8,padding:12,fontSize:11,color:"#D7B87A",fontFamily:"monospace",overflowX:"auto",whiteSpace:"pre-wrap",margin:0}}>{iframeCode}</pre>
            </div>

            {/* Script */}
            <div style={card}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{...secLabel,margin:0}}>Script Tag</span>
                {copyBtn(scriptCode,"script","Copy")}
              </div>
              <pre style={{background:"#040D15",border:"1px solid rgba(215,184,122,0.1)",borderRadius:8,padding:12,fontSize:11,color:"#D7B87A",fontFamily:"monospace",overflowX:"auto",whiteSpace:"pre-wrap",margin:0}}>{scriptCode}</pre>
            </div>

            {/* Instructions */}
            <div style={card}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span style={{...secLabel,margin:0}}>Integration Instructions</span>
                {copyBtn(INSTRUCTIONS,"instructions","Copy Instructions")}
              </div>
              <ol style={{margin:0,padding:"0 0 0 18px",display:"flex",flexDirection:"column",gap:6}}>
                {INSTRUCTIONS.split("\n").map((line,i)=>(
                  <li key={i} style={{fontSize:12,color:"rgba(224,225,221,0.55)"}}>{line.replace(/^\d+\.\s/,"")}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
