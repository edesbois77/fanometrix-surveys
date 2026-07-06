import Link from "next/link";
import type { Metadata } from "next";
import { ScrollFadeObserver } from "@/app/components/ScrollFadeObserver";
import { APP_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: "Fanometrix for Publishers — Give Your Audience a Voice",
  description:
    "Deploy short, anonymous fan surveys on your existing inventory in minutes. Understand your audience, win more business, and benchmark against the wider football ecosystem — at no commercial cost.",
};

// ─── Design tokens (matches the public homepage) ─────────────────────────────
const NAVY    = "#0B1929";
const GOLD    = "#D7B87A";
const GREY    = "#6B7280";
const MUTED   = "#9CA3AF";
const BG_SOFT = "#F8F9FB";
const BORDER  = "#E5E7EB";
const SURFACE = "#F1F2F5";

// ─── Content ──────────────────────────────────────────────────────────────────

const HERO_BADGES = [
  "Anonymous by design",
  "No personal data collected",
  "Uses existing inventory",
  "Global benchmarking included",
];

const KNOWN_TODAY = ["Clicks", "Sessions", "Page views", "Video starts", "Engagement"];

const UNKNOWN_TODAY = [
  "What fans value",
  "What fans expect from brands",
  "Which experiences fans want next",
  "What drives supporter loyalty",
  "How audiences differ from competitors",
];

// Each label is forced onto exactly two lines via an explicit break (rather
// than relying on wrapping at a shared max-width, which gave inconsistent
// 1/2/3-line results depending on word length) so all four look uniform.
const ECOSYSTEM_FLOW = [
  { lines: ["Fans share", "opinions"], icon: <path d="M4 4h16v12H8l-4 4V4z" /> },
  { lines: ["Publishers understand", "audiences"], icon: <path d="M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-4.35-4.35" /> },
  { lines: ["Brands create", "better activations"], icon: <path d="M12 2a6 6 0 00-3 11.2c.6.4 1 1.1 1 1.8h4c0-.7.4-1.4 1-1.8A6 6 0 0012 2z M9 18h6M10 21h4" /> },
  { lines: ["Football experiences", "improve"], icon: <path d="M12 21s-7-4.35-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.65-9.5 9-9.5 9z" /> },
];

const WHEN_FANS_HAVE_A_VOICE = [
  "Publishers build better products",
  "Brands create better experiences",
  "Rights holders understand supporters",
  "Football benefits from more valuable commercial investment",
];

const RECEIVE_CARDS = [
  {
    title: "Understand Your Audience",
    body: "Understand opinions rather than behaviours.",
    icon: <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7z M12 9a3 3 0 100 6 3 3 0 000-6z" />,
  },
  {
    title: "Win More Business",
    body: "Support proposals and sponsorship ideas using real audience evidence.",
    icon: <path d="M4 17l5.5-6 4 4L21 6 M21 6h-5 M21 6v5" />,
  },
  {
    title: "Improve Products",
    body: "Validate product and editorial decisions using fan feedback.",
    icon: <path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z M12 2v2.6 M12 19.4V22 M4.6 4.6l1.9 1.9 M17.5 17.5l1.9 1.9 M2 12h2.6 M19.4 12H22 M4.6 19.4l1.9-1.9 M17.5 6.5l1.9-1.9" />,
  },
  {
    title: "Benchmark Against The Industry",
    body: "Compare audiences across markets, competitions and football communities.",
    icon: <path d="M4 20V11 M10 20V4 M16 20v-8 M3 20h18" />,
  },
  {
    title: "Access Everything For Free",
    body: "No licence fees or software costs.",
    icon: <path d="M20.6 12.9L12 21.5 2.5 12A2 2 0 012 10.6V4a2 2 0 012-2h6.6a2 2 0 011.4.6l8.6 8.6a2 2 0 010 2.8z M7 8a1 1 0 100-2 1 1 0 000 2z" />,
  },
];

const IMPLEMENTATION_STEPS = [
  { label: "Create Survey", image: "/for-publishers-create-survey.png" },
  { label: "Generate Tag",  image: "/for-publishers-generate-tag.png" },
  { label: "Traffic MPU",   image: "/for-publishers-traffic-mpu.png" },
  { label: "View Results",  image: "/for-publishers-view-results.png" },
];

const NO_FRICTION = [
  "15 minute implementation",
  "No SDK",
  "No engineering project",
  "No app updates",
  "No personal data collection",
  "No panel recruitment",
  "No incentives required",
];

const COMMITMENT_ROWS = [
  { label: "Inventory",        value: "House inventory" },
  { label: "Format",           value: "300×250 MPU" },
  { label: "Frequency Cap",    value: "2–3 monthly" },
  { label: "Engineering Time", value: "15 minutes" },
  { label: "Commercial Cost",  value: "£0" },
];

const CREATIVE_FLEXIBILITY = [
  "Native design options",
  "Publisher colours",
  "Typography support",
  "Multiple creative themes",
  "White-label experiences",
];

const PRIVACY_POINTS = [
  { label: "Anonymous responses", body: "No response can ever be linked back to an individual fan." },
  { label: "No PII",              body: "No names, emails, or personal identifiers are ever collected." },
  { label: "No cookies",          body: "Nothing is tracked or stored across sessions or devices." },
  { label: "Publisher control",   body: "You control placement, frequency, and participation at every step." },
];

const FAQ_ITEMS = [
  {
    q: "Is this really free?",
    a: "Yes. Fanometrix is free for publishers because we believe every football fan deserves a voice and better audience understanding benefits the entire football ecosystem.",
  },
  {
    q: "How long does implementation take?",
    a: "Most publishers can launch their first survey in under 15 minutes using existing 300x250 inventory.",
  },
  {
    q: "What data is collected?",
    a: "Fanometrix collects anonymous survey responses only. No names, emails, cookies or personal identifiers are ever collected.",
  },
  {
    q: "Can surveys match our design system?",
    a: "Yes. Creatives can be tailored to match publisher colours, typography and visual identity, helping surveys feel native to existing experiences.",
  },
  {
    q: "How can publishers use the results?",
    a: "Publishers use Fanometrix to support commercial proposals, improve products and editorial decisions, benchmark audiences and better understand supporter behaviour and preferences.",
  },
  {
    q: "Do we need to recruit a panel or offer incentives?",
    a: "No. Fanometrix works using existing inventory and existing audiences. There are no panels to recruit and no incentives required.",
  },
];

// ─── Shared UI ────────────────────────────────────────────────────────────────

function CtaButton({ href, children, variant }: { href: string; children: React.ReactNode; variant: "primary" | "secondary" }) {
  const primary = variant === "primary";
  return (
    <Link
      href={href}
      className="text-sm font-bold px-8 py-3.5 rounded-xl border-2 transition-all duration-150 hover:opacity-85"
      style={
        primary
          ? { background: GOLD, color: NAVY, borderColor: GOLD, letterSpacing: "0.01em" }
          : { background: "#fff", color: NAVY, borderColor: GOLD, letterSpacing: "0.01em" }
      }
    >
      {children}
    </Link>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="scroll-fade-up mb-4 font-semibold uppercase tracking-[0.18em]" style={{ fontSize: 12, color: GOLD }}>
      {children}
    </p>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs font-semibold px-4 py-2 rounded-full border"
      style={{ color: NAVY, borderColor: BORDER, background: "#fff" }}
    >
      {children}
    </span>
  );
}

export default function ForPublishersPage() {
  return (
    <div
      className="min-h-screen bg-white flex flex-col"
      style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-gray-100 px-4 sm:px-10">
        <div className="max-w-[1340px] mx-auto flex items-center justify-between py-4 sm:py-5">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Fanometrix_Logo.png"
              alt="Fanometrix"
              className="h-4 sm:h-[21px] w-auto shrink-0"
              style={{
                objectFit: "contain",
                filter: "brightness(0) saturate(100%) invert(11%) sepia(33%) saturate(1200%) hue-rotate(192deg) brightness(95%)",
              }}
            />
            <span
              className="shrink-0 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.08em] px-1.5 sm:px-2 py-0.5 rounded-full"
              style={{ background: GOLD, color: NAVY }}
            >
              Beta
            </span>
          </Link>
          <Link
            href={`${APP_URL}/login`}
            className="shrink-0 whitespace-nowrap text-sm font-semibold transition-opacity duration-150 hover:opacity-70"
            style={{ color: NAVY }}
          >
            Sign In
          </Link>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ── */}
        <section className="relative overflow-hidden px-5 sm:px-10 pt-[clamp(48px,7vw,84px)] pb-[clamp(56px,7vw,96px)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 90% 55% at 50% 0%, rgba(11,25,41,0.045) 0%, transparent 70%)" }}
          />

          <div className="relative max-w-[1340px] mx-auto grid lg:grid-cols-[0.7fr_1.3fr] gap-14 lg:gap-8 items-center">

            {/* Left — copy (shown second on mobile, first on desktop) */}
            <div className="order-2 lg:order-1 text-center lg:text-left">
              <p
                className="hero-fade-up mb-5 font-semibold uppercase tracking-[0.18em]"
                style={{ fontSize: 12, color: GOLD, animationDelay: "0s" }}
              >
                For Publishers
              </p>

              <h1
                className="hero-fade-up font-bold leading-[1.08] tracking-tight mb-6 mx-auto lg:mx-0"
                style={{ fontSize: "clamp(36px, 5vw, 56px)", color: NAVY, letterSpacing: "-0.03em", animationDelay: "0.08s", maxWidth: 480 }}
              >
                Every Football Fan Deserves A Voice.
              </h1>

              <p
                className="hero-fade-up leading-[1.75] mb-8 mx-auto lg:mx-0"
                style={{ animationDelay: "0.2s", fontSize: "clamp(15px, 1.6vw, 17px)", color: GREY, maxWidth: 460 }}
              >
                Fanometrix helps publishers understand not only what football fans do, but why they do it, through short anonymous surveys embedded directly into existing football experiences.
              </p>

              <div className="hero-fade-up flex flex-wrap gap-2.5 justify-center lg:justify-start mb-8" style={{ animationDelay: "0.3s" }}>
                {HERO_BADGES.map(badge => <Pill key={badge}>{badge}</Pill>)}
              </div>

              <div className="hero-fade-up flex flex-col items-center lg:items-start gap-3" style={{ animationDelay: "0.4s" }}>
                <CtaButton href="/request-access?from=publisher" variant="primary">Run Your First Survey</CtaButton>
                <p className="text-xs leading-relaxed text-center lg:text-left max-w-[260px]" style={{ color: MUTED }}>
                  Deploy Fanometrix on existing inventory and start seeing results within hours.
                </p>
              </div>
            </div>

            {/* Right — real product visual (shown first on mobile, second on desktop) */}
            <div className="hero-fade-up order-1 lg:order-2 relative" style={{ animationDelay: "0.45s" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/homepagelaptopphone.webp"
                alt="The Fanometrix dashboard on laptop, and a live survey creative on mobile"
                className="w-full h-auto mx-auto"
                style={{ maxWidth: 980 }}
              />
            </div>
          </div>
        </section>

        {/* ── Problem ── */}
        <section className="border-t border-gray-100 pt-[clamp(56px,7vw,96px)] pb-[clamp(56px,7vw,96px)] px-5 sm:px-10" style={{ background: BG_SOFT }}>
          <div className="text-center max-w-[720px] mx-auto mb-16">
            <h2
              className="scroll-fade-up font-bold leading-[1.1] tracking-tight mx-auto"
              style={{ fontSize: "clamp(28px, 4vw, 46px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s", maxWidth: 620 }}
            >
              Clicks Don&apos;t Tell The Whole Story.
            </h2>
          </div>

          <div className="max-w-[880px] mx-auto grid sm:grid-cols-2 gap-10 sm:gap-6">
            <div className="scroll-fade-up" style={{ transitionDelay: "0.15s" }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-5" style={{ color: MUTED }}>
                Publishers already understand
              </p>
              <ul className="space-y-3.5">
                {KNOWN_TODAY.map(item => (
                  <li key={item} className="flex items-center gap-3 text-[15px]" style={{ color: GREY }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: BORDER }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="scroll-fade-up" style={{ transitionDelay: "0.25s" }}>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-5" style={{ color: GOLD }}>
                But they rarely understand
              </p>
              <ul className="space-y-3.5">
                {UNKNOWN_TODAY.map(item => (
                  <li key={item} className="flex items-center gap-3 text-[15px] font-semibold" style={{ color: NAVY }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GOLD }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Give Fans A Voice ── */}
        <section className="border-t border-gray-100 bg-white pt-[clamp(64px,8vw,104px)] pb-[clamp(64px,8vw,104px)] px-5 sm:px-10 text-center">
          <div className="max-w-[720px] mx-auto">
            <p
              className="scroll-fade-up font-bold leading-[1.2] tracking-tight mx-auto"
              style={{ fontSize: "clamp(24px, 3.4vw, 38px)", color: NAVY, letterSpacing: "-0.02em", maxWidth: 640 }}
            >
              Millions of football fans are spoken to every day.
            </p>
            <p
              className="scroll-fade-up font-bold leading-[1.2] tracking-tight mx-auto mt-2"
              style={{ fontSize: "clamp(24px, 3.4vw, 38px)", color: GOLD, letterSpacing: "-0.02em", maxWidth: 640, transitionDelay: "0.15s" }}
            >
              Very few are spoken with.
            </p>
            <p
              className="scroll-fade-up leading-[1.75] mt-8 mx-auto"
              style={{ fontSize: "clamp(15px, 1.6vw, 17px)", color: GREY, maxWidth: 560, transitionDelay: "0.3s" }}
            >
              Fanometrix gives supporters a simple, anonymous and privacy-safe way to shape the future of
              football experiences.
            </p>
          </div>
        </section>

        {/* ── Ecosystem Impact ── */}
        <section className="border-t border-gray-100 bg-white pt-[clamp(64px,8vw,104px)] pb-[clamp(64px,8vw,104px)] px-5 sm:px-10">
          <div className="text-center max-w-[760px] mx-auto mb-16">
            <SectionEyebrow>Why Fanometrix Exists</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-[1.15] tracking-tight mx-auto"
              style={{ fontSize: "clamp(26px, 3.6vw, 42px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s", maxWidth: 680 }}
            >
              Better understanding creates better football experiences.
            </h2>
          </div>

          <div className="relative max-w-[980px] mx-auto mb-14">
            <div className="hidden md:block absolute top-6 left-0 right-0 h-px" style={{ background: BORDER }} />
            <div className="relative grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6">
              {ECOSYSTEM_FLOW.map(({ lines, icon }, i) => (
                <div key={lines[0]} className="scroll-fade-up flex flex-col items-center text-center" style={{ transitionDelay: `${i * 0.1}s` }}>
                  <div className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-white border-2" style={{ borderColor: GOLD }}>
                    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke={NAVY} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      {icon}
                    </svg>
                  </div>
                  <h3 className="mt-4 text-[14px] font-bold tracking-[-0.01em]" style={{ color: NAVY }}>
                    {lines[0]}<br />{lines[1]}
                  </h3>
                </div>
              ))}
            </div>
          </div>

          <p
            className="scroll-fade-up text-center leading-[1.75] max-w-[600px] mx-auto mb-12"
            style={{ fontSize: "clamp(15px, 1.6vw, 17px)", color: GREY, transitionDelay: "0.3s" }}
          >
            Fanometrix exists to help commercial investment improve football experiences rather than interrupt them.
          </p>

          <div className="max-w-[760px] mx-auto">
            <p
              className="scroll-fade-up text-center text-[11px] font-bold uppercase tracking-[0.14em] mb-6"
              style={{ color: MUTED, transitionDelay: "0.35s" }}
            >
              When Fans Have A Voice
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {WHEN_FANS_HAVE_A_VOICE.map((item, i) => (
                <div
                  key={item}
                  className="scroll-fade-up flex items-center gap-3 bg-white rounded-xl border p-4"
                  style={{ borderColor: BORDER, transitionDelay: `${0.4 + i * 0.08}s` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: GOLD }} />
                  <span className="text-sm font-semibold" style={{ color: NAVY }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What Publishers Receive ── */}
        <section className="border-t border-gray-100 pt-[clamp(56px,7vw,96px)] pb-[clamp(56px,7vw,96px)] px-5 sm:px-10" style={{ background: BG_SOFT }}>
          <div className="text-center max-w-[720px] mx-auto mb-14">
            <SectionEyebrow>What Publishers Receive</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight"
              style={{ fontSize: "clamp(26px, 3.2vw, 40px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s" }}
            >
              Everything you need. Nothing you don&apos;t.
            </h2>
          </div>

          <div className="max-w-[960px] mx-auto flex flex-wrap justify-center gap-5">
            {RECEIVE_CARDS.map(({ title, body, icon }, i) => (
              <div
                key={title}
                className="scroll-fade-up bg-white rounded-2xl border p-9 transition-all duration-200 hover:border-[#D7B87A] hover:-translate-y-1 hover:shadow-lg"
                style={{ borderColor: BORDER, transitionDelay: `${i * 0.08}s`, flex: "1 1 280px", maxWidth: 300 }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-6" style={{ background: SURFACE }}>
                  <svg viewBox="0 0 24 24" width={21} height={21} fill="none" stroke={NAVY} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    {icon}
                  </svg>
                </div>
                <h3 className="text-[17px] font-bold mb-2.5 tracking-[-0.01em]" style={{ color: NAVY }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: GREY }}>{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Simplicity ── */}
        <section className="border-t border-gray-100 bg-white pt-[clamp(64px,8vw,104px)] pb-[clamp(56px,7vw,96px)] px-5 sm:px-10">
          <div className="text-center max-w-[760px] mx-auto mb-16">
            <SectionEyebrow>Implementation</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-[1.15] tracking-tight mx-auto"
              style={{ fontSize: "clamp(26px, 3.6vw, 42px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s", maxWidth: 680 }}
            >
              If You Can Traffic An MPU,
              <br />
              You Can Run Fanometrix.
            </h2>
          </div>

          <div className="max-w-[1160px] mx-auto grid sm:grid-cols-2 gap-6 mb-14">
            {IMPLEMENTATION_STEPS.map(({ label, image }, i) => (
              <div
                key={label}
                className="group scroll-fade-up bg-white rounded-2xl border overflow-hidden transition-all duration-200 hover:border-[#D7B87A] hover:-translate-y-1 hover:shadow-lg"
                style={{ borderColor: BORDER, transitionDelay: `${i * 0.1}s` }}
              >
                <div className="flex items-center gap-3 px-6 py-5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 bg-white" style={{ borderColor: GOLD }}>
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{i + 1}</span>
                  </div>
                  <h3 className="text-[16px] font-bold tracking-[-0.01em]" style={{ color: NAVY }}>{label}</h3>
                </div>
                <div className="relative overflow-hidden" style={{ height: 300, background: SURFACE }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt={`${label} — real Fanometrix product screenshot`}
                    className="w-full h-full object-cover object-top transition-[object-position] duration-[4000ms] ease-in-out group-hover:object-bottom"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-12 pointer-events-none bg-gradient-to-t from-black/10 to-transparent" />
                </div>
              </div>
            ))}
          </div>

          <div className="scroll-fade-up flex flex-wrap gap-2.5 justify-center max-w-[720px] mx-auto" style={{ transitionDelay: "0.3s" }}>
            {NO_FRICTION.map(item => <Pill key={item}>{item}</Pill>)}
          </div>
        </section>

        {/* ── Publisher Commitment ── */}
        <section className="border-t border-gray-100 pt-[clamp(56px,7vw,96px)] pb-[clamp(56px,7vw,96px)] px-5 sm:px-10" style={{ background: BG_SOFT }}>
          <div className="text-center max-w-[720px] mx-auto mb-14">
            <SectionEyebrow>Publisher Commitment</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight"
              style={{ fontSize: "clamp(26px, 3.2vw, 40px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s" }}
            >
              Small Contribution. Huge Value.
            </h2>
          </div>

          <div
            className="scroll-fade-up max-w-[680px] mx-auto bg-white rounded-2xl border shadow-sm overflow-hidden"
            style={{ borderColor: BORDER, transitionDelay: "0.15s" }}
          >
            {COMMITMENT_ROWS.map((row, i) => (
              <div
                key={row.label}
                className="flex items-center justify-between px-8 sm:px-10 py-5"
                style={i > 0 ? { borderTop: `1px solid ${BORDER}` } : undefined}
              >
                <span className="text-[13px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{row.label}</span>
                <span className="text-base font-bold" style={{ color: NAVY }}>{row.value}</span>
              </div>
            ))}
          </div>

          <p className="scroll-fade-up text-center text-sm leading-relaxed mt-8 max-w-[520px] mx-auto" style={{ color: GREY, transitionDelay: "0.3s" }}>
            These are typical starting points, not requirements. Inventory, frequency and participation
            levels remain entirely under your control.
          </p>
        </section>

        {/* ── Creative Flexibility ── */}
        <section className="border-t border-gray-100 bg-white pt-[clamp(64px,8vw,104px)] pb-[clamp(64px,8vw,104px)] px-5 sm:px-10">
          <div className="text-center max-w-[720px] mx-auto mb-12">
            <SectionEyebrow>Creative Flexibility</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight mb-6 mx-auto"
              style={{ fontSize: "clamp(26px, 3.2vw, 40px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s" }}
            >
              Designed To Belong.
            </h2>
            <p
              className="scroll-fade-up leading-[1.75] mx-auto"
              style={{ fontSize: "clamp(15px, 1.6vw, 17px)", color: GREY, maxWidth: 560, transitionDelay: "0.2s" }}
            >
              Fanometrix creatives can be tailored to match publisher design systems and visual identities.
            </p>
          </div>

          <div className="scroll-fade-up flex flex-wrap gap-2.5 justify-center max-w-[640px] mx-auto mb-16" style={{ transitionDelay: "0.3s" }}>
            {CREATIVE_FLEXIBILITY.map(item => <Pill key={item}>{item}</Pill>)}
          </div>

          <div className="text-center">
            {["Your audience.", "Your inventory.", "Your design."].map((line, i) => (
              <p
                key={line}
                className="scroll-fade-up font-bold leading-[1.3] tracking-tight mx-auto"
                style={{ fontSize: "clamp(22px, 3vw, 34px)", color: i === 2 ? GOLD : NAVY, letterSpacing: "-0.02em", transitionDelay: `${0.4 + i * 0.15}s` }}
              >
                {line}
              </p>
            ))}
          </div>
        </section>

        {/* ── Privacy ── */}
        <section className="border-t border-gray-100 pt-[clamp(56px,7vw,96px)] pb-[clamp(56px,7vw,96px)] px-5 sm:px-10" style={{ background: BG_SOFT }}>
          <div className="text-center max-w-[720px] mx-auto mb-14">
            <SectionEyebrow>Privacy By Design</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight"
              style={{ fontSize: "clamp(26px, 3.2vw, 40px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s" }}
            >
              Built to protect every fan.
            </h2>
          </div>

          <div className="max-w-[880px] mx-auto grid sm:grid-cols-2 gap-5">
            {PRIVACY_POINTS.map(({ label, body }, i) => (
              <div
                key={label}
                className="scroll-fade-up bg-white rounded-2xl border p-7 flex items-start gap-4"
                style={{ borderColor: BORDER, transitionDelay: `${i * 0.1}s` }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: SURFACE }}>
                  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke={NAVY} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3z M9 12l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold mb-1 tracking-[-0.01em]" style={{ color: NAVY }}>{label}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: GREY }}>{body}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="scroll-fade-up text-center mt-8" style={{ transitionDelay: "0.4s" }}>
            <Link href="/privacy" className="text-xs font-semibold hover:opacity-70 transition-opacity" style={{ color: GOLD }}>
              Read our full privacy policy →
            </Link>
          </p>
        </section>

        {/* ── Common Publisher Questions ── */}
        <section className="border-t border-gray-100 bg-white pt-[clamp(56px,7vw,96px)] pb-[clamp(56px,7vw,96px)] px-5 sm:px-10">
          <div className="text-center max-w-[720px] mx-auto mb-12">
            <SectionEyebrow>FAQ</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight"
              style={{ fontSize: "clamp(26px, 3.2vw, 40px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s" }}
            >
              Common Publisher Questions
            </h2>
          </div>

          <div className="max-w-[760px] mx-auto space-y-3">
            {FAQ_ITEMS.map(({ q, a }, i) => (
              <details
                key={q}
                className="scroll-fade-up group bg-white border rounded-2xl overflow-hidden"
                style={{ borderColor: BORDER, transitionDelay: `${i * 0.06}s` }}
              >
                <summary className="cursor-pointer select-none list-none px-6 py-5 flex items-center justify-between gap-4">
                  <span className="text-[15px] sm:text-base font-bold tracking-[-0.01em]" style={{ color: NAVY }}>{q}</span>
                  <span
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center border-2 text-lg leading-none transition-transform duration-200 group-open:rotate-45"
                    style={{ borderColor: GOLD, color: NAVY }}
                  >
                    +
                  </span>
                </summary>
                <p className="px-6 pb-6 -mt-1 text-sm leading-relaxed" style={{ color: GREY }}>
                  {a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="border-t border-gray-100 bg-white px-5 sm:px-10 py-[clamp(64px,8vw,104px)] text-center">
          <h2
            className="scroll-fade-up font-bold leading-tight tracking-tight mb-10 mx-auto"
            style={{ fontSize: "clamp(30px, 4vw, 48px)", color: NAVY, letterSpacing: "-0.02em", maxWidth: 620 }}
          >
            Start Listening To Your Fans.
          </h2>
          <div className="scroll-fade-up flex flex-wrap gap-3.5 justify-center" style={{ transitionDelay: "0.1s" }}>
            <CtaButton href="/request-access?from=publisher" variant="primary">Run Your First Survey</CtaButton>
          </div>
        </section>

        <ScrollFadeObserver />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 px-5 sm:px-10 py-5">
        <span className="text-xs" style={{ color: MUTED }}>
          © {new Date().getFullYear()} Fanometrix
        </span>
        <nav className="flex gap-5">
          {[{ label: "Privacy Policy", href: "/privacy" }].map(({ label, href }) => (
            <Link key={href} href={href} className="text-xs hover:text-gray-700 transition-colors duration-150" style={{ color: MUTED }}>
              {label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
