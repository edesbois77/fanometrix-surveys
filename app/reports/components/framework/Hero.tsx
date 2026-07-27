"use client";

// The hero and its intelligence panel — the report's opening spread.
//
// Left: the editorial title block (eyebrow, oversized title, subtitle, research
// question, prepared-for / prepared-by). Right: a NAVY intelligence panel that
// reads as an executive summary — headline scope figures up top, then status,
// last-updated, persistent views, reading time and version, with a gold Download
// PDF action. `views` is the only value injected at request time.
//
// The opening is deliberately spacious — closer to a keynote title card than a
// web page. White surface, navy panel, gold accents.

import { NAVY, GOLD, INK, SANS } from "@/app/reports/theme";
import type { HeroSection, ReportStatus } from "@/lib/reports/framework/types";
import { Reveal, CountUp } from "./ui";

const STATUS_DOT: Record<ReportStatus, string> = {
  complete: "#5FB07E",
  "in-progress": "#D7B87A",
  draft: "#98A0AC",
};

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderTop: "1px solid rgba(255,255,255,0.09)",
      }}
    >
      <span style={{ fontFamily: SANS, fontSize: 12.5, color: "rgba(255,255,255,0.5)", letterSpacing: "0.01em" }}>{label}</span>
      <span
        className="fx-tabular-nums"
        style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 560, color: "#fff", textAlign: "right" }}
      >
        {children}
      </span>
    </div>
  );
}

function IntelligencePanel({ section, views }: { section: HeroSection; views: number | null }) {
  const m = section.meta;
  return (
    <Reveal
      style={{
        background: NAVY,
        borderRadius: 18,
        padding: "28px 30px 30px",
        boxShadow: "0 30px 80px rgba(11,25,41,0.22), 0 6px 18px rgba(11,25,41,0.12)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        {m.status && (
          <span
            className="fx-pulse"
            style={{ width: 8, height: 8, borderRadius: 999, background: STATUS_DOT[m.status] }}
            aria-hidden
          />
        )}
        <span
          style={{
            fontFamily: SANS,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: GOLD,
          }}
        >
          Report Intelligence
        </span>
      </div>

      {/* Headline scope figures — the executive-summary moment. */}
      {m.highlights && m.highlights.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${m.highlights.length}, 1fr)`,
            gap: 12,
            paddingBottom: 22,
            marginBottom: 6,
            borderBottom: "1px solid rgba(255,255,255,0.09)",
          }}
        >
          {m.highlights.map((h, i) => (
            <div key={i}>
              <div style={{ fontFamily: SANS, fontSize: "clamp(1.7rem,2.6vw,2.1rem)", fontWeight: 660, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1 }}>
                {h.value}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, lineHeight: 1.3, color: "rgba(255,255,255,0.55)", marginTop: 7 }}>
                {h.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        {m.statusLabel && (
          <MetaRow label="Research status">
            <span style={{ color: m.status ? STATUS_DOT[m.status] : "#fff", fontWeight: 640 }}>
              {m.statusLabel}
              {m.status === "complete" ? " ✓" : ""}
            </span>
          </MetaRow>
        )}
        {m.lastUpdated && <MetaRow label="Last updated">{m.lastUpdated}</MetaRow>}
        {views != null && (
          <MetaRow label="Views">
            <CountUp to={views} />
          </MetaRow>
        )}
        {m.readingTime && <MetaRow label="Reading time">{m.readingTime}</MetaRow>}
        {m.version && <MetaRow label="Version">{m.version}</MetaRow>}
      </div>

      <button
        type="button"
        data-no-print
        onClick={() => window.print()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          width: "100%",
          marginTop: 24,
          fontFamily: SANS,
          fontSize: 14.5,
          fontWeight: 640,
          padding: "14px 18px",
          borderRadius: 10,
          border: "none",
          background: GOLD,
          color: NAVY,
          cursor: "pointer",
          transition: "filter 0.2s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.06)")}
        onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Download PDF
      </button>
    </Reveal>
  );
}

export function Hero({ section, views }: { section: HeroSection; views: number | null }) {
  const m = section.meta;
  return (
    <section
      id={section.id}
      style={{
        background: "#FFFFFF",
        color: INK.primary,
        paddingTop: "clamp(64px, 10vw, 132px)",
        paddingBottom: "clamp(72px, 12vw, 148px)",
        scrollMarginTop: 76,
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          paddingLeft: "clamp(20px, 5vw, 44px)",
          paddingRight: "clamp(20px, 5vw, 44px)",
        }}
      >
        {section.eyebrow && (
          <Reveal>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 12.5,
                fontWeight: 600,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: "#9A7B3C",
              }}
            >
              {section.eyebrow}
            </div>
            <div className="gold-rule revealed" style={{ width: 60, marginTop: 20 }} />
          </Reveal>
        )}

        <div
          className="fx-report-hero-grid"
          style={{
            display: "grid",
            gap: "clamp(40px, 6vw, 88px)",
            alignItems: "start",
            marginTop: "clamp(32px, 4vw, 52px)",
          }}
        >
          {/* Title column */}
          <div>
            <Reveal>
              <h1
                style={{
                  fontFamily: SANS,
                  fontSize: "clamp(2.7rem, 6.4vw, 5rem)",
                  lineHeight: 1.0,
                  letterSpacing: "-0.04em",
                  fontWeight: 660,
                  margin: 0,
                  color: NAVY,
                  maxWidth: 14 * 16,
                }}
              >
                {section.title}
              </h1>
            </Reveal>
            {section.subtitle && (
              <Reveal>
                <p
                  style={{
                    fontFamily: SANS,
                    fontSize: "clamp(1.2rem, 2.1vw, 1.65rem)",
                    lineHeight: 1.4,
                    letterSpacing: "-0.015em",
                    fontWeight: 400,
                    color: INK.secondary,
                    margin: "clamp(20px,2.5vw,30px) 0 0",
                    maxWidth: 32 * 16,
                  }}
                >
                  {section.subtitle}
                </p>
              </Reveal>
            )}

            {section.researchQuestion && (
              <Reveal>
                <blockquote
                  style={{
                    margin: "clamp(32px,4vw,44px) 0 0",
                    paddingLeft: 24,
                    borderLeft: `2px solid ${GOLD}`,
                    fontFamily: SANS,
                    fontSize: "clamp(1.15rem, 1.9vw, 1.4rem)",
                    lineHeight: 1.48,
                    fontStyle: "italic",
                    color: INK.primary,
                    maxWidth: 30 * 16,
                  }}
                >
                  {section.researchQuestion}
                </blockquote>
              </Reveal>
            )}

            {(m.preparedFor || m.preparedBy || m.date || m.classification) && (
              <Reveal>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "28px 48px",
                    marginTop: "clamp(40px,5vw,56px)",
                    paddingTop: 28,
                    borderTop: `1px solid ${INK.hairline}`,
                  }}
                >
                  {m.preparedFor && <PreparedItem label="Prepared for" value={m.preparedFor} />}
                  {m.preparedBy && <PreparedItem label="Prepared by" value={m.preparedBy} />}
                  {m.date && <PreparedItem label="Date" value={m.date} />}
                  {m.classification && <PreparedItem label="Classification" value={m.classification} />}
                </div>
              </Reveal>
            )}
          </div>

          {/* Intelligence panel column */}
          <div className="fx-report-hero-panel">
            <IntelligencePanel section={section} views={views} />
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 940px) {
          .fx-report-hero-grid { grid-template-columns: minmax(0,1.5fr) minmax(320px,0.95fr); }
        }
        .fx-report-hero-panel { position: relative; }
        @media (min-width: 940px) {
          .fx-report-hero-panel { position: sticky; top: 88px; }
        }
      `}</style>
    </section>
  );
}

function PreparedItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: SANS,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: INK.tertiary,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 500, color: INK.primary }}>{value}</div>
    </div>
  );
}
