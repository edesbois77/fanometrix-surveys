import Link from "next/link";

export const metadata = { title: "Privacy Policy – Fanometrix Pulse" };

const section = "margin-bottom: 32px";

export default function PrivacyPage() {
  return (
    <main style={{minHeight:"100vh",padding:"48px 24px"}}>
      <div style={{maxWidth:680,margin:"0 auto"}}>
        <Link href="/" style={{fontSize:12,color:"rgba(215,184,122,0.5)",textDecoration:"none"}}>← Back to survey</Link>

        <div style={{marginTop:24,marginBottom:40}}>
          <h1 style={{fontSize:28,fontWeight:700,color:"#FFFFFF",margin:0,marginBottom:6}}>Privacy Policy</h1>
          <p style={{fontSize:12,color:"rgba(215,184,122,0.4)"}}>Fanometrix Pulse · Last updated June 2026</p>
        </div>

        {[
          { title:"What is Fanometrix Pulse?", content:"Fanometrix Pulse is a fan sentiment survey platform that collects anonymous feedback on behalf of sports clubs, competition rights holders, and their media partners. Surveys are delivered as short embedded units within digital media placements." },
          { title:"Why we collect it", content:"Survey responses are collected to produce aggregated fan insight reports for sports rights holders and their commercial partners. No individual is profiled, targeted, or identified from the data we collect. The data is anonymous — the combination of fields we collect cannot realistically be used to identify a specific person." },
          { title:"Data storage and retention", content:"Data is stored securely in a Supabase (Postgres) database hosted in the EU West (London) region. Data is retained for a maximum of 24 months from the date of collection, after which it is deleted." },
          { title:"Your rights", content:"Because we do not collect any information that can identify you, we are unable to locate, modify, or delete a specific individual's response. If you have a concern about data collected via a specific survey placement, please contact the publisher who displayed it." },
        ].map(({title,content})=>(
          <div key={title} style={{marginBottom:28}}>
            <h2 style={{fontSize:15,fontWeight:700,color:"#FFFFFF",marginBottom:8}}>{title}</h2>
            <p style={{fontSize:13,color:"rgba(224,225,221,0.55)",lineHeight:1.7}}>{content}</p>
          </div>
        ))}

        <div style={{marginBottom:28}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#FFFFFF",marginBottom:10}}>What data we collect</h2>
          <table style={{width:"100%",fontSize:12,borderCollapse:"collapse",border:"1px solid rgba(215,184,122,0.12)",borderRadius:10,overflow:"hidden"}}>
            <thead>
              <tr style={{background:"rgba(215,184,122,0.06)"}}>
                <th style={{textAlign:"left",padding:"10px 14px",color:"rgba(215,184,122,0.7)",fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>Field</th>
                <th style={{textAlign:"left",padding:"10px 14px",color:"rgba(215,184,122,0.7)",fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[["Survey responses (Q1–Q3)","Your answers to the radio-button questions"],["Campaign ID","Identifies which brand or campaign the survey belongs to"],["Publisher","The media partner where the survey was displayed"],["Placement","The position on the page (e.g. homepage MPU)"],["Club / Competition","The football club or competition the survey relates to"],["Country","Country level only, supplied by the ad server"],["Fan segment","A category label set by the publisher, not entered by you"],["Device type","Mobile, tablet, or desktop"],["Browser","Chrome, Safari, Firefox, Edge, or Other"],["Response time","How many seconds the survey took to complete"],["Timestamp","Date and approximate time of submission"]].map(([f,d])=>(
                <tr key={f as string} style={{borderTop:"1px solid rgba(215,184,122,0.06)"}}>
                  <td style={{padding:"10px 14px",color:"#E0E1DD",fontWeight:500,fontSize:12,whiteSpace:"nowrap"}}>{f}</td>
                  <td style={{padding:"10px 14px",color:"rgba(224,225,221,0.45)",fontSize:12}}>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{marginBottom:28}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#FFFFFF",marginBottom:10}}>What we do NOT collect</h2>
          <ul style={{listStyle:"none",padding:0,display:"flex",flexDirection:"column",gap:6}}>
            {["Names, email addresses, phone numbers, or any contact information","User IDs, login credentials, or account data","Exact location data — only country level","IP addresses — not stored","Cookies or persistent identifiers","Free-text personal information","Any data from children under 16"].map(item=>(
              <li key={item} style={{fontSize:13,color:"rgba(224,225,221,0.5)",display:"flex",gap:10,alignItems:"flex-start"}}>
                <span style={{color:"rgba(215,184,122,0.4)",flexShrink:0}}>✕</span>{item}
              </li>
            ))}
          </ul>
        </div>

        <div style={{marginBottom:28}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#FFFFFF",marginBottom:8}}>Contact</h2>
          <p style={{fontSize:13,color:"rgba(224,225,221,0.5)"}}>
            For questions about this policy: <a href="mailto:privacy@fanometrix.com" style={{color:"#D7B87A"}}>privacy@fanometrix.com</a>
          </p>
        </div>

        <div style={{paddingTop:24,borderTop:"1px solid rgba(215,184,122,0.08)"}}>
          <p style={{fontSize:11,color:"rgba(215,184,122,0.3)"}}>
            Fanometrix Pulse · Fan Insight Platform · <Link href="/" style={{color:"rgba(215,184,122,0.3)"}}>fanometrix-surveys.vercel.app</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
