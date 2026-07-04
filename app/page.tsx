import Link from "next/link";
import type { Metadata } from "next";
import { ScrollFadeObserver } from "@/app/components/ScrollFadeObserver";
import { BuiltForCarousel } from "@/app/components/BuiltForCarousel";
import { APP_URL } from "@/lib/env";

export const metadata: Metadata = {
  title: "Fanometrix — Football Fan Intelligence",
  description:
    "Fanometrix combines fan surveys, conversation intelligence and industry research to help publishers, brands, agencies and rights holders better understand football supporters.",
};

// ─── Design tokens ────────────────────────────────────────────────────────
const NAVY      = "#0B1929";
const GOLD      = "#D7B87A";
const GREY      = "#6B7280";
const MUTED     = "#9CA3AF";
const BG_SOFT   = "#F8F9FB";
const BORDER    = "#E5E7EB";
const SURFACE   = "#F1F2F5";

const TRUSTED_BY = ["LiveScore", "Sofascore", "KickOut", "Dentsu", "UM", "FIFPRO"];

// Flip to true once there are credible confirmed partners to list.
const SHOW_TRUSTED_BY = false;

const BUILT_FOR = [
  {
    label: "For Publishers",
    body: "Understand audiences, collect first-party intelligence and benchmark against the wider ecosystem.",
    icon: <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z M14 3v5h5 M9 13h6M9 17h6" />,
  },
  {
    label: "For Brands",
    body: "Develop campaigns and strategies rooted in genuine fan understanding across the global football ecosystem.",
    icon: <path d="M12.6 3H5a1 1 0 00-1 1v7.6a1 1 0 00.3.7l9.4 9.4a1 1 0 001.4 0l7.6-7.6a1 1 0 000-1.4l-9.4-9.4a1 1 0 00-.7-.3z M8.5 8.7a.2.2 0 100-.4.2.2 0 000 .4z" />,
  },
  {
    label: "For Agencies",
    body: "Support planning, recommendations and client strategy with real football fan intelligence and insight.",
    icon: <path d="M9 11.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z M2.8 20c.8-3.4 3.2-5.4 6.2-5.4s5.4 2 6.2 5.4 M17 11.6a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z M15 14.4c2.4.3 4 2 4.6 4.4" />,
  },
  {
    label: "For Rights Holders",
    body: "Better understand supporters, markets and commercial opportunities across the global football ecosystem.",
    icon: <path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3z M9 12l2 2 4-4" />,
  },
];

const HOW_IT_WORKS = [
  { label: "Ask",        body: "Collect anonymous opinions directly from football supporters across our network of 300M+ fans." },
  { label: "Listen",     body: "Analyse conversations shaping football culture across social platforms and fan communities." },
  { label: "Understand", body: "Combine survey responses, conversation intelligence and industry research into insight." },
  { label: "Recommend",  body: "Transform intelligence into strategic recommendations for brands, publishers and rights holders." },
];

const SAMPLE_INSIGHTS = [
  { tag: "Sponsorship",     stat: "72%", body: "of fans believe sponsors should improve the fan experience." },
  { tag: "Authenticity",    stat: "64%", body: "say authenticity matters more than visibility." },
  { tag: "Purchase Intent", stat: "41%", body: "have purchased a product after discovering it through football." },
];

function CtaButton({ href, children, variant }: { href: string; children: React.ReactNode; variant: "primary" | "secondary" }) {
  const primary = variant === "primary";
  return (
    <Link
      href={href}
      className="text-sm font-bold px-8 py-3.5 rounded-xl border-2 transition-all duration-150 hover:opacity-85"
      style={
        primary
          ? { background: NAVY, color: GOLD, borderColor: NAVY, letterSpacing: "0.01em" }
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

export default function PublicHomePage() {
  return (
    <div
      className="min-h-screen bg-white flex flex-col"
      style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
    >
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur border-b border-gray-100 px-4 sm:px-10">
        <div className="max-w-[1340px] mx-auto flex items-center justify-between py-4 sm:py-5">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
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
          </div>
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
              <h1
                className="hero-fade-up font-bold leading-[1.08] tracking-tight mb-6 mx-auto lg:mx-0"
                style={{ fontSize: "clamp(38px, 5vw, 62px)", color: NAVY, letterSpacing: "-0.03em", animationDelay: "0.05s", maxWidth: 440 }}
              >
                Giving football fans a voice.
              </h1>

              <p
                className="hero-fade-up leading-[1.75] mb-8 mx-auto lg:mx-0"
                style={{ animationDelay: "0.18s", fontSize: "clamp(15px, 1.6vw, 17px)", color: GREY, maxWidth: 440 }}
              >
                Fanometrix combines fan surveys, conversation intelligence and industry
                research to help publishers, brands, agencies and rights holders better
                understand football supporters.
              </p>

              <div className="hero-fade-up flex flex-wrap gap-3.5 justify-center lg:justify-start" style={{ animationDelay: "0.3s" }}>
                <CtaButton href="/request-access" variant="primary">Request Access</CtaButton>
                <CtaButton href="#sample-insights" variant="secondary">View Example Insight</CtaButton>
              </div>

              <p className="hero-fade-up text-xs font-medium tracking-wide mt-6" style={{ animationDelay: "0.4s", color: MUTED }}>
                Real fans <span style={{ color: GOLD }}>·</span> Real opinions <span style={{ color: GOLD }}>·</span> Real intelligence
              </p>
            </div>

            {/* Right — laptop + phone product mockup (shown first on mobile, second on desktop) */}
            <div className="hero-fade-up order-1 lg:order-2 relative" style={{ animationDelay: "0.45s" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/homepagelaptopphone.webp"
                alt="Fanometrix dashboard on laptop and mobile survey on phone"
                className="w-full h-auto mx-auto"
                style={{ maxWidth: 980 }}
              />
            </div>
          </div>
        </section>

        {/* ── Trusted by ── */}
        {SHOW_TRUSTED_BY && (
          <section className="border-t border-gray-100 px-5 sm:px-10 py-10 sm:py-12">
            <p className="scroll-fade-up text-center text-[11px] font-semibold uppercase tracking-[0.18em] mb-7" style={{ color: MUTED }}>
              Trusted by the football ecosystem
            </p>
            <div className="scroll-fade-up marquee-mask overflow-hidden max-w-[1340px] mx-auto" style={{ transitionDelay: "0.1s" }}>
              <div className="marquee-track flex items-center w-max">
                {Array(8).fill(TRUSTED_BY).flat().map((name, i) => (
                  <span
                    key={i}
                    className="text-sm sm:text-base font-bold tracking-tight shrink-0 px-7 sm:px-9"
                    style={{ color: NAVY, opacity: 0.35 }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Built For ── */}
        <section className="border-t border-gray-100 bg-white pt-[clamp(48px,6vw,72px)] pb-[clamp(48px,6vw,72px)] px-5 sm:px-10">
          <div className="text-center max-w-[720px] mx-auto mb-10">
            <SectionEyebrow>Built For</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight"
              style={{ fontSize: "clamp(24px, 3vw, 36px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s" }}
            >
              Built for the football ecosystem.
            </h2>
          </div>

          {/* Desktop: divider grid */}
          <div className="hidden md:grid max-w-[1100px] mx-auto grid-cols-4 divide-x border-y" style={{ borderColor: BORDER }}>
            {BUILT_FOR.map(({ label, body, icon }, i) => (
              <div
                key={label}
                className="scroll-fade-up px-6 sm:px-7 py-9 text-center flex flex-col items-center transition-colors duration-200 hover:bg-[#FAFAFC]"
                style={{ transitionDelay: `${i * 0.1}s`, borderColor: BORDER }}
              >
                <div className="w-11 h-11 rounded-full flex items-center justify-center mb-5" style={{ background: SURFACE }}>
                  <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke={NAVY} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    {icon}
                  </svg>
                </div>
                <h3 className="text-[16px] font-bold mb-2.5 tracking-[-0.01em]" style={{ color: NAVY }}>{label}</h3>
                <p className="text-sm leading-relaxed" style={{ color: GREY }}>{body}</p>
              </div>
            ))}
          </div>

          {/* Mobile: swipeable carousel */}
          <div className="md:hidden border-y py-9" style={{ borderColor: BORDER }}>
            <BuiltForCarousel items={BUILT_FOR} />
          </div>
        </section>

        {/* ── About Fanometrix ── */}
        <section className="border-t border-gray-100 pt-[clamp(56px,7vw,88px)] pb-[clamp(56px,7vw,88px)] px-5 sm:px-10" style={{ background: BG_SOFT }}>
          <div className="text-center max-w-[880px] mx-auto">
            <SectionEyebrow>About Fanometrix</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight mb-6 mx-auto"
              style={{ fontSize: "clamp(26px, 3vw, 40px)", color: NAVY, letterSpacing: "-0.02em", maxWidth: 640, transitionDelay: "0.1s" }}
            >
              Giving football fans a voice.
            </h2>
            <div className="scroll-fade-up space-y-3.5 mx-auto" style={{ fontSize: 14.5, color: GREY, lineHeight: 1.75, maxWidth: 720, transitionDelay: "0.2s" }}>
              <p>
                Football supporters invest their time, passion and money into the game, yet they are
                rarely asked what they truly think and feel.
              </p>
              <p>
                We believe brands have an opportunity, and an obligation, to improve the fan
                experience rather than interrupt it.
              </p>
              <p>
                Fanometrix gives supporters a voice and helps brands, rights holders and media
                partners better understand football fans around the world, turning real fan opinions
                into actionable insight that improves experiences for the people who love the game.
              </p>
            </div>
          </div>
        </section>

        {/* ── How Fanometrix Works ── */}
        <section className="border-t border-gray-100 bg-white pt-[clamp(56px,7vw,88px)] pb-[clamp(48px,7vw,80px)] px-5 sm:px-10">
          <div className="text-center max-w-[720px] mx-auto mb-14">
            <SectionEyebrow>Methodology</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight"
              style={{ fontSize: "clamp(24px, 3vw, 36px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s" }}
            >
              How Fanometrix works.
            </h2>
          </div>

          <div className="relative max-w-[1100px] mx-auto">
            <div className="hidden md:block absolute top-6 left-0 right-0 h-px" style={{ background: BORDER }} />
            <div className="relative grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-6">
              {HOW_IT_WORKS.map(({ label, body }, i) => (
                <div key={label} className="scroll-fade-up flex flex-col items-center text-center" style={{ transitionDelay: `${i * 0.1}s` }}>
                  <div className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-white border-2" style={{ borderColor: GOLD }}>
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{i + 1}</span>
                  </div>
                  <div className="mt-5">
                    <h3 className="text-[16px] font-bold mb-2 tracking-[-0.01em]" style={{ color: NAVY }}>{label}</h3>
                    <p className="text-sm leading-relaxed max-w-[240px] mx-auto" style={{ color: GREY }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Sample Insights ── */}
        <section id="sample-insights" className="border-t border-gray-100 pt-[clamp(56px,7vw,88px)] pb-[clamp(56px,7vw,88px)] px-5 sm:px-10 scroll-mt-20" style={{ background: BG_SOFT }}>
          <div className="text-center max-w-[720px] mx-auto mb-12">
            <SectionEyebrow>Sample Insights</SectionEyebrow>
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight"
              style={{ fontSize: "clamp(24px, 3vw, 36px)", color: NAVY, letterSpacing: "-0.02em", transitionDelay: "0.1s" }}
            >
              What fans are telling us.
            </h2>
          </div>

          <div className="max-w-[980px] mx-auto grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {SAMPLE_INSIGHTS.map(({ tag, stat, body }, i) => (
              <div
                key={stat}
                className="scroll-fade-up bg-white rounded-2xl border overflow-hidden transition-all duration-200 hover:border-[#D7B87A] hover:-translate-y-1 hover:shadow-lg"
                style={{ transitionDelay: `${i * 0.1}s`, borderColor: BORDER }}
              >
                {/* abstract visual tile */}
                <div className="relative h-20 flex items-end gap-1 px-6 overflow-hidden" style={{ background: SURFACE }}>
                  {[40, 65, 50, 80, 60, 90, 45].map((h, j) => (
                    <div key={j} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: NAVY, opacity: 0.1 + j * 0.03 }} />
                  ))}
                </div>
                <div className="p-8 pt-6">
                  <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>{tag}</span>
                  <div className="text-4xl font-extrabold mt-2" style={{ color: NAVY, letterSpacing: "-0.02em" }}>{stat}</div>
                  <div className="w-8 h-[2px] my-4" style={{ background: GOLD }} />
                  <p className="text-sm leading-relaxed" style={{ color: GREY }}>{body}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="scroll-fade-up text-center text-xs mt-10" style={{ color: MUTED, transitionDelay: "0.3s" }}>
            Illustrative examples for demonstration purposes.
          </p>
        </section>

        {/* ── Final CTA ── */}
        <section className="border-t border-gray-100 bg-white px-5 sm:px-10 py-[clamp(56px,7vw,88px)] text-center">
          <h2
            className="scroll-fade-up font-bold leading-tight tracking-tight mb-8 mx-auto"
            style={{ fontSize: "clamp(28px, 3.5vw, 44px)", color: NAVY, letterSpacing: "-0.02em", maxWidth: 620 }}
          >
            Ready to understand football fans better?
          </h2>
          <div className="scroll-fade-up flex flex-wrap gap-3.5 justify-center" style={{ transitionDelay: "0.1s" }}>
            <CtaButton href="/request-access" variant="primary">Request Access</CtaButton>
            <CtaButton href="mailto:partnerships@fanometrix.com" variant="secondary">Speak To Us</CtaButton>
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
