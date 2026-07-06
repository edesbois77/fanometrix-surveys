"use client";

// Self-contained production themed survey creative.
// No imports from /creative-lab/ — safe to deploy independently.
// Renders the 4-quadrant timer design with the chosen theme applied.

import { useState, useRef, useEffect, useLayoutEffect } from "react";

// ── Compact theme definitions (8 themes, independent of creative-lab) ─────────

export interface EmbedTheme {
  canvas: string; quad: string; gridLine: string;
  outerBorder: string; outerShadow: string;
  text: string; accent: string;
  gradient: string; reversedGradient: string;
  selectedBg: string; selectedText: string;
  hoverBg: string; hoverGlow: string;
  circle: string; circleBorder: string; pulseGlow: string;
  timerRing: string; progressRing: string;
  header: { bg: string; text: string; meta: string };
}

// Last-resort default — used only if a design's row is ever unreachable or
// missing. Every real design (including the 9 original built-ins) now lives
// in the creative_designs table and is always passed in via customTheme;
// see lib/creative-theme-builder.ts's buildEmbedThemeFromState.
const FALLBACK_THEME: EmbedTheme = {
  canvas:"#041B33", quad:"#0B1929", gridLine:"rgba(215,184,122,0.12)",
  outerBorder:"rgba(215,184,122,0.45)", outerShadow:"0 8px 32px rgba(0,0,0,0.6)",
  text:"#fff", accent:"#D7B87A", gradient:"linear-gradient(180deg,#D7B87A,#A8864A)",
  reversedGradient:"linear-gradient(180deg,#A8864A,#D7B87A)",
  selectedBg:"linear-gradient(180deg,#D7B87A,#A8864A)", selectedText:"#041B33",
  hoverBg:"rgba(215,184,122,0.07)", hoverGlow:"inset 0 0 28px rgba(215,184,122,0.1)",
  circle:"#041B33", circleBorder:"rgba(215,184,122,0.35)",
  pulseGlow:"0 0 0 5px rgba(215,184,122,0.14),0 0 18px rgba(215,184,122,0.07)",
  timerRing:"#D7B87A", progressRing:"#D7B87A",
  header:{bg:"linear-gradient(180deg,#D7B87A,#A8864A)", text:"#041B33", meta:"rgba(4,27,51,0.6)"},
};

// ── Layout constants (matches Design - Timer layout) ─────────────────────────

const HEADER_H  = 72;
const ROW_H     = (250 - HEADER_H) / 2;  // 89
const GRID_CX   = 150;
const GRID_CY   = HEADER_H + ROW_H;      // 161

const TIMER_D   = 72;
const TIMER_R   = 36;
const RING_R    = 40;
const RING_SVG  = (RING_R + 3) * 2;
const RING_CX_V = RING_SVG / 2;
const RING_CIRC = 2 * Math.PI * RING_R;
const PROG_R    = 46;
const PROG_SVG  = (PROG_R + 3) * 2;
const PROG_CX_V = PROG_SVG / 2;
const PROG_CIRC = 2 * Math.PI * PROG_R;

// GRID_TO_ANSWER: display index → options array index
const GRID_TO_ANS = [0, 1, 3, 2];

const FONT_Q = "'Space Grotesk', system-ui, sans-serif";
const FONT_A = "'Inter', system-ui, sans-serif";

// ── Types ─────────────────────────────────────────────────────────────────────

type EmbedOption  = { id: number; text: string };
type EmbedQuestion = { id: string; text: string; options: EmbedOption[] };

export interface ThemedSurveyProps {
  // Kept for React `key` uniqueness at call sites — no longer used for a
  // theme lookup (every design is resolved server-side into customTheme).
  themeId:        string;
  customTheme?:   EmbedTheme;
  questions:      EmbedQuestion[];
  thankYouTitle:  string;
  thankYouBody:   string;
  isPreview:      boolean;
  // Submit payload — passed from parent EmbedSurvey
  campaignId:     string;
  surveyId:       string | null;
  publisher:      string | null;
  placement:      string | null;
  placementId:    string | null;
  creativeId:     string | null;
  club:           string | null;
  competition:    string | null;
  country:        string | null;
  segment:        string | null;
  device:         string | null;
  browser:        string | null;
  groupId:        string | null;
  countryCode:    string | null;
  market:         string | null;
  surveyLanguage: string;
  sessionId:      string;
}

// ── Answer text formatter ─────────────────────────────────────────────────────
// Ensures text splits into exactly 2 lines, then picks the split that puts more
// weight on the correct side:
//   top quadrants  → first line longer (weight away from centre circle)
//   bottom quadrants → second line longer
//
// PRIMARY constraint: both lines must fit within CHARS_PER_LINE characters
// (tuned to the 94 px content area at 11.5 px Inter).
// SECONDARY constraint: honour the row direction.

const CHARS_PER_LINE = 15;

function formatAnswer(text: string, isTopRow: boolean): string {
  if (text.includes('\n')) return text; // explicit break already set — respect it
  const words = text.split(' ');
  if (words.length <= 1) return text;

  // Collect every word-boundary split where BOTH resulting lines fit in one render line
  function collectSplits(maxChars: number) {
    const out: Array<{ i: number; l1: number; l2: number }> = [];
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ').length;
      const l2 = words.slice(i).join(' ').length;
      if (l1 <= maxChars && l2 <= maxChars) out.push({ i, l1, l2 });
    }
    return out;
  }

  // Try strict limit first; relax to 18 for longer (but valid) answers up to 32 chars
  const valid = collectSplits(CHARS_PER_LINE).length > 0
    ? collectSplits(CHARS_PER_LINE)
    : collectSplits(18);

  // No valid 2-line split found — fall back to a balanced middle split
  // (font-size reducer in the Quadrant component will handle overflow)
  if (valid.length === 0) {
    const mid = Math.ceil(words.length / 2);
    return words.slice(0, mid).join(' ') + '\n' + words.slice(mid).join(' ');
  }

  // Among valid splits, pick the one that best honours the row direction
  const best = isTopRow
    ? valid.reduce((b, s) => s.l1 >= b.l1 ? s : b, valid[0])  // longest first line
    : valid.reduce((b, s) => s.l2 >= b.l2 ? s : b, valid[0]); // longest second line

  return words.slice(0, best.i).join(' ') + '\n' + words.slice(best.i).join(' ');
}

// ── Timer circle ──────────────────────────────────────────────────────────────

function TimerCircle({ timeLeft, isRunning, expired, pulse, visible, theme }: {
  timeLeft: number; isRunning: boolean; expired: boolean;
  pulse: boolean; visible: boolean; theme: EmbedTheme;
}) {
  const visibleLen = RING_CIRC * (timeLeft / 10);
  const ringTrans  = isRunning && !expired ? "stroke-dasharray 1s linear" : "none";
  return (
    <>
      <svg width={RING_SVG} height={RING_SVG} viewBox={`0 0 ${RING_SVG} ${RING_SVG}`}
        style={{ position:"absolute", left:GRID_CX - RING_CX_V, top:GRID_CY - RING_CX_V, pointerEvents:"none", zIndex:5 }}
        aria-hidden>
        <circle cx={RING_CX_V} cy={RING_CX_V} r={RING_R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={2.5} />
        <circle cx={RING_CX_V} cy={RING_CX_V} r={RING_R} fill="none" stroke={theme.timerRing} strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={`${visibleLen} ${RING_CIRC}`} strokeDashoffset={0}
          transform={`rotate(-90 ${RING_CX_V} ${RING_CX_V})`}
          style={{ transition: ringTrans }} />
      </svg>
      <div style={{
        position:"absolute", left:GRID_CX - TIMER_R, top:GRID_CY - TIMER_R,
        width:TIMER_D, height:TIMER_D, borderRadius:"50%",
        background:theme.circle, border:`1.5px solid ${theme.circleBorder}`,
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        zIndex:6, boxSizing:"border-box", padding:"4px", textAlign:"center",
        boxShadow: pulse ? theme.pulseGlow : "0 0 0 0px transparent",
        transition:"box-shadow 0.4s ease",
      }}>
        {!expired ? (
          <>
            <span style={{ color:theme.text, fontSize:34, fontWeight:700, fontFamily:FONT_Q,
              lineHeight:1, letterSpacing:"-0.02em", opacity: visible ? 1 : 0, transition:"opacity 0.22s ease" }}>
              {timeLeft}
            </span>
            <span style={{ color:theme.text, fontSize:6.5, fontWeight:600, fontFamily:FONT_A,
              letterSpacing:"0.08em", textTransform:"uppercase", lineHeight:1, marginTop:3,
              opacity: visible ? 0.4 : 0, transition:"opacity 0.22s ease" }}>
              {timeLeft === 1 ? "SEC" : "SECS"}
            </span>
          </>
        ) : (
          <span style={{ color:theme.text, fontSize:7, fontWeight:600, fontFamily:FONT_A,
            lineHeight:1.4, opacity:0.8, textAlign:"center" }}>
            Select an answer
          </span>
        )}
      </div>
    </>
  );
}

// ── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({ done, total, theme }: { done: number; total: number; theme: EmbedTheme }) {
  const offset = PROG_CIRC * (1 - done / total);
  return (
    <svg width={PROG_SVG} height={PROG_SVG} viewBox={`0 0 ${PROG_SVG} ${PROG_SVG}`}
      style={{ position:"absolute", left:GRID_CX - PROG_CX_V, top:GRID_CY - PROG_CX_V, pointerEvents:"none", zIndex:4 }}
      aria-hidden>
      <circle cx={PROG_CX_V} cy={PROG_CX_V} r={PROG_R} fill="none" stroke={`${theme.progressRing}22`} strokeWidth={1.5} />
      <circle cx={PROG_CX_V} cy={PROG_CX_V} r={PROG_R} fill="none" stroke={theme.progressRing}
        strokeWidth={1.5} strokeLinecap="round"
        strokeDasharray={`${PROG_CIRC}`} strokeDashoffset={offset}
        transform={`rotate(-90 ${PROG_CX_V} ${PROG_CX_V})`}
        style={{ transition:"stroke-dashoffset 0.4s cubic-bezier(0.4,0,0.2,1)" }} opacity={0.65} />
    </svg>
  );
}

// ── Header bar ────────────────────────────────────────────────────────────────

function Header({ text, step, total, visible, theme }: {
  text: string; step: number; total: number; visible: boolean; theme: EmbedTheme;
}) {
  return (
    <div style={{
      position:"absolute", top:0, left:0, right:0, height:HEADER_H,
      background:theme.header.bg,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:"6px 18px", boxSizing:"border-box", zIndex:2, textAlign:"center", gap:3,
    }}>
      <span style={{ color:theme.header.meta, fontSize:8, fontWeight:600, fontFamily:FONT_A,
        letterSpacing:"0.12em", textTransform:"uppercase",
        opacity: visible ? 1 : 0, transition:"opacity 0.22s ease", lineHeight:1 }}>
        {step + 1} OF {total}
      </span>
      <p style={{ color:theme.header.text, fontSize:15, fontWeight:600, fontFamily:FONT_Q,
        letterSpacing:"-0.02em", lineHeight:1.2, margin:0,
        opacity: visible ? 1 : 0, transition:"opacity 0.22s ease",
        display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical",
        overflow:"hidden", maxWidth:262 }}>
        {text}
      </p>
    </div>
  );
}

// ── Quadrant ──────────────────────────────────────────────────────────────────

function Quadrant({ text, side, isSelected, isOther, isHovered, visible, onSelect, onHover, onLeave, disabled, selectedBg, theme }: {
  text: string; side:"left"|"right";
  isSelected: boolean; isOther: boolean; isHovered: boolean; visible: boolean;
  onSelect:()=>void; onHover:()=>void; onLeave:()=>void;
  disabled: boolean; selectedBg: string; theme: EmbedTheme;
}) {
  const bg        = isSelected ? selectedBg : isHovered ? theme.hoverBg : theme.quad;
  const textColor = isSelected ? theme.selectedText : theme.text;
  const scale     = isHovered && !isSelected && !isOther ? 1.025 : 1;

  // Safety-net: reduce font size until text fits in ≤ 2 rendered lines
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    let size = 11.5;
    el.style.fontSize = `${size}px`;
    // 2-line threshold = 2 × lineHeight × fontSize + small buffer
    while (el.scrollHeight > size * 1.35 * 2 + 4 && size > 8.5) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [text]);

  return (
    <div role="button" tabIndex={disabled ? -1 : 0}
      aria-label={text.replace(/\n/g, " ")} aria-disabled={disabled}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={e => !disabled && (e.key === "Enter" || e.key === " ") && onSelect()}
      onMouseEnter={disabled ? undefined : onHover}
      onMouseLeave={disabled ? undefined : onLeave}
      style={{
        background: bg,
        display:"flex", alignItems:"center",
        justifyContent: side === "left" ? "flex-start" : "flex-end",
        cursor: disabled ? "default" : "pointer",
        userSelect:"none", position:"relative", overflow:"hidden",
        opacity: isOther ? 0.6 : 1, transform:`scale(${scale})`,
        transition:"background 0.25s ease, opacity 0.25s ease, transform 0.15s ease, box-shadow 0.15s ease",
        boxShadow: isHovered && !isSelected && !isOther ? theme.hoverGlow : "none",
        paddingLeft:  side === "left"  ? 16 : 40,
        paddingRight: side === "right" ? 16 : 40,
      }}>
      <span ref={textRef} style={{
        color:textColor, fontSize:11.5, fontWeight:500, fontFamily:FONT_A,
        lineHeight:1.35, textAlign:side, whiteSpace:"pre-line",
        width:"100%", minWidth:0,
        opacity: visible ? 1 : 0, transition:"opacity 0.22s ease, color 0.22s ease",
        pointerEvents:"none",
      }}>
        {text}
      </span>
    </div>
  );
}

// ── Thank you ─────────────────────────────────────────────────────────────────

function ThankYou({ title, body, theme }: { title: string; body: string; theme: EmbedTheme }) {
  return (
    <div style={{
      position:"absolute", inset:0, background:theme.canvas,
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      textAlign:"center", padding:"20px 24px", gap:8, zIndex:10,
    }}>
      <div style={{ width:44, height:44, borderRadius:"50%",
        background:`${theme.accent}20`, border:`2px solid ${theme.accent}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        color:theme.accent, fontSize:20, fontWeight:700, flexShrink:0, marginBottom:2 }}>
        ✓
      </div>
      <p style={{ color:"#fff", fontSize:22, margin:0, letterSpacing:"-0.02em", fontFamily:FONT_Q, fontWeight:600 }}>
        {title}
      </p>
      <p style={{ color:"rgba(255,255,255,0.65)", fontSize:13, margin:0, lineHeight:1.55, maxWidth:210, fontFamily:FONT_A, fontWeight:400 }}>
        {body}
      </p>
      <p style={{ color:theme.accent, fontSize:11, fontWeight:500, margin:"2px 0 0", letterSpacing:"0.04em", fontFamily:FONT_A }}>
        Fan voice counted.
      </p>
    </div>
  );
}

// ── Themed privacy overlay ────────────────────────────────────────────────────
// Matches the design approved in Creative Lab (PrivacyOverlay.tsx).
// Single screen — no pagination.

const PRIVACY_ITEMS = [
  "No personal information collected",
  "No email addresses collected",
  "No cookies required",
  "No individual identifiers stored",
];

function ThemedPrivacyOverlay({ theme, onClose }: { theme: EmbedTheme; onClose: () => void }) {
  // Derive overlay colours from the existing EmbedTheme fields
  const bg        = theme.canvas;
  const titleCol  = theme.accent;
  const textCol   = "rgba(255,255,255,0.7)";
  const border    = theme.gridLine;
  const closeBg   = theme.hoverBg;
  const accent    = theme.accent;

  return (
    <div
      role="dialog"
      aria-label="Privacy information"
      aria-modal="true"
      style={{
        position: "absolute", inset: 0, zIndex: 30,
        background: bg,
        display: "flex", flexDirection: "column", boxSizing: "border-box",
        borderRadius: 12, overflow: "hidden",
        animation: "tgFadeIn 0.18s ease",
      }}
    >
      <style>{`@keyframes tgFadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Header */}
      <div style={{ height: 42, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", borderBottom: `1px solid ${border}` }}>
        <span style={{ color: titleCol, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", fontFamily: FONT_Q }}>
          Privacy
        </span>
        <button
          onClick={onClose}
          aria-label="Close privacy and return to survey"
          style={{ background: closeBg, border: `1px solid ${accent}44`, borderRadius: 12, cursor: "pointer", color: accent, fontSize: 9, fontWeight: 700, padding: "3px 10px", lineHeight: 1.4, letterSpacing: "0.04em", fontFamily: FONT_A }}
        >
          ✕ Back
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "12px 16px 8px", overflow: "hidden", display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ color: titleCol, fontSize: 10.5, fontWeight: 700, margin: 0, lineHeight: 1.3, fontFamily: FONT_Q }}>
          Your responses are anonymous.
        </p>
        {PRIVACY_ITEMS.map(item => (
          <div key={item} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <span style={{ color: accent, fontSize: 7, marginTop: 2.5, flexShrink: 0 }}>●</span>
            <span style={{ color: textCol, fontSize: 9.5, lineHeight: 1.4, fontFamily: FONT_A, fontWeight: 400 }}>
              {item}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 16px 12px", flexShrink: 0, borderTop: `1px solid ${border}` }}>
        <a
          href="/en/privacy"
          target="_blank"
          rel="noopener"
          style={{ display: "block", textAlign: "center", color: accent, fontSize: 9.5, fontWeight: 700, padding: "7px", borderRadius: 6, textDecoration: "none", background: closeBg, border: `1px solid ${accent}44`, letterSpacing: "0.03em", fontFamily: FONT_A }}
        >
          Read Full Privacy Policy →
        </a>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ThemedSurvey(props: ThemedSurveyProps) {
  const theme = props.customTheme ?? FALLBACK_THEME;
  const total = props.questions.length;

  const [step,        setStep]        = useState(0);
  const [done,        setDone]        = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx,  setHoveredIdx]  = useState<number | null>(null);
  const [phase,       setPhase]       = useState<"question"|"selecting"|"thankyou">("question");
  const [textVisible, setTextVisible] = useState(true);
  const [pulse,       setPulse]       = useState(false);
  const [answers,     setAnswers]     = useState<Record<string, number>>({});

  const [timeLeft,  setTimeLeft]  = useState(10);
  const [isRunning, setIsRunning] = useState(false);
  const [expired,   setExpired]   = useState(false);

  const [showPrivacy, setShowPrivacy] = useState(false);

  const containerRef    = useRef<HTMLDivElement>(null);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef    = useRef(false);
  const advancingRef    = useRef(false);
  const startRef        = useRef(Date.now());
  const hasRendered     = useRef(false);
  const hasStarted      = useRef(false);
  const hasCompleted    = useRef(false);

  const q = props.questions[step];

  function sendEvent(eventType: string) {
    if (props.isPreview) return;
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        session_id:   props.sessionId,
        event_type:   eventType,
        campaign_id:  props.campaignId  || null,
        publisher:    props.publisher   || null,
        placement:    props.placement   || null,
        placement_id: props.placementId || null,
        creative_id:  props.creativeId  || null,
        country:      props.country     || null,
        device:       props.device      || null,
        browser:      props.browser     || null,
      }),
    }).catch(() => {/* non-fatal */});
  }

  // IntersectionObserver — start timer when in view, fire SURVEY_RENDER once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => {
      isVisibleRef.current = e.isIntersecting;
      if (e.isIntersecting && !document.hidden) {
        setIsRunning(true);
        if (!hasRendered.current) {
          hasRendered.current = true;
          sendEvent("SURVEY_RENDER");
        }
      } else {
        setIsRunning(false);
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fn = () => {
      if (document.hidden) {
        setIsRunning(false);
        if (hasStarted.current && !hasCompleted.current) sendEvent("SURVEY_EXIT");
      } else if (isVisibleRef.current) {
        setIsRunning(true);
      }
    };
    document.addEventListener("visibilitychange", fn);
    window.addEventListener("beforeunload", fn);
    return () => {
      document.removeEventListener("visibilitychange", fn);
      window.removeEventListener("beforeunload", fn);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isRunning || phase !== "question" || expired) return;
    intervalRef.current = setInterval(() => setTimeLeft(t => t <= 1 ? 0 : t - 1), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, phase, expired]);

  useEffect(() => {
    if (timeLeft !== 0 || expired || phase !== "question") return;
    setIsRunning(false);
    setExpired(true);
    pulseRef.current = setInterval(() => { setPulse(true); setTimeout(() => setPulse(false), 350); }, 2700);
    return () => { if (pulseRef.current) clearInterval(pulseRef.current); };
  }, [timeLeft, phase, expired]);

  function getSelectedBg(gridIdx: number) { return gridIdx <= 1 ? theme.reversedGradient : theme.selectedBg; }

  function handleSelect(gridIdx: number) {
    if (advancingRef.current || phase !== "question") return;
    advancingRef.current = true;

    // Clear timer state
    setExpired(false);
    setPulse(false);
    if (pulseRef.current) clearInterval(pulseRef.current);
    setIsRunning(false);

    const optionIdx = GRID_TO_ANS[gridIdx];
    const option    = q.options[optionIdx];
    if (!option) { advancingRef.current = false; return; }

    const newAnswers = { ...answers, [q.id]: option.id };
    setAnswers(newAnswers);

    // SURVEY_START: first answer
    if (!hasStarted.current) {
      hasStarted.current = true;
      sendEvent("SURVEY_START");
    }

    setSelectedIdx(gridIdx);
    setPhase("selecting");
    setPulse(true);
    setTimeout(() => setPulse(false), 220);
    setTimeout(() => setTextVisible(false), 350);

    setTimeout(async () => {
      if (step + 1 >= total) {
        // Submit
        if (!props.isPreview) {
          const duration = Math.round((Date.now() - startRef.current) / 1000);
          const allQ     = props.questions;
          await fetch("/api/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              campaign_id:               props.campaignId,
              survey_id:                 props.surveyId,
              publisher:                 props.publisher,
              placement:                 props.placement,
              placement_id:              props.placementId,
              creative_id:               props.creativeId,
              club:                      props.club,
              competition:               props.competition,
              q1:                        newAnswers[allQ[0]?.id] ?? null,
              q2:                        newAnswers[allQ[1]?.id] ?? null,
              q3:                        newAnswers[allQ[2]?.id] ?? null,
              country:                   props.country,
              fan_segment:               props.segment,
              device:                    props.device,
              browser:                   props.browser,
              response_duration_seconds: duration,
              group_id:                  props.groupId,
              country_code:              props.countryCode,
              market:                    props.market,
              survey_language:           props.surveyLanguage,
            }),
          }).catch(() => {/* non-fatal */});
          hasCompleted.current = true;
          sendEvent("SURVEY_COMPLETED");
        }
        setPhase("thankyou");
      } else {
        const next = step + 1;
        if (next === 1) sendEvent("QUESTION_2_REACHED");
        if (next === 2) sendEvent("QUESTION_3_REACHED");
        setDone(d => d + 1);
        setStep(next);
        setSelectedIdx(null);
        setHoveredIdx(null);
        setPhase("question");
        setTimeLeft(10);
        setTimeout(() => {
          setTextVisible(true);
          if (isVisibleRef.current && !document.hidden) setIsRunning(true);
        }, 40);
      }
      advancingRef.current = false;
    }, 650);
  }

  return (
    <div ref={containerRef} style={{
      width:300, height:250, background:theme.canvas,
      position:"relative", overflow:"hidden",
      fontFamily:FONT_A, boxSizing:"border-box",
      border:`1px solid ${theme.outerBorder}`, borderRadius:12,
      boxShadow:theme.outerShadow,
    }}>
      {/* Google Fonts */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap');`}</style>

      {/* Themed privacy overlay — rendered above everything else */}
      {showPrivacy && (
        <ThemedPrivacyOverlay theme={theme} onClose={() => setShowPrivacy(false)} />
      )}

      {phase === "thankyou" && <ThankYou title={props.thankYouTitle} body={props.thankYouBody} theme={theme} />}

      <Header text={q?.text ?? ""} step={step} total={total}
        visible={textVisible && phase !== "thankyou"} theme={theme} />

      {/* 2×2 quadrant grid */}
      <div aria-hidden={phase === "thankyou"} style={{
        position:"absolute", top:HEADER_H, left:0, right:0, height:250 - HEADER_H,
        display:"grid", gridTemplateColumns:"150px 150px",
        gridTemplateRows:`${ROW_H}px ${ROW_H}px`, gap:1, background:theme.gridLine,
      }}>
        {[0, 1, 2, 3].map(gridIdx => {
          const optionIdx = GRID_TO_ANS[gridIdx];
          const option    = q?.options[optionIdx];
          const isTopRow  = gridIdx <= 1;
          return (
            <Quadrant key={gridIdx}
              text={formatAnswer(option?.text ?? "", isTopRow)}
              side={gridIdx % 2 === 0 ? "left" : "right"}
              isSelected={selectedIdx === gridIdx}
              isOther={selectedIdx !== null && selectedIdx !== gridIdx}
              isHovered={hoveredIdx === gridIdx && phase === "question"}
              visible={textVisible}
              onSelect={() => handleSelect(gridIdx)}
              onHover={() => phase === "question" && setHoveredIdx(gridIdx)}
              onLeave={() => setHoveredIdx(null)}
              disabled={phase !== "question"}
              selectedBg={getSelectedBg(gridIdx)}
              theme={theme}
            />
          );
        })}
      </div>

      {phase !== "thankyou" && <ProgressRing done={done} total={total} theme={theme} />}
      {phase !== "thankyou" && (
        <TimerCircle timeLeft={timeLeft} isRunning={isRunning} expired={expired}
          pulse={pulse} visible={textVisible} theme={theme} />
      )}

      {/* Privacy — centred, same position as original */}
      {phase !== "thankyou" && (
        <button
          onClick={() => setShowPrivacy(true)}
          style={{
            position:"absolute", bottom:5, left:"50%", transform:"translateX(-50%)",
            background:theme.quad, border:"none", cursor:"pointer",
            color:`${theme.accent}88`, fontSize:8.5, zIndex:7,
            padding:"3px 8px", letterSpacing:"0.02em", lineHeight:1,
            borderRadius:4, fontFamily:FONT_A,
          }}
        >
          ⓘ Privacy
        </button>
      )}
    </div>
  );
}
