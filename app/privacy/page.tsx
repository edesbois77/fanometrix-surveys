import Link from "next/link";

export const metadata = { title: "Privacy Policy – Fanometrix Pulse" };

export default function PrivacyPage() {
  return (
    <main style={{minHeight:"100vh",background:"#F7F6F2",padding:"48px 24px"}}>
      <div style={{maxWidth:680,margin:"0 auto"}}>
        <Link href="/" style={{fontSize:12,color:"#D7B87A",textDecoration:"none",fontWeight:600}}>← Back to survey</Link>
        <div style={{marginTop:24,marginBottom:40}}>
          <p style={{fontSize:10,fontWeight:700,color:"#D7B87A",letterSpacing:"0.14em",textTransform:"uppercase",marginBottom:6}}>Fanometrix Pulse</p>
          <h1 style={{fontSize:28,fontWeight:700,color:"#0B1929",margin:0,marginBottom:6,letterSpacing:"-0.02em"}}>Privacy Policy</h1>
          <p style={{fontSize:12,color:"#5F6670"}}>Last updated June 2026</p>
        </div>

        {[
          {title:"What is Fanometrix Pulse?",content:"Fanometrix Pulse is a fan sentiment survey platform that collects anonymous feedback on behalf of sports clubs, competition rights holders, and their media partners. Surveys are delivered as short embedded units within digital media placements."},
          {title:"Why we collect it",content:"Survey responses are collected to produce aggregated fan insight reports. No individual is profiled, targeted, or identified from the data we collect. The combination of fields we collect cannot realistically be used to identify a specific person."},
          {title:"Data storage and retention",content:"Data is stored securely in a Supabase (Postgres) database hosted in the EU West (London) region. Data is retained for a maximum of 24 months from the date of collection, after which it is deleted."},
          {title:"Your rights",content:"Because we do not collect any information that can identify you, we are unable to locate, modify, or delete a specific individual's response. If you have a concern, please contact the publisher who displayed the survey."},
        ].map(({title,content})=>(
          <div key={title} style={{background:"#FFFFFF",border:"1px solid rgba(11,25,41,0.08)",borderRadius:16,padding:24,marginBottom:12,boxShadow:"0 4px 20px rgba(11,25,41,0.06)"}}>
            <h2 style={{fontSize:15,fontWeight:700,color:"#0B1929",marginBottom:8,marginTop:0}}>{title}</h2>
            <p style={{fontSize:13,color:"#5F6670",lineHeight:1.7,margin:0}}>{content}</p>
          </div>
        ))}

        <div style={{background:"#FFFFFF",border:"1px solid rgba(11,25,41,0.08)",borderRadius:16,padding:24,marginBottom:12,boxShadow:"0 4px 20px rgba(11,25,41,0.06)"}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#0B1929",marginBottom:12,marginTop:0}}>What data we collect</h2>
          <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
            <thead><tr style={{borderBottom:"1px solid rgba(11,25,41,0.08)"}}><th style={{textAlign:"left",padding:"8px 0",fontSize:9,fontWeight:700,color:"#D7B87A",letterSpacing:"0.08em",textTransform:"uppercase"}}>Field</th><th style={{textAlign:"left",padding:"8px 12px",fontSize:9,fontWeight:700,color:"#D7B87A",letterSpacing:"0.08em",textTransform:"uppercase"}}>Description</th></tr></thead>
            <tbody>
              {[["Survey responses (Q1–Q3)","Your answers to the radio-button questions"],["Campaign & Publisher","Which campaign and media partner served the survey"],["Club / Competition","Football club or competition the survey relates to"],["Country","Country level only — no more precise location"],["Device / Browser","Mobile, tablet, desktop, and browser type"],["Response time","Seconds taken to complete"],["Timestamp","Date and approximate time"]].map(([f,d])=>(
                <tr key={f as string} style={{borderBottom:"1px solid rgba(11,25,41,0.04)"}}><td style={{padding:"8px 0",color:"#0B1929",fontWeight:500,whiteSpace:"nowrap"}}>{f}</td><td style={{padding:"8px 12px",color:"#5F6670"}}>{d}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{background:"#FFFFFF",border:"1px solid rgba(11,25,41,0.08)",borderRadius:16,padding:24,marginBottom:12,boxShadow:"0 4px 20px rgba(11,25,41,0.06)"}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#0B1929",marginBottom:10,marginTop:0}}>What we do NOT collect</h2>
          <ul style={{listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:5}}>
            {["Names, emails, phone numbers","User IDs or login credentials","Exact location (only country level)","IP addresses","Cookies or persistent identifiers","Free-text personal information","Data from children under 16"].map(item=>(
              <li key={item} style={{display:"flex",gap:10,fontSize:13,color:"#5F6670"}}>
                <span style={{color:"rgba(220,38,38,0.5)",flexShrink:0}}>✕</span>{item}
              </li>
            ))}
          </ul>
        </div>

        <div style={{background:"#FFFFFF",border:"1px solid rgba(11,25,41,0.08)",borderRadius:16,padding:24,boxShadow:"0 4px 20px rgba(11,25,41,0.06)"}}>
          <h2 style={{fontSize:15,fontWeight:700,color:"#0B1929",marginBottom:8,marginTop:0}}>Contact</h2>
          <p style={{fontSize:13,color:"#5F6670",margin:0}}>For questions: <a href="mailto:privacy@fanometrix.com" style={{color:"#D7B87A",textDecoration:"none",fontWeight:600}}>privacy@fanometrix.com</a></p>
        </div>

        <p style={{fontSize:11,color:"rgba(11,25,41,0.3)",marginTop:28,paddingTop:20,borderTop:"1px solid rgba(11,25,41,0.08)"}}>
          Fanometrix Pulse · <Link href="/" style={{color:"rgba(11,25,41,0.3)"}}>fanometrix-surveys.vercel.app</Link>
        </p>
      </div>
    </main>
  );
}
