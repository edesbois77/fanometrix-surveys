"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";

type Survey   = { id:string; name:string };
type Campaign = { id:string; campaign_id:string; brand_name:string; campaign_name:string; campaign_description:string|null; start_date:string|null; end_date:string|null; survey_id:string|null; surveys?:{name:string}|null; publishers:string[]; status:"draft"|"live"|"completed"|"archived"; created_at:string };

const STATUS = {
  draft:     { bg:"rgba(11,25,41,0.06)",    text:"#5F6670",  border:"rgba(11,25,41,0.12)" },
  live:      { bg:"rgba(16,185,129,0.08)",  text:"#059669",  border:"rgba(16,185,129,0.2)" },
  completed: { bg:"rgba(79,107,138,0.08)",  text:"#4F6B8A",  border:"rgba(79,107,138,0.2)" },
  archived:  { bg:"rgba(215,184,122,0.10)", text:"#92400E",  border:"rgba(215,184,122,0.25)" },
};

function genId(b:string,n:string){return`${b}_${n}_${new Date().getFullYear()}`.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"").replace(/__+/g,"_").replace(/^_|_$/g,"").slice(0,80);}

const card: React.CSSProperties = {background:"#FFFFFF",border:"1px solid rgba(11,25,41,0.08)",borderRadius:16,boxShadow:"0 4px 20px rgba(11,25,41,0.06)"};
const inp:  React.CSSProperties = {width:"100%",background:"#F7F6F2",border:"1px solid rgba(11,25,41,0.10)",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#0B1929",outline:"none"};
const lbl:  React.CSSProperties = {display:"block",fontSize:9,fontWeight:700,color:"#D7B87A",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:5};
const BLANK: Partial<Campaign> = {campaign_id:"",brand_name:"",campaign_name:"",campaign_description:"",start_date:null,end_date:null,survey_id:null,publishers:[],status:"draft"};

export default function CampaignsPage(){
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [surveys,  setSurveys]  =useState<Survey[]>([]);
  const [loading,  setLoading]  =useState(true);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [editing,  setEditing]  =useState<Partial<Campaign>>(BLANK);
  const [pubInput, setPubInput] =useState("");
  const [saving,   setSaving]   =useState(false);
  const [error,    setError]    =useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    const [cr,sr]=await Promise.all([fetch("/api/campaigns"),fetch("/api/surveys")]);
    setCampaigns((await cr.json()).data??[]);setSurveys((await sr.json()).data??[]);setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  function openCreate(){setEditing({...BLANK,publishers:[]});setPubInput("");setDrawerOpen(true);}
  function openEdit(c:Campaign){setEditing({...c});setPubInput("");setDrawerOpen(true);}
  function addPub(){const v=pubInput.trim();if(!v)return;setEditing(e=>({...e,publishers:[...(e.publishers??[]),v]}));setPubInput("");}
  function removePub(i:number){setEditing(e=>({...e,publishers:(e.publishers??[]).filter((_,j)=>j!==i)}));}
  function autoId(){setEditing(e=>({...e,campaign_id:genId(e.brand_name??"",e.campaign_name??"")}));}

  async function handleSave(){
    if(!editing.brand_name?.trim()||!editing.campaign_name?.trim()||!editing.campaign_id?.trim()){setError("Brand name, campaign name and ID are required.");return;}
    setError("");setSaving(true);
    if(editing.id) await fetch(`/api/campaigns/${editing.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(editing)});
    else await fetch("/api/campaigns",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(editing)});
    setSaving(false);setDrawerOpen(false);load();
  }
  async function handleDelete(id:string){if(!confirm("Delete this campaign?"))return;await fetch(`/api/campaigns/${id}`,{method:"DELETE"});load();}
  async function changeStatus(c:Campaign,status:string){await fetch(`/api/campaigns/${c.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...c,status})});load();}

  return(
    <AdminShell>
      <div style={{padding:"32px 32px 48px",maxWidth:960,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
          <div>
            <p style={{fontSize:10,color:"#D7B87A",fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:5}}>Fanometrix Pulse</p>
            <h1 style={{fontSize:28,fontWeight:700,color:"#0B1929",margin:0,letterSpacing:"-0.02em"}}>Campaigns</h1>
            <p style={{fontSize:12,color:"#5F6670",marginTop:4}}>{campaigns.length} campaign{campaigns.length!==1?"s":""}</p>
          </div>
          <button onClick={openCreate} style={{fontSize:13,fontWeight:700,background:"#D7B87A",color:"#0B1929",border:"none",cursor:"pointer",padding:"10px 22px",borderRadius:10}}>+ Create Campaign</button>
        </div>

        {loading&&<p style={{color:"#5F6670",fontSize:13}}>Loading…</p>}
        {!loading&&campaigns.length===0&&(
          <div style={{textAlign:"center",padding:"64px 0",color:"rgba(11,25,41,0.25)"}}>
            <p style={{fontSize:40,marginBottom:12}}>◎</p>
            <p style={{fontSize:14,fontWeight:600,color:"#5F6670"}}>No campaigns yet</p>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {campaigns.map(c=>{const st=STATUS[c.status]??STATUS.draft;return(
            <div key={c.id} style={{...card,padding:18,display:"flex",alignItems:"center",gap:16}}>
              <Link href={`/campaigns/${c.id}`} style={{flex:1,minWidth:0,textDecoration:"none",display:"block"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,color:"#0B1929",fontSize:14}}>{c.brand_name}</span>
                  <span style={{color:"rgba(11,25,41,0.2)"}}>·</span>
                  <span style={{color:"#5F6670",fontSize:13}}>{c.campaign_name}</span>
                </div>
                <code style={{fontSize:11,color:"#D7B87A"}}>{c.campaign_id}</code>
                {c.campaign_description&&<p style={{fontSize:11,color:"rgba(11,25,41,0.35)",marginTop:3}}>{c.campaign_description}</p>}
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
                  {c.surveys?.name&&<span style={{fontSize:10,background:"rgba(215,184,122,0.1)",color:"#92400E",padding:"2px 8px",borderRadius:20,border:"1px solid rgba(215,184,122,0.2)"}}>{c.surveys.name}</span>}
                  {c.publishers.map(p=><span key={p} style={{fontSize:10,background:"rgba(11,25,41,0.05)",color:"#5F6670",padding:"2px 8px",borderRadius:20}}>{p}</span>)}
                  {c.start_date&&<span style={{fontSize:10,color:"rgba(11,25,41,0.3)"}}>{c.start_date} → {c.end_date??"ongoing"}</span>}
                </div>
              </Link>
              <span style={{fontSize:10,fontWeight:700,background:st.bg,color:st.text,border:`1px solid ${st.border}`,padding:"4px 10px",borderRadius:20,flexShrink:0,textTransform:"capitalize"}}>{c.status}</span>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>openEdit(c)} style={{fontSize:11,border:"1px solid rgba(11,25,41,0.12)",color:"#5F6670",background:"#FFFFFF",cursor:"pointer",padding:"6px 12px",borderRadius:8}}>Edit</button>
                <button onClick={()=>handleDelete(c.id)} style={{fontSize:11,border:"1px solid rgba(220,38,38,0.15)",color:"#dc2626",background:"#FFFFFF",cursor:"pointer",padding:"6px 12px",borderRadius:8}}>Delete</button>
              </div>
            </div>
          );})}
        </div>
      </div>

      {drawerOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex"}}>
          <div style={{flex:1,background:"rgba(11,25,41,0.4)",backdropFilter:"blur(4px)"}} onClick={()=>setDrawerOpen(false)} />
          <div style={{width:480,background:"#FFFFFF",borderLeft:"1px solid rgba(11,25,41,0.1)",display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:"-8px 0 32px rgba(11,25,41,0.12)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px",borderBottom:"1px solid rgba(11,25,41,0.08)"}}>
              <h2 style={{fontSize:16,fontWeight:700,color:"#0B1929",margin:0}}>{editing.id?"Edit Campaign":"Create Campaign"}</h2>
              <button onClick={()=>setDrawerOpen(false)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(11,25,41,0.4)",fontSize:22}}>×</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",gap:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[["Brand Name *","brand_name","e.g. Carlsberg"],["Campaign Name *","campaign_name","e.g. UCL 2026"]].map(([l,f,ph])=>(
                  <div key={f as string}><label style={lbl}>{l as string}</label><input value={(editing as Record<string,string>)[f as string]??""} onChange={e=>setEditing(x=>({...x,[f as string]:e.target.value}))} placeholder={ph as string} style={inp} /></div>
                ))}
              </div>
              <div><label style={lbl}>Campaign ID *</label>
                <div style={{display:"flex",gap:8}}>
                  <input value={editing.campaign_id??""} onChange={e=>setEditing(x=>({...x,campaign_id:e.target.value}))} placeholder="carlsberg_ucl_2026" style={{...inp,fontFamily:"monospace",fontSize:12}} />
                  <button onClick={autoId} style={{fontSize:11,fontWeight:600,border:"1px solid rgba(11,25,41,0.15)",color:"#0B1929",background:"#FFFFFF",cursor:"pointer",padding:"8px 14px",borderRadius:8,whiteSpace:"nowrap"}}>Auto</button>
                </div>
              </div>
              <div><label style={lbl}>Description</label><input value={editing.campaign_description??""} onChange={e=>setEditing(x=>({...x,campaign_description:e.target.value}))} placeholder="Optional" style={inp} /></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[["Start Date","start_date"],["End Date","end_date"]].map(([l,f])=>(<div key={f as string}><label style={lbl}>{l as string}</label><input type="date" value={(editing as Record<string,string|null>)[f as string]??""} onChange={e=>setEditing(x=>({...x,[f as string]:e.target.value||null}))} style={inp} /></div>))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><label style={lbl}>Survey</label><select value={editing.survey_id??""} onChange={e=>setEditing(x=>({...x,survey_id:e.target.value||null}))} style={inp}><option value="">None</option>{surveys.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div><label style={lbl}>Status</label><select value={editing.status??"draft"} onChange={e=>setEditing(x=>({...x,status:e.target.value as Campaign["status"]}))} style={inp}>{["draft","live","completed","archived"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}</select></div>
              </div>
              <div><label style={lbl}>Publishers</label>
                <div style={{display:"flex",gap:8,marginBottom:8}}><input value={pubInput} onChange={e=>setPubInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPub()} placeholder="e.g. sky-sports" style={inp} /><button onClick={addPub} style={{fontSize:11,border:"1px solid rgba(11,25,41,0.15)",color:"#0B1929",background:"#FFFFFF",cursor:"pointer",padding:"8px 14px",borderRadius:8}}>Add</button></div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{(editing.publishers??[]).map((p,i)=><span key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,background:"rgba(215,184,122,0.1)",color:"#0B1929",padding:"4px 10px",borderRadius:20,border:"1px solid rgba(215,184,122,0.2)"}}>{p}<button onClick={()=>removePub(i)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(11,25,41,0.4)",fontSize:14}}>×</button></span>)}</div>
              </div>
              {error&&<p style={{fontSize:11,color:"#dc2626"}}>{error}</p>}
            </div>
            <div style={{padding:"16px 24px",borderTop:"1px solid rgba(11,25,41,0.08)",display:"flex",justifyContent:"flex-end",gap:10}}>
              <button onClick={()=>setDrawerOpen(false)} style={{fontSize:12,color:"#5F6670",background:"none",border:"none",cursor:"pointer",padding:"10px 16px"}}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{fontSize:12,fontWeight:700,background:"#D7B87A",color:"#0B1929",border:"none",cursor:"pointer",padding:"10px 22px",borderRadius:10,opacity:saving?0.6:1}}>{saving?"Saving…":"Save Campaign"}</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
