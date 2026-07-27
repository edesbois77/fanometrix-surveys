"use client";

// Shared primitives for the report framework: the reveal-on-scroll wrapper, the
// count-up figure, section chrome (band, container, kicker, gold rule), the
// confidence badge and the print button. Every section is built from these, so
// spacing, motion and colour stay consistent across a report and across reports.
//
// Colour and type come from app/reports/theme.ts (the same tokens the partner
// reports use). Backgrounds and ink are always set explicitly so the document
// reads as paper regardless of the visitor's OS dark-mode preference, and so it
// prints faithfully.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { NAVY, GOLD, INK, SANS, CONFIDENCE_TONE } from "@/app/reports/theme";
import type { Confidence } from "@/lib/reports/framework/types";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Runs before paint on the client, falls back to useEffect on the server so
// there is no SSR warning. Used by CountUp to reset to 0 before the first frame.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ─────────────────────────── Reveal on scroll ───────────────────────────── */

/** Adds `.revealed` when the element scrolls into view (once). Reuses the CSS in
 *  globals.css (.report-reveal / .report-reveal-stagger / .stat-entrance /
 *  .gold-rule) so print already knows how to force these to their end state. */
export function Reveal({
  children,
  className = "",
  base = "report-reveal",
  stagger = false,
  style,
  id,
}: {
  children?: ReactNode;
  className?: string;
  base?: string;
  stagger?: boolean;
  style?: React.CSSProperties;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const immediate = prefersReducedMotion() || typeof IntersectionObserver === "undefined";
    // Safety net (async, so no synchronous setState in the effect body): content
    // must never stay hidden. Reduced-motion / no-observer environments reveal on
    // the next tick; everything else reveals on scroll, with a timed fallback so a
    // section below the observer's trigger line is never left blank.
    const safety = setTimeout(() => setShown(true), immediate ? 0 : 1500);
    let io: IntersectionObserver | undefined;
    if (!immediate) {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              setShown(true);
              clearTimeout(safety);
              io?.disconnect();
            }
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      );
      io.observe(el);
    }
    return () => {
      clearTimeout(safety);
      io?.disconnect();
    };
  }, []);

  const cls = [stagger ? "report-reveal-stagger" : base, shown ? "revealed" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} id={id} className={cls} style={style}>
      {children}
    </div>
  );
}

/* ───────────────────────────── Count-up figure ──────────────────────────── */

export function CountUp({
  to,
  prefix = "",
  suffix = "",
  durationMs = 1100,
  style,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // Initialise to the FINAL value so the correct number is what renders on the
  // server and if JavaScript, the observer or the animation never runs. The
  // count-up is a progressive enhancement, never load-bearing for correctness.
  const [val, setVal] = useState(to);
  const decimals = Number.isInteger(to) ? 0 : 1;

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;

    // Reset to 0 before paint, then animate up once in view. A safety timer
    // forces the final value even if the observer never fires, so the figure is
    // never left reading 0.
    setVal(0);
    let raf = 0;
    let start = 0;
    let done = false;
    // Unconditional, authoritative safety: whatever happens with the observer or
    // rAF (including environments where rAF timestamps never advance), the figure
    // snaps to its real value and the animation loop is stopped so it cannot
    // overwrite it. Never cleared on success.
    const safety = setTimeout(() => {
      done = true;
      cancelAnimationFrame(raf);
      setVal(to);
    }, durationMs + 900);
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || done) return;
        io.disconnect();
        const tick = (t: number) => {
          if (done) return;
          if (!start) start = t;
          const p = Math.min(1, (t - start) / durationMs);
          const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); // easeOutExpo
          setVal(to * eased);
          if (p < 1) raf = requestAnimationFrame(tick);
          else done = true;
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(safety);
      cancelAnimationFrame(raf);
    };
  }, [to, durationMs]);

  return (
    <span ref={ref} className="fx-tabular-nums" style={style}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* ─────────────────────────────── Chrome bits ────────────────────────────── */

export function Kicker({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "muted" }) {
  return (
    <div
      style={{
        fontFamily: SANS,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: tone === "gold" ? "#9A7B3C" : INK.tertiary,
      }}
    >
      {children}
    </div>
  );
}

/** The animated gold hairline used to open sections. */
export function GoldRule({ width = 56, style }: { width?: number; style?: React.CSSProperties }) {
  return <Reveal base="gold-rule" style={{ width, ...style }} />;
}

export function ConfidenceBadge({
  confidence,
  label,
}: {
  confidence: Confidence;
  label: string;
}) {
  const tone = CONFIDENCE_TONE[confidence];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: SANS,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: tone.ink,
        background: tone.wash,
        border: `1px solid ${tone.line}`,
        borderRadius: 999,
        padding: "3px 11px 3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: tone.ink }} aria-hidden />
      {label}
    </span>
  );
}

/* ─────────────────────────── Section scaffolding ────────────────────────── */

/** The report's surface palette. White is the primary reading surface; grey is a
 *  near-white (#F7F8FA) for transitions and supporting sections; navy is reserved
 *  for high-emphasis moments. Cream and gold are never full surfaces. */
export const SURFACE = {
  white: "#FFFFFF",
  grey: "#F7F8FA",
  navy: NAVY,
} as const;

/** A full-width tone band wrapping one section. Sets the background explicitly so
 *  the light/dark rhythm is controlled from config and survives dark mode + print.
 *  Generous vertical rhythm gives each chapter room to breathe. */
export function SectionBand({
  id,
  tone = "white",
  children,
  style,
  compact = false,
}: {
  id?: string;
  tone?: "white" | "grey" | "navy";
  children: ReactNode;
  style?: React.CSSProperties;
  compact?: boolean;
}) {
  return (
    <section
      id={id}
      style={{
        background: SURFACE[tone],
        color: tone === "navy" ? "#FFFFFF" : INK.primary,
        paddingTop: compact ? "clamp(56px, 8vw, 104px)" : "clamp(88px, 13vw, 184px)",
        paddingBottom: compact ? "clamp(56px, 8vw, 104px)" : "clamp(88px, 13vw, 184px)",
        scrollMarginTop: 76,
        ...style,
      }}
    >
      {children}
    </section>
  );
}

/** Centered content column. `size` sets the measure: prose is a comfortable
 *  reading width, wide is for charts/cards, full for edge-to-edge grids. */
export function Container({
  size = "prose",
  children,
  style,
}: {
  size?: "prose" | "wide" | "full";
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  // Two standard widths only: READING (~748) for long-form copy, and CONTENT
  // (~1240) for presentation layouts (hero, stats, charts, tables, cards).
  const max = size === "prose" ? 748 : 1240;
  return (
    <div
      style={{
        maxWidth: max,
        margin: "0 auto",
        paddingLeft: "clamp(20px, 5vw, 40px)",
        paddingRight: "clamp(20px, 5vw, 40px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Standard section header: chapter marker + kicker + gold rule + title + lede. */
export function SectionHead({
  kicker,
  chapter,
  title,
  lede,
  invert = false,
  align = "left",
}: {
  kicker?: string;
  chapter?: string;
  title?: string;
  lede?: string;
  invert?: boolean;
  align?: "left" | "center";
}) {
  if (!kicker && !title && !lede) return null;
  const centerX = align === "center";
  return (
    <Reveal style={{ textAlign: align, maxWidth: centerX ? 780 : undefined, marginInline: centerX ? "auto" : undefined }}>
      {(kicker || chapter) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: centerX ? "center" : "flex-start" }}>
          {chapter && (
            <span
              className="fx-tabular-nums"
              style={{
                fontFamily: SANS,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: invert ? "rgba(255,255,255,0.4)" : INK.tertiary,
              }}
            >
              {chapter}
            </span>
          )}
          {chapter && kicker && (
            <span aria-hidden style={{ width: 14, height: 1, background: invert ? "rgba(255,255,255,0.25)" : INK.axis }} />
          )}
          {kicker && <Kicker tone={invert ? "muted" : "gold"}>{kicker}</Kicker>}
        </div>
      )}
      {kicker && (
        <GoldRule style={{ marginTop: 18, marginBottom: 28, marginInline: centerX ? "auto" : undefined }} />
      )}
      {title && (
        <h2
          style={{
            fontFamily: SANS,
            fontSize: "clamp(1.85rem, 3.8vw, 2.9rem)",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            fontWeight: 640,
            margin: 0,
            color: invert ? "#FFFFFF" : INK.primary,
            // Widened so the longest section titles wrap to at most three lines.
            maxWidth: 34 * 16,
            marginInline: centerX ? "auto" : undefined,
          }}
        >
          {title}
        </h2>
      )}
      {lede && (
        <p
          style={{
            fontFamily: SANS,
            fontSize: "clamp(1.08rem, 1.6vw, 1.28rem)",
            lineHeight: 1.6,
            margin: "22px 0 0",
            color: invert ? "rgba(255,255,255,0.72)" : INK.secondary,
            maxWidth: centerX ? 760 : undefined,
            marginInline: centerX ? "auto" : undefined,
          }}
        >
          {lede}
        </p>
      )}
    </Reveal>
  );
}

/** End-of-chapter takeaway — a quiet gold-ruled line that returns the reader to
 *  the commercial implication before the next chapter. Adapts to dark bands. */
export function Takeaway({ label = "Why this matters", text, invert = false }: { label?: string; text: string; invert?: boolean }) {
  return (
    <Reveal
      style={{
        display: "flex",
        gap: 18,
        alignItems: "flex-start",
        marginTop: "clamp(44px, 6vw, 72px)",
        paddingTop: 26,
        borderTop: `1px solid ${invert ? "rgba(255,255,255,0.14)" : INK.hairline}`,
        maxWidth: 820,
      }}
    >
      <span aria-hidden style={{ flexShrink: 0, width: 3, alignSelf: "stretch", background: GOLD, borderRadius: 2, minHeight: 44 }} />
      <div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#9A7B3C",
            marginBottom: 8,
          }}
        >
          {label}
        </div>
        <p
          style={{
            fontFamily: SANS,
            fontSize: "clamp(1.1rem, 1.7vw, 1.32rem)",
            lineHeight: 1.5,
            letterSpacing: "-0.01em",
            fontWeight: 500,
            margin: 0,
            color: invert ? "#FFFFFF" : INK.primary,
          }}
        >
          {text}
        </p>
      </div>
    </Reveal>
  );
}

/* ─────────────────────────────── PDF button ─────────────────────────────── */

export function PdfButton({
  variant = "solid",
  label = "Download PDF",
}: {
  variant?: "solid" | "ghost";
  label?: string;
}) {
  const solid = variant === "solid";
  return (
    <button
      type="button"
      data-no-print
      onClick={() => window.print()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        fontFamily: SANS,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "0.01em",
        padding: "12px 18px",
        borderRadius: 9,
        cursor: "pointer",
        width: "100%",
        border: solid ? "none" : `1px solid ${GOLD}`,
        background: solid ? NAVY : "transparent",
        color: solid ? "#FFFFFF" : "#9A7B3C",
        transition: "opacity 0.2s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </button>
  );
}
