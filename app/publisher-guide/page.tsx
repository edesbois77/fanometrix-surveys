import Link from "next/link";
import { HowItWorksSection } from "./HowItWorksSection";
import { NavHeader } from "./NavHeader";

export const metadata = {
  title: "Publisher Hub – Fanometrix",
  description:
    "Deploy anonymous football fan surveys within standard 300×250 inventory to generate fan intelligence and unlock new commercial opportunities.",
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const N = "#0B1929"; // Navy
const G = "#D7B87A"; // Gold


// ─── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: "⚡", label: "15-minute integration" },
  { icon: "🔒", label: "No personal data collected" },
  { icon: "📱", label: "Standard 300×250 MPU" },
  { icon: "🌍", label: "Global deployment ready" },
];

const BENEFITS = [
  { icon: "💰", title: "New Commercial Opportunities",    body: "Create additional revenue opportunities through research and insight partnerships." },
  { icon: "📊", title: "Audience Intelligence",          body: "Understand how your football audience thinks and behaves across content and contexts." },
  { icon: "📈", title: "Industry Benchmarking",          body: "Compare audience trends against other football publishers and markets worldwide." },
  { icon: "⚡", title: "Low Integration Effort",         body: "Deploy in minutes using standard MPU inventory and existing ad operations workflows." },
  { icon: "🔒", title: "Privacy by Design",              body: "No names, emails, cookies, IP addresses or advertising IDs are ever collected." },
  { icon: "🌍", title: "Global Scalability",             body: "Run surveys across multiple markets and languages with a single implementation." },
];


const COLLECTED = [
  { field: "Survey Answer",     example: "Likely",           personal: false },
  { field: "Country",           example: "United Kingdom",   personal: false },
  { field: "Device",            example: "Mobile",           personal: false },
  { field: "Browser",           example: "Chrome",           personal: false },
  { field: "Publisher",         example: "FotMob",           personal: false },
  { field: "Placement",         example: "Homepage MPU",     personal: false },
  { field: "Timestamp",         example: "19 June 2026",     personal: false },
];

const NO_COLLECT = [
  "Names",
  "Email addresses",
  "IP addresses",
  "Cookies",
  "Advertising IDs",
  "Cross-site tracking",
];

const PARAMS: [string, string, string][] = [
  ["campaign",     "Required",                              "carlsberg_ucl_2026"],
  ["publisher",    "Recommended",                           "fotmob"],
  ["placement",    "Recommended",                           "homepage-mpu"],
  ["country",      "Recommended — use geo macro",           "%%COUNTRY%%"],
  ["club",         "Optional",                              "Arsenal"],
  ["competition",  "Optional",                              "Premier+League"],
  ["segment",      "Optional",                              "season-ticket-holder"],
  ["survey",       "Optional — links to survey config",     "uuid"],
];

const MACROS: [string, string][] = [
  ["Google Ad Manager", "%%COUNTRY%%"],
  ["Xandr (AppNexus)",  "${GEO_COUNTRY}"],
  ["Freewheel",         "[country]"],
  ["The Trade Desk",    "##COUNTRY##"],
  ["DV360",             "%%COUNTRY%%"],
];

const TECH_SECTIONS = [
  {
    title: "Example creative tag",
    content: (
      <pre
        style={{ background: "#0d1117", color: "#7ee787", fontSize: 12, borderRadius: 10, padding: "16px 18px", overflowX: "auto", whiteSpace: "pre-wrap", lineHeight: 1.6 }}
      >{`<!-- Fanometrix MPU (300×250) — Google Ad Manager -->
<iframe
  src="https://fanometrix-surveys.vercel.app/embed
    ?campaign=YOUR_CAMPAIGN_ID
    &publisher=YOUR_PUBLISHER_NAME
    &placement=YOUR_PLACEMENT_NAME
    &country=%%COUNTRY%%
    &segment=YOUR_SEGMENT"
  width="300" height="250" frameborder="0"
  scrolling="no"
  style="border:0;overflow:hidden;display:block;"
  title="Fanometrix Fan Survey"
></iframe>`}</pre>
    ),
  },
  {
    title: "URL parameters",
    content: (
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F8F9FA" }}>
            {["Parameter", "Required?", "Example"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: N, borderBottom: "1px solid #E5E7EB" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PARAMS.map(([p, r, e]) => (
            <tr key={p} style={{ borderBottom: "1px solid #F3F4F6" }}>
              <td style={{ padding: "8px 12px", fontFamily: "monospace", color: N, fontWeight: 600 }}>{p}</td>
              <td style={{ padding: "8px 12px", color: "#6B7280" }}>{r}</td>
              <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#9CA3AF" }}>{e}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    title: "Ad server geo macros",
    content: (
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F8F9FA" }}>
            {["Ad Server", "Country macro"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: N, borderBottom: "1px solid #E5E7EB" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MACROS.map(([server, macro]) => (
            <tr key={server} style={{ borderBottom: "1px solid #F3F4F6" }}>
              <td style={{ padding: "8px 12px", color: "#374151" }}>{server}</td>
              <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#6B7280" }}>{macro}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    title: "Creative format specs",
    content: (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          ["Format", "MPU"],
          ["Size", "300×250 px"],
          ["File type", "iframe / HTML"],
          ["Safe frame", "Yes"],
          ["3rd party served", "Yes"],
          ["GDPR consent required", "No"],
        ].map(([k, v]) => (
          <div key={k} style={{ background: "#F9FAFB", borderRadius: 8, padding: "12px 14px", border: "1px solid #E5E7EB" }}>
            <p style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 4 }}>{k}</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: N }}>{v}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Supported placements",
    content: (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {["Homepage MPU", "Article sidebar", "In-stream video overlay", "Scoreboard widget", "Match centre", "Live blog", "Sports hub", "App interstitial"].map(p => (
          <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #E5E7EB" }}>
            <span style={{ color: G, fontSize: 12 }}>✓</span>
            <span style={{ fontSize: 13, color: "#374151" }}>{p}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Testing & QA",
    content: (
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "#374151" }}>
        <p style={{ marginBottom: 12 }}>For QA and pre-launch testing:</p>
        <ul style={{ paddingLeft: 20, marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <li>Hardcode <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>country=GB</code> rather than using an unfired geo macro</li>
          <li>Use a test <code style={{ background: "#F3F4F6", padding: "1px 5px", borderRadius: 4, fontSize: 12 }}>campaign_id</code> that is distinct from your production campaign</li>
          <li>Responses submitted to a test campaign are clearly labelled and can be filtered in reporting</li>
          <li>Use the Campaign Deployment tool to generate and preview tags before trafficking</li>
        </ul>
        <p>The Campaign Deployment tool generates a live preview of your creative tag before it goes into your ad server.</p>
      </div>
    ),
  },
  {
    title: "Data not permitted",
    content: (
      <div>
        <p style={{ fontSize: 14, color: "#374151", marginBottom: 12, lineHeight: 1.6 }}>The following must never be passed as URL parameters. Passing prohibited data is a breach of the integration agreement.</p>
        <ul style={{ paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {["Names, email addresses, phone numbers", "User IDs, login tokens or authenticated identifiers", "Hashed or encrypted personal identifiers", "Free-text personal information of any kind", "Precise location data (lat/lon, postcode, GPS coordinates)"].map(item => (
            <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "#DC2626", background: "#FEF2F2", padding: "10px 14px", borderRadius: 8, border: "1px solid #FECACA" }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>✕</span>
              <span style={{ color: "#374151" }}>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    ),
  },
  {
    title: "Troubleshooting",
    content: (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          { q: "Survey not appearing", a: "Check the campaign_id parameter is exactly correct and the campaign is set to Live status in the Fanometrix platform." },
          { q: "Geo macro not firing", a: "Ensure the macro is URL-encoded if required by your ad server. Test with a hardcoded country=GB first." },
          { q: "Safe frame issues", a: "Fanometrix is compatible with all major safe frame implementations. Ensure scrolling=no is set in the iframe tag." },
          { q: "Blank creative", a: "Check that your ad server is not blocking third-party iframes. The creative must load from fanometrix-surveys.vercel.app." },
        ].map(({ q, a }) => (
          <div key={q} style={{ padding: "14px 16px", background: "#F9FAFB", borderRadius: 10, border: "1px solid #E5E7EB" }}>
            <p style={{ fontWeight: 600, fontSize: 13, color: N, marginBottom: 6 }}>{q}</p>
            <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>{a}</p>
          </div>
        ))}
      </div>
    ),
  },
];

const FAQS = [
  {
    q: "How long does integration take?",
    a: "For most publishers with standard ad server access, integration takes 15–30 minutes. The Fanometrix team provides a pre-built creative tag; ad ops simply traffics it as an HTML creative.",
  },
  {
    q: "Do I need to update my CMP or consent banner?",
    a: "No. Fanometrix collects only anonymous, non-personal data. There are no cookies, no advertising IDs and no personal identifiers. No consent mechanism is required from respondents.",
  },
  {
    q: "What data is collected?",
    a: "Fanometrix collects survey answers (multiple choice only), country (from ad server geo), device type, browser, publisher name, placement name and timestamp. Nothing that can identify an individual.",
  },
  {
    q: "Can I whitelist specific campaigns only?",
    a: "Yes. Each campaign has a unique campaign_id. You control which campaigns you traffic and where. You can restrict delivery to specific placements, sections or devices.",
  },
  {
    q: "Can surveys be translated into other languages?",
    a: "Yes. Survey questions and answer options are fully configurable by the Fanometrix team. Multi-language campaigns can be set up for publishers with international audiences.",
  },
  {
    q: "Can campaigns be geo-targeted?",
    a: "Yes. Country is passed as a parameter from your ad server's geo macro. The Fanometrix platform can filter and report by country. Targeting by country can also be configured at ad server level.",
  },
  {
    q: "Can I pause or stop a survey at any time?",
    a: "Yes. Campaigns can be Paused or Closed immediately from the Fanometrix platform. Once paused, the creative will stop accepting responses within seconds.",
  },
  {
    q: "Can I see reporting in real time?",
    a: "Yes. Responses appear in the Fanometrix dashboard within seconds of submission. Real-time reporting is available to authorised users throughout the campaign.",
  },
];

// ─── Shared section wrapper ───────────────────────────────────────────────────

function Section({
  id, children, dark, tight,
}: {
  id?: string;
  children: React.ReactNode;
  dark?: boolean;
  tight?: boolean;
}) {
  return (
    <section
      id={id}
      style={{
        background:  dark ? N : "#fff",
        padding:     tight ? "48px 24px" : "80px 24px",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {children}
      </div>
    </section>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: G, marginBottom: 12 }}>
      {children}
    </p>
  );
}

function SectionTitle({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: light ? "#fff" : N, marginBottom: 16, lineHeight: 1.2 }}>
      {children}
    </h2>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublisherHubPage() {
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100vh", background: "#fff" }}>

      {/* ── Navigation ───────────────────────────────────────────────────────── */}
      <NavHeader />

      {/* ── 1. HERO ──────────────────────────────────────────────────────────── */}
      <div style={{ background: N, padding: "clamp(32px, 5vw, 48px) 20px clamp(48px, 7vw, 64px)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center" }}>
          <h1 style={{ fontSize: "clamp(32px, 6vw, 56px)", fontWeight: 800, color: "#fff", lineHeight: 1.1, letterSpacing: "-0.02em", marginBottom: 24 }}>
            Fanometrix<br />
            <span style={{ color: G }}>Publisher Hub</span>
          </h1>

          <p style={{ fontSize: "clamp(15px, 2.5vw, 18px)", color: "rgba(255,255,255,0.72)", lineHeight: 1.7, maxWidth: 860, margin: "0 auto 48px" }}>
            Deploy anonymous football fan surveys within standard 300×250 inventory to generate
            fan intelligence and unlock new commercial opportunities - with no personal data
            collection and minimal implementation effort.
          </p>

          {/* Feature chips — wrap on mobile */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            {FEATURES.map(({ icon, label }) => (
              <div key={label}
                style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 40, padding: "9px 16px", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 15 }}>{icon}</span>
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 500 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 2. WHY PARTNER ───────────────────────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <SectionLabel>Partnership</SectionLabel>
          <SectionTitle>Why partner with Fanometrix?</SectionTitle>
          <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.7, maxWidth: 620, margin: "0 auto" }}>
            Fanometrix helps publishers understand football audiences through short anonymous surveys
            while creating new opportunities for commercial insight and industry benchmarking.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          {BENEFITS.map(({ icon, title, body }) => (
            <div key={title}
              style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "28px 28px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 28, marginBottom: 16 }}>{icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: N, marginBottom: 8 }}>{title}</h3>
              <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.65 }}>{body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 3. HOW IT WORKS ──────────────────────────────────────────────────── */}
      <HowItWorksSection />

      {/* ── 4. PRODUCT DEMO ──────────────────────────────────────────────────── */}
      <Section id="demo">
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <SectionLabel>Live Preview</SectionLabel>
          <SectionTitle>See Fanometrix in Action</SectionTitle>
          <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
            Every Fanometrix survey runs inside a standard 300×250 MPU with a built-in privacy overlay.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start" }}>

          {/* Card 1: Live survey embed */}
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#F9FAFB", padding: "20px 24px", borderBottom: "1px solid #E5E7EB" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>01 — Survey Creative</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: N }}>300×250 MPU</p>
            </div>
            <div style={{ background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
              <div style={{ borderRadius: 4, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.25)", width: 300, height: 250, flexShrink: 0 }}>
                <iframe
                  src="/embed?campaign=demo&publisher=publisher-hub"
                  width="300"
                  height="250"
                  style={{ border: "none", display: "block" }}
                  scrolling="no"
                  title="Fanometrix Fan Survey Demo"
                />
              </div>
            </div>
            <div style={{ padding: "16px 24px 20px", background: "#fff" }}>
              <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                A 3-question survey with radio-button answers. Fans complete it in under 60 seconds.
                Auto-advances on selection - no submit button needed.
              </p>
            </div>
          </div>

          {/* Card 2: Privacy modal mockup */}
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#F9FAFB", padding: "20px 24px", borderBottom: "1px solid #E5E7EB" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>02 — Privacy Experience</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: N }}>Built-in privacy layer</p>
            </div>
            <div style={{ background: "#E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
              {/* Privacy modal mockup at 300×250 */}
              <div style={{ width: 300, height: 250, borderRadius: 4, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.25)", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif", flexShrink: 0 }}>
                {/* Modal header */}
                <div style={{ height: 40, minHeight: 40, background: N, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", flexShrink: 0 }}>
                  <span style={{ color: G, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}>Privacy</span>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, lineHeight: 1 }}>✕</span>
                </div>
                {/* Slide 3: centred layout */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 20px", textAlign: "center", gap: 7, background: "#fff" }}>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>🛡️</div>
                  <p style={{ color: N, fontSize: 10.5, fontWeight: 700, lineHeight: 1.3, margin: 0 }}>Your responses cannot identify you</p>
                  <p style={{ color: "#6B7280", fontSize: 9.5, lineHeight: 1.45, margin: 0 }}>Responses are analysed in aggregate and cannot be linked back to individuals.</p>
                  <p style={{ color: "#6B7280", fontSize: 9, margin: 0, lineHeight: 1.5 }}>
                    Questions? <span style={{ color: G, fontWeight: 600 }}>privacy@fanometrix.com</span>
                  </p>
                  <span style={{ display: "inline-block", marginTop: 2, background: N, color: G, fontSize: 9.5, fontWeight: 700, padding: "5px 16px", borderRadius: 20 }}>
                    Privacy Policy →
                  </span>
                </div>
                {/* Nav */}
                <div style={{ height: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", flexShrink: 0 }}>
                  <span style={{ color: "#D1D5DB", fontSize: 20, padding: "2px 8px" }}>‹</span>
                  <span style={{ color: "#9CA3AF", fontSize: 9.5 }}>3 of 3</span>
                  <span style={{ color: "#D1D5DB", fontSize: 20, padding: "2px 8px" }}>›</span>
                </div>
              </div>
            </div>
            <div style={{ padding: "16px 24px 20px", background: "#fff" }}>
              <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                A 3-slide privacy modal is available within every survey. No consent banner required - Fanometrix collects no personal data.
              </p>
            </div>
          </div>

          {/* Card 3: Dashboard mockup */}
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 20, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
            <div style={{ background: "#F9FAFB", padding: "20px 24px", borderBottom: "1px solid #E5E7EB" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: G, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>03 — Dashboard &amp; Reporting</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: N }}>Real-time analytics</p>
            </div>
            <div style={{ background: "#F1F5F9", padding: 16 }}>
              {/* Mini dashboard mockup */}
              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: 12, marginBottom: 10 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[["8,450", "Responses"], ["84%", "Completion"], ["47s", "Avg time"]].map(([v, l]) => (
                    <div key={l} style={{ textAlign: "center", padding: "8px 4px" }}>
                      <p style={{ fontSize: 18, fontWeight: 800, color: N, lineHeight: 1 }}>{v}</p>
                      <p style={{ fontSize: 9, color: "#9CA3AF", marginTop: 3 }}>{l}</p>
                    </div>
                  ))}
                </div>
              </div>
              {/* Mini bar chart mockup */}
              <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E5E7EB", padding: "10px 12px" }}>
                <p style={{ fontSize: 9, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Q1 · Responses over time</p>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 50 }}>
                  {[30, 45, 38, 65, 72, 58, 80, 85, 92, 75, 88, 95].map((h, i) => (
                    <div key={i} style={{ flex: 1, height: `${h}%`, background: G, borderRadius: "2px 2px 0 0", opacity: 0.8 + (i / 60) }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ padding: "16px 24px 20px", background: "#fff" }}>
              <p style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.6 }}>
                Responses appear in real time. Filter by publisher, country, device, club and more.
                Export to CSV at any time.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 5. DATA COLLECTION ───────────────────────────────────────────────── */}
      <section id="privacy" style={{ background: "#F9FAFB", padding: "80px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <SectionLabel>Data &amp; Privacy</SectionLabel>
            <SectionTitle>What data is collected?</SectionTitle>
            <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
              Every field collected is anonymous and non-identifiable by design.
            </p>
          </div>

          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F8F9FA" }}>
                    <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>Data field</th>
                    <th style={{ textAlign: "left", padding: "12px 20px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>Example</th>
                    <th style={{ textAlign: "center", padding: "12px 20px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>Personal data?</th>
                  </tr>
                </thead>
                <tbody>
                  {COLLECTED.map(({ field, example }) => (
                    <tr key={field} style={{ borderTop: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "14px 20px", fontSize: 14, fontWeight: 600, color: N }}>{field}</td>
                      <td style={{ padding: "14px 20px", fontSize: 13, color: "#6B7280" }}>{example}</td>
                      <td style={{ padding: "14px 20px", textAlign: "center" }}>
                        <span style={{ background: "#D1FAE5", color: "#065F46", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>No</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Trust box */}
            <div style={{ marginTop: 24, background: `${N}`, borderRadius: 16, padding: "24px 28px", display: "flex", alignItems: "flex-start", gap: 16 }}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>🛡️</span>
              <p style={{ fontSize: 15, color: "#fff", lineHeight: 1.65, margin: 0 }}>
                <strong style={{ color: G }}>Fanometrix is intentionally designed</strong> to collect anonymous,
                non-identifiable survey responses only. No individual can ever be identified, profiled
                or targeted from data collected by Fanometrix.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. PRIVACY BY DESIGN ─────────────────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <SectionLabel>Compliance</SectionLabel>
          <SectionTitle>Privacy by Design</SectionTitle>
          <p style={{ fontSize: 16, color: "#6B7280", lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
            Fanometrix has been intentionally designed to minimise privacy risk and collect anonymous, non-identifiable responses only. Publishers should assess implementation within their own legal and privacy frameworks.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 40 }}>
          {NO_COLLECT.map(item => (
            <div key={item}
              style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 14, padding: "20px 18px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ background: "#DC2626", color: "#fff", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>✕</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#991B1B" }}>No {item}</span>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: 700, margin: "0 auto", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 16, padding: "24px 28px" }}>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, margin: 0, textAlign: "center" }}>
            Responses are analysed <strong style={{ color: N }}>only in aggregate form</strong>.
            Individuals are never identified, profiled or targeted.
          </p>
        </div>
      </Section>

      {/* ── 7. TECHNICAL INTEGRATION ─────────────────────────────────────────── */}
      <section id="technical" style={{ background: "#F9FAFB", padding: "80px 24px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ marginBottom: 48 }}>
            <SectionLabel>Documentation</SectionLabel>
            <SectionTitle>Technical Integration</SectionTitle>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {TECH_SECTIONS.map((sec) => (
              <details
                key={sec.title}
                style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}
              >
                <summary style={{
                  padding: "18px 22px", cursor: "pointer", fontWeight: 600, fontSize: 15, color: N,
                  display: "flex", alignItems: "center", justifyContent: "space-between", listStyle: "none",
                  userSelect: "none",
                }}>
                  {sec.title}
                  <span style={{ color: G, fontSize: 18, fontWeight: 300, flexShrink: 0 }}>+</span>
                </summary>
                <div style={{ padding: "0 22px 22px", borderTop: "1px solid #F3F4F6" }}>
                  <div style={{ paddingTop: 16 }}>{sec.content}</div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. FAQ ───────────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ marginBottom: 48, textAlign: "center" }}>
            <SectionLabel>Questions</SectionLabel>
            <SectionTitle>Frequently Asked Questions</SectionTitle>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {FAQS.map(({ q, a }) => (
              <details
                key={q}
                style={{ border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden", background: "#fff" }}
              >
                <summary style={{
                  padding: "18px 22px", cursor: "pointer", fontWeight: 600, fontSize: 14, color: N,
                  display: "flex", alignItems: "center", justifyContent: "space-between", listStyle: "none",
                  userSelect: "none", gap: 12,
                }}>
                  <span>{q}</span>
                  <span style={{ color: G, fontSize: 18, fontWeight: 300, flexShrink: 0 }}>+</span>
                </summary>
                <div style={{ padding: "0 22px 20px", borderTop: "1px solid #F3F4F6" }}>
                  <p style={{ paddingTop: 14, fontSize: 14, color: "#6B7280", lineHeight: 1.7, margin: 0 }}>{a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 9. CONTACT ───────────────────────────────────────────────────────── */}
      <section id="contact" style={{ background: N, padding: "80px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: G, marginBottom: 12 }}>Support</p>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: "#fff", marginBottom: 16 }}>Need help?</h2>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.65)", maxWidth: 500, margin: "0 auto", lineHeight: 1.7 }}>
              The Fanometrix team is available to help with integration, privacy compliance and commercial enquiries.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {[
              { icon: "🔧", title: "Integration Support",    email: "publishers@fanometrix.com",   desc: "Tag implementation, ad server setup and QA" },
              { icon: "🔒", title: "Privacy Questions",      email: "privacy@fanometrix.com",       desc: "DPA, GDPR and compliance documentation" },
              { icon: "🤝", title: "Commercial Partnerships",email: "partnerships@fanometrix.com",  desc: "Revenue share, insight reports and benchmarking" },
              { icon: "📞", title: "Book a Technical Call",  email: "publishers@fanometrix.com?subject=Technical Call Request", desc: "Schedule a call with the Fanometrix integration team" },
            ].map(({ icon, title, email, desc }) => (
              <a key={title} href={`mailto:${email}`}
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: "24px", display: "block", textDecoration: "none", transition: "background 0.2s" }}>
                <div style={{ fontSize: 28, marginBottom: 14 }}>{icon}</div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 12, color: G, marginBottom: 10, wordBreak: "break-all" }}>{email.split("?")[0]}</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.55 }}>{desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>


      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#060F19", padding: "28px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Fanometrix_Logo.png" alt="Fanometrix" style={{ height: 14, objectFit: "contain", opacity: 0.6 }} />
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>Publisher Hub v1.0 · June 2026</span>
          </div>
          <nav style={{ display: "flex", gap: 20 }}>
            <Link href="/privacy" style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "none" }}>Privacy Policy</Link>
            <a href="mailto:publishers@fanometrix.com" style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textDecoration: "none" }}>Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
