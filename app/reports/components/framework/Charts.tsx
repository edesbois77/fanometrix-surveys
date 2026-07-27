"use client";

// Survey charts, hand-built rather than pulled from a chart library so they read
// as designed document furniture, not generated output.
//
// Both are single-series (one distribution, or one metric compared across
// markets), so per the data-viz method they use ONE data hue — the validated
// DATA.series1 — with the value direct-labelled on every bar and no legend. The
// bars grow from the baseline on reveal and settle to their end state for print.
// A hover tooltip surfaces the exact count.

import { useEffect, useRef, useState } from "react";
import { DATA, INK, SANS } from "@/app/reports/theme";
import type { SurveyQuestion, ChartOption } from "@/lib/reports/framework/types";

const FILL = DATA.series1;
const TRACK = INK.grid;

function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined";
    // Async reveal (no synchronous setState in the effect body). Reduced-motion
    // shows on the next tick; otherwise a timed fallback guarantees the bars are
    // never left at zero even if the observer never fires.
    const safety = setTimeout(() => setInView(true), reduce ? 0 : 1500);
    let io: IntersectionObserver | undefined;
    if (!reduce) {
      io = new IntersectionObserver(
        (e) => {
          if (e[0]?.isIntersecting) {
            setInView(true);
            clearTimeout(safety);
            io?.disconnect();
          }
        },
        { threshold },
      );
      io.observe(el);
    }
    return () => {
      clearTimeout(safety);
      io?.disconnect();
    };
  }, [threshold]);
  return { ref, inView };
}

/* ─────────────────────────── Distribution bars ──────────────────────────── */

function Bar({ option, grown, delay, n }: { option: ChartOption; grown: boolean; delay: number; n: number }) {
  const [hover, setHover] = useState(false);
  const strong = option.highlight;
  return (
    <div
      style={{ position: "relative", padding: "13px 0" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 9 }}>
        <span
          style={{
            fontFamily: SANS,
            fontSize: "clamp(0.98rem, 1.5vw, 1.08rem)",
            fontWeight: strong ? 600 : 450,
            color: strong ? INK.primary : "#2A2F37",
          }}
        >
          {option.label}
        </span>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
          <span
            className="fx-tabular-nums"
            style={{ fontFamily: SANS, fontSize: "clamp(1.05rem, 1.7vw, 1.25rem)", fontWeight: 680, color: INK.primary }}
          >
            {option.pct}%
          </span>
          <span className="fx-tabular-nums" style={{ fontFamily: SANS, fontSize: 13, color: INK.tertiary }}>
            ({option.count})
          </span>
        </span>
      </div>
      <div style={{ position: "relative", height: 9, borderRadius: 5, background: TRACK, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: grown ? `${option.pct}%` : "0%",
            background: FILL,
            borderRadius: 5,
            opacity: strong ? 1 : 0.82,
            transition: `width 1.05s cubic-bezier(0.16,1,0.3,1) ${delay}s`,
          }}
        />
      </div>
      {hover && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: -6,
            right: 0,
            transform: "translateY(-100%)",
            background: "#12161C",
            color: "#fff",
            fontFamily: SANS,
            fontSize: 12,
            lineHeight: 1.4,
            padding: "7px 10px",
            borderRadius: 7,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 3,
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
          }}
        >
          {option.count} of {n} respondents · {option.pct}%
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Market comparison bars ───────────────────────── */

function MarketCompare({ question }: { question: SurveyQuestion }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const markets = question.markets ?? [];
  if (markets.length === 0) return null;

  // Compare markets on the option the narrative leans on (else the first).
  const focusIdx = Math.max(0, question.options.findIndex((o) => o.highlight));
  const focusOption = question.options[focusIdx];
  const rows = markets
    .map((m) => ({ code: m.code, market: m.market, value: m.values[focusIdx] ?? 0, n: m.n }))
    .sort((a, b) => b.value - a.value);
  const maxVal = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div ref={ref} style={{ marginTop: 26 }}>
      <div
        style={{
          fontFamily: SANS,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: INK.tertiary,
          marginBottom: 16,
        }}
      >
        “{focusOption?.label}” by market
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((r, i) => (
          <div key={r.code} style={{ display: "grid", gridTemplateColumns: "132px 1fr 48px", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: SANS, fontSize: 14, color: INK.secondary }}>{r.market}</span>
            <div style={{ position: "relative", height: 7, borderRadius: 4, background: TRACK, overflow: "hidden" }}>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: inView ? `${(r.value / maxVal) * 100}%` : "0%",
                  background: FILL,
                  opacity: 0.85,
                  borderRadius: 4,
                  transition: `width 0.9s cubic-bezier(0.16,1,0.3,1) ${0.05 * i}s`,
                }}
              />
            </div>
            <span
              className="fx-tabular-nums"
              style={{ fontFamily: SANS, fontSize: 14, fontWeight: 640, color: INK.primary, textAlign: "right" }}
            >
              {r.value}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────── Question block ─────────────────────────────── */

export function QuestionChart({ question }: { question: SurveyQuestion }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [openMarkets, setOpenMarkets] = useState(false);
  const hasMarkets = (question.markets?.length ?? 0) > 0;

  return (
    <div ref={ref} style={{ breakInside: "avoid" }}>
      {question.displayTitle && (
        <h3
          style={{
            fontFamily: SANS,
            fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)",
            lineHeight: 1.18,
            letterSpacing: "-0.025em",
            fontWeight: 620,
            margin: "0 0 24px",
            color: INK.primary,
            maxWidth: 640,
          }}
        >
          {question.displayTitle}
        </h3>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <span style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#9A7B3C" }}>
          {question.number}
        </span>
        <h4
          style={{
            fontFamily: SANS,
            fontSize: "clamp(1.05rem, 1.7vw, 1.2rem)",
            lineHeight: 1.25,
            letterSpacing: "-0.01em",
            fontWeight: 560,
            margin: 0,
            color: INK.secondary,
          }}
        >
          {question.title}
        </h4>
      </div>
      <div
        style={{
          fontFamily: SANS,
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: INK.tertiary,
          margin: "0 0 6px",
        }}
      >
        All markets · n&nbsp;=&nbsp;{question.n}
      </div>
      <div style={{ borderTop: `1px solid ${INK.hairlineSoft}` }}>
        {question.options.map((o, i) => (
          <div key={o.label} style={{ borderBottom: `1px solid ${INK.hairlineSoft}` }}>
            <Bar option={o} grown={inView} delay={0.08 * i} n={question.n} />
          </div>
        ))}
      </div>

      {question.note && (
        <p style={{ fontFamily: SANS, fontSize: 12.5, lineHeight: 1.5, color: INK.tertiary, margin: "12px 0 0" }}>
          {question.note}
        </p>
      )}

      {hasMarkets && (
        <>
          <button
            type="button"
            data-no-print
            onClick={() => setOpenMarkets((v) => !v)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              marginTop: 18,
              fontFamily: SANS,
              fontSize: 13,
              fontWeight: 600,
              color: "#9A7B3C",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
            aria-expanded={openMarkets}
          >
            <span
              style={{
                display: "inline-block",
                transform: openMarkets ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
              aria-hidden
            >
              ▸
            </span>
            {openMarkets ? "Hide market breakdown" : "View by market"}
          </button>
          {/* Always rendered for print; visually collapsed on screen when closed. */}
          <div
            data-print-open
            style={{
              maxHeight: openMarkets ? 2000 : 0,
              overflow: "hidden",
              transition: "max-height 0.5s ease",
            }}
          >
            <MarketCompare question={question} />
          </div>
        </>
      )}

      {(question.keyInsight || question.strategicImplication) && (
        <div className="fx-q-insight" style={{ display: "grid", gap: "22px 40px", marginTop: "clamp(26px,3vw,36px)" }}>
          {question.keyInsight && (
            <div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9A7B3C", marginBottom: 10 }}>
                Key Insight
              </div>
              <p style={{ fontFamily: SANS, fontSize: 15.5, lineHeight: 1.62, color: INK.primary, margin: 0 }}>
                {question.keyInsight}
              </p>
            </div>
          )}
          {question.strategicImplication && (
            <div>
              <div style={{ fontFamily: SANS, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: INK.tertiary, marginBottom: 10 }}>
                Strategic Implication
              </div>
              <p style={{ fontFamily: SANS, fontSize: 15.5, lineHeight: 1.62, color: INK.secondary, margin: 0 }}>
                {question.strategicImplication}
              </p>
            </div>
          )}
        </div>
      )}
      <style>{`.fx-q-insight { grid-template-columns: 1fr; } @media (min-width: 760px) { .fx-q-insight { grid-template-columns: 1fr 1fr; } }`}</style>
    </div>
  );
}
