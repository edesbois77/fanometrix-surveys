import Link from "next/link";
import { ScrollFadeObserver } from "@/app/components/ScrollFadeObserver";
import { CountUp } from "./CountUp";
import { SurveyDemo } from "./SurveyDemo";
import type { PublisherConfig } from "./config";
import { APP_URL } from "@/lib/env";

// ─── Design tokens (shared with the public homepage and wider marketing site) ─
const NAVY     = "#0B1929";
const NAVY_2   = "#122338"; // one step lighter than NAVY for layered dark panels
const GOLD     = "#D7B87A";
const GOLD_INK = "#8A6D2F"; // gold that holds contrast on light surfaces
const INK      = "#181B20"; // primary text
const GREY     = "#404752"; // body copy (high contrast per design §7.2)
const MUTED    = "#68707C"; // secondary labels
const FAINT    = "#9CA3AF"; // tertiary
const OFFWHITE = "#FAF9F6"; // soft off-white main light surface (design §5)
const BG_SOFT  = "#F5F6F8";
const GREY_BG  = "#EEF0F3"; // light grey alternate surface
const WASH     = "#FBF3E1"; // gold wash
const BORDER   = "#E5E7EB";
const BORDER_2 = "#EEF0F3";

// ─────────────────────────────────────────────────────────────────────────────
// Pilot benchmark figures — supplied and confirmed by Fanometrix (2026-07-28).
// `countTo` drives the count-up for integer values; percentages render static.
// These are the agreed illustrative-campaign benchmarks; do not alter without
// a new confirmed figure.
// ─────────────────────────────────────────────────────────────────────────────
type FunnelStep = { label: string; value: string; note?: string; countTo?: number };
const FUNNEL: FunnelStep[] = [
  { label: "Impressions",                      value: "1,000,000", countTo: 1000000 },
  { label: "Interaction Rate",                 value: "0.10%" },
  { label: "Completion Rate",                  value: "80%" },
  { label: "Completed Surveys",                value: "800", countTo: 800 },
  { label: "Zero-Party Data Points Collected", value: "2,850", note: "answered questions", countTo: 2850 },
];

// ─── Content (verbatim from the approved Content Specification v1.0) ──────────

const CAPABILITIES = [
  { title: "Managed Survey Campaigns",        body: "Fanometrix plans, builds and manages professionally designed audience research campaigns.", icon: "campaigns", mode: "Done for you" },
  { title: "Survey Studio",                   body: "Create, launch and manage your own football audience surveys through the Fanometrix platform.", icon: "studio", soon: true, mode: "Do it yourself" },
  { title: "Zero-Party Audience Data",        body: "Collect trusted information directly from supporters through consent-first research.", icon: "zeroparty" },
  { title: "AI-Powered Analysis",             body: "Transform thousands of fan responses into clear, actionable audience intelligence.", icon: "ai" },
  { title: "Campaign Dashboard",              body: "Monitor campaign performance in real time through an intuitive reporting dashboard.", icon: "dashboard" },
  { title: "Publisher Reports",               body: "Receive professionally produced reports combining research findings with practical recommendations.", icon: "reports" },
  { title: "Audience Benchmarking",           body: "Compare your audience against wider football fan benchmarks.", icon: "benchmark" },
  { title: "Industry Research Participation", body: "Contribute to collaborative football research projects undertaken across the Fanometrix publisher network.", icon: "industry" },
  { title: "Custom Survey Creative",          body: "Purpose-built creative designed to maximise engagement while protecting the supporter experience.", icon: "creative" },
];

const TRADITIONAL = ["One-off surveys", "Raw responses", "Generic reporting", "Individual campaigns", "Standalone data"];
const FANOMETRIX  = ["Continuous audience intelligence", "AI-powered analysis", "Football-specific insights", "Long-term knowledge", "Network benchmarking"];

// The Fanometrix flywheel — a continuous cycle of learning (design direction §6).
const FLYWHEEL = ["Research question", "Survey research", "Evidence", "AI analysis", "Audience intelligence", "Better decisions"];

// Publisher journey — "How Fanometrix Works" (new section, user-directed).
const JOURNEY = [
  { title: "Define your research question", icon: "question" },
  { title: "Build your survey", icon: "studio" },
  { title: "Select creative format", icon: "creative" },
  { title: "Choose markets", icon: "globe" },
  { title: "Generate iframe tags", icon: "code" },
  { title: "Schedule campaigns", icon: "calendar" },
  { title: "Watch responses arrive in the dashboard", icon: "dashboard" },
  { title: "Receive AI analysis and reports", icon: "reports" },
];


const TIMELINE = [
  { marker: "First hours",       heading: "Launch",       actions: ["Research question agreed", "Survey designed", "Creative produced", "Campaign launched"], maturity: 1 },
  { marker: "Week 1",            heading: "Signals",      actions: ["Initial responses collected", "Early trends identified", "Live dashboard available"], maturity: 2 },
  { marker: "Weeks 2–4",         heading: "Depth",        actions: ["Representative sample develops", "Audience understanding grows", "Research quality improves"], maturity: 3 },
  { marker: "Campaign Complete", heading: "Intelligence", actions: ["AI analysis", "Publisher report", "Practical recommendations"], maturity: 4 },
];

// The value publisher inventory becomes (design direction §8, user-specified).
const INVENTORY_TO_INTELLIGENCE = [
  "Zero-party audience data",
  "Meaningful research evidence",
  "Market benchmarking",
  "AI-powered analysis",
  "Executive-ready reporting",
  "Actionable recommendations",
];

const NETWORK_CARDS = [
  { title: "Audience Benchmarking", body: "Understand how your audience compares with the wider Fanometrix network." },
  { title: "Market Comparison",     body: "Explore differences in supporter attitudes across countries, competitions and regions." },
  { title: "Industry Trends",       body: "Track how football fan opinions evolve through continuous research." },
  { title: "Shared Intelligence",   body: "Benefit from anonymised network benchmarks while maintaining ownership of your own campaign data." },
];

const DEPARTMENTS = [
  { title: "Commercial",           body: "Strengthen client conversations through proprietary audience intelligence and create new research opportunities.", icon: "commercial" },
  { title: "Editorial",            body: "Create content informed by genuine audience insight.", icon: "editorial" },
  { title: "Product",              body: "Validate ideas, prioritise future development and make better product decisions.", icon: "product" },
  { title: "Executive Leadership", body: "Support strategic decision-making using independent audience intelligence and AI-powered analysis.", icon: "leadership" },
];

const TRUST = ["Consent-First Research", "Zero-Party Data Collection", "GDPR Compliance", "Secure Infrastructure", "Transparent Methodology", "Publisher Partnership"];

const PROCESS = [
  { step: "1", title: "Discovery Call", body: "Understand your objectives and audience." },
  { step: "2", title: "Onboarding",     body: "Prepare your first research campaign." },
  { step: "3", title: "Launch",         body: "Deploy your campaign and begin collecting audience intelligence." },
  { step: "4", title: "Analyse & Grow", body: "Receive AI-powered analysis, benchmark your results and make better business decisions." },
];

// The three ways publishers can work with Fanometrix (benefit-led headings).
const WAYS_TO_WORK = [
  { title: "Run Your Own Research",              body: "Launch unlimited football audience research through Fanometrix and build your own zero-party audience intelligence." },
  { title: "Earn Revenue Through Brand Research", body: "Participate in commissioned research campaigns for brands and agencies. Fanometrix funds the publisher inventory and you receive payment for participating." },
  { title: "Join Industry-Wide Research",        body: "Opt in to collaborative industry-wide football research using your house inventory. Receive benchmark data and audience intelligence alongside other publisher partners." },
];

// ─── Iconography — one coherent thin line family (design §13) ─────────────────
const ICONS: Record<string, React.ReactNode> = {
  campaigns:   <path d="M4 5h16M4 12h16M4 19h10" />,
  studio:      <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v9a2 2 0 01-2 2H9l-4 3v-3H6a2 2 0 01-2-2V6z" />,
  zeroparty:   <path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5C7.9 18.4 5 15.2 5 11V6l7-3z" />,
  ai:          <path d="M12 4v4m0 8v4m8-8h-4M8 12H4m3.5-4.5l2.5 2.5m4.5-2.5l-2.5 2.5m0 4.5l2.5 2.5m-9-2.5l2.5-2.5M12 9.5A2.5 2.5 0 1012 14.5 2.5 2.5 0 0012 9.5z" />,
  dashboard:   <path d="M4 13a8 8 0 0116 0M12 13l4-3M9 20h6" />,
  reports:     <path d="M7 3h7l4 4v14H7V3zm7 0v4h4M9.5 12h5M9.5 15.5h5" />,
  benchmark:   <path d="M5 20V10m5 10V5m5 15v-7m5 7V8" />,
  industry:    <path d="M12 3a4 4 0 100 8 4 4 0 000-8zM5 21a7 7 0 0114 0M18 6a2 2 0 100 4 2 2 0 000-4z" />,
  creative:    <path d="M4 4h16v12H4V4zm0 12l4-4 3 3 4-5 5 6" />,
  commercial:  <path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6" />,
  editorial:   <path d="M5 4h9l5 5v11H5V4zm4 8h6M9 15.5h6" />,
  product:     <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 0v9m0 0l8-4.5M12 12L4 7.5" />,
  leadership:  <path d="M4 20a8 8 0 0116 0M12 4a4 4 0 100 8 4 4 0 000-8z" />,
  question:    <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM9.6 9a2.5 2.5 0 014.9.6c0 1.7-2.5 2-2.5 3.9M12 17h.01" />,
  globe:       <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3.5 12h17M12 3c2.5 2.6 3.5 6 3.5 9s-1 6.4-3.5 9c-2.5-2.6-3.5-6-3.5-9s1-6.4 3.5-9z" />,
  code:        <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
  calendar:    <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6zM4 9.5h16M8 3v4M16 3v4" />,
  target:      <path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 4.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />,
  supporters:  <path d="M9 11a3 3 0 100-6 3 3 0 000 6zM2.5 20a6.5 6.5 0 0113 0M17 11a3 3 0 100-6M15.5 14.2c2.6.3 4.5 2.2 4.5 4.8" />,
};

// ─── Shared UI ────────────────────────────────────────────────────────────────

function CtaButton({ href, children, variant, onDark }: { href: string; children: React.ReactNode; variant: "primary" | "secondary"; onDark?: boolean }) {
  const primary = variant === "primary";
  const base = "inline-flex items-center justify-center text-[15px] font-bold px-8 py-4 rounded-xl border-2 transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
  const style = primary
    ? { background: GOLD, color: NAVY, borderColor: GOLD, letterSpacing: "0.01em" }
    : onDark
      ? { background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.35)", letterSpacing: "0.01em" }
      : { background: "#fff", color: NAVY, borderColor: BORDER, letterSpacing: "0.01em" };
  return (
    <Link href={href} className={base} style={{ ...style, ["--tw-ring-color" as string]: GOLD }}>
      {children}
      {variant === "secondary" && (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
    </Link>
  );
}

function Eyebrow({ children, onDark }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <p className="scroll-fade-up mb-5 font-semibold uppercase tracking-[0.22em]" style={{ fontSize: 13, color: onDark ? GOLD : GOLD_INK }}>
      {children}
    </p>
  );
}

function Check({ color = GOLD, size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function Icon({ name, color = GOLD_INK, size = 24 }: { name: string; color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

// ─── The Fanometrix flywheel (design direction §6) — continuous learning cycle ─
function Flywheel() {
  const C = 150, R = 116;
  const nodes = FLYWHEEL.map((label, i) => {
    const a = (-90 + i * 60) * (Math.PI / 180);
    return { label, n: i + 1, x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
  });
  return (
    <div className="grid lg:grid-cols-[minmax(0,340px)_1fr] gap-10 lg:gap-14 items-center">
      <div className="relative mx-auto w-full max-w-[340px]">
        <svg viewBox="0 0 300 300" className="w-full h-auto" role="img" aria-label="A continuous Fanometrix intelligence cycle: research question, survey research, evidence, AI analysis, audience intelligence, better decisions, feeding new research questions.">
          <defs>
            <marker id="fw-arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M1 1L6 4L1 7" fill="none" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {/* faint static ring */}
          <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(215,184,122,0.2)" strokeWidth="1.5" />
          {/* slowly-turning dashed ring = continuous motion */}
          <circle cx={C} cy={C} r={R} fill="none" stroke={GOLD} strokeWidth="1.5" className="pp-ring" />
          {/* clockwise direction arc with arrowhead */}
          <path d={`M ${C + R * Math.cos(-1.15)} ${C + R * Math.sin(-1.15)} A ${R} ${R} 0 0 1 ${C + R * Math.cos(-0.35)} ${C + R * Math.sin(-0.35)}`} fill="none" stroke={GOLD} strokeWidth="1.6" markerEnd="url(#fw-arrow)" />
          {/* centre emblem */}
          <circle cx={C} cy={C} r="50" fill={NAVY_2} stroke={GOLD} strokeWidth="1.2" />
          <circle cx={C} cy={C} r="50" fill="none" stroke={GOLD} strokeWidth="1.2" className="pp-breathe" />
          <text x={C} y={C - 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">Continuous</text>
          <text x={C} y={C + 12} textAnchor="middle" fontSize="12" fontWeight="700" fill={GOLD}>intelligence</text>
          {/* stage nodes */}
          {nodes.map(nd => (
            <g key={nd.n}>
              <circle cx={nd.x} cy={nd.y} r="16" fill={NAVY} stroke={GOLD} strokeWidth="1.4" />
              <text x={nd.x} y={nd.y + 4} textAnchor="middle" fontSize="13" fontWeight="700" fill={GOLD}>{nd.n}</text>
            </g>
          ))}
        </svg>
      </div>

      {/* stage legend + loop-back */}
      <div>
        <ol className="grid sm:grid-rows-3 sm:grid-flow-col gap-x-10 gap-y-4 mb-6">
          {FLYWHEEL.map((label, i) => (
            <li key={label} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold" style={{ background: GOLD, color: NAVY }}>{i + 1}</span>
              <span className="font-semibold text-white" style={{ fontSize: 17 }}>{label}</span>
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-3 rounded-xl px-5 py-3.5" style={{ background: "rgba(215,184,122,0.1)", border: "1px dashed rgba(215,184,122,0.5)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12a8 8 0 018-8 8 8 0 016.9 4M20 4v4h-4M20 12a8 8 0 01-8 8 8 8 0 01-6.9-4M4 20v-4h4" />
          </svg>
          <span className="font-semibold" style={{ fontSize: 15, color: GOLD }}>
            New research questions feed the next cycle — intelligence compounds over time.
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Premium product visuals (design §10) — abstracted, not screenshots, ──────
//     no fabricated data. Each is a stylised representation of the real product.

// Premium framing for the product visuals — a deep, soft, layered elevation so
// each reads as crafted product photography rather than a flat screenshot.
const MOCK_SHADOW = "0 28px 56px -18px rgba(11,25,41,0.30), 0 10px 24px -12px rgba(11,25,41,0.20)";

function BrowserChrome({ label, brand }: { label: string; brand?: string }) {
  return (
    <div className="relative flex items-center px-4 py-3" style={{ background: "linear-gradient(180deg, #16253A, #101F32)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <span className="flex gap-1.5" aria-hidden>
        {["#E5675A", "#E5B95A", "#5AB96B"].map(c => <span key={c} className="h-2 w-2 rounded-full" style={{ background: c, opacity: 0.75 }} />)}
      </span>
      <span className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: GOLD }} />
        <span className="text-[11px] font-semibold tracking-wide whitespace-nowrap" style={{ color: "rgba(255,255,255,0.7)" }}>{brand ? `${brand} · ${label}` : label}</span>
      </span>
    </div>
  );
}

function SurveyStudioMock({ className = "", brand }: { className?: string; brand?: string }) {
  return (
    <div className={`relative rounded-2xl overflow-hidden flex flex-col ${className}`} style={{ border: `1px solid ${BORDER}`, background: "#fff", boxShadow: MOCK_SHADOW }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] z-10" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      <BrowserChrome label="Survey Studio" brand={brand} />
      <div className="p-6 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: GOLD_INK }}>Sponsored research</p>
        <div className="space-y-2 mb-5">
          <span className="block h-3.5 rounded" style={{ background: "#E9ECF1", width: "88%" }} />
          <span className="block h-3.5 rounded" style={{ background: "#E9ECF1", width: "62%" }} />
        </div>
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ border: `1.5px solid ${i === 1 ? GOLD : BORDER}`, background: i === 1 ? WASH : "#fff" }}>
              <span className="h-4 w-4 rounded-full shrink-0" style={{ border: `1.5px solid ${i === 1 ? GOLD_INK : "#C7CCD4"}`, background: i === 1 ? GOLD : "transparent" }} />
              <span className="h-2.5 rounded" style={{ background: i === 1 ? "rgba(138,109,47,0.35)" : "#E9ECF1", width: `${70 - i * 8}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-1.5">
          {[0, 1, 2].map(i => <span key={i} className="h-1.5 rounded-full" style={{ width: i === 0 ? 22 : 8, background: i === 0 ? GOLD : "#DDE1E7" }} />)}
        </div>
      </div>
    </div>
  );
}

function DashboardMock({ className = "", brand }: { className?: string; brand?: string }) {
  return (
    <div className={`relative rounded-2xl overflow-hidden flex flex-col ${className}`} style={{ border: `1px solid ${BORDER}`, background: "#fff", boxShadow: MOCK_SHADOW }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] z-10" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      <BrowserChrome label="Campaign Dashboard" brand={brand} />
      <div className="p-6 flex-1">
        <div className="flex items-center justify-between mb-5">
          <span className="h-3 rounded" style={{ background: "#E9ECF1", width: 120 }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-1 rounded" style={{ background: WASH, color: GOLD_INK }}>Illustrative</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {["Responses", "Completion", "Markets"].map((l, i) => (
            <div key={l} className="rounded-lg p-3" style={{ background: BG_SOFT }}>
              <span className="block h-5 rounded mb-2" style={{ background: i === 0 ? GOLD : "#D7DCE3", width: `${60 - i * 10}%`, opacity: 0.9 }} />
              <span className="text-[10px] font-semibold" style={{ color: MUTED }}>{l}</span>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2 h-24 rounded-lg px-4 pt-3 pb-0" style={{ background: BG_SOFT }}>
          {[40, 55, 48, 68, 60, 82, 72, 90].map((h, i) => (
            <span key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i >= 6 ? GOLD : "#C3CAD4" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportMock({ className = "", brand }: { className?: string; brand?: string }) {
  return (
    <div className={`relative rounded-2xl overflow-hidden flex flex-col ${className}`} style={{ border: `1px solid ${BORDER}`, background: "#fff", boxShadow: MOCK_SHADOW }}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] z-10" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
      <BrowserChrome label="Publisher Report" brand={brand} />
      <div className="p-6 flex-1">
        <span className="block h-4 rounded mb-2" style={{ background: "#DFE3E9", width: "70%" }} />
        <span className="block h-3 rounded mb-4" style={{ background: "#E9ECF1", width: "45%" }} />
        <span aria-hidden className="block mb-4" style={{ height: 2, width: 44, background: GOLD }} />
        <div className="space-y-2 mb-5">
          {["92%", "84%", "88%"].map((w, i) => <span key={i} className="block h-2.5 rounded" style={{ background: "#EDEFF3", width: w }} />)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg p-3 flex items-end gap-1.5 h-20" style={{ background: BG_SOFT }}>
            {[50, 70, 60, 85].map((h, i) => <span key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 3 ? GOLD : "#C3CAD4" }} />)}
          </div>
          <div className="rounded-lg p-3 space-y-2" style={{ background: BG_SOFT }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: GOLD_INK }}>Recommendations</span>
            {[0, 1, 2].map(i => (
              <span key={i} className="flex items-center gap-2">
                <Check color={GOLD_INK} size={12} />
                <span className="h-2 rounded" style={{ background: "#DDE1E7", width: `${60 - i * 8}%` }} />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Network benchmarking visual (design §20, Section 7) — the page hero ───────
// Your audience, set against the wider football market: one highlighted node
// joins a network of anonymised publisher audiences inside a central Fanometrix
// benchmark layer, ringed by the comparative dimensions the network unlocks.
function NetworkVisual() {
  const CX = 260, CY = 210;
  // one highlighted "your audience" node + five anonymised network audiences
  const nodes = [
    { x: 150, y: 118, you: true },
    { x: 372, y: 104 },
    { x: 430, y: 232 },
    { x: 322, y: 330 },
    { x: 150, y: 322 },
    { x: 96,  y: 226 },
  ];
  const dims = [
    { x: 400, y: 60,  t: "Markets" },
    { x: 470, y: 300, t: "Competitions" },
    { x: 70,  y: 350, t: "Regions" },
  ];
  return (
    <svg viewBox="0 0 520 420" className="w-full h-auto max-w-[980px] mx-auto" role="img" aria-label="Your audience joins a network of publisher audiences inside a central Fanometrix benchmark layer, compared across markets, competitions and regions.">
      {/* wider-market reach rings */}
      <circle cx={CX} cy={CY} r="176" fill="none" stroke="rgba(215,184,122,0.14)" strokeWidth="1" />
      <circle cx={CX} cy={CY} r="176" fill="none" stroke={GOLD} strokeOpacity="0.35" strokeWidth="1" className="pp-ring" />
      <circle cx={CX} cy={CY} r="120" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* connections to the benchmark layer */}
      {nodes.map((n, i) => (
        <line key={`l${i}`} x1={CX} y1={CY} x2={n.x} y2={n.y} stroke={n.you ? GOLD : "rgba(255,255,255,0.28)"} strokeOpacity={n.you ? 0.9 : 1} strokeWidth={n.you ? 1.8 : 1} className="pp-draw" style={{ ["--pp-dash" as string]: 420 }} />
      ))}
      {/* comparative-dimension labels around the outer ring */}
      {dims.map(d => (
        <text key={d.t} x={d.x} y={d.y} textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="1.5" fill="rgba(215,184,122,0.6)">{d.t.toUpperCase()}</text>
      ))}
      {/* audience nodes */}
      {nodes.map((n, i) => (
        <g key={`n${i}`}>
          {n.you && <circle cx={n.x} cy={n.y} r="26" fill="none" stroke={GOLD} strokeWidth="1" opacity="0.4" className="pp-breathe" />}
          <circle cx={n.x} cy={n.y} r={n.you ? 20 : 11} fill={n.you ? "rgba(215,184,122,0.14)" : "rgba(255,255,255,0.06)"} stroke={n.you ? GOLD : "rgba(255,255,255,0.5)"} strokeWidth={n.you ? 2 : 1} />
          {n.you && <text x={n.x} y={n.y - 34} textAnchor="middle" fontSize="13" fontWeight="700" fill={GOLD}>Your audience</text>}
        </g>
      ))}
      {/* central benchmark layer */}
      <circle cx={CX} cy={CY} r="60" fill={NAVY_2} stroke={GOLD} strokeWidth="1.5" />
      <circle cx={CX} cy={CY} r="60" fill="none" stroke={GOLD} strokeWidth="1.5" className="pp-breathe" />
      <text x={CX} y={CY - 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">Fanometrix</text>
      <text x={CX} y={CY + 14} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.72)">benchmark layer</text>
    </svg>
  );
}

// A concept callout that reads as a label radiating from the network diagram.
// `side` is the side of the network the callout sits on (so the connector points
// inward, toward the benchmark layer).
function NetworkCallout({ title, body, side }: { title: string; body: string; side: "left" | "right" }) {
  const right = side === "left"; // sits on the LEFT of the network → text hugs right edge, connector points right
  return (
    <div className={right ? "lg:text-right" : "lg:text-left"}>
      <div className={`flex items-center gap-3 mb-1.5 ${right ? "lg:justify-end" : ""}`}>
        {right ? (
          <>
            <h3 className="font-bold text-white" style={{ fontSize: 16 }}>{title}</h3>
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: GOLD }} />
            <span aria-hidden className="hidden lg:block h-px w-7 shrink-0" style={{ background: "linear-gradient(90deg, rgba(215,184,122,0.55), transparent)" }} />
          </>
        ) : (
          <>
            <span aria-hidden className="hidden lg:block h-px w-7 shrink-0" style={{ background: "linear-gradient(270deg, rgba(215,184,122,0.55), transparent)" }} />
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: GOLD }} />
            <h3 className="font-bold text-white" style={{ fontSize: 16 }}>{title}</h3>
          </>
        )}
      </div>
      <p className="leading-[1.5]" style={{ fontSize: 13.5, color: "rgba(255,255,255,0.62)" }}>{body}</p>
    </div>
  );
}

function MaturityBars({ level }: { level: number }) {
  return (
    <div className="flex items-end gap-1 h-5" aria-hidden>
      {[1, 2, 3, 4].map(n => (
        <span key={n} className="w-1.5 rounded-sm" style={{ height: `${25 * n}%`, background: n <= level ? GOLD : BORDER, opacity: n <= level ? 1 : 0.6 }} />
      ))}
    </div>
  );
}

// ─── Publisher FAQ accordion (native <details>, subtle CSS reveal) ────────────
function FaqP({ children }: { children: React.ReactNode }) {
  return <p className="leading-[1.7]" style={{ fontSize: 16, color: GREY }}>{children}</p>;
}
function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="pp-faq border-b" style={{ borderColor: BORDER }}>
      <summary className="flex items-start justify-between gap-6 cursor-pointer py-6 sm:py-7">
        <span className="font-semibold pr-2" style={{ fontSize: "clamp(17px,1.7vw,20px)", color: INK, lineHeight: 1.4, letterSpacing: "-0.01em" }}>{question}</span>
        <span className="pp-faq-icon mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200" style={{ border: `1px solid ${BORDER}`, color: MUTED }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M7 1v12M1 7h12" /></svg>
        </span>
      </summary>
      <div className="pp-faq-panel pb-8 sm:pr-14" style={{ maxWidth: 780 }}>{children}</div>
    </details>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The single shared implementation. ~90% of what follows is identical for every
// publisher; only values read from `config` change per partner.
export function PublisherTemplate({ config }: { config: PublisherConfig }) {
  const JOIN_HREF = config.joinHref;
  const DEMO_HREF = config.demoHref;
  const AUDIENCE_QUESTIONS = config.audienceQuestions;
  return (
    <div className="min-h-screen flex flex-col" style={{ background: OFFWHITE, color: INK }}>
      {/* ── Header (solid navy, matches the hero) ── */}
      <header className="sticky top-0 z-50 border-b border-white/10 px-4 sm:px-10" style={{ background: NAVY }}>
        <div className="max-w-[1240px] mx-auto flex items-center justify-between py-4 sm:py-5">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Fanometrix_Logo.png" alt="Fanometrix" className="h-4 sm:h-[21px] w-auto shrink-0" style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
            <span className="shrink-0 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.08em] px-1.5 sm:px-2 py-0.5 rounded-full" style={{ background: GOLD, color: NAVY }}>Beta</span>
            {config.personalised && (
              <span className="hidden sm:flex items-center gap-2.5 shrink-0 pl-2.5 ml-1 border-l border-white/15">
                {config.logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={config.logoSrc} alt={config.name} className="h-4 sm:h-[19px] w-auto" style={{ objectFit: "contain" }} />
                ) : (
                  <span className="text-[13px] font-semibold text-white/85 whitespace-nowrap">{config.name}</span>
                )}
              </span>
            )}
          </Link>
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href={JOIN_HREF} className="hidden sm:inline-flex text-sm font-bold px-5 py-2.5 rounded-lg transition-opacity duration-150 hover:opacity-90" style={{ background: GOLD, color: NAVY }}>
              {config.joinLabel}
            </Link>
            <Link href={`${APP_URL}/login`} className="shrink-0 whitespace-nowrap text-sm font-semibold text-white/90 transition-opacity duration-150 hover:opacity-70">Sign In</Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ═══════════════ Section 1 — Hero ═══════════════ */}
        <section className="relative overflow-hidden px-5 sm:px-10 pt-[clamp(56px,7vw,100px)] pb-[clamp(64px,8vw,120px)]" style={{ background: NAVY }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.5]" style={{
            backgroundImage: "radial-gradient(ellipse 80% 60% at 80% 0%, rgba(215,184,122,0.10) 0%, transparent 60%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "auto, 46px 46px, 46px 46px",
          }} />
          <div className="relative max-w-[1240px] mx-auto">
            <p className="hero-fade-up mb-6 font-semibold uppercase tracking-[0.22em]" style={{ fontSize: 13, color: GOLD, animationDelay: "0s" }}>{config.heroEyebrow}</p>
            <h1 className="hero-fade-up font-bold tracking-tight mb-9 text-white" style={{ fontSize: "clamp(38px, 6vw, 66px)", lineHeight: 1.05, letterSpacing: "-0.03em", animationDelay: "0.08s" }}>
              {config.heroHeadline.map((line, i) => (
                <span key={i}>{i > 0 && <br />}{line}</span>
              ))}
            </h1>
            <p className="hero-fade-up leading-[1.7] mb-10" style={{ animationDelay: "0.2s", fontSize: "clamp(18px, 1.8vw, 21px)", color: "rgba(255,255,255,0.84)", maxWidth: 760 }}>
              {config.heroBody}
            </p>
            <div className="hero-fade-up flex flex-wrap gap-4" style={{ animationDelay: "0.32s" }}>
              <CtaButton href={JOIN_HREF} variant="primary">{config.joinLabel}</CtaButton>
              <CtaButton href="#how-it-works" variant="secondary" onDark>See How It Works</CtaButton>
            </div>
          </div>
        </section>

        {/* ═══════════════ Section 2 — Everything Included ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(72px,8vw,120px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-14">
              <Eyebrow>The Platform</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-5" style={{ fontSize: "clamp(30px,4.2vw,50px)", lineHeight: 1.08, letterSpacing: "-0.02em", color: INK, transitionDelay: "0.05s" }}>
                Everything Included as a Publisher Partner
              </h2>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 20, color: GREY, transitionDelay: "0.1s" }}>
                Becoming a Publisher Partner gives you access to a complete audience intelligence platform designed specifically for football.
              </p>
            </div>

            {/* All nine capabilities as an equal editorial index — numbered rows
                divided by hairlines, not a grid of boxes. */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-14 border-t" style={{ borderColor: BORDER }}>
              {CAPABILITIES.map((c, i) => {
                const mode = "mode" in c ? c.mode : undefined;
                const selfServe = mode === "Do it yourself";
                return (
                  <div key={c.title} className="scroll-fade-up group flex gap-5 py-6 sm:py-7 border-b" style={{ borderColor: BORDER, transitionDelay: `${0.03 * i}s` }}>
                    <span className="shrink-0 pt-1 font-bold fx-tabular-nums" style={{ fontSize: 14, color: "#C0C6CF" }}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 group-hover:bg-[#FBF3E1]" style={{ background: selfServe ? WASH : GREY_BG }}>
                      <Icon name={c.icon} size={20} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="font-bold" style={{ fontSize: 17, color: INK }}>{c.title}</h3>
                        {mode && <span className="text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full" style={{ background: WASH, color: GOLD_INK }}>{mode}</span>}
                        {c.soon && <span className="text-[10px] font-bold uppercase tracking-[0.1em] px-2 py-0.5 rounded-full" style={{ background: GREY_BG, color: MUTED }}>Launching Soon</span>}
                      </div>
                      <p className="leading-[1.55]" style={{ fontSize: 15, color: GREY }}>{c.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════════════ Section 3 — Already Running Surveys? (Flywheel) ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(72px,8vw,120px)]" style={{ background: BG_SOFT }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-14">
              <Eyebrow>Complementary by Design</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-6" style={{ fontSize: "clamp(30px,4.2vw,50px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: INK, transitionDelay: "0.05s" }}>
                Already Running Surveys?<br />You&apos;re Exactly Who We Built Fanometrix For.
              </h2>
              <p className="scroll-fade-up leading-[1.7] mb-5" style={{ fontSize: 19, color: GREY, transitionDelay: "0.1s" }}>
                Fanometrix complements existing survey platforms by transforming individual research campaigns into a growing body of football audience intelligence.
              </p>
              <p className="scroll-fade-up leading-[1.6]" style={{ fontSize: 21, color: INK, fontWeight: 600, transitionDelay: "0.14s" }}>
                Traditional survey tools help you collect responses.{" "}
                <span style={{ color: GOLD_INK }}>Fanometrix helps you understand what they mean.</span>
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-5 mb-16">
              <div className="scroll-fade-up rounded-2xl border p-8" style={{ background: "#fff", borderColor: BORDER, transitionDelay: "0.06s" }}>
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] mb-6" style={{ color: MUTED }}>Traditional Survey Platforms</p>
                <ul className="space-y-4">
                  {TRADITIONAL.map(item => (
                    <li key={item} className="flex items-center gap-3.5" style={{ fontSize: 17, color: GREY }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: FAINT }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="scroll-fade-up rounded-2xl p-8" style={{ background: NAVY, transitionDelay: "0.12s" }}>
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] mb-6" style={{ color: GOLD }}>Fanometrix</p>
                <ul className="space-y-4">
                  {FANOMETRIX.map(item => (
                    <li key={item} className="flex items-center gap-3.5" style={{ fontSize: 17, color: "rgba(255,255,255,0.92)" }}>
                      <Check /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* The flywheel — the memorable moment: a continuous cycle, not a dead end */}
            <div className="scroll-fade-up rounded-3xl overflow-hidden" style={{ background: NAVY, transitionDelay: "0.05s" }}>
              <div className="p-8 sm:p-12">
                <div className="max-w-[620px] mb-10">
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] mb-4" style={{ color: GOLD }}>The Fanometrix Flywheel</p>
                  <h3 className="font-bold tracking-tight text-white mb-4" style={{ fontSize: "clamp(24px,3vw,36px)", lineHeight: 1.15, letterSpacing: "-0.01em" }}>
                    Where others stop at a report, Fanometrix keeps learning.
                  </h3>
                  <div className="inline-flex items-center gap-2.5 rounded-full px-4 py-2" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.65)" }}>Traditional:</span>
                    <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>Survey → Responses → Report</span>
                    <span className="text-[13px] font-semibold px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>End</span>
                  </div>
                </div>
                <Flywheel />
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ NEW — How Fanometrix Works ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(72px,8vw,120px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-14">
              <Eyebrow>How It Works</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-5" style={{ fontSize: "clamp(30px,4.2vw,50px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: INK, transitionDelay: "0.05s" }}>
                From Research Question to Publisher Report
              </h2>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 20, color: GREY, transitionDelay: "0.1s" }}>
                A guided path takes you from a single question to campaigns running across your inventory, with responses and analysis flowing back to you.
              </p>
            </div>

            {/* 8-step journey as a clean numbered progression — no boxes */}
            <ol className="grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4 mb-14">
              {JOURNEY.map((s, i) => {
                const last = i === JOURNEY.length - 1;
                return (
                  <li key={s.title} className="scroll-fade-up flex items-start gap-4" style={{ transitionDelay: `${0.04 * i}s` }}>
                    <span className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-bold fx-tabular-nums" style={{ background: last ? GOLD : "#fff", color: NAVY, border: `1.5px solid ${last ? GOLD : "rgba(215,184,122,0.55)"}` }}>{i + 1}</span>
                    <p className="font-semibold leading-snug pt-1.5" style={{ fontSize: 16, color: INK }}>{s.title}</p>
                  </li>
                );
              })}
            </ol>

            {/* Show the product — build → responses → report, presented on a soft
                pedestal so the interfaces read as crafted product photography. */}
            <div className="relative">
              <div aria-hidden className="pointer-events-none absolute inset-x-0" style={{ top: -24, bottom: -24, background: "radial-gradient(ellipse 68% 62% at 50% 42%, rgba(215,184,122,0.11), transparent 70%)" }} />
              <div className="relative grid lg:grid-cols-3 gap-8 lg:gap-8 items-stretch">
                <div className="scroll-fade-up flex flex-col" style={{ transitionDelay: "0.05s" }}>
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] mb-4" style={{ color: GOLD_INK }}>01 · Build</p>
                  <SurveyStudioMock className="flex-1" brand={config.brandLabel} />
                </div>
                <div className="scroll-fade-up flex flex-col" style={{ transitionDelay: "0.1s" }}>
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] mb-4" style={{ color: GOLD_INK }}>02 · Watch responses arrive</p>
                  <DashboardMock className="flex-1" brand={config.brandLabel} />
                </div>
                <div className="scroll-fade-up flex flex-col" style={{ transitionDelay: "0.15s" }}>
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] mb-4" style={{ color: GOLD_INK }}>03 · Receive intelligence</p>
                  <ReportMock className="flex-1" brand={config.brandLabel} />
                </div>
              </div>
            </div>
            <p className="scroll-fade-up mt-6 text-[13px]" style={{ color: MUTED }}>Illustrative product interfaces.</p>
          </div>
        </section>

        {/* ═══════════════ Section 4 — What Could Your Audience Tell You? ═══════════════ */}
        <section className="relative overflow-hidden px-5 sm:px-10 py-[clamp(72px,8vw,120px)]" style={{ background: NAVY }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(ellipse 70% 50% at 50% 100%, rgba(215,184,122,0.12) 0%, transparent 60%)" }} />
          <div className="relative max-w-[1240px] mx-auto text-center">
            <Eyebrow onDark>Audience Intelligence</Eyebrow>
            <h2 className="scroll-fade-up font-bold tracking-tight mb-7 mx-auto text-white sm:whitespace-nowrap" style={{ fontSize: "clamp(28px,4.2vw,50px)", lineHeight: 1.1, letterSpacing: "-0.02em", transitionDelay: "0.05s" }}>
              What Could Your Audience Tell You?
            </h2>
            <div className="scroll-fade-up mx-auto space-y-4 mb-14" style={{ transitionDelay: "0.1s" }}>
              <p className="leading-[1.7]" style={{ fontSize: 19, color: "rgba(255,255,255,0.82)" }}>Every research campaign helps answer important questions about your audience.</p>
              <p className="leading-[1.7]" style={{ fontSize: 19, color: "rgba(255,255,255,0.82)" }}>The more you understand your supporters, the better your commercial, editorial and product decisions become.</p>
            </div>
            {/* An editorial index of research questions — no cards; each is a
                line in a commissioning agenda, divided by hairlines. */}
            <ul className="grid sm:grid-flow-col sm:grid-rows-4 gap-x-14 mb-14 text-left border-t" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
              {AUDIENCE_QUESTIONS.map((q, i) => (
                <li key={q} className="scroll-fade-up group flex items-baseline gap-5 py-5 sm:py-6 border-b transition-colors duration-200" style={{ borderColor: "rgba(255,255,255,0.12)", transitionDelay: `${0.04 * i}s` }}>
                  <span className="shrink-0 font-bold fx-tabular-nums" style={{ fontSize: 14, color: "rgba(215,184,122,0.6)" }}>Q{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-semibold text-white leading-snug transition-colors duration-200 group-hover:text-[var(--g)]" style={{ ["--g" as string]: GOLD, fontSize: "clamp(18px,1.9vw,23px)", letterSpacing: "-0.01em" }}>{q}</span>
                </li>
              ))}
            </ul>
            <p className="scroll-fade-up mx-auto leading-[1.7]" style={{ fontSize: 17, color: "rgba(255,255,255,0.66)", transitionDelay: "0.1s" }}>
              Every survey contributes to a growing body of football audience intelligence that becomes more valuable over time.
            </p>
          </div>
        </section>

        {/* ═══════════════ Section 5 — Launch Research in Hours ═══════════════ */}
        <section id="how-it-works" className="scroll-mt-20 px-5 sm:px-10 py-[clamp(72px,8vw,120px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-16">
              <Eyebrow>Research Methodology</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-6" style={{ fontSize: "clamp(30px,4.2vw,50px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: INK, transitionDelay: "0.05s" }}>
                Launch Research in Hours.<br />Build Intelligence Over Weeks.
              </h2>
              <p className="scroll-fade-up leading-[1.7] mb-4" style={{ fontSize: 19, color: GREY, transitionDelay: "0.1s" }}>
                Fanometrix enables publishers to launch professionally managed audience research within hours, with data flowing from the moment a campaign goes live.
              </p>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 19, color: GREY, transitionDelay: "0.14s" }}>
                Early insights begin emerging immediately, while robust and representative findings are developed over a typical two to four week campaign.
              </p>
            </div>

            <ol className="relative grid gap-10 md:grid-cols-4 md:gap-6">
              {/* one continuous journey rail running through the stage nodes, */}
              {/* deepening left → right as research matures */}
              <span aria-hidden className="hidden md:block absolute left-[10%] right-[10%]" style={{ top: 19, height: 3, borderRadius: 2, background: `linear-gradient(90deg, rgba(215,184,122,0.25), ${GOLD})` }} />
              {[25, 50, 75].map(p => (
                <svg key={p} aria-hidden width="15" height="13" viewBox="0 0 15 13" className="hidden md:block absolute" style={{ left: `${p}%`, top: 14, transform: "translateX(-50%)" }}>
                  <path d="M2 1.5l5 5-5 5M8 1.5l5 5-5 5" fill="none" stroke={GOLD} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />
                </svg>
              ))}
              {TIMELINE.map((t, i) => (
                <li key={t.marker} className="scroll-fade-up relative" style={{ transitionDelay: `${0.08 * i}s` }}>
                  <div className="flex md:flex-col items-center md:items-start gap-4 md:gap-0">
                    <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold md:mb-6" style={{ background: i === TIMELINE.length - 1 ? GOLD : NAVY, color: i === TIMELINE.length - 1 ? NAVY : "#fff" }}>{i + 1}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: GOLD_INK }}>{t.marker}</p>
                        <MaturityBars level={t.maturity} />
                      </div>
                      <h3 className="font-bold mb-3.5" style={{ fontSize: 19, color: INK }}>{t.heading}</h3>
                      <ul className="space-y-2.5">
                        {t.actions.map(a => (
                          <li key={a} className="flex items-start gap-2.5" style={{ fontSize: 16, color: GREY }}>
                            <span className="mt-2 w-1 h-1 rounded-full shrink-0" style={{ background: GOLD }} />{a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <div className="scroll-fade-up mt-20 mx-auto text-center max-w-[1000px]" style={{ transitionDelay: "0.1s" }}>
              <p className="font-semibold tracking-tight" style={{ fontSize: "clamp(24px,3vw,34px)", lineHeight: 1.3, color: INK, letterSpacing: "-0.01em" }}>
                Good research shouldn&apos;t take months, but it shouldn&apos;t be rushed either.
              </p>
              <p className="mt-5 leading-[1.7] mx-auto" style={{ fontSize: 18, color: GREY, maxWidth: 820 }}>
                Fanometrix balances speed with robust research methodology to produce audience intelligence publishers can trust.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════ Section 6 — 1 Million Impressions (wide hero section) ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(80px,9vw,132px)]" style={{ background: NAVY }}>
          <div className="max-w-[1360px] mx-auto">
            <div className="mb-14">
              <Eyebrow onDark>Pilot Benchmarks</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-6 text-white xl:whitespace-nowrap" style={{ fontSize: "clamp(30px,4.2vw,54px)", lineHeight: 1.06, letterSpacing: "-0.02em", transitionDelay: "0.05s" }}>
                What Could 1 Million Impressions Deliver?
              </h2>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 19, color: "rgba(255,255,255,0.82)", transitionDelay: "0.1s" }}>
                Before opening Fanometrix to publisher partners, we conducted a pilot across four football publishers spanning multiple European markets. The pilot enabled us to validate the platform, optimise the survey experience and establish our initial performance benchmarks. The illustration below represents a typical two to four week campaign based on those benchmarks. Actual performance will vary depending on audience, placement, survey design and campaign duration.
              </p>
              {config.benchmarkNote && (
                <p className="scroll-fade-up leading-[1.6] mt-5" style={{ fontSize: 15, color: "rgba(215,184,122,0.9)", transitionDelay: "0.14s" }}>{config.benchmarkNote}</p>
              )}
            </div>

            <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6 lg:gap-8 items-stretch">
              {/* funnel */}
              <div className="scroll-fade-up rounded-3xl p-7 sm:p-10" style={{ background: "#fff", transitionDelay: "0.06s" }}>
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] mb-8 text-center" style={{ color: MUTED }}>Illustrative Campaign</p>
                <ol className="mx-auto max-w-[720px] space-y-2.5">
                  {FUNNEL.map((f, i) => {
                    const dark = i === 0 || i === FUNNEL.length - 1; // input + output bookends
                    const width = 100 - i * 6; // gentle taper: 100, 94, 88, 82, 76
                    return (
                      <li key={f.label} className="flex flex-col items-center">
                        <div className="pp-funnel-step rounded-xl flex items-center justify-between px-6 py-5 gap-5" style={{ ["--w" as string]: `${width}%`, background: dark ? NAVY : "#fff", border: dark ? "none" : `1.5px solid ${BORDER}` }}>
                          <span className="font-semibold" style={{ fontSize: 15, lineHeight: 1.3, color: dark ? "rgba(255,255,255,0.9)" : GREY }}>{f.label}</span>
                          <span className="text-right shrink-0">
                            {f.countTo ? (
                              <CountUp to={f.countTo} className="font-bold fx-tabular-nums block" style={{ fontSize: "clamp(20px,2.6vw,28px)", color: dark ? GOLD : INK }} />
                            ) : (
                              <span className="font-bold fx-tabular-nums block" style={{ fontSize: "clamp(20px,2.6vw,28px)", color: dark ? GOLD : INK }}>{f.value}</span>
                            )}
                            {f.note && <span className="block text-[11px] font-medium mt-0.5" style={{ color: dark ? "rgba(255,255,255,0.55)" : MUTED }}>{f.note}</span>}
                          </span>
                        </div>
                        {i < FUNNEL.length - 1 && (
                          <svg width="18" height="14" viewBox="0 0 18 14" className="my-1" aria-hidden><path d="M9 0v10M4 6l5 5 5-5" fill="none" stroke={BORDER} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <div className="mt-9 grid grid-cols-3 gap-4 border-t pt-8" style={{ borderColor: BORDER_2 }}>
                  {[{ n: 4, s: "Publisher Partners", cu: true }, { n: 5, s: "European Markets", cu: true }, { n: "2–4", s: "Week Campaign", cu: false }].map(x => (
                    <div key={x.s} className="text-center">
                      {x.cu ? (
                        <CountUp to={x.n as number} className="font-bold fx-tabular-nums block" style={{ fontSize: "clamp(30px,3.6vw,44px)", color: NAVY }} />
                      ) : (
                        <span className="font-bold fx-tabular-nums block" style={{ fontSize: "clamp(30px,3.6vw,44px)", color: NAVY }}>{x.n}</span>
                      )}
                      <p className="text-[12px] font-semibold uppercase tracking-[0.08em] mt-1.5" style={{ color: MUTED }}>{x.s}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* outcomes + validation, stacked to use the width */}
              <div className="flex flex-col gap-6">
                <div className="scroll-fade-up rounded-3xl p-8 sm:p-10 flex-1 flex flex-col" style={{ background: NAVY_2, border: "1px solid rgba(255,255,255,0.08)", transitionDelay: "0.1s" }}>
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: GOLD }}>The Value Created</p>
                  <h3 className="font-bold tracking-tight text-white mb-1.5" style={{ fontSize: "clamp(22px,2.6vw,30px)", lineHeight: 1.15, letterSpacing: "-0.01em" }}>
                    From Inventory to Intelligence
                  </h3>
                  <p className="mb-6" style={{ fontSize: 15, color: "rgba(255,255,255,0.65)" }}>Publisher inventory becomes:</p>
                  <ul className="space-y-3.5 mb-8">
                    {INVENTORY_TO_INTELLIGENCE.map(o => (
                      <li key={o} className="flex items-center gap-3.5" style={{ fontSize: 17, color: "rgba(255,255,255,0.92)" }}><Check /> {o}</li>
                    ))}
                  </ul>
                  <p className="mt-auto font-bold tracking-tight text-white" style={{ fontSize: "clamp(20px,2.4vw,26px)", lineHeight: 1.25 }}>
                    Impressions are the input. <span style={{ color: GOLD }}>Intelligence is the outcome.</span>
                  </p>
                </div>
                <div className="scroll-fade-up flex items-start gap-4 rounded-2xl p-6" style={{ background: "rgba(215,184,122,0.1)", border: "1px solid rgba(215,184,122,0.25)", transitionDelay: "0.14s" }}>
                  <span className="shrink-0 mt-0.5"><Icon name="benchmark" color={GOLD} size={22} /></span>
                  <p className="leading-[1.6]" style={{ fontSize: 15, color: "rgba(255,255,255,0.85)" }}>
                    <strong className="font-bold" style={{ color: GOLD }}>Validated in the real world.</strong> These benchmark assumptions were established through a real-world pilot across four football publishers and multiple European markets.
                  </p>
                </div>
              </div>
            </div>

            <p className="scroll-fade-up mt-8 text-center italic leading-[1.6] mx-auto" style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", maxWidth: 860 }}>
              Illustrative campaign based on current Fanometrix pilot benchmarks. Actual performance will vary according to audience, placement, survey design, market and campaign duration.
            </p>
            <p className="scroll-fade-up mt-4 text-center leading-[1.6] mx-auto" style={{ fontSize: 15, color: "rgba(255,255,255,0.72)", maxWidth: 900 }}>
              Our benchmarks will continue to evolve as more publisher partners join the Fanometrix network and additional campaigns are completed.
            </p>
          </div>
        </section>

        {/* ═══════════════ Section 7 — See Beyond Your Own Audience ═══════════════ */}
        <section className="relative overflow-hidden px-5 sm:px-10 py-[clamp(72px,8vw,120px)]" style={{ background: BG_SOFT }}>
          <div className="relative max-w-[1240px] mx-auto">
            <div className="text-center mx-auto mb-14">
              <Eyebrow>Network Intelligence</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-6 mx-auto" style={{ fontSize: "clamp(30px,4.2vw,50px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: INK, transitionDelay: "0.05s" }}>
                See Beyond Your Own Audience
              </h2>
              <div className="scroll-fade-up space-y-3" style={{ transitionDelay: "0.1s" }}>
                <p className="leading-[1.7]" style={{ fontSize: 19, color: GREY }}>Every publisher understands their own audience. Fanometrix helps you understand how your audience compares with football supporters across the wider market.</p>
                <p className="leading-[1.7] mx-auto" style={{ fontSize: 19, color: GREY }}>As more publisher partners join the network, every campaign contributes to an expanding body of football audience intelligence that no individual publisher could create alone.</p>
              </div>
            </div>

            {/* An infographic: the four network concepts flank the benchmark
                diagram on desktop, connected inward; they stack into a divided
                index on smaller screens. No cards. */}
            <div className="scroll-fade-up relative overflow-hidden rounded-3xl" style={{ background: NAVY, transitionDelay: "0.06s" }}>
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(ellipse 60% 55% at 50% 45%, rgba(215,184,122,0.10) 0%, transparent 65%)" }} />
              <div className="relative px-6 sm:px-12 py-14 sm:py-20">
                <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)_minmax(0,1fr)] gap-10 lg:gap-6 items-center">
                  <div className="flex flex-col gap-14">
                    <NetworkCallout title={NETWORK_CARDS[0].title} body={NETWORK_CARDS[0].body} side="left" />
                    <NetworkCallout title={NETWORK_CARDS[1].title} body={NETWORK_CARDS[1].body} side="left" />
                  </div>
                  <NetworkVisual />
                  <div className="flex flex-col gap-14">
                    <NetworkCallout title={NETWORK_CARDS[2].title} body={NETWORK_CARDS[2].body} side="right" />
                    <NetworkCallout title={NETWORK_CARDS[3].title} body={NETWORK_CARDS[3].body} side="right" />
                  </div>
                </div>
              </div>
            </div>

            <div className="scroll-fade-up mt-16 text-center mx-auto" style={{ maxWidth: 980, transitionDelay: "0.08s" }}>
              <p className="font-semibold tracking-tight" style={{ fontSize: "clamp(22px,2.9vw,33px)", lineHeight: 1.3, color: INK, letterSpacing: "-0.015em" }}>
                No single publisher can build this intelligence alone. <span style={{ color: GOLD_INK }}>Every research campaign strengthens the network,</span> creating richer audience intelligence for every publisher partner.
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════ Section 8 — Creating Value Across Your Business ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(72px,8vw,120px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="mb-14">
              <Eyebrow>Business Value</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-5" style={{ fontSize: "clamp(30px,4.2vw,50px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: INK, transitionDelay: "0.05s" }}>
                Creating Value Across Your Business
              </h2>
              <p className="scroll-fade-up leading-[1.7]" style={{ fontSize: 20, color: GREY, transitionDelay: "0.1s" }}>
                Fanometrix supports commercial, editorial, product and leadership teams by providing trusted audience intelligence collected directly from football supporters.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {DEPARTMENTS.map((d, i) => (
                <div key={d.title} className="scroll-fade-up relative overflow-hidden rounded-2xl border bg-white p-7 pt-8 flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(16,24,40,0.08)]" style={{ borderColor: BORDER, transitionDelay: `${0.05 * i}s` }}>
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: GOLD }} />
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl mb-5" style={{ background: WASH }}><Icon name={d.icon} /></span>
                  <h3 className="font-bold mb-2.5" style={{ fontSize: 18, color: INK }}>{d.title}</h3>
                  <p className="leading-[1.6]" style={{ fontSize: 15, color: GREY }}>{d.body}</p>
                </div>
              ))}
            </div>
            <p className="scroll-fade-up mt-16 text-center font-bold tracking-tight" style={{ fontSize: "clamp(24px,3.4vw,40px)", color: INK, letterSpacing: "-0.02em", transitionDelay: "0.08s" }}>
              One platform. <span style={{ color: GOLD_INK }}>Multiple teams.</span> Better decisions.
            </p>
          </div>
        </section>

        {/* ═══════════════ Section 9 — Built on Trust, Privacy & Transparency ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(72px,8vw,120px)]" style={{ background: GREY_BG }}>
          <div className="max-w-[1240px] mx-auto">
            <div className="text-center mx-auto mb-14">
              <Eyebrow>Trust &amp; Governance</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mb-6 mx-auto" style={{ fontSize: "clamp(30px,4.2vw,50px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: INK, transitionDelay: "0.05s" }}>
                Built on Trust, Privacy &amp; Transparency
              </h2>
              <p className="scroll-fade-up leading-[1.7] mx-auto" style={{ fontSize: 19, color: GREY, transitionDelay: "0.1s" }}>
                Fanometrix has been designed to help publishers collect meaningful audience intelligence responsibly, transparently and in accordance with modern privacy standards.
              </p>
            </div>
            {/* Trust commitments as a calm divided list, not cards. */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-12 border-t" style={{ borderColor: "#DDE0E5" }}>
              {TRUST.map((t, i) => (
                <div key={t} className="scroll-fade-up flex items-center gap-4 py-6 border-b" style={{ borderColor: "#DDE0E5", transitionDelay: `${0.04 * i}s` }}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: WASH }}><Check color={GOLD_INK} /></span>
                  <span className="font-semibold" style={{ fontSize: 17, color: INK }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ Common Publisher Questions (knowledge centre) ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(72px,8vw,120px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[920px] mx-auto">
            <div className="text-center mb-14">
              <Eyebrow>Common Publisher Questions</Eyebrow>
              <h2 className="scroll-fade-up font-bold tracking-tight mx-auto" style={{ fontSize: "clamp(30px,4.2vw,50px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: INK, transitionDelay: "0.05s" }}>
                Everything Else You Need to Know
              </h2>
            </div>

            <div className="scroll-fade-up border-t" style={{ borderColor: BORDER, transitionDelay: "0.05s" }}>
              <FaqItem question="How easy is Fanometrix to implement?">
                <div className="space-y-4">
                  <FaqP>Fanometrix has been designed to fit into existing publisher workflows with minimal technical effort.</FaqP>
                  <FaqP>A typical campaign looks like this:</FaqP>
                  <ol className="space-y-2.5">
                    {["Create your survey.", "Create campaign lines for each market and creative.", "Copy the generated iframe.", "Schedule the survey exactly as you would a standard 300 × 250 display campaign.", "Watch responses arrive in your live dashboard."].map((s, i) => (
                      <li key={i} className="flex gap-3.5" style={{ fontSize: 16, color: GREY }}>
                        <span className="shrink-0 font-bold fx-tabular-nums" style={{ color: GOLD_INK }}>{i + 1}.</span>
                        <span className="leading-[1.6]">{s}</span>
                      </li>
                    ))}
                  </ol>
                  <FaqP>For most publishers, implementation is no more complex than trafficking a standard display advertisement.</FaqP>
                </div>
              </FaqItem>

              <FaqItem question="What advert formats does Fanometrix support?">
                <div className="space-y-4">
                  <FaqP>Currently Fanometrix uses a standard 300 × 250 MPU format.</FaqP>
                  <FaqP>We intentionally started with the industry&apos;s most common display format to make implementation straightforward.</FaqP>
                  <FaqP>As the platform evolves we may introduce additional formats where there is demand from publisher partners.</FaqP>
                </div>
              </FaqItem>

              <FaqItem question="How are impressions purchased?">
                <div className="space-y-4">
                  <FaqP>When brands commission research through Fanometrix, publisher inventory is purchased using an agreed commercial model.</FaqP>
                  <FaqP>A member of the Fanometrix team will work directly with each publisher to agree the most appropriate commercial approach and ensure inventory is fairly valued.</FaqP>
                </div>
              </FaqItem>

              <FaqItem question="What does a typical survey look like?">
                <div className="space-y-6">
                  <FaqP>See exactly what supporters experience. From invitation to thank you, the survey is deliberately lightweight and clean, designed to sit comfortably within your audience&apos;s experience.</FaqP>
                  <SurveyDemo brand={config.brandLabel} />
                </div>
              </FaqItem>

              <FaqItem question="Can surveys be translated?">
                <div className="space-y-4">
                  <FaqP><strong className="font-bold" style={{ color: INK }}>Yes.</strong></FaqP>
                  <FaqP>When creating a survey you simply choose the languages and markets you want to support.</FaqP>
                  <FaqP>Fanometrix automatically generates the translated surveys, allowing campaigns to run consistently across multiple territories.</FaqP>
                </div>
              </FaqItem>

              <FaqItem question="Can we run our own surveys?">
                <div className="space-y-4">
                  <FaqP><strong className="font-bold" style={{ color: INK }}>Yes.</strong></FaqP>
                  <FaqP>Publisher Partners can create and manage their own audience research while benefiting from Fanometrix reporting, AI analysis and audience intelligence.</FaqP>
                </div>
              </FaqItem>

              <FaqItem question="Do we have to participate in industry research?">
                <div className="space-y-4">
                  <FaqP><strong className="font-bold" style={{ color: INK }}>No.</strong></FaqP>
                  <FaqP>Industry-wide research projects are entirely optional.</FaqP>
                  <FaqP>Each publisher decides whether they wish to contribute inventory to any collaborative study.</FaqP>
                </div>
              </FaqItem>

              <FaqItem question="What happens when a brand commissions research?">
                <div className="space-y-4">
                  <FaqP>Fanometrix manages the campaign on behalf of the commissioning brand or agency.</FaqP>
                  <FaqP>Publisher inventory is funded as part of the campaign and participating publishers receive payment in line with agreed commercial terms.</FaqP>
                </div>
              </FaqItem>

              <FaqItem question="How long should surveys run?">
                <div className="space-y-4">
                  <FaqP>Although campaigns can launch within hours, we generally recommend research remains live for 2–4 weeks.</FaqP>
                  <FaqP>This helps reach a broader cross-section of supporters and produces more representative audience intelligence.</FaqP>
                </div>
              </FaqItem>

              <FaqItem question="Is our audience data shared with other publishers?">
                <div className="space-y-4">
                  <FaqP><strong className="font-bold" style={{ color: INK }}>No.</strong></FaqP>
                  <FaqP>Research commissioned by individual publishers remains private.</FaqP>
                  <FaqP>Industry benchmarking uses aggregated and anonymised insights and never exposes another publisher&apos;s proprietary research.</FaqP>
                </div>
              </FaqItem>

              <FaqItem question="What support does Fanometrix provide?">
                <div className="space-y-4">
                  <FaqP>The Fanometrix team supports publisher partners throughout the entire process, including:</FaqP>
                  <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
                    {["Survey design", "Campaign setup", "Implementation guidance", "Reporting", "AI analysis", "Ongoing optimisation"].map(s => (
                      <li key={s} className="flex items-center gap-3" style={{ fontSize: 16, color: GREY }}>
                        <Check color={GOLD_INK} size={16} /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </FaqItem>
            </div>

            {/* Reassurance bridge into Become a Publisher Partner */}
            <div className="scroll-fade-up mt-14 text-center" style={{ transitionDelay: "0.05s" }}>
              <p className="mx-auto mb-6" style={{ fontSize: 18, color: INK, maxWidth: 660, lineHeight: 1.6 }}>
                Still have a question? We&apos;d be happy to arrange a short demo and answer anything not covered above.
              </p>
              <div className="flex justify-center">
                <CtaButton href={DEMO_HREF} variant="secondary">{config.demoLabel}</CtaButton>
              </div>
              {config.contact && (config.contact.name || config.contact.email) && (
                <p className="mt-5" style={{ fontSize: 14, color: MUTED }}>
                  {config.contact.name ? `Your Fanometrix contact: ${config.contact.name}` : "Speak to the Fanometrix team"}
                  {config.contact.email && (
                    <> · <a href={`mailto:${config.contact.email}`} className="font-semibold transition-opacity hover:opacity-70" style={{ color: GOLD_INK }}>{config.contact.email}</a></>
                  )}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ═══════════════ Section 10 — Become a Publisher Partner ═══════════════ */}
        <section className="relative overflow-hidden px-5 sm:px-10 py-[clamp(80px,9vw,132px)]" style={{ background: NAVY }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(215,184,122,0.12) 0%, transparent 60%)" }} />
          <div className="relative max-w-[1240px] mx-auto text-center">
            <Eyebrow onDark>Get Started</Eyebrow>
            <h2 className="scroll-fade-up font-bold tracking-tight mb-6 mx-auto text-white" style={{ fontSize: "clamp(30px,4.6vw,56px)", lineHeight: 1.08, letterSpacing: "-0.02em", transitionDelay: "0.05s" }}>
              Become a Publisher Partner
            </h2>
            <p className="scroll-fade-up leading-[1.7] mx-auto mb-16 lg:whitespace-nowrap" style={{ fontSize: 19, color: "rgba(255,255,255,0.82)", transitionDelay: "0.1s" }}>
              Join a growing network of publishers helping to build the future of football audience intelligence.
            </p>

            {/* Three ways to work with Fanometrix — a clean editorial element
                (columns divided by hairlines), not another set of feature cards. */}
            <div className="scroll-fade-up mb-16" style={{ transitionDelay: "0.12s" }}>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-center mb-9" style={{ color: GOLD }}>Choose How You Want to Work With Fanometrix</p>
              <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10 border-y border-white/10">
                {WAYS_TO_WORK.map((w, i) => (
                  <div key={w.title} className="py-8 md:py-9 md:px-9 md:first:pl-0 md:last:pr-0 text-left">
                    <span className="block font-bold fx-tabular-nums mb-4" style={{ fontSize: 15, color: "rgba(215,184,122,0.6)" }}>{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="font-bold text-white mb-3" style={{ fontSize: 20, letterSpacing: "-0.01em" }}>{w.title}</h3>
                    <p className="leading-[1.6]" style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}>{w.body}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* A simple onboarding pathway — nodes on one rail, not a card grid. */}
            <ol className="relative grid gap-12 sm:grid-cols-2 lg:grid-cols-4 mb-16">
              <span aria-hidden className="hidden lg:block absolute left-[12.5%] right-[12.5%]" style={{ top: 22, height: 2, background: "linear-gradient(90deg, rgba(215,184,122,0.3), rgba(215,184,122,0.9))" }} />
              {PROCESS.map((p, i) => {
                const last = i === PROCESS.length - 1;
                return (
                  <li key={p.step} className="scroll-fade-up relative text-center" style={{ transitionDelay: `${0.06 * i}s` }}>
                    <span className="relative z-10 mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-bold" style={{ background: last ? GOLD : NAVY_2, color: last ? NAVY : "#fff", border: `1.5px solid ${GOLD}` }}>{p.step}</span>
                    <h3 className="font-bold mb-2 text-white" style={{ fontSize: 18 }}>{p.title}</h3>
                    <p className="leading-[1.6] mx-auto" style={{ fontSize: 15, color: "rgba(255,255,255,0.72)", maxWidth: 230 }}>{p.body}</p>
                  </li>
                );
              })}
            </ol>
            <div className="scroll-fade-up flex flex-wrap gap-4 justify-center" style={{ transitionDelay: "0.1s" }}>
              <CtaButton href={JOIN_HREF} variant="primary">{config.joinLabel}</CtaButton>
              <CtaButton href={DEMO_HREF} variant="secondary" onDark>{config.demoLabel}</CtaButton>
            </div>
          </div>
        </section>

        {/* ═══════════════ Final Closing Statement ═══════════════ */}
        <section className="px-5 sm:px-10 py-[clamp(80px,9vw,140px)]" style={{ background: OFFWHITE }}>
          <div className="max-w-[1080px] mx-auto text-center">
            <span aria-hidden className="scroll-fade-up mx-auto mb-9 block gold-rule" style={{ width: 60, height: 2, background: GOLD }} />
            <p className="scroll-fade-up font-semibold tracking-tight" style={{ fontSize: "clamp(24px,3.4vw,38px)", lineHeight: 1.32, color: INK, letterSpacing: "-0.01em", transitionDelay: "0.05s" }}>
              Football supporters invest their time, passion and money into the game every day. Fanometrix exists to ensure their voices help shape the future of football, helping publishers, brands and the wider industry make better decisions through <span style={{ color: GOLD_INK }}>trusted audience intelligence</span>.
            </p>
          </div>
        </section>

        <ScrollFadeObserver />
      </main>

      {/* ── Footer ── */}
      <footer className="px-5 sm:px-10 py-12" style={{ background: NAVY }}>
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="max-w-md">
            <Link href="/" className="inline-flex items-center gap-2 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Fanometrix_Logo.png" alt="Fanometrix" className="h-[18px] w-auto" style={{ objectFit: "contain", filter: "brightness(0) invert(1)" }} />
            </Link>
            <p className="leading-[1.6]" style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
              Football audience intelligence, built from consent-first supporter research, AI-powered analysis and industry benchmarking.
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-3">
            <nav className="flex flex-wrap gap-5">
              <Link href={JOIN_HREF} className="text-[13px] font-semibold transition-opacity hover:opacity-70" style={{ color: GOLD }}>{config.joinLabel}</Link>
              <Link href="/privacy" className="text-[13px] transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.7)" }}>Privacy Policy</Link>
            </nav>
            <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.45)" }}>© {new Date().getFullYear()} Fanometrix</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
