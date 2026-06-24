"use client";

// Self-contained production themed survey creative.
// No imports from /creative-lab/ — safe to deploy independently.
// Renders the 4-quadrant timer design with the chosen theme applied.

import { useState, useRef, useEffect } from "react";

// ── Compact theme definitions (8 themes, independent of creative-lab) ─────────

interface EmbedTheme {
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

const EMBED_THEMES: Record<string, EmbedTheme> = {
  "fanometrix": {
    canvas:"#041B33", quad:"#0B1929", gridLine:"rgba(215,184,122,0.12)",
    outerBorder:"rgba(215,184,122,0.5)", outerShadow:"0 8px 32px rgba(0,0,0,0.6)",
    text:"#fff", accent:"#D7B87A", gradient:"linear-gradient(180deg,#D7B87A,#A8864A)",
    reversedGradient:"linear-gradient(180deg,#A8864A,#D7B87A)",
    selectedBg:"linear-gradient(180deg,#D7B87A,#A8864A)", selectedText:"#041B33",
    hoverBg:"rgba(215,184,122,0.08)", hoverGlow:"inset 0 0 28px rgba(215,184,122,0.1)",
    circle:"#041B33", circleBorder:"rgba(215,184,122,0.35)",
    pulseGlow:"0 0 0 5px rgba(215,184,122,0.11),0 0 18px rgba(215,184,122,0.06)",
    timerRing:"#D7B87A", progressRing:"#D7B87A",
    header:{bg:"linear-gradient(180deg,#D7B87A,#A8864A)", text:"#041B33", meta:"rgba(4,27,51,0.6)"},
  },
  "electric-football": {
    canvas:"#061A2F", quad:"#082038", gridLine:"rgba(0,245,160,0.12)",
    outerBorder:"rgba(0,245,160,0.45)", outerShadow:"0 8px 32px rgba(0,245,160,0.15)",
    text:"#fff", accent:"#00F5A0", gradient:"linear-gradient(180deg,#00F5A0,#00C2FF)",
    reversedGradient:"linear-gradient(180deg,#00C2FF,#00F5A0)",
    selectedBg:"linear-gradient(180deg,#00F5A0,#00C2FF)", selectedText:"#061A2F",
    hoverBg:"rgba(0,245,160,0.07)", hoverGlow:"inset 0 0 28px rgba(0,245,160,0.1)",
    circle:"#061A2F", circleBorder:"rgba(0,245,160,0.35)",
    pulseGlow:"0 0 0 5px rgba(0,245,160,0.14),0 0 18px rgba(0,245,160,0.07)",
    timerRing:"#00F5A0", progressRing:"#00F5A0",
    header:{bg:"linear-gradient(180deg,#00F5A0,#00C2FF)", text:"#061A2F", meta:"rgba(6,26,47,0.6)"},
  },
  "fan-energy": {
    canvas:"#170B2E", quad:"#21103D", gridLine:"rgba(255,79,163,0.12)",
    outerBorder:"rgba(255,79,163,0.45)", outerShadow:"0 8px 32px rgba(255,79,163,0.2)",
    text:"#fff", accent:"#FF4FA3", gradient:"linear-gradient(180deg,#FF4FA3,#A855F7)",
    reversedGradient:"linear-gradient(180deg,#A855F7,#FF4FA3)",
    selectedBg:"linear-gradient(180deg,#FF4FA3,#A855F7)", selectedText:"#fff",
    hoverBg:"rgba(255,79,163,0.07)", hoverGlow:"inset 0 0 28px rgba(255,79,163,0.1)",
    circle:"#170B2E", circleBorder:"rgba(255,79,163,0.35)",
    pulseGlow:"0 0 0 5px rgba(255,79,163,0.14),0 0 18px rgba(255,79,163,0.07)",
    timerRing:"#FF4FA3", progressRing:"#FF4FA3",
    header:{bg:"linear-gradient(180deg,#FF4FA3,#A855F7)", text:"#fff", meta:"rgba(255,255,255,0.65)"},
  },
  "electric-purple": {
    canvas:"#140B2E", quad:"#1E0D36", gridLine:"rgba(217,70,239,0.12)",
    outerBorder:"rgba(217,70,239,0.45)", outerShadow:"0 8px 32px rgba(217,70,239,0.2)",
    text:"#fff", accent:"#D946EF", gradient:"linear-gradient(180deg,#D946EF,#7C3AED)",
    reversedGradient:"linear-gradient(180deg,#7C3AED,#D946EF)",
    selectedBg:"linear-gradient(180deg,#D946EF,#7C3AED)", selectedText:"#fff",
    hoverBg:"rgba(217,70,239,0.07)", hoverGlow:"inset 0 0 28px rgba(217,70,239,0.1)",
    circle:"#140B2E", circleBorder:"rgba(217,70,239,0.35)",
    pulseGlow:"0 0 0 5px rgba(217,70,239,0.14),0 0 18px rgba(217,70,239,0.07)",
    timerRing:"#D946EF", progressRing:"#D946EF",
    header:{bg:"linear-gradient(180deg,#D946EF,#7C3AED)", text:"#fff", meta:"rgba(255,255,255,0.65)"},
  },
  "sky-pulse": {
    canvas:"#071625", quad:"#0A2033", gridLine:"rgba(125,211,252,0.1)",
    outerBorder:"rgba(125,211,252,0.45)", outerShadow:"0 8px 32px rgba(125,211,252,0.1)",
    text:"#fff", accent:"#7DD3FC", gradient:"linear-gradient(180deg,#7DD3FC,#3B82F6)",
    reversedGradient:"linear-gradient(180deg,#3B82F6,#7DD3FC)",
    selectedBg:"linear-gradient(180deg,#7DD3FC,#3B82F6)", selectedText:"#071625",
    hoverBg:"rgba(125,211,252,0.07)", hoverGlow:"inset 0 0 28px rgba(125,211,252,0.08)",
    circle:"#071625", circleBorder:"rgba(125,211,252,0.35)",
    pulseGlow:"0 0 0 5px rgba(125,211,252,0.14),0 0 18px rgba(125,211,252,0.07)",
    timerRing:"#7DD3FC", progressRing:"#7DD3FC",
    header:{bg:"linear-gradient(180deg,#7DD3FC,#3B82F6)", text:"#071625", meta:"rgba(7,22,37,0.6)"},
  },
  "ocean": {
    canvas:"#081421", quad:"#0B1C2D", gridLine:"rgba(114,212,241,0.1)",
    outerBorder:"rgba(114,212,241,0.45)", outerShadow:"0 8px 32px rgba(114,212,241,0.1)",
    text:"#fff", accent:"#72D4F1", gradient:"linear-gradient(180deg,#7DD3FC,#2563EB)",
    reversedGradient:"linear-gradient(180deg,#2563EB,#7DD3FC)",
    selectedBg:"linear-gradient(180deg,#7DD3FC,#2563EB)", selectedText:"#081421",
    hoverBg:"rgba(114,212,241,0.07)", hoverGlow:"inset 0 0 28px rgba(114,212,241,0.08)",
    circle:"#081421", circleBorder:"rgba(114,212,241,0.35)",
    pulseGlow:"0 0 0 5px rgba(114,212,241,0.14),0 0 18px rgba(114,212,241,0.07)",
    timerRing:"#72D4F1", progressRing:"#72D4F1",
    header:{bg:"linear-gradient(180deg,#7DD3FC,#2563EB)", text:"#081421", meta:"rgba(8,20,33,0.6)"},
  },
  "lime-energy": {
    canvas:"#10120B", quad:"#1A1F0E", gridLine:"rgba(248,243,43,0.12)",
    outerBorder:"rgba(248,243,43,0.45)", outerShadow:"0 8px 32px rgba(248,243,43,0.1)",
    text:"#fff", accent:"#F8F32B", gradient:"linear-gradient(180deg,#F8F32B,#A3D92F)",
    reversedGradient:"linear-gradient(180deg,#A3D92F,#F8F32B)",
    selectedBg:"linear-gradient(180deg,#F8F32B,#A3D92F)", selectedText:"#0B1929",
    hoverBg:"rgba(248,243,43,0.07)", hoverGlow:"inset 0 0 28px rgba(248,243,43,0.08)",
    circle:"#10120B", circleBorder:"rgba(248,243,43,0.35)",
    pulseGlow:"0 0 0 5px rgba(248,243,43,0.14),0 0 18px rgba(248,243,43,0.07)",
    timerRing:"#F8F32B", progressRing:"#F8F32B",
    header:{bg:"linear-gradient(180deg,#F8F32B,#A3D92F)", text:"#10120B", meta:"rgba(16,18,11,0.65)"},
  },
  "stadium-green": {
    canvas:"#07150B", quad:"#10210F", gridLine:"rgba(100,221,23,0.12)",
    outerBorder:"rgba(100,221,23,0.45)", outerShadow:"0 8px 32px rgba(100,221,23,0.12)",
    text:"#fff", accent:"#64DD17", gradient:"linear-gradient(180deg,#64DD17,#0B5D1E)",
    reversedGradient:"linear-gradient(180deg,#0B5D1E,#64DD17)",
    selectedBg:"linear-gradient(180deg,#64DD17,#0B5D1E)", selectedText:"#07150B",
    hoverBg:"rgba(100,221,23,0.07)", hoverGlow:"inset 0 0 28px rgba(100,221,23,0.08)",
    circle:"#07150B", circleBorder:"rgba(100,221,23,0.35)",
    pulseGlow:"0 0 0 5px rgba(100,221,23,0.14),0 0 18px rgba(100,221,23,0.07)",
    timerRing:"#64DD17", progressRing:"#64DD17",
    header:{bg:"linear-gradient(180deg,#64DD17,#0B5D1E)", text:"#fff", meta:"rgba(255,255,255,0.65)"},
  },
};

const FALLBACK_THEME = EMBED_THEMES["fanometrix"];

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
  themeId:        string;
  questions:      EmbedQuestion[];
  thankYouTitle:  string;
  thankYouBody:   string;
  isPreview:      boolean;
  // Submit payload — passed from parent EmbedSurvey
  campaignId:     string;
  surveyId:       string | null;
  publisher:      string | null;
  placement:      string | null;
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
}

// ── Answer text formatter ─────────────────────────────────────────────────────
// Inserts a line break so the visual weight of the text leans away from the
// centre circle:  top quadrants → first line longer,  bottom → second line longer.
// Uses character counts (not word counts) so short words like "and" don't skew it.

function formatAnswer(text: string, isTopRow: boolean): string {
  if (text.includes('\n')) return text; // already has explicit breaks — respect them
  const words = text.split(' ');
  if (words.length <= 1) return text;   // single word, nothing to split

  // For exactly 2 words: only split if it creates the right distribution
  if (words.length === 2) {
    const [w1, w2] = words;
    if (isTopRow && w1.length >= w2.length) return `${w1}\n${w2}`;
    if (!isTopRow && w2.length >= w1.length) return `${w1}\n${w2}`;
    return text; // wrong distribution — keep as one line
  }

  // For 3+ words: find the word boundary closest to the target split ratio.
  // Top row wants ~60% of characters on line 1 (longer first line).
  // Bottom row wants ~40% of characters on line 1 (longer second line).
  const target = text.length * (isTopRow ? 0.60 : 0.40);

  for (let i = 0; i < words.length - 1; i++) {
    const line1Len = words.slice(0, i + 2).join(' ').length; // length IF we include next word
    if (line1Len > target) {
      // Adding the next word would exceed the target — split here
      return words.slice(0, i + 1).join(' ') + '\n' + words.slice(i + 1).join(' ');
    }
  }

  // Fallback: split at the middle word
  const mid = Math.ceil(words.length / 2);
  return words.slice(0, mid).join(' ') + '\n' + words.slice(mid).join(' ');
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
      <span style={{
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

// ── Main export ───────────────────────────────────────────────────────────────

export function ThemedSurvey(props: ThemedSurveyProps) {
  const theme = EMBED_THEMES[props.themeId] ?? FALLBACK_THEME;
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

  const containerRef    = useRef<HTMLDivElement>(null);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef    = useRef(false);
  const advancingRef    = useRef(false);
  const startRef        = useRef(Date.now());

  const q = props.questions[step];

  // IntersectionObserver — start timer when in view
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => {
      isVisibleRef.current = e.isIntersecting;
      if (e.isIntersecting && !document.hidden) setIsRunning(true);
      else setIsRunning(false);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const fn = () => { if (document.hidden) setIsRunning(false); else if (isVisibleRef.current) setIsRunning(true); };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
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
        }
        setPhase("thankyou");
      } else {
        const next = step + 1;
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
          onClick={() => {/* privacy handled by outer EmbedSurvey in future */}}
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
