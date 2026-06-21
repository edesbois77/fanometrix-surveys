import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fanometrix — Football Fan Intelligence",
  description:
    "Fanometrix combines anonymous fan surveys, campaign analytics and first-party publisher context to help brands, rights holders and media partners understand football supporters.",
};

const PILLARS = [
  {
    label: "Real-Time",
    body:  "Collect fan responses and campaign performance as they happen.",
  },
  {
    label: "Insights",
    body:  "Understand what supporters think, value and expect from brands.",
  },
  {
    label: "Reporting",
    body:  "Turn responses into dashboards, exports and actionable findings.",
  },
  {
    label: "Privacy Safe",
    body:  "Anonymous surveys with no personal data collection.",
  },
];

export default function PublicHomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col"
      style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100
                         flex items-center justify-between px-5 sm:px-10 h-[60px]">
        <Link href="/" className="flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Fanometrix_Logo.png"
            alt="Fanometrix"
            style={{
              height: 18,
              objectFit: "contain",
              filter:
                "brightness(0) saturate(100%) invert(11%) sepia(33%) saturate(1200%) hue-rotate(192deg) brightness(95%)",
            }}
          />
        </Link>
        <Link
          href="/login"
          className="flex-shrink-0 text-[13px] font-semibold px-5 py-2 rounded-lg
                     transition-opacity duration-150 hover:opacity-80"
          style={{ background: "#0B1929", color: "#D7B87A" }}
        >
          Enter Platform
        </Link>
      </header>

      {/* ── Hero ── */}
      <main className="flex-1">
        <section className="relative text-center overflow-hidden
                            py-[clamp(72px,10vw,120px)] px-6">
          {/* Subtle radial gold glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(215,184,122,0.07) 0%, transparent 70%)",
            }}
          />

          <div className="relative max-w-[700px] mx-auto">

            {/* Logo mark */}
            <div className="flex justify-center mb-9">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/FLogo.png" alt="Fanometrix" style={{ width: 72, height: 72, objectFit: "contain" }} />
            </div>

            {/* Headline */}
            <h1
              className="font-extrabold leading-[1.08] tracking-[-0.025em] mb-6"
              style={{ fontSize: "clamp(38px, 7vw, 62px)", color: "#0B1929" }}
            >
              Football Fan Intelligence
            </h1>

            {/* Body */}
            <p
              className="leading-[1.75] mx-auto mb-11"
              style={{
                fontSize: "clamp(15px, 2vw, 18px)",
                color: "#6B7280",
                maxWidth: 660,
              }}
            >
              Fanometrix combines anonymous fan surveys, campaign analytics and
              first-party publisher context to help brands, rights holders and
              media partners better understand football supporters.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap gap-3.5 justify-center">
              <Link
                href="/login"
                className="text-sm font-bold px-8 py-3.5 rounded-xl border-2
                           transition-opacity duration-150 hover:opacity-85"
                style={{
                  background: "#0B1929",
                  color: "#D7B87A",
                  borderColor: "#0B1929",
                  letterSpacing: "0.01em",
                }}
              >
                Enter Platform
              </Link>
              <Link
                href="/login"
                className="text-sm font-bold px-8 py-3.5 rounded-xl border-2
                           bg-white hover:bg-[#FBF5E8] transition-colors duration-150"
                style={{
                  color: "#0B1929",
                  borderColor: "#D7B87A",
                  letterSpacing: "0.01em",
                }}
              >
                Request Access
              </Link>
            </div>
          </div>
        </section>

        {/* ── Value pillars ── */}
        <section className="border-t border-gray-100 bg-gray-50
                            py-[clamp(48px,7vw,80px)] px-5 sm:px-10">
          <div className="max-w-[1100px] mx-auto grid gap-5"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {PILLARS.map(({ label, body }) => (
              <div
                key={label}
                className="group relative bg-white rounded-2xl overflow-hidden
                           border border-gray-200 p-7
                           transition-all duration-200
                           hover:border-[#D7B87A] hover:-translate-y-1 hover:shadow-lg"
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

                {/* Gold dot accent */}
                <div className="w-2 h-2 rounded-full mb-5 flex-shrink-0"
                  style={{ background: "#D7B87A" }} />

                <h3 className="text-[17px] font-bold mb-2.5 tracking-[-0.01em]"
                  style={{ color: "#0B1929" }}>
                  {label}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "#6B7280" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 flex flex-wrap items-center
                         justify-between gap-3 px-5 sm:px-10 py-5">
        <span className="text-xs text-gray-400">
          © {new Date().getFullYear()} Fanometrix
        </span>
        <nav className="flex gap-5">
          {[
            { label: "Privacy Policy", href: "/privacy"       },
            { label: "Publisher Hub",  href: "/publisher-hub" },
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
