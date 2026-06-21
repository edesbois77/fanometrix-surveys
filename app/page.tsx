import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fanometrix — Football Fan Intelligence",
  description:
    "Fanometrix combines anonymous fan surveys, campaign analytics and first-party publisher context to help brands, rights holders and media partners understand football supporters.",
};

const N = "#0B1929";
const G = "#D7B87A";

// ─── Value pillars ────────────────────────────────────────────────────────────
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
    <div
      style={{
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: "#fff",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        color: "#374151",
      }}
    >

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{
        padding: "0 clamp(20px, 5vw, 48px)",
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid #F3F4F6",
        position: "sticky",
        top: 0,
        background: "#fff",
        zIndex: 40,
      }}>
        {/* Logo wordmark */}
        <Link href="/" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Fanometrix_Logo.png"
            alt="Fanometrix"
            style={{
              height: 18,
              objectFit: "contain",
              /* Convert the light logo to dark navy for the white header */
              filter:
                "brightness(0) saturate(100%) invert(11%) sepia(33%) saturate(1200%) hue-rotate(192deg) brightness(95%)",
            }}
          />
        </Link>

        {/* Enter Platform CTA */}
        <Link
          href="/login"
          style={{
            background: N,
            color: G,
            fontSize: 13,
            fontWeight: 600,
            padding: "8px 20px",
            borderRadius: 10,
            textDecoration: "none",
            flexShrink: 0,
            transition: "opacity .15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
        >
          Enter Platform
        </Link>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1 }}>
        <section style={{
          position: "relative",
          padding: "clamp(72px, 10vw, 120px) 24px clamp(80px, 10vw, 120px)",
          textAlign: "center",
          overflow: "hidden",
        }}>
          {/* Subtle radial gold glow */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "100%",
              maxWidth: 900,
              height: "100%",
              background:
                "radial-gradient(ellipse 80% 55% at 50% 0%, rgba(215,184,122,0.07) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />

          <div style={{ maxWidth: 700, margin: "0 auto", position: "relative" }}>

            {/* Hero logo mark */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/FLogo.png"
                alt="Fanometrix"
                style={{ width: 72, height: 72, objectFit: "contain" }}
              />
            </div>

            {/* Headline */}
            <h1 style={{
              fontSize: "clamp(38px, 7vw, 62px)",
              fontWeight: 800,
              color: N,
              lineHeight: 1.08,
              letterSpacing: "-0.025em",
              margin: "0 0 24px",
            }}>
              Football Fan Intelligence
            </h1>

            {/* Body paragraph */}
            <p style={{
              fontSize: "clamp(15px, 2vw, 18px)",
              color: "#6B7280",
              lineHeight: 1.75,
              maxWidth: 660,
              margin: "0 auto 44px",
            }}>
              Fanometrix combines anonymous fan surveys, campaign analytics and
              first-party publisher context to help brands, rights holders and
              media partners better understand football supporters.
            </p>

            {/* CTA buttons */}
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              justifyContent: "center",
            }}>
              <Link
                href="/login"
                style={{
                  background: N,
                  color: G,
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "14px 32px",
                  borderRadius: 12,
                  textDecoration: "none",
                  border: `2px solid ${N}`,
                  transition: "opacity .15s",
                  letterSpacing: "0.01em",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              >
                Enter Platform
              </Link>
              <Link
                href="/login"
                style={{
                  background: "#fff",
                  color: N,
                  fontSize: 14,
                  fontWeight: 700,
                  padding: "14px 32px",
                  borderRadius: 12,
                  textDecoration: "none",
                  border: `2px solid ${G}`,
                  transition: "background .15s",
                  letterSpacing: "0.01em",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#FBF5E8"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
              >
                Request Access
              </Link>
            </div>
          </div>
        </section>

        {/* ── Four value pillars ─────────────────────────────────────────────── */}
        <section style={{
          padding: "clamp(48px, 7vw, 80px) clamp(20px, 5vw, 48px)",
          borderTop: "1px solid #F3F4F6",
          background: "#FAFAFA",
        }}>
          <div style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
          }}>
            {PILLARS.map(({ label, body }) => (
              <div
                key={label}
                style={{
                  position: "relative",
                  background: "#fff",
                  border: "1px solid #E5E7EB",
                  borderRadius: 16,
                  padding: "28px 26px 30px",
                  overflow: "hidden",
                  transition: "border-color .2s, transform .2s, box-shadow .2s",
                  cursor: "default",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = G;
                  el.style.transform = "translateY(-3px)";
                  el.style.boxShadow = "0 8px 24px rgba(11,25,41,0.08)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = "#E5E7EB";
                  el.style.transform = "translateY(0)";
                  el.style.boxShadow = "none";
                }}
              >
                {/* Ghost F watermark */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/FLogo.png"
                  alt=""
                  aria-hidden
                  style={{
                    position: "absolute",
                    bottom: -20,
                    right: -20,
                    width: 130,
                    height: 130,
                    opacity: 0.03,
                    filter: "blur(0.5px)",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                />

                {/* Gold accent dot */}
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: G,
                  marginBottom: 18,
                }} />

                <h3 style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: N,
                  marginBottom: 10,
                  letterSpacing: "-0.01em",
                }}>
                  {label}
                </h3>
                <p style={{
                  fontSize: 14,
                  color: "#6B7280",
                  lineHeight: 1.65,
                  margin: 0,
                }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{
        borderTop: "1px solid #F3F4F6",
        padding: "20px clamp(20px, 5vw, 48px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>
          © {new Date().getFullYear()} Fanometrix
        </span>
        <nav style={{ display: "flex", gap: 20 }}>
          {[
            { label: "Privacy Policy",  href: "/privacy"       },
            { label: "Publisher Hub",   href: "/publisher-hub" },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              style={{ fontSize: 12, color: "#9CA3AF", textDecoration: "none", transition: "color .15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#374151"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#9CA3AF"; }}
            >
              {label}
            </Link>
          ))}
        </nav>
      </footer>

    </div>
  );
}
