"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";

type Survey = { id: string; name: string };
type Campaign = {
  id: string; campaign_id: string; brand_name: string; campaign_name: string;
  campaign_description: string|null; start_date: string|null; end_date: string|null;
  survey_id: string|null; surveys?: {name:string}|null; publishers: string[];
  status: "draft"|"live"|"completed"|"archived"; created_at: string;
};

const STATUS = {
  draft:     { bg:"rgba(100,116,139,0.15)", text:"rgba(148,163,184,0.9)", label:"Draft"     },
  live:      { bg:"rgba(16,185,129,0.12)",  text:"#6ee7b7",               label:"Live"      },
  completed: { bg:"rgba(79,107,138,0.2)",   text:"#8FA8C4",               label:"Completed" },
  archived:  { bg:"rgba(215,184,122,0.12)", text:"rgba(215,184,122,0.7)", label:"Archived"  },
};

function generateCampaignId(brand:string,name:string){
  return `${brand}_${name}_${new Date().getFullYear()}`.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"").replace(/__+/g,"_").replace(/^_|_$/g,"").slice(0,80);
}

const card: React.CSSProperties={background:"rgba(255,255,255,0.03)",border:"1px solid rgba(215,184,122,0.12)",borderRadius:16,backdropFilter:"blur(8px)"};
const input: React.CSSProperties={width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(215,184,122,0.15)",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#E0E1DD",outline:"none"};
const label_s: React.CSSProperties={display:"block",fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:5};

const BLANK: Partial<Campaign>={campaign_id:"",brand_name:"",campaign_name:"",campaign_description:"",start_date:null,end_date:null,survey_id:null,publishers:[],status:"draft"};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [surveys,   setSurveys]   = useState<Survey[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [drawerOpen,setDrawerOpen]= useState(false);
  const [editing,   setEditing]   = useState<Partial<Campaign>>(BLANK);
  const [pubInput,  setPubInput]  = useState("");
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");

  const load = useCallback(async()=>{
    setLoading(true);
    const [camRes,surRes]=await Promise.all([fetch("/api/campaigns"),fetch("/api/surveys")]);
    setCampaigns((await camRes.json()).data??[]);
    setSurveys((await surRes.json()).data??[]);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  function openCreate(){setEditing({...BLANK,publishers:[]});setPubInput("");setDrawerOpen(true);}
  function openEdit(c:Campaign){setEditing({...c});setPubInput("");setDrawerOpen(true);}

  function autoId(){setEditing(e=>({...e,campaign_id:generateCampaignId(e.brand_name??"",e.campaign_name??"")}));}

  function addPublisher(){const v=pubInput.trim();if(!v)return;setEditing(e=>({...e,publishers:[...(e.publishers??[]),v]}));setPubInput("");}
  function removePub(i:number){setEditing(e=>({...e,publishers:(e.publishers??[]).filter((_,j)=>j!==i)}));}

  async function handleSave(){
    if(!editing.brand_name?.trim()){setError("Brand name required.");return;}
    if(!editing.campaign_name?.trim()){setError("Campaign name required.");return;}
    if(!editing.campaign_id?.trim()){setError("Campaign ID required.");return;}
    setError("");setSaving(true);
    if(editing.id) await fetch(`/api/campaigns/${editing.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(editing)});
    else await fetch("/api/campaigns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(editing)});
    setSaving(false);setDrawerOpen(false);load();
  }

  async function handleDelete(id:string){
    if(!confirm("Delete this campaign?"))return;
    await fetch(`/api/campaigns/${id}`,{method:"DELETE"});load();
  }

  async function changeStatus(c:Campaign,status:string){
    await fetch(`/api/campaigns/${c.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...c,status})});load();
  }

  return (
    <AdminShell>
      <div style={{padding:"28px 28px 40px",maxWidth:960,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:700,color:"#FFFFFF",margin:0,letterSpacing:"-0.02em"}}>Campaigns</h1>
            <p style={{fontSize:11,color:"rgba(224,225,221,0.4)",marginTop:4}}>{campaigns.length} campaign{campaigns.length!==1?"s":""}</p>
          </div>
          <button onClick={openCreate} style={{fontSize:12,fontWeight:700,background:"#D7B87A",color:"#07121D",border:"none",cursor:"pointer",padding:"10px 20px",borderRadius:10}}>
            + Create Campaign
          </button>
        </div>

        {loading&&<p style={{color:"rgba(224,225,221,0.3)",fontSize:13}}>Loading…</p>}

        {!loading&&campaigns.length===0&&(
          <div style={{textAlign:"center",padding:"64px 0",color:"rgba(224,225,221,0.25)"}}>
            <p style={{fontSize:40,marginBottom:12}}>◎</p>
            <p style={{fontSize:14,fontWeight:600}}>No campaigns yet</p>
            <p style={{fontSize:12,marginTop:4}}>Create your first campaign to generate embed codes.</p>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {campaigns.map(c=>{
            const st=STATUS[c.status]??STATUS.draft;
            return (
              <div key={c.id} style={{...card,padding:18,display:"flex",alignItems:"center",gap:16}}>
                <Link href={`/campaigns/${c.id}`} style={{flex:1,minWidth:0,textDecoration:"none",display:"block"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,color:"#FFFFFF",fontSize:14}}>{c.brand_name}</span>
                    <span style={{color:"rgba(215,184,122,0.3)"}}>·</span>
                    <span style={{color:"#E0E1DD",fontSize:13}}>{c.campaign_name}</span>
                  </div>
                  <code style={{fontSize:11,color:"rgba(215,184,122,0.6)",fontFamily:"monospace"}}>{c.campaign_id}</code>
                  {c.campaign_description&&<p style={{fontSize:11,color:"rgba(224,225,221,0.35)",marginTop:3}}>{c.campaign_description}</p>}
                  <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                    {c.surveys?.name&&<span style={{fontSize:10,background:"rgba(215,184,122,0.1)",color:"rgba(215,184,122,0.7)",padding:"2px 8px",borderRadius:20}}>Survey: {c.surveys.name}</span>}
                    {c.publishers.map(p=><span key={p} style={{fontSize:10,background:"rgba(255,255,255,0.06)",color:"rgba(224,225,221,0.6)",padding:"2px 8px",borderRadius:20}}>{p}</span>)}
                    {c.start_date&&<span style={{fontSize:10,color:"rgba(224,225,221,0.3)"}}>{c.start_date} → {c.end_date??"ongoing"}</span>}
                  </div>
                </Link>
                <span style={{fontSize:10,fontWeight:700,background:st.bg,color:st.text,padding:"4px 10px",borderRadius:20,flexShrink:0}}>{st.label}</span>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>openEdit(c)} style={{fontSize:11,border:"1px solid rgba(215,184,122,0.2)",color:"rgba(215,184,122,0.7)",background:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8}}>Edit</button>
                  <button onClick={()=>handleDelete(c.id)} style={{fontSize:11,border:"1px solid rgba(239,68,68,0.2)",color:"rgba(248,113,113,0.7)",background:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8}}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex"}}>
          <div style={{flex:1,background:"rgba(7,18,29,0.7)",backdropFilter:"blur(4px)"}} onClick={()=>setDrawerOpen(false)} />
          <div style={{width:480,background:"#0D1B2A",borderLeft:"1px solid rgba(215,184,122,0.15)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px",borderBottom:"1px solid rgba(215,184,122,0.1)"}}>
              <h2 style={{fontSize:16,fontWeight:700,color:"#FFFFFF",margin:0}}>{editing.id?"Edit Campaign":"Create Campaign"}</h2>
              <button onClick={()=>setDrawerOpen(false)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(215,184,122,0.5)",fontSize:22}}>×</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",gap:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[["Brand Name *","brand_name","e.g. Carlsberg"],["Campaign Name *","campaign_name","e.g. UCL 2026"]].map(([l,f,ph])=>(
                  <div key={f as string}><label style={label_s}>{l as string}</label>
                    <input value={(editing as Record<string,string>)[f as string]??""} onChange={e=>setEditing(x=>({...x,[f as string]:e.target.value}))} placeholder={ph as string} style={input} />
                  </div>
                ))}
              </div>
              <div><label style={label_s}>Campaign ID *</label>
                <div style={{display:"flex",gap:8}}>
                  <input value={editing.campaign_id??""} onChange={e=>setEditing(x=>({...x,campaign_id:e.target.value}))} placeholder="carlsberg_ucl_2026" style={{...input,fontFamily:"monospace"}} />
                  <button onClick={autoId} style={{fontSize:11,fontWeight:600,border:"1px solid rgba(215,184,122,0.25)",color:"#D7B87A",background:"none",cursor:"pointer",padding:"8px 14px",borderRadius:8,whiteSpace:"nowrap"}}>Auto</button>
                </div>
              </div>
              <div><label style={label_s}>Description</label>
                <input value={editing.campaign_description??""} onChange={e=>setEditing(x=>({...x,campaign_description:e.target.value}))} placeholder="Optional" style={input} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[["Start Date","start_date"],["End Date","end_date"]].map(([l,f])=>(
                  <div key={f as string}><label style={label_s}>{l as string}</label>
                    <input type="date" value={(editing as Record<string,string|null>)[f as string]??""} onChange={e=>setEditing(x=>({...x,[f as string]:e.target.value||null}))} style={input} />
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><label style={label_s}>Survey</label>
                  <select value={editing.survey_id??""} onChange={e=>setEditing(x=>({...x,survey_id:e.target.value||null}))} style={input}>
                    <option value="">None selected</option>
                    {surveys.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><label style={label_s}>Status</label>
                  <select value={editing.status??"draft"} onChange={e=>setEditing(x=>({...x,status:e.target.value as Campaign["status"]}))} style={input}>
                    {["draft","live","completed","archived"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div><label style={label_s}>Publishers</label>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <input value={pubInput} onChange={e=>setPubInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPublisher()} placeholder="e.g. sky-sports" style={input} />
                  <button onClick={addPublisher} style={{fontSize:11,border:"1px solid rgba(215,184,122,0.25)",color:"#D7B87A",background:"none",cursor:"pointer",padding:"8px 14px",borderRadius:8}}>Add</button>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {(editing.publishers??[]).map((p,i)=>(
                    <span key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,background:"rgba(215,184,122,0.1)",color:"#D7B87A",padding:"4px 10px",borderRadius:20}}>
                      {p}<button onClick={()=>removePub(i)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(215,184,122,0.4)",fontSize:14}}>×</button>
                    </span>
                  ))}
                </div>
              </div>
              {error&&<p style={{fontSize:11,color:"#f87171"}}>{error}</p>}
            </div>
            <div style={{padding:"16px 24px",borderTop:"1px solid rgba(215,184,122,0.1)",display:"flex",justifyContent:"flex-end",gap:10}}>
              <button onClick={()=>setDrawerOpen(false)} style={{fontSize:12,color:"rgba(224,225,221,0.5)",background:"none",border:"none",cursor:"pointer",padding:"10px 16px"}}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{fontSize:12,fontWeight:700,background:"#D7B87A",color:"#07121D",border:"none",cursor:"pointer",padding:"10px 20px",borderRadius:10,opacity:saving?0.6:1}}>
                {saving?"Saving…":"Save Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
