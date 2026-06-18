"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type Stats = { demo_count:number; real_count:number };

const PRESETS = [{label:"100",count:100,note:"Quick test"},{label:"1,000",count:1000,note:"Small dataset"},{label:"5,000",count:5000,note:"Medium dataset"},{label:"10,000",count:10000,note:"Large dataset"}];
const DISTS = [
  {title:"Countries",  rows:[{l:"United Kingdom",p:40},{l:"Germany",p:20},{l:"Spain",p:15},{l:"Italy",p:10},{l:"France",p:10},{l:"Other",p:5}]},
  {title:"Publishers", rows:[{l:"FotMob",p:35},{l:"LiveScore",p:35},{l:"Forza Football",p:20},{l:"Football365",p:10}]},
  {title:"Devices",    rows:[{l:"Mobile",p:75},{l:"Desktop",p:20},{l:"Tablet",p:5}]},
  {title:"Q1",         rows:[{l:"Never",p:25},{l:"1-2 times/year",p:35},{l:"3-5 times/year",p:25},{l:"5+/year",p:15}]},
  {title:"Q2",         rows:[{l:"Excellent",p:30},{l:"Good",p:45},{l:"Average",p:20},{l:"Poor",p:5}]},
  {title:"Q3",         rows:[{l:"Very likely",p:35},{l:"Likely",p:40},{l:"Somewhat likely",p:20},{l:"Not likely",p:5}]},
];

const BATCH=500;
const card: React.CSSProperties={background:"#FFFFFF",border:"1px solid rgba(11,25,41,0.08)",borderRadius:16,boxShadow:"0 4px 20px rgba(11,25,41,0.06)"};

export default function DemoDataPage(){
  const [stats,       setStats]       =useState<Stats|null>(null);
  const [generating,  setGenerating]  =useState(false);
  const [progress,    setProgress]    =useState({done:0,total:0});
  const [deleting,    setDeleting]    =useState(false);
  const [showConfirm, setShowConfirm] =useState(false);
  const [confirmed,   setConfirmed]   =useState(false);
  const [toast,       setToast]       =useState<{msg:string;ok:boolean}|null>(null);

  const loadStats=useCallback(async()=>{const r=await fetch("/api/demo/stats");setStats(await r.json());},[]);
  useEffect(()=>{loadStats();},[loadStats]);
  function showToast(msg:string,ok=true){setToast({msg,ok});setTimeout(()=>setToast(null),4000);}

  async function generate(total:number){
    setGenerating(true);setProgress({done:0,total});
    for(let i=0;i<Math.ceil(total/BATCH);i++){
      const count=Math.min(BATCH,total-i*BATCH);
      const r=await fetch("/api/demo/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({count})});
      if(!r.ok){showToast("Generation failed.",false);break;}
      setProgress({done:Math.min((i+1)*BATCH,total),total});
    }
    setGenerating(false);setProgress({done:0,total:0});await loadStats();showToast(`${total.toLocaleString()} demo responses generated.`);
  }

  async function handleDelete(){
    setDeleting(true);setShowConfirm(false);setConfirmed(false);
    const r=await fetch("/api/demo/delete",{method:"DELETE"});const j=await r.json();
    setDeleting(false);await loadStats();showToast(`${(j.deleted??0).toLocaleString()} demo responses deleted.`);
  }

  const pct=progress.total>0?Math.round(progress.done/progress.total*100):0;

  return(
    <AdminShell>
      <div style={{padding:"32px 32px 48px",maxWidth:960,margin:"0 auto"}}>
        <p style={{fontSize:10,color:"#D7B87A",fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:5}}>Fanometrix Pulse</p>
        <h1 style={{fontSize:28,fontWeight:700,color:"#0B1929",margin:0,letterSpacing:"-0.02em",marginBottom:4}}>Demo Data Generator</h1>
        <p style={{fontSize:12,color:"#5F6670",marginBottom:28}}>Generate realistic football fan survey data for testing and demonstrations.</p>

        <div style={{...card,padding:20,marginBottom:12,borderColor:(stats?.demo_count)?"rgba(215,184,122,0.3)":"rgba(11,25,41,0.08)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <p style={{fontSize:9,fontWeight:700,color:"#D7B87A",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:8}}>Demo Responses in Database</p>
              <p style={{fontSize:40,fontWeight:700,color:stats?.demo_count?"#D7B87A":"rgba(11,25,41,0.2)",margin:0}}>{stats?.demo_count?.toLocaleString()??<span>—</span>}</p>
              {stats&&<p style={{fontSize:11,color:"#5F6670",marginTop:4}}>+ {stats.real_count.toLocaleString()} real responses (never touched)</p>}
            </div>
            {(stats?.demo_count??0)>0&&(
              <button onClick={()=>{setShowConfirm(true);setConfirmed(false);}} disabled={deleting} style={{fontSize:12,border:"1px solid rgba(220,38,38,0.2)",color:"#dc2626",background:"rgba(220,38,38,0.04)",cursor:"pointer",padding:"9px 18px",borderRadius:10,fontWeight:600}}>
                {deleting?"Deleting…":"Delete Demo Data"}
              </button>
            )}
          </div>
        </div>

        <div style={{...card,padding:20,marginBottom:12}}>
          <p style={{fontSize:9,fontWeight:700,color:"#D7B87A",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:14}}>Generate Responses</p>
          {generating?(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#0B1929",marginBottom:8,fontWeight:500}}>
                <span>Generating… {progress.done.toLocaleString()} / {progress.total.toLocaleString()}</span>
                <span style={{color:"#D7B87A",fontWeight:700}}>{pct}%</span>
              </div>
              <div style={{height:6,background:"rgba(11,25,41,0.07)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:"#D7B87A",borderRadius:3,transition:"width 0.3s"}} />
              </div>
              <p style={{fontSize:11,color:"#5F6670",marginTop:8}}>Inserting in batches of 500 — please wait…</p>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
              {PRESETS.map(({label,count,note})=>(
                <button key={count} onClick={()=>generate(count)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,border:"1px solid rgba(11,25,41,0.12)",borderRadius:14,padding:"20px 12px",background:"#FFFFFF",cursor:"pointer",transition:"all 0.12s"}}>
                  <span style={{fontSize:26,fontWeight:700,color:"#0B1929"}}>{label}</span>
                  <span style={{fontSize:11,color:"#5F6670"}}>{note}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{...card,padding:20,marginBottom:12}}>
          <p style={{fontSize:9,fontWeight:700,color:"#D7B87A",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:16}}>Distribution Preview</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:24}}>
            {DISTS.map(({title,rows})=>(
              <div key={title}>
                <p style={{fontSize:11,fontWeight:700,color:"#0B1929",marginBottom:10}}>{title}</p>
                {rows.map(({l,p})=>(
                  <div key={l} style={{marginBottom:7}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}><span style={{color:"#5F6670"}}>{l}</span><span style={{color:"#D7B87A",fontWeight:600}}>{p}%</span></div>
                    <div style={{height:3,background:"rgba(11,25,41,0.07)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${p}%`,background:"#0B1929",borderRadius:2,opacity:0.6}} /></div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{background:"rgba(16,185,129,0.04)",border:"1px solid rgba(16,185,129,0.15)",borderRadius:12,padding:"14px 18px",display:"flex",gap:12,alignItems:"flex-start"}}>
          <span style={{color:"#059669",fontSize:16}}>✓</span>
          <div>
            <p style={{fontSize:12,fontWeight:600,color:"#059669",marginBottom:2}}>Real data is always safe</p>
            <p style={{fontSize:11,color:"rgba(5,150,105,0.7)"}}>Every demo response is tagged <code style={{background:"rgba(5,150,105,0.08)",padding:"1px 5px",borderRadius:4,fontFamily:"monospace"}}>is_demo = true</code>. The delete function only removes rows with this flag.</p>
          </div>
        </div>
      </div>

      {showConfirm&&(
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(11,25,41,0.5)",backdropFilter:"blur(4px)"}}>
          <div style={{background:"#FFFFFF",border:"1px solid rgba(11,25,41,0.1)",borderRadius:20,padding:28,maxWidth:400,width:"100%",margin:"0 16px",boxShadow:"0 16px 48px rgba(11,25,41,0.2)"}}>
            <h2 style={{fontSize:18,fontWeight:700,color:"#0B1929",marginBottom:6}}>Delete Demo Data</h2>
            <p style={{fontSize:13,color:"#5F6670",marginBottom:14}}>This will permanently delete <strong style={{color:"#dc2626"}}>{stats?.demo_count?.toLocaleString()} demo responses</strong>.</p>
            <div style={{background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.15)",borderRadius:8,padding:"10px 14px",fontSize:11,color:"#059669",marginBottom:16}}>✓ Your {stats?.real_count?.toLocaleString()} real responses will not be affected.</div>
            <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",marginBottom:20}}>
              <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} style={{marginTop:2,accentColor:"#D7B87A",width:16,height:16}} />
              <span style={{fontSize:12,color:"#5F6670"}}>I understand this cannot be undone.</span>
            </label>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setShowConfirm(false);setConfirmed(false);}} style={{flex:1,fontSize:12,border:"1px solid rgba(11,25,41,0.12)",color:"#5F6670",background:"#FFFFFF",cursor:"pointer",padding:"10px",borderRadius:10}}>Cancel</button>
              <button onClick={handleDelete} disabled={!confirmed} style={{flex:1,fontSize:12,fontWeight:700,background:confirmed?"#D7B87A":"rgba(11,25,41,0.06)",color:confirmed?"#0B1929":"rgba(11,25,41,0.3)",border:"none",cursor:confirmed?"pointer":"not-allowed",padding:"10px",borderRadius:10}}>Delete {stats?.demo_count?.toLocaleString()} Responses</button>
            </div>
          </div>
        </div>
      )}

      {toast&&(
        <div style={{position:"fixed",bottom:24,right:24,zIndex:50,padding:"12px 18px",borderRadius:12,fontSize:12,fontWeight:600,background:"#FFFFFF",border:`1px solid ${toast.ok?"rgba(16,185,129,0.3)":"rgba(220,38,38,0.2)"}`,color:toast.ok?"#059669":"#dc2626",boxShadow:"0 4px 16px rgba(11,25,41,0.12)"}}>
          {toast.ok?"✓":"✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}
