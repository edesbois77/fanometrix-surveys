import Link from "next/link";
import type { Metadata } from "next";
import { ScrollFadeObserver } from "@/app/components/ScrollFadeObserver";

export const metadata: Metadata = {
  title: "Fanometrix — Football Fan Intelligence",
  description:
    "Fanometrix combines anonymous fan surveys, campaign analytics and first-party publisher context to help brands, rights holders and media partners understand football supporters.",
};

// ─── Content v2 — updated June 2026 ──────────────────────────────────────────
// To revert: git revert HEAD (or restore the v1 block below)

const PILLARS = [
  {
    label: "Real-Time",
    body:  "Understand what football fans around the world think and feel, as it happens.",
  },
  {
    label: "Insights",
    body:  "Discover what supporters value most and what they expect from brands and experiences.",
  },
  {
    label: "Intelligence",
    body:  "Turn fan opinions into strategic reports and actionable recommendations for organisations.",
  },
  {
    label: "Privacy Safe",
    body:  "Collect anonymous fan feedback with no personal data or identifiable information stored.",
  },
];

// ─── v1 content (preserved for easy reversion) ────────────────────────────────
// const PILLARS = [
//   { label: "Real-Time",    body: "Collect fan responses and campaign performance as they happen."        },
//   { label: "Insights",     body: "Understand what supporters think, value and expect from brands."       },
//   { label: "Reporting",    body: "Turn responses into dashboards, exports and actionable findings."       },
//   { label: "Privacy Safe", body: "Anonymous surveys with no personal data collection."                   },
// ];

export default function PublicHomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col"
      style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ── Hero ── */}
      <main className="flex-1">
        {/*
          Hero — full first-viewport height.
          100svh = small viewport height (accounts for mobile browser chrome).
          Content centred vertically; scroll prompt pinned to the bottom.
          Revert: restore py-[clamp(72px,10vw,120px)] and remove flex layout.
        */}
        <section
          className="relative text-center overflow-hidden flex flex-col px-6"
          style={{ minHeight: "100svh" }}
        >
          {/* Subtle radial gold glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(215,184,122,0.07) 0%, transparent 70%)",
            }}
          />

          {/* ── Vertically centred hero content — fills full 100svh ── */}
          <div className="flex-1 flex flex-col items-center justify-center relative">
            <div className="max-w-[700px] mx-auto w-full">

              {/* Brand lockup — staggered fade-up on load */}
              <div className="hero-fade-up flex flex-col items-center mb-10 gap-2"
                style={{ animationDelay: "0.05s" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/Fanometrix_Logo.png"
                  alt="Fanometrix"
                  style={{
                    height: 52,
                    objectFit: "contain",
                    filter:
                      "brightness(0) saturate(100%) invert(11%) sepia(33%) saturate(1200%) hue-rotate(192deg) brightness(95%)",
                  }}
                />
                <p className="text-xs font-semibold tracking-[0.18em] uppercase"
                  style={{ color: "#D7B87A" }}>
                  Football Fan Insights
                </p>
              </div>

              {/* Body */}
              <p
                className="hero-fade-up leading-[1.75] mx-auto mb-11"
                style={{ animationDelay: "0.22s", fontSize: "clamp(15px, 2vw, 18px)", color: "#6B7280", maxWidth: 660 }}
              >
                Fanometrix combines anonymous fan surveys, campaign analytics and
                first-party publisher context to help brands, rights holders and
                media partners better understand football supporters.
              </p>

              {/* CTAs */}
              <div className="hero-fade-up flex flex-wrap gap-3.5 justify-center"
                style={{ animationDelay: "0.38s" }}>
                <Link
                  href="/login"
                  className="text-sm font-bold px-8 py-3.5 rounded-xl border-2
                             transition-opacity duration-150 hover:opacity-85"
                  style={{ background: "#0B1929", color: "#D7B87A", borderColor: "#0B1929", letterSpacing: "0.01em" }}
                >
                  Log in
                </Link>
                <Link
                  href="/request-access"
                  className="text-sm font-bold px-8 py-3.5 rounded-xl border-2
                             bg-white hover:bg-[#FBF5E8] transition-colors duration-150"
                  style={{ color: "#0B1929", borderColor: "#D7B87A", letterSpacing: "0.01em" }}
                >
                  Request Access
                </Link>
              </div>

            </div>
          </div>

          {/* ── Scroll prompt — fades in after hero content completes ── */}
          <div className="hero-fade-up absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
            style={{ animationDelay: "2.7s" }} aria-hidden>
            {/* Gradient line: gold → transparent, pulsing scaleY + opacity */}
            <div className="scroll-indicator-line" />
            <p style={{ fontSize: 10, letterSpacing: "0.35em", color: "#D7B87A", fontWeight: 600, textTransform: "uppercase" }}>
              Scroll
            </p>
          </div>

        </section>

        {/* ── Why Fanometrix + Value pillars (unified section, Content v2) ── */}
        {/* Revert: restore the two separate sections from git history         */}
        <section className="border-t border-gray-100 bg-gray-50
                            pt-[clamp(56px,7vw,80px)] pb-[clamp(48px,7vw,80px)]
                            px-5 sm:px-10">

          {/* Intro above the cards */}
          <div className="text-center max-w-[960px] mx-auto mb-10">

            {/* Eyebrow label */}
            <p className="scroll-fade-up mb-4 font-semibold uppercase tracking-[0.18em]"
              style={{ fontSize: 12, color: "#D7B87A" }}>
              About Fanometrix
            </p>

            {/* Section heading */}
            <h2
              className="scroll-fade-up font-bold leading-tight tracking-tight mb-5 mx-auto"
              style={{ fontSize: "clamp(26px, 3vw, 40px)", color: "#0B1929", letterSpacing: "-0.02em", maxWidth: 720, transitionDelay: "0.1s" }}
            >
              Giving football fans a voice.
            </h2>

            {/* Supporting copy — wider, more compact */}
            <div className="scroll-fade-up space-y-3 mx-auto"
              style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.65, maxWidth: 880, transitionDelay: "0.2s" }}>
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
          <div className="max-w-[1100px] mx-auto grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {PILLARS.map(({ label, body }, i) => (
              <div
                key={label}
                className="scroll-fade-up group relative bg-white rounded-2xl overflow-hidden
                           border border-gray-200 p-7
                           transition-all duration-200
                           hover:border-[#D7B87A] hover:-translate-y-1 hover:shadow-lg"
                style={{ transitionDelay: `${i * 0.1}s` }}
              >
                {/* Ghost F watermark */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/FLogo.png"
                  alt=""
                  aria-hidden
                  className="pointer-events-none select-none absolute"
                  style={{
                    bottom: -20,
                    right: -20,
                    width: 130,
                    height: 130,
                    opacity: 0.03,
                    filter: "blur(0.5px)",
                  }}
                />

                <h3 className="text-[17px] font-bold mb-2.5 tracking-[-0.01em] text-center"
                  style={{ color: "#0B1929" }}>
                  {label}
                </h3>
                <p className="text-sm leading-relaxed text-center" style={{ color: "#6B7280" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>

          {/* F logo — equal margin above and below so it sits midway between cards and footer */}
          <div className="scroll-fade-up flex justify-center"
            style={{ marginTop: "clamp(48px,7vw,80px)", transitionDelay: "0.4s" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/FLogo.png"
              alt="Fanometrix"
              style={{ width: 24, height: 24, objectFit: "contain", opacity: 1 }}
            />
          </div>
        </section>

        <ScrollFadeObserver />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 flex flex-wrap items-center
                         justify-between gap-3 px-5 sm:px-10 py-5">
        <span className="text-xs text-gray-400">
          © {new Date().getFullYear()} Fanometrix
        </span>
        <nav className="flex gap-5">
          {[
            { label: "Privacy Policy", href: "/privacy" },
          ].map(({ label, href }) => (
            <Link key={href} href={href}
              className="text-xs text-gray-400 hover:text-gray-700 transition-colors duration-150">
              {label}
            </Link>
          ))}
        </nav>
      </footer>

    </div>
  );
}
