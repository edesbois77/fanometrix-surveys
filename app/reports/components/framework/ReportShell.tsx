"use client";

// The report shell — everything around the sections.
//
// Given a ReportConfig (pure data) it:
//   • renders each enabled section in array order through the registry,
//   • builds the contents rail + scroll-spy from the sections that carry a
//     navLabel, so the reader always knows where they are,
//   • drives the top reading-progress bar and the sticky mini-header,
//   • fires the view beacon once past the gate.
//
// It holds no report-specific knowledge — the FedEx page and every future report
// render through this exact component. Chrome (rail, header, progress) is marked
// data-no-print so the PDF is the document alone.

import { useEffect, useMemo, useRef, useState } from "react";
import { NAVY, GOLD, INK, SANS } from "@/app/reports/theme";
import type { ReportConfig, HeroSection } from "@/lib/reports/framework/types";
import { resolveModule, UnknownModule, type AnyRenderer } from "./registry";
import { ViewBeacon } from "./ViewBeacon";

type NavItem = { id: string; label: string };

// The Fanometrix wordmark. Rendered as a background image (avoids the img-element
// lint and keeps sizing simple) at the given cap height; width follows the
// logo's native 1491×141 aspect ratio. `variant` picks the colourway for the
// surface it sits on: gold on navy, navy on white.
const LOGO_ASPECT = 1491 / 141;
function BrandMark({ variant, height = 14 }: { variant: "gold" | "navy" | "white"; height?: number }) {
  const src =
    variant === "gold" ? "/Fanometrix_Logo.png" : variant === "white" ? "/Fanometrix_Logo_White.png" : "/Fanometrix_Logo_Black.png";
  return (
    <span
      role="img"
      aria-label="Fanometrix"
      style={{
        display: "inline-block",
        height,
        width: height * LOGO_ASPECT,
        backgroundImage: `url("${src}")`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "left center",
      }}
    />
  );
}

export function ReportShell({
  config,
  views,
  extraModules,
}: {
  config: ReportConfig;
  views: number | null;
  extraModules?: Record<string, AnyRenderer>;
}) {
  const sections = useMemo(() => config.sections.filter((s) => s.enabled !== false), [config.sections]);
  const nav: NavItem[] = useMemo(
    () => sections.filter((s) => s.navLabel).map((s) => ({ id: s.id, label: s.navLabel as string })),
    [sections],
  );

  const [activeId, setActiveId] = useState<string | null>(nav[0]?.id ?? null);
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Reading progress + "has scrolled past the hero" for the sticky header.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const doc = document.documentElement;
        const max = doc.scrollHeight - doc.clientHeight;
        setProgress(max > 0 ? Math.min(1, doc.scrollTop / max) : 0);
        setScrolled(doc.scrollTop > 60);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Scroll-spy: the section whose top most recently crossed the upper third.
  useEffect(() => {
    if (nav.length === 0) return;
    const els = nav.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [nav]);

  const activeLabel = nav.find((n) => n.id === activeId)?.label;

  function go(id: string) {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div
      ref={rootRef}
      style={{ background: "#FFFFFF", color: INK.primary, colorScheme: "light", minHeight: "100vh" }}
    >
      {views != null && <ViewBeacon reportId={config.access.id} />}

      {/* Reading progress bar */}
      <div
        data-no-print
        aria-hidden
        style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, background: "transparent", zIndex: 60 }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: GOLD,
            transformOrigin: "left",
            transition: "width 0.1s linear",
          }}
        />
      </div>

      {/* Brand wordmark shown at the top of the page (navy), before the navy
          header slides in with the gold wordmark at the same position. */}
      <div
        data-no-print
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          opacity: scrolled ? 0 : 1,
          transition: "opacity 0.3s ease",
          pointerEvents: scrolled ? "none" : "auto",
        }}
      >
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "10px clamp(16px,4vw,32px)" }}>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 29,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <BrandMark variant="navy" />
          </button>
        </div>
      </div>

      {/* Sticky mini-header (appears after the hero) */}
      <header
        data-no-print
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 55,
          transform: scrolled ? "translateY(0)" : "translateY(-100%)",
          opacity: scrolled ? 1 : 0,
          transition: "transform 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease",
          background: NAVY,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 10px 40px rgba(11,25,41,0.28)",
        }}
      >
        <div
          style={{
            maxWidth: 1240,
            margin: "0 auto",
            padding: "10px clamp(16px,4vw,32px)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <BrandMark variant="gold" />
          </button>
          {activeLabel && (
            <>
              <span aria-hidden style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.78)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeLabel}
              </span>
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => window.print()}
              className="fx-topbar-pdf"
              style={{
                fontFamily: SANS,
                fontSize: 13,
                fontWeight: 600,
                color: GOLD,
                background: "transparent",
                border: "1px solid rgba(215,184,122,0.55)",
                borderRadius: 8,
                padding: "7px 13px",
                cursor: "pointer",
              }}
            >
              PDF
            </button>
            {nav.length > 0 && (
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                style={{
                  fontFamily: SANS,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 8,
                  padding: "7px 13px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                }}
              >
                Contents
                <span style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s", fontSize: 10 }}>▾</span>
              </button>
            )}
          </div>
        </div>

        {/* Contents dropdown */}
        {menuOpen && nav.length > 0 && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", background: NAVY }}>
            <nav
              style={{
                maxWidth: 1240,
                margin: "0 auto",
                padding: "10px clamp(16px,4vw,32px) 16px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: "2px 20px",
              }}
            >
              {nav.map((n, i) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => go(n.id)}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "baseline",
                    textAlign: "left",
                    fontFamily: SANS,
                    fontSize: 14,
                    fontWeight: activeId === n.id ? 640 : 450,
                    color: activeId === n.id ? "#fff" : "rgba(255,255,255,0.7)",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    padding: "9px 8px",
                    cursor: "pointer",
                  }}
                >
                  <span className="fx-tabular-nums" style={{ fontSize: 11, color: activeId === n.id ? GOLD : "rgba(255,255,255,0.4)", minWidth: 18 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {n.label}
                </button>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Sections */}
      <main>
        {sections.map((section) => {
          const Renderer = resolveModule(section.type, extraModules);
          if (!Renderer) return <UnknownModule key={section.id} section={section} />;
          return <Renderer key={section.id} section={section} views={section.type === "hero" ? views : null} />;
        })}
      </main>

      {/* Footer */}
      <Footer config={config} />

      <style>{`
        @media (max-width: 420px) { .fx-topbar-pdf { display: none; } }
      `}</style>
    </div>
  );
}

function Footer({ config }: { config: ReportConfig }) {
  const hero = config.sections.find((s) => s.type === "hero") as HeroSection | undefined;
  const m = hero?.meta;
  return (
    <footer
      style={{
        background: NAVY,
        color: "rgba(255,255,255,0.6)",
        padding: "40px clamp(20px,5vw,40px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          maxWidth: 1240,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: "14px 28px",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: SANS,
          fontSize: 12.5,
        }}
      >
        <BrandMark variant="gold" height={15} />
        <span style={{ textAlign: "center" }}>
          {m?.classification ?? "Confidential"}
          {m?.version ? ` · Version ${m.version}` : ""}
        </span>
        <span data-no-print>
          <button
            type="button"
            onClick={() => window.print()}
            style={{ fontFamily: SANS, fontSize: 12.5, color: "rgba(255,255,255,0.8)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            Download PDF ↓
          </button>
        </span>
      </div>
    </footer>
  );
}
