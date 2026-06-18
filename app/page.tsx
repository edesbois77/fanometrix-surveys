"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const QUESTIONS = [
  { id:"q1", text:"How often do you attend live events?", options:["Never","1-2 times a year","3-5 times a year","More than 5 times a year"] },
  { id:"q2", text:"How would you rate your overall fan experience?", options:["Poor","Average","Good","Excellent"] },
  { id:"q3", text:"How likely are you to recommend us to a friend?", options:["Not likely","Somewhat likely","Likely","Very likely"] },
];

const COUNTRIES = ["United Kingdom","United States","France","Germany","Spain","Italy","Brazil","Argentina","Australia","Japan","Other"];

const input: React.CSSProperties = { width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(215,184,122,0.15)",borderRadius:10,padding:"11px 14px",fontSize:14,color:"#E0E1DD",outline:"none" };

export default function SurveyPage() {
  const [answers,    setAnswers]    = useState<Record<string,string>>({});
  const [country,    setCountry]    = useState("");
  const [campaignId, setCampaignId] = useState("default");
  const [status,     setStatus]     = useState<"idle"|"submitting"|"success"|"error">("idle");

  useEffect(()=>{
    const p=new URLSearchParams(window.location.search);
    const c=p.get("campaign");if(c)setCampaignId(c);
  },[]);

  async function handleSubmit(e:React.FormEvent){
    e.preventDefault();
    if(!answers.q1){alert("Please answer at least the first question.");return;}
    if(!country){alert("Please select your country.");return;}
    setStatus("submitting");
    const res=await fetch("/api/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({campaign_id:campaignId,q1:answers.q1??null,q2:answers.q2??null,q3:answers.q3??null,country})});
    setStatus(res.ok?"success":"error");
  }

  if(status==="success") return (
    <main style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(215,184,122,0.2)",borderRadius:24,padding:48,maxWidth:420,width:"100%",textAlign:"center",backdropFilter:"blur(12px)"}}>
        <div style={{fontSize:48,marginBottom:16}}>🎉</div>
        <h1 style={{fontSize:22,fontWeight:700,color:"#FFFFFF",marginBottom:8}}>Thank you!</h1>
        <p style={{fontSize:14,color:"rgba(224,225,221,0.55)"}}>Your response has been recorded.</p>
      </div>
    </main>
  );

  return (
    <main style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <form onSubmit={handleSubmit} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(215,184,122,0.15)",borderRadius:24,padding:40,maxWidth:560,width:"100%",backdropFilter:"blur(12px)",boxShadow:"0 24px 64px rgba(0,0,0,0.4)"}}>

        {/* Header */}
        <div style={{marginBottom:32}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#D7B87A",boxShadow:"0 0 8px rgba(215,184,122,0.5)"}} />
            <span style={{fontSize:11,fontWeight:700,color:"rgba(215,184,122,0.6)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Fanometrix Pulse</span>
          </div>
          <h1 style={{fontSize:22,fontWeight:700,color:"#FFFFFF",margin:0,marginBottom:6}}>Fan Experience Survey</h1>
          <p style={{fontSize:13,color:"rgba(224,225,221,0.45)"}}>Your feedback helps us improve the fan experience. Takes 60 seconds.</p>
        </div>

        {/* Questions */}
        {QUESTIONS.map(q=>(
          <fieldset key={q.id} style={{border:"none",padding:0,marginBottom:24}}>
            <legend style={{fontSize:13,fontWeight:600,color:"#E0E1DD",marginBottom:10}}>{q.text}</legend>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {q.options.map(opt=>{
                const sel=answers[q.id]===opt;
                return(
                  <label key={opt} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,cursor:"pointer",border:`1px solid ${sel?"rgba(215,184,122,0.5)":"rgba(215,184,122,0.12)"}`,background:sel?"rgba(215,184,122,0.08)":"rgba(255,255,255,0.02)",transition:"all 0.15s"}}>
                    <input type="radio" name={q.id} value={opt} checked={sel} onChange={()=>setAnswers(p=>({...p,[q.id]:opt}))} style={{accentColor:"#D7B87A",width:16,height:16}} />
                    <span style={{fontSize:13,color:sel?"#D7B87A":"rgba(224,225,221,0.7)",fontWeight:sel?600:400}}>{opt}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {/* Country */}
        <div style={{marginBottom:24}}>
          <label style={{display:"block",fontSize:10,fontWeight:700,color:"rgba(215,184,122,0.5)",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Country</label>
          <select value={country} onChange={e=>setCountry(e.target.value)} required style={input}>
            <option value="">Select your country…</option>
            {COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {status==="error"&&<p style={{fontSize:12,color:"#f87171",marginBottom:12}}>Something went wrong. Please try again.</p>}

        <button type="submit" disabled={status==="submitting"} style={{width:"100%",background:"#D7B87A",color:"#07121D",border:"none",borderRadius:12,padding:"14px",fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:"0.02em",opacity:status==="submitting"?0.6:1}}>
          {status==="submitting"?"Submitting…":"Submit your response"}
        </button>

        <div style={{marginTop:16,textAlign:"center"}}>
          <Link href="/privacy" style={{fontSize:10,color:"rgba(215,184,122,0.3)",textDecoration:"none"}}>ⓘ Privacy Policy</Link>
        </div>
      </form>
    </main>
  );
}
