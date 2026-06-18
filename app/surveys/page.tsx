"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminShell } from "@/app/components/AdminShell";

// ─── MPU inline styles ────────────────────────────────────────────────────────

const M = {
  wrap: { width:300,height:250,overflow:"hidden" as const,fontFamily:"system-ui,-apple-system,sans-serif",background:"linear-gradient(160deg,#312e81 0%,#1e1b4b 100%)",display:"flex",flexDirection:"column" as const,boxSizing:"border-box" as const,borderRadius:10,boxShadow:"0 8px 32px rgba(0,0,0,0.4)" },
  header: { display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px 6px",borderBottom:"1px solid rgba(255,255,255,0.1)",flexShrink:0 },
  logo: { color:"#fff",fontSize:11,fontWeight:700,letterSpacing:"0.02em",display:"flex",alignItems:"center",gap:4 },
  dot: { width:7,height:7,borderRadius:"50%",background:"#818cf8",display:"inline-block",flexShrink:0 },
  step: { color:"rgba(255,255,255,0.5)",fontSize:10,fontWeight:600,flexShrink:0 },
  body: { flex:1,padding:"8px 12px 8px",display:"flex",flexDirection:"column" as const,gap:7,minHeight:0 },
  question: { color:"#fff",fontSize:12,fontWeight:700,lineHeight:1.35,margin:0,flexShrink:0 },
  options: { display:"flex",flexDirection:"column" as const,gap:4,flex:1 },
  option: (sel:boolean)=>({ display:"flex",alignItems:"center",gap:8,padding:"5px 9px",borderRadius:6,flexShrink:0,cursor:"pointer" as const,border:`1px solid ${sel?"rgba(165,180,252,0.8)":"rgba(255,255,255,0.15)"}`,background:sel?"rgba(99,102,241,0.45)":"rgba(255,255,255,0.06)",transition:"background 0.1s" }),
  radio: (sel:boolean)=>({ width:12,height:12,borderRadius:"50%",flexShrink:0,border:`2px solid ${sel?"#a5b4fc":"rgba(255,255,255,0.4)"}`,background:sel?"#a5b4fc":"transparent",boxSizing:"border-box" as const }),
  lbl: { color:"#e0e7ff",fontSize:10.5,fontWeight:500,lineHeight:1 },
  btn: (dis:boolean)=>({ background:dis?"rgba(255,255,255,0.15)":"#fff",color:dis?"rgba(255,255,255,0.35)":"#312e81",border:"none",borderRadius:7,padding:"7px 0",fontSize:11,fontWeight:700,letterSpacing:"0.03em",cursor:dis?"not-allowed" as const:"pointer" as const,width:"100%",flexShrink:0 }),
  success: { width:300,height:250,overflow:"hidden" as const,borderRadius:10,background:"linear-gradient(160deg,#312e81 0%,#1e1b4b 100%)",display:"flex",flexDirection:"column" as const,alignItems:"center",justifyContent:"center",fontFamily:"system-ui,-apple-system,sans-serif",gap:8,textAlign:"center" as const,padding:20,boxSizing:"border-box" as const,boxShadow:"0 8px 32px rgba(0,0,0,0.4)" },
};

type Question = { id:string; text:string; options:string[] };
type Survey = { id:string; name:string; description:string|null; questions:Question[]; thank_you_title:string; thank_you_body:string; start_date:string|null; end_date:string|null; status:"draft"|"live"|"completed"|"archived"; is_template:boolean; created_at:string };
type PreviewSurvey = { name:string; questions:Question[]; thank_you_title:string; thank_you_body:string };

const STATUS = { draft:{bg:"rgba(100,116,139,0.15)",text:"rgba(148,163,184,0.9)"},live:{bg:"rgba(16,185,129,0.12)",text:"#6ee7b7"},completed:{bg:"rgba(79,107,138,0.2)",text:"#8FA8C4"},archived:{bg:"rgba(215,184,122,0.12)",text:"rgba(215,184,122,0.7)"} };

const BLANK_Q=():Question=>({id:`q${Date.now()}`,text:"",options:["",""]});
const BLANK_S: Omit<Survey,"id"|"created_at">={ name:"",description:"",questions:[BLANK_Q()],thank_you_title:"Thank you!",thank_you_body:"Your response has been recorded.",start_date:null,end_date:null,status:"draft",is_template:false };

const card: React.CSSProperties={background:"rgba(255,255,255,0.03)",border:"1px solid rgba(215,184,122,0.12)",borderRadius:16,backdropFilter:"blur(8px)"};
const input: React.CSSProperties={width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(215,184,122,0.15)",borderRadius:8,padding:"9px 12px",fontSize:13,color:"#E0E1DD",outline:"none"};
const lbl: React.CSSProperties={display:"block",fontSize:9,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:5};

function MPUPreviewModal({survey,onClose}:{survey:PreviewSurvey;onClose:()=>void}){
  const [step,setStep]=useState(0);
  const [answers,setAnswers]=useState<Record<string,string>>({});
  const [done,setDone]=useState(false);
  const qs=survey.questions??[];
  const q=qs[step]; const sel=q?(answers[q.id]??""):"";
  const isLast=step===qs.length-1; const isFirst=step===0;
  function restart(){setStep(0);setAnswers({});setDone(false);}

  return (
    <div style={{position:"fixed",inset:0,zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(7,18,29,0.85)",backdropFilter:"blur(8px)"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16}}>
        {/* Preview badge */}
        <div style={{background:"rgba(215,184,122,0.08)",border:"1px solid rgba(215,184,122,0.3)",borderRadius:12,padding:"10px 20px",textAlign:"center"}}>
          <p style={{fontSize:10,fontWeight:700,color:"#D7B87A",letterSpacing:"0.12em",textTransform:"uppercase"}}>◆ Preview Mode</p>
          <p style={{fontSize:11,color:"rgba(215,184,122,0.6)",marginTop:2}}>No responses are recorded.</p>
          <p style={{fontSize:11,color:"rgba(215,184,122,0.5)",marginTop:1,fontWeight:600}}>{survey.name}</p>
        </div>
        {/* MPU */}
        {done?(
          <div style={M.success}>
            <div style={{fontSize:34,lineHeight:1}}>🎉</div>
            <p style={{color:"#fff",fontSize:15,fontWeight:700,margin:0}}>{survey.thank_you_title||"Thank you!"}</p>
            <p style={{color:"rgba(255,255,255,0.6)",fontSize:11,margin:0,lineHeight:1.4}}>{survey.thank_you_body}</p>
            <p style={{color:"rgba(255,255,255,0.25)",fontSize:9,marginTop:6,letterSpacing:"0.06em"}}>PREVIEW MODE · NOT RECORDED</p>
          </div>
        ):(
          <div style={M.wrap}>
            <div style={M.header}>
              <div style={M.logo}><span style={M.dot} />Fanometrix Pulse</div>
              <span style={M.step}>{step+1} of {qs.length}</span>
            </div>
            <div style={M.body}>
              <p style={M.question}>{q?.text}</p>
              <div style={M.options}>
                {(q?.options??[]).map(opt=>{
                  const s=sel===opt;
                  return(<div key={opt} style={M.option(s)} onClick={()=>setAnswers(a=>({...a,[q.id]:opt}))} role="radio" aria-checked={s} tabIndex={0} onKeyDown={e=>e.key===" "&&setAnswers(a=>({...a,[q.id]:opt}))}>
                    <div style={M.radio(s)} /><span style={M.lbl}>{opt}</span>
                  </div>);
                })}
              </div>
              <button style={M.btn(!sel)} onClick={()=>{if(!sel)return;isLast?setDone(true):setStep(s=>s+1);}} disabled={!sel}>
                {isLast?"Submit ✓":"Next →"}
              </button>
            </div>
          </div>
        )}
        {/* Controls */}
        <div style={{display:"flex",gap:8}}>
          {!done&&!isFirst&&<button onClick={()=>setStep(s=>s-1)} style={{fontSize:11,border:"1px solid rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.7)",background:"none",cursor:"pointer",padding:"7px 14px",borderRadius:8}}>← Previous</button>}
          <button onClick={restart} style={{fontSize:11,border:"1px solid rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.7)",background:"none",cursor:"pointer",padding:"7px 14px",borderRadius:8}}>↺ Restart</button>
          {!done&&!isLast&&<button onClick={()=>setStep(s=>s+1)} style={{fontSize:11,border:"1px solid rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.7)",background:"none",cursor:"pointer",padding:"7px 14px",borderRadius:8}}>Next →</button>}
          <button onClick={onClose} style={{fontSize:11,fontWeight:600,background:"rgba(255,255,255,0.15)",color:"#fff",border:"none",cursor:"pointer",padding:"7px 16px",borderRadius:8}}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function SurveysPage() {
  const [surveys,      setSurveys]      = useState<Survey[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [previewSurvey,setPreviewSurvey]= useState<Survey|null>(null);
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [editing,      setEditing]      = useState<Partial<Survey>>(BLANK_S);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState("");

  const load = useCallback(async()=>{setLoading(true);const r=await fetch("/api/surveys");setSurveys((await r.json()).data??[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);

  function openCreate(){setEditing({...BLANK_S,questions:[BLANK_Q()]});setDrawerOpen(true);}
  function openEdit(s:Survey){setEditing({...s});setDrawerOpen(true);}

  async function openDuplicate(s:Survey){
    const p={...s,name:`${s.name} (copy)`,status:"draft" as const};
    delete (p as Partial<Survey>).id; delete (p as Partial<Survey>).created_at;
    await fetch("/api/surveys",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)});load();
  }

  async function handleDelete(id:string){if(!confirm("Delete this survey?"))return;await fetch(`/api/surveys/${id}`,{method:"DELETE"});load();}

  async function handleSave(){
    if(!editing.name?.trim()){setError("Survey name required.");return;}
    const qs=editing.questions??[];
    if(!qs.length){setError("At least one question required.");return;}
    for(const q of qs){if(!q.text.trim()){setError("All questions need text.");return;}if(q.options.filter(o=>o.trim()).length<2){setError("Each question needs 2+ options.");return;}}
    setError("");setSaving(true);
    const payload={...editing,questions:qs.map(q=>({...q,options:q.options.filter(o=>o.trim())}))};
    if(editing.id) await fetch(`/api/surveys/${editing.id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    else await fetch("/api/surveys",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    setSaving(false);setDrawerOpen(false);load();
  }

  function setQ(idx:number,patch:Partial<Question>){setEditing(e=>({...e,questions:(e.questions??[]).map((q,i)=>i===idx?{...q,...patch}:q)}));}
  function addQ(){if((editing.questions?.length??0)>=3)return;setEditing(e=>({...e,questions:[...(e.questions??[]),BLANK_Q()]}));}
  function removeQ(idx:number){setEditing(e=>({...e,questions:(e.questions??[]).filter((_,i)=>i!==idx)}));}
  function setOpt(qi:number,oi:number,val:string){setEditing(e=>({...e,questions:(e.questions??[]).map((q,i)=>i===qi?{...q,options:q.options.map((o,j)=>j===oi?val:o)}:q)}));}
  function addOpt(qi:number){setEditing(e=>({...e,questions:(e.questions??[]).map((q,i)=>i===qi?{...q,options:[...q.options,""]}:q)}));}
  function removeOpt(qi:number,oi:number){setEditing(e=>({...e,questions:(e.questions??[]).map((q,i)=>i===qi?{...q,options:q.options.filter((_,j)=>j!==oi)}:q)}));}

  return (
    <AdminShell>
      <div style={{padding:"28px 28px 40px",maxWidth:960,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:700,color:"#FFFFFF",margin:0,letterSpacing:"-0.02em"}}>Surveys</h1>
            <p style={{fontSize:11,color:"rgba(224,225,221,0.4)",marginTop:4}}>{surveys.length} survey{surveys.length!==1?"s":""}</p>
          </div>
          <button onClick={openCreate} style={{fontSize:12,fontWeight:700,background:"#D7B87A",color:"#07121D",border:"none",cursor:"pointer",padding:"10px 20px",borderRadius:10}}>
            + Create Survey
          </button>
        </div>

        {loading&&<p style={{color:"rgba(224,225,221,0.3)",fontSize:13}}>Loading…</p>}

        {!loading&&surveys.length===0&&(
          <div style={{textAlign:"center",padding:"64px 0",color:"rgba(224,225,221,0.25)"}}>
            <p style={{fontSize:40,marginBottom:12}}>◫</p>
            <p style={{fontSize:14,fontWeight:600}}>No surveys yet</p>
            <p style={{fontSize:12,marginTop:4}}>Create your first survey to get started.</p>
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {surveys.map(s=>{
            const st=STATUS[s.status]??STATUS.draft;
            return (
              <div key={s.id} style={{...card,padding:18,display:"flex",alignItems:"center",gap:14}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                    <span style={{fontWeight:700,color:"#FFFFFF",fontSize:14}}>{s.name}</span>
                    {s.is_template&&<span style={{fontSize:9,fontWeight:700,background:"rgba(124,58,237,0.15)",color:"rgba(167,139,250,0.8)",padding:"2px 8px",borderRadius:20,letterSpacing:"0.06em",textTransform:"uppercase"}}>Template</span>}
                  </div>
                  {s.description&&<p style={{fontSize:11,color:"rgba(224,225,221,0.35)",marginBottom:2}}>{s.description}</p>}
                  <p style={{fontSize:11,color:"rgba(224,225,221,0.3)"}}>
                    {s.questions.length} question{s.questions.length!==1?"s":""}
                    {s.start_date&&<> · {s.start_date}</>}{s.end_date&&<> → {s.end_date}</>}
                  </p>
                </div>
                <span style={{fontSize:10,fontWeight:700,background:st.bg,color:st.text,padding:"4px 10px",borderRadius:20,flexShrink:0,textTransform:"capitalize"}}>{s.status}</span>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>setPreviewSurvey(s)} disabled={s.questions.length===0} style={{fontSize:11,fontWeight:600,border:"1px solid rgba(215,184,122,0.3)",color:"#D7B87A",background:"rgba(215,184,122,0.06)",cursor:"pointer",padding:"6px 12px",borderRadius:8,opacity:s.questions.length===0?0.4:1}}>Preview MPU</button>
                  <button onClick={()=>openEdit(s)} style={{fontSize:11,border:"1px solid rgba(215,184,122,0.15)",color:"rgba(215,184,122,0.6)",background:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8}}>Edit</button>
                  <button onClick={()=>openDuplicate(s)} style={{fontSize:11,border:"1px solid rgba(215,184,122,0.15)",color:"rgba(215,184,122,0.6)",background:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8}}>Duplicate</button>
                  <button onClick={()=>handleDelete(s.id)} style={{fontSize:11,border:"1px solid rgba(239,68,68,0.2)",color:"rgba(248,113,113,0.6)",background:"none",cursor:"pointer",padding:"6px 12px",borderRadius:8}}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {previewSurvey&&<MPUPreviewModal survey={previewSurvey} onClose={()=>setPreviewSurvey(null)} />}

      {/* Drawer */}
      {drawerOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:50,display:"flex"}}>
          <div style={{flex:1,background:"rgba(7,18,29,0.7)",backdropFilter:"blur(4px)"}} onClick={()=>setDrawerOpen(false)} />
          <div style={{width:520,background:"#0D1B2A",borderLeft:"1px solid rgba(215,184,122,0.15)",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px",borderBottom:"1px solid rgba(215,184,122,0.1)"}}>
              <h2 style={{fontSize:16,fontWeight:700,color:"#FFFFFF",margin:0}}>{editing.id?"Edit Survey":"Create Survey"}</h2>
              <button onClick={()=>setDrawerOpen(false)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(215,184,122,0.5)",fontSize:22}}>×</button>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",gap:16}}>
              <div><label style={lbl}>Survey Name *</label><input value={editing.name??""} onChange={e=>setEditing(x=>({...x,name:e.target.value}))} placeholder="e.g. Premier League Fan Pulse" style={input} /></div>
              <div><label style={lbl}>Description</label><input value={editing.description??""} onChange={e=>setEditing(x=>({...x,description:e.target.value}))} placeholder="Optional" style={input} /></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {[["Start Date","start_date"],["End Date","end_date"]].map(([l,f])=>(
                  <div key={f as string}><label style={lbl}>{l as string}</label>
                    <input type="date" value={(editing as Record<string,string|null>)[f as string]??""} onChange={e=>setEditing(x=>({...x,[f as string]:e.target.value||null}))} style={input} />
                  </div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><label style={lbl}>Status</label>
                  <select value={editing.status??"draft"} onChange={e=>setEditing(x=>({...x,status:e.target.value as Survey["status"]}))} style={input}>
                    {["draft","live","completed","archived"].map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                  </select>
                </div>
                <div style={{display:"flex",alignItems:"flex-end",paddingBottom:6}}>
                  <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
                    <input type="checkbox" checked={editing.is_template??false} onChange={e=>setEditing(x=>({...x,is_template:e.target.checked}))} style={{accentColor:"#D7B87A",width:16,height:16}} />
                    <span style={{fontSize:12,color:"rgba(224,225,221,0.7)"}}>Save as template</span>
                  </label>
                </div>
              </div>

              {/* Questions */}
              <div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <label style={lbl}>Questions ({editing.questions?.length??0}/3)</label>
                  <button onClick={addQ} disabled={(editing.questions?.length??0)>=3} style={{fontSize:11,color:"#D7B87A",background:"none",border:"none",cursor:"pointer",opacity:(editing.questions?.length??0)>=3?0.3:1}}>+ Add question</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {(editing.questions??[]).map((q,qi)=>(
                    <div key={q.id} style={{border:"1px solid rgba(215,184,122,0.12)",borderRadius:10,padding:14}}>
                      <div style={{display:"flex",gap:8,marginBottom:10}}>
                        <span style={{fontSize:10,fontWeight:700,color:"#D7B87A",alignSelf:"center",minWidth:20}}>Q{qi+1}</span>
                        <input value={q.text} onChange={e=>setQ(qi,{text:e.target.value})} placeholder="Question text…" style={{...input,flex:1}} />
                        {(editing.questions?.length??0)>1&&<button onClick={()=>removeQ(qi)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(248,113,113,0.5)",fontSize:18}}>✕</button>}
                      </div>
                      <div style={{paddingLeft:28,display:"flex",flexDirection:"column",gap:6}}>
                        {q.options.map((opt,oi)=>(
                          <div key={oi} style={{display:"flex",gap:6}}>
                            <input value={opt} onChange={e=>setOpt(qi,oi,e.target.value)} placeholder={`Option ${oi+1}`} style={{...input,fontSize:11,padding:"6px 10px"}} />
                            {q.options.length>2&&<button onClick={()=>removeOpt(qi,oi)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(215,184,122,0.3)",fontSize:14}}>✕</button>}
                          </div>
                        ))}
                        {q.options.length<6&&<button onClick={()=>addOpt(qi)} style={{fontSize:11,color:"rgba(215,184,122,0.5)",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}>+ Add option</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Thank you */}
              <div style={{border:"1px solid rgba(215,184,122,0.1)",borderRadius:10,padding:14,background:"rgba(215,184,122,0.03)"}}>
                <label style={lbl}>Thank You Screen</label>
                <input value={editing.thank_you_title??""} onChange={e=>setEditing(x=>({...x,thank_you_title:e.target.value}))} placeholder="Title" style={{...input,marginBottom:8}} />
                <input value={editing.thank_you_body??""} onChange={e=>setEditing(x=>({...x,thank_you_body:e.target.value}))} placeholder="Message" style={input} />
              </div>

              {error&&<p style={{fontSize:11,color:"#f87171"}}>{error}</p>}
            </div>
            <div style={{padding:"16px 24px",borderTop:"1px solid rgba(215,184,122,0.1)",display:"flex",justifyContent:"flex-end",gap:10}}>
              <button onClick={()=>setDrawerOpen(false)} style={{fontSize:12,color:"rgba(224,225,221,0.5)",background:"none",border:"none",cursor:"pointer",padding:"10px 16px"}}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{fontSize:12,fontWeight:700,background:"#D7B87A",color:"#07121D",border:"none",cursor:"pointer",padding:"10px 20px",borderRadius:10,opacity:saving?0.6:1}}>
                {saving?"Saving…":"Save Survey"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
