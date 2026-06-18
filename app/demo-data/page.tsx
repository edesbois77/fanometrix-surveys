"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

type Stats = { demo_count: number; real_count: number };

const PRESETS = [
  { label: "100",    count: 100,   note: "Quick test"    },
  { label: "1,000",  count: 1000,  note: "Small dataset" },
  { label: "5,000",  count: 5000,  note: "Medium dataset"},
  { label: "10,000", count: 10000, note: "Large dataset" },
];

const DISTRIBUTIONS = [
  { title: "Countries",    rows: [{ l:"United Kingdom",pct:40},{l:"Germany",pct:20},{l:"Spain",pct:15},{l:"Italy",pct:10},{l:"France",pct:10},{l:"Other",pct:5}] },
  { title: "Publishers",   rows: [{ l:"FotMob",pct:35},{l:"LiveScore",pct:35},{l:"Forza Football",pct:20},{l:"Football365",pct:10}] },
  { title: "Devices",      rows: [{ l:"Mobile",pct:75},{l:"Desktop",pct:20},{l:"Tablet",pct:5}] },
  { title: "Q1 · Attendance", rows: [{ l:"Never",pct:25},{l:"1-2 times/year",pct:35},{l:"3-5 times/year",pct:25},{l:"5+/year",pct:15}] },
  { title: "Q2 · Experience", rows: [{ l:"Excellent",pct:30},{l:"Good",pct:45},{l:"Average",pct:20},{l:"Poor",pct:5}] },
  { title: "Q3 · Recommend",  rows: [{ l:"Very likely",pct:35},{l:"Likely",pct:40},{l:"Somewhat likely",pct:20},{l:"Not likely",pct:5}] },
];

const BATCH = 500;

const card: React.CSSProperties = { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(215,184,122,0.12)", borderRadius:16, backdropFilter:"blur(8px)" };

export default function DemoDataPage() {
  const [stats,       setStats]       = useState<Stats|null>(null);
  const [generating,  setGenerating]  = useState(false);
  const [progress,    setProgress]    = useState({done:0,total:0});
  const [deleting,    setDeleting]    = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmed,   setConfirmed]   = useState(false);
  const [toast,       setToast]       = useState<{msg:string;ok:boolean}|null>(null);

  const loadStats = useCallback(async()=>{
    const r=await fetch("/api/demo/stats"); setStats(await r.json());
  },[]);

  useEffect(()=>{loadStats();},[loadStats]);

  function showToast(msg:string,ok=true){setToast({msg,ok});setTimeout(()=>setToast(null),4000);}

  async function generate(total:number) {
    setGenerating(true); setProgress({done:0,total});
    const batches=Math.ceil(total/BATCH);
    for(let i=0;i<batches;i++){
      const count=Math.min(BATCH,total-i*BATCH);
      const r=await fetch("/api/demo/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({count})});
      if(!r.ok){showToast("Generation failed.",false);break;}
      setProgress({done:Math.min((i+1)*BATCH,total),total});
    }
    setGenerating(false); setProgress({done:0,total:0});
    await loadStats(); showToast(`${total.toLocaleString()} demo responses generated.`);
  }

  async function handleDelete(){
    setDeleting(true); setShowConfirm(false); setConfirmed(false);
    const r=await fetch("/api/demo/delete",{method:"DELETE"}); const j=await r.json();
    setDeleting(false); await loadStats(); showToast(`${(j.deleted??0).toLocaleString()} demo responses deleted.`);
  }

  const pct=progress.total>0?Math.round(progress.done/progress.total*100):0;

  return (
    <AdminShell>
      <div style={{padding:"28px 28px 40px",maxWidth:960,margin:"0 auto"}}>
        <h1 style={{fontSize:26,fontWeight:700,color:"#FFFFFF",margin:0,letterSpacing:"-0.02em",marginBottom:4}}>Demo Data Generator</h1>
        <p style={{fontSize:11,color:"rgba(224,225,221,0.4)",marginBottom:28}}>Generate realistic football fan survey data for testing and demonstrations.</p>

        {/* Status */}
        <div style={{...card, padding:20, marginBottom:12, borderColor:(stats?.demo_count)?"rgba(215,184,122,0.25)":"rgba(215,184,122,0.12)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <p style={{fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>Demo Responses in Database</p>
              <p style={{fontSize:40,fontWeight:700,color:stats?.demo_count?"#D7B87A":"rgba(255,255,255,0.2)",margin:0}}>{stats?.demo_count?.toLocaleString()??<span style={{opacity:0.3}}>—</span>}</p>
              {stats&&<p style={{fontSize:11,color:"rgba(224,225,221,0.35)",marginTop:4}}>+ {stats.real_count.toLocaleString()} real responses (never touched)</p>}
            </div>
            {(stats?.demo_count??0)>0&&(
              <button onClick={()=>{setShowConfirm(true);setConfirmed(false);}} disabled={deleting} style={{
                fontSize:12,border:"1px solid rgba(215,76,76,0.4)",color:"#f87171",background:"rgba(215,76,76,0.08)",
                cursor:"pointer",padding:"9px 18px",borderRadius:10,fontWeight:600,
              }}>{deleting?"Deleting…":"Delete Demo Data"}</button>
            )}
          </div>
        </div>

        {/* Generate */}
        <div style={{...card, padding:20, marginBottom:12}}>
          <p style={{fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:14}}>Generate Responses</p>
          {generating?(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#E0E1DD",marginBottom:8}}>
                <span>Generating… {progress.done.toLocaleString()} / {progress.total.toLocaleString()}</span>
                <span style={{color:"#D7B87A",fontWeight:700}}>{pct}%</span>
              </div>
              <div style={{height:6,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:"#D7B87A",borderRadius:3,transition:"width 0.3s"}} />
              </div>
              <p style={{fontSize:11,color:"rgba(224,225,221,0.3)",marginTop:8}}>Inserting in batches of 500 — please wait…</p>
            </div>
          ):(
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
              {PRESETS.map(({label,count,note})=>(
                <button key={count} onClick={()=>generate(count)} style={{
                  display:"flex",flexDirection:"column",alignItems:"center",gap:4,
                  border:"1px solid rgba(215,184,122,0.2)",borderRadius:14,padding:"20px 12px",
                  background:"rgba(255,255,255,0.02)",cursor:"pointer",transition:"all 0.15s",
                }}>
                  <span style={{fontSize:28,fontWeight:700,color:"#D7B87A"}}>{label}</span>
                  <span style={{fontSize:11,color:"rgba(224,225,221,0.4)"}}>{note}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Distributions */}
        <div style={{...card, padding:20, marginBottom:12}}>
          <p style={{fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:16}}>Distribution Preview</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:24}}>
            {DISTRIBUTIONS.map(({title,rows})=>(
              <div key={title}>
                <p style={{fontSize:10,fontWeight:700,color:"#E0E1DD",marginBottom:8}}>{title}</p>
                {rows.map(({l,pct:p})=>(
                  <div key={l} style={{marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                      <span style={{color:"rgba(224,225,221,0.7)"}}>{l}</span>
                      <span style={{color:"rgba(215,184,122,0.5)"}}>{p}%</span>
                    </div>
                    <div style={{height:3,background:"rgba(255,255,255,0.07)",borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${p}%`,background:"rgba(215,184,122,0.4)",borderRadius:2}} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Safety note */}
        <div style={{background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.15)",borderRadius:12,padding:"14px 18px",display:"flex",gap:12,alignItems:"flex-start"}}>
          <span style={{color:"#6ee7b7",fontSize:16}}>✓</span>
          <div>
            <p style={{fontSize:12,fontWeight:600,color:"#6ee7b7",marginBottom:2}}>Real data is always safe</p>
            <p style={{fontSize:11,color:"rgba(110,231,183,0.6)"}}>Every demo response is tagged <code style={{background:"rgba(110,231,183,0.1)",padding:"1px 5px",borderRadius:4}}>is_demo = true</code>. The delete function only removes rows with this flag. Real survey responses cannot be deleted from this page.</p>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm&&(
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(7,18,29,0.85)",backdropFilter:"blur(8px)"}}>
          <div style={{background:"#0F1E2E",border:"1px solid rgba(215,184,122,0.2)",borderRadius:20,padding:28,maxWidth:400,width:"100%",margin:"0 16px"}}>
            <h2 style={{fontSize:18,fontWeight:700,color:"#FFFFFF",marginBottom:6}}>Delete Demo Data</h2>
            <p style={{fontSize:13,color:"rgba(224,225,221,0.6)",marginBottom:16}}>
              This will permanently delete <strong style={{color:"#f87171"}}>{stats?.demo_count?.toLocaleString()} demo responses</strong>. This cannot be undone.
            </p>
            <div style={{background:"rgba(16,185,129,0.06)",border:"1px solid rgba(16,185,129,0.12)",borderRadius:8,padding:"10px 14px",fontSize:11,color:"rgba(110,231,183,0.7)",marginBottom:16}}>
              ✓ Your {stats?.real_count?.toLocaleString()} real responses will not be affected.
            </div>
            <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",marginBottom:20}}>
              <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} style={{marginTop:2,accentColor:"#D7B87A",width:16,height:16}} />
              <span style={{fontSize:12,color:"rgba(224,225,221,0.7)"}}>I understand this will delete all demo responses and cannot be undone.</span>
            </label>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setShowConfirm(false);setConfirmed(false);}} style={{flex:1,fontSize:12,border:"1px solid rgba(215,184,122,0.2)",color:"rgba(224,225,221,0.6)",background:"none",cursor:"pointer",padding:"10px",borderRadius:10}}>Cancel</button>
              <button onClick={handleDelete} disabled={!confirmed} style={{flex:1,fontSize:12,fontWeight:700,background:confirmed?"#D7B87A":"rgba(215,184,122,0.15)",color:confirmed?"#07121D":"rgba(215,184,122,0.3)",border:"none",cursor:confirmed?"pointer":"not-allowed",padding:"10px",borderRadius:10}}>
                Delete {stats?.demo_count?.toLocaleString()} Responses
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast&&(
        <div style={{position:"fixed",bottom:24,right:24,zIndex:50,padding:"12px 18px",borderRadius:12,fontSize:12,fontWeight:600,background:toast.ok?"rgba(16,185,129,0.15)":"rgba(239,68,68,0.15)",border:`1px solid ${toast.ok?"rgba(16,185,129,0.3)":"rgba(239,68,68,0.3)"}`,color:toast.ok?"#6ee7b7":"#fca5a5"}}>
          {toast.ok?"✓":"✕"} {toast.msg}
        </div>
      )}
    </AdminShell>
  );
}
