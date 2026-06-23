"use client";

import { useState, useRef, useEffect } from "react";
import { PrivacyOverlay } from "./PrivacyOverlay";
import type { Theme } from "./themes";
import { DEFAULT_THEME } from "./themes";

// Grid display order [TL, TR, BL, BR] → answer indices [0,1,3,2]
const GRID_TO_ANSWER = [0, 1, 3, 2];

const DEMO_QUESTIONS: Array<{ text: string; answers: [string, string, string, string] }> = [
  {
    text: "Why do you watch football?",
    answers: ["Entertainment\n& Escape", "Friends\n& Family", "Inspiration\n& Ambition", "Identity &\nCommunity"],
  },
  {
    text: "What shapes your match day?",
    answers: ["The\nAtmosphere", "The\nResult", "Social\nExperience", "Player\nPerformance"],
  },
  {
    text: "What drives your club loyalty?",
    answers: ["Local\nPride", "Family\nTradition", "Winning\nCulture", "Player\nHeritage"],
  },
];

// Layout: header 58px + grid 192px (2 × 96px rows)
const HEADER_H = 58;
const ROW_H = 96;
const GRID_CX = 150;
const GRID_CY = HEADER_H + ROW_H; // 154

// Timer circle: 72px diameter
const TIMER_D = 72;
const TIMER_R = 36;

// Timer countdown ring: R=40
const RING_R = 40;
const RING_SVG = (RING_R + 3) * 2; // 86
const RING_CX = RING_SVG / 2;       // 43
const RING_CIRC = 2 * Math.PI * RING_R; // ≈251.3

// Progress ring (completed questions): R=46, thin outer arc
const PROG_R = 46;
const PROG_SVG = (PROG_R + 3) * 2; // 98
const PROG_CX_SVG = PROG_SVG / 2;   // 49
const PROG_CIRC = 2 * Math.PI * PROG_R; // ≈288.9

export type SurveyEvent = {
  variant: "B";
  type: string;
  detail: string;
};

// ── Timer circle ──────────────────────────────────────────────────────────────

function TimerCircle({
  timeLeft,
  isRunning,
  timerExpired,
  centerPulse,
  visible,
  theme,
}: {
  timeLeft: number;
  isRunning: boolean;
  timerExpired: boolean;
  centerPulse: boolean;
  visible: boolean;
  theme: Theme;
}) {
  const visibleLen = RING_CIRC * (timeLeft / 10);
  const ringTransition = isRunning && !timerExpired ? "stroke-dasharray 1s linear" : "none";

  return (
    <>
      <svg
        width={RING_SVG}
        height={RING_SVG}
        viewBox={`0 0 ${RING_SVG} ${RING_SVG}`}
        style={{ position: "absolute", left: GRID_CX - RING_CX, top: GRID_CY - RING_CX, pointerEvents: "none", zIndex: 5 }}
        aria-hidden
      >
        <circle cx={RING_CX} cy={RING_CX} r={RING_R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2.5} />
        <circle
          cx={RING_CX} cy={RING_CX} r={RING_R}
          fill="none"
          stroke={theme.timerRing}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={`${visibleLen} ${RING_CIRC}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${RING_CX} ${RING_CX})`}
          style={{ transition: ringTransition }}
        />
      </svg>

      <div
        style={{
          position: "absolute",
          left: GRID_CX - TIMER_R,
          top: GRID_CY - TIMER_R,
          width: TIMER_D,
          height: TIMER_D,
          borderRadius: "50%",
          background: theme.circle,
          border: `1.5px solid ${theme.circleBorder}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 6,
          boxSizing: "border-box",
          textAlign: "center",
          padding: "4px",
          boxShadow: centerPulse ? theme.pulseGlow : "0 0 0 0px transparent",
          transition: "box-shadow 0.4s ease",
        }}
        aria-label={timerExpired ? "Timer expired" : `${timeLeft} seconds remaining`}
      >
        {!timerExpired ? (
          <>
            <span style={{ color: theme.timerText, fontSize: 20, fontWeight: 700, lineHeight: 1, opacity: visible ? 1 : 0, transition: "opacity 0.22s ease" }}>
              {timeLeft}
            </span>
            <span style={{ color: theme.timerText, fontSize: 6.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1, marginTop: 2, opacity: visible ? 0.4 : 0, transition: "opacity 0.22s ease" }}>
              {timeLeft === 1 ? "SEC" : "SECS"}
            </span>
          </>
        ) : (
          <>
            <style>{`@keyframes qmv2FadeIn{from{opacity:0}to{opacity:1}}`}</style>
            <span style={{ color: theme.text, fontSize: 7, fontWeight: 600, lineHeight: 1.4, opacity: 0.8, textAlign: "center", animation: "qmv2FadeIn 0.25s ease" }}>
              Select an answer
            </span>
          </>
        )}
      </div>
    </>
  );
}

// ── Progress ring (completed questions) ──────────────────────────────────────

function ProgressRing({ completedCount, total, theme }: { completedCount: number; total: number; theme: Theme }) {
  const offset = PROG_CIRC * (1 - completedCount / total);
  return (
    <svg
      width={PROG_SVG}
      height={PROG_SVG}
      viewBox={`0 0 ${PROG_SVG} ${PROG_SVG}`}
      style={{ position: "absolute", left: GRID_CX - PROG_CX_SVG, top: GRID_CY - PROG_CX_SVG, pointerEvents: "none", zIndex: 4 }}
      aria-hidden
    >
      <circle cx={PROG_CX_SVG} cy={PROG_CX_SVG} r={PROG_R} fill="none" stroke={`${theme.progressRing}22`} strokeWidth={1.5} />
      <circle
        cx={PROG_CX_SVG} cy={PROG_CX_SVG} r={PROG_R}
        fill="none"
        stroke={theme.progressRing}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray={`${PROG_CIRC}`}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${PROG_CX_SVG} ${PROG_CX_SVG})`}
        style={{ transition: "stroke-dashoffset 0.4s cubic-bezier(0.4,0,0.2,1)" }}
        opacity={0.65}
      />
    </svg>
  );
}

// ── Question header — themed hero bar ─────────────────────────────────────────

function QuestionHeader({
  text, step, total, visible, theme,
}: {
  text: string; step: number; total: number; visible: boolean; theme: Theme;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: HEADER_H,
        background: theme.header.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 16px",
        boxSizing: "border-box",
        zIndex: 2,
        textAlign: "center",
        gap: 3,
      }}
    >
      <span
        aria-live="polite"
        style={{
          color: theme.header.meta,
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.22s ease",
          lineHeight: 1,
        }}
      >
        {step + 1} OF {total}
      </span>
      <p
        aria-live="polite"
        style={{
          color: theme.header.text,
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.3,
          margin: 0,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.22s ease",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          maxWidth: 256,
        }}
      >
        {text}
      </p>
    </div>
  );
}

// ── Quadrant button ───────────────────────────────────────────────────────────

function Quadrant({
  answerText, side, isSelected, isOther, isHovered, visible,
  onSelect, onHover, onLeave, disabled, theme,
}: {
  answerText: string;
  side: "left" | "right";
  isSelected: boolean;
  isOther: boolean;
  isHovered: boolean;
  visible: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
  disabled: boolean;
  theme: Theme;
}) {
  const bg = isSelected ? theme.selectedBg : isHovered ? theme.hoverBg : theme.quad;
  const textColor = isSelected ? theme.selectedText : theme.text;
  const scale = isHovered && !isSelected && !isOther ? 1.025 : 1;

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={answerText.replace(/\n/g, " ")}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(e) => !disabled && (e.key === "Enter" || e.key === " ") && onSelect()}
      onMouseEnter={disabled ? undefined : onHover}
      onMouseLeave={disabled ? undefined : onLeave}
      style={{
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: side === "left" ? "flex-start" : "flex-end",
        cursor: disabled ? "default" : "pointer",
        userSelect: "none",
        position: "relative",
        overflow: "hidden",
        opacity: isOther ? theme.dimOpacity : 1,
        transform: `scale(${scale})`,
        transition: "background 0.25s ease, opacity 0.25s ease, transform 0.15s ease, box-shadow 0.15s ease",
        boxShadow: isHovered && !isSelected && !isOther ? theme.hoverGlow : "none",
        paddingLeft: side === "left" ? 12 : 0,
        paddingRight: side === "right" ? 12 : 0,
      }}
    >
      <span
        style={{
          color: textColor,
          fontSize: 11.5,
          fontWeight: 700,
          lineHeight: 1.35,
          textAlign: side,
          whiteSpace: "pre-line",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.22s ease, color 0.22s ease",
          pointerEvents: "none",
        }}
      >
        {answerText}
      </span>
    </div>
  );
}

// ── Thank you screen ──────────────────────────────────────────────────────────

function ThankYouScreen({ theme }: { theme: Theme }) {
  const t = theme.thankYou;
  return (
    <div
      style={{
        position: "absolute", inset: 0,
        background: t.bg,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        textAlign: "center", padding: "20px 24px", gap: 10, zIndex: 10,
        animation: "qmv2FadeIn 0.4s ease forwards",
      }}
    >
      <style>{`@keyframes qmv2FadeIn{from{opacity:0}to{opacity:1}}`}</style>
      <div style={{ width: 46, height: 46, borderRadius: "50%", background: t.checkBg, border: `2px solid ${t.check}`, display: "flex", alignItems: "center", justifyContent: "center", color: t.check, fontSize: 20, fontWeight: 700, flexShrink: 0, marginBottom: 2 }}>
        ✓
      </div>
      <p style={{ color: t.heading, fontSize: 16, fontWeight: 700, margin: 0 }}>Thank You</p>
      <p style={{ color: t.body, fontSize: 10, margin: 0, lineHeight: 1.55, maxWidth: 210 }}>
        Your anonymous feedback helps improve the football experience for fans everywhere.
      </p>
      <p style={{ color: t.tagline, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", margin: "4px 0 0", textTransform: "uppercase" }}>
        Fan voice counted
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface VariantBProps {
  theme?: Theme;
  simulatedHoverGridIdx?: number | null;
  forceExpire?: number;
  onEvent?: (e: SurveyEvent) => void;
}

export function VariantB({
  theme = DEFAULT_THEME,
  simulatedHoverGridIdx,
  forceExpire,
  onEvent,
}: VariantBProps) {
  const questions = DEMO_QUESTIONS;
  const total = questions.length;

  // Survey state
  const [step, setStep] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<"question" | "selecting" | "thankyou">("question");
  const [textVisible, setTextVisible] = useState(true);
  const [centerPulse, setCenterPulse] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const advancingRef = useRef(false);

  // Timer state
  const [timeLeft, setTimeLeft] = useState(10);
  const [isRunning, setIsRunning] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const [savedTimeLeft, setSavedTimeLeft] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredPulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(false);

  const q = questions[step];
  const effectiveHover =
    simulatedHoverGridIdx !== undefined && simulatedHoverGridIdx !== null
      ? simulatedHoverGridIdx : hoveredIdx;

  function emit(type: string, detail: string) {
    onEvent?.({ variant: "B", type, detail });
    console.log(`[Quadrant B] ${type}: ${detail}`);
  }

  // ── IntersectionObserver ───────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting && !document.hidden) { setIsRunning(true); emit("timer", "Started — entered viewport"); }
      else { setIsRunning(false); emit("timer", "Paused — left viewport"); }
    }, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Page Visibility API ────────────────────────────────────────────────────
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) { setIsRunning(false); emit("timer", "Paused — tab hidden"); }
      else if (isVisibleRef.current) { setIsRunning(true); emit("timer", "Resumed — tab visible"); }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Countdown interval ─────────────────────────────────────────────────────
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isRunning || phase !== "question" || timerExpired) return;
    intervalRef.current = setInterval(() => { setTimeLeft((t) => (t <= 1 ? 0 : t - 1)); }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, phase, timerExpired]);

  // ── Timer expiry — gentle pulse, do NOT auto-advance ─────────────────────
  useEffect(() => {
    if (timeLeft !== 0 || timerExpired || phase !== "question") return;
    setIsRunning(false);
    setTimerExpired(true);
    emit("timer", "Expired — waiting for user selection");

    expiredPulseRef.current = setInterval(() => {
      setCenterPulse(true);
      setTimeout(() => setCenterPulse(false), 350);
    }, 2700);

    return () => {
      if (expiredPulseRef.current) clearInterval(expiredPulseRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase, timerExpired]);

  // ── Force expire from testing panel ───────────────────────────────────────
  useEffect(() => {
    if (!forceExpire || phase !== "question" || timerExpired) return;
    emit("timer", "Force expired via testing panel");
    setTimeLeft(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceExpire]);

  // ── Answer selection ───────────────────────────────────────────────────────
  function handleSelect(gridIdx: number) {
    if (advancingRef.current || phase !== "question") return;
    advancingRef.current = true;

    // Clear expired state
    setTimerExpired(false);
    setCenterPulse(false);
    if (expiredPulseRef.current) clearInterval(expiredPulseRef.current);
    setIsRunning(false);

    const answerText = q.answers[GRID_TO_ANSWER[gridIdx]].replace(/\n/g, " ");
    emit("answered", `Q${step + 1} → "${answerText}"`);

    setSelectedIdx(gridIdx);
    setPhase("selecting");
    setCenterPulse(true);
    setTimeout(() => setCenterPulse(false), 220);

    setTimeout(() => {
      setCompletedCount((c) => { const n = c + 1; emit("progress", `${n}/${total} complete`); return n; });
    }, 250);

    setTimeout(() => setTextVisible(false), 350);

    setTimeout(() => {
      if (step + 1 >= total) {
        setPhase("thankyou");
        emit("complete", "Survey complete");
      } else {
        const next = step + 1;
        setStep(next);
        setSelectedIdx(null);
        setHoveredIdx(null);
        setPhase("question");
        setTimeLeft(10);
        setTimeout(() => {
          setTextVisible(true);
          if (isVisibleRef.current && !document.hidden) setIsRunning(true);
        }, 40);
        emit("question_loaded", `Q${next + 1} of ${total}`);
        emit("timer", "Reset to 10s for next question");
      }
      advancingRef.current = false;
    }, 650);
  }

  function openPrivacy() {
    setSavedTimeLeft(timerExpired ? 0 : timeLeft);
    setIsRunning(false);
    if (expiredPulseRef.current) clearInterval(expiredPulseRef.current);
    setShowPrivacy(true);
    emit("privacy_open", `On Q${step + 1}, timer at ${timeLeft}s`);
  }

  function closePrivacy() {
    setShowPrivacy(false);
    if (savedTimeLeft !== null && savedTimeLeft > 0) {
      setTimeLeft(savedTimeLeft);
      if (isVisibleRef.current && !document.hidden && phase === "question") setIsRunning(true);
    } else if (savedTimeLeft === 0 && timerExpired) {
      expiredPulseRef.current = setInterval(() => {
        setCenterPulse(true);
        setTimeout(() => setCenterPulse(false), 350);
      }, 2700);
    }
    setSavedTimeLeft(null);
    emit("privacy_close", `Resumed at Q${step + 1}`);
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: 300,
        height: 250,
        background: theme.canvas,
        position: "relative",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        boxSizing: "border-box",
      }}
      role="region"
      aria-label="Fan survey — Variant B"
    >
      {showPrivacy && <PrivacyOverlay theme={theme} onClose={closePrivacy} />}
      {phase === "thankyou" && <ThankYouScreen theme={theme} />}

      <QuestionHeader
        text={q.text} step={step} total={total}
        visible={textVisible && phase !== "thankyou" && !showPrivacy}
        theme={theme}
      />

      {/* 2×2 quadrant grid */}
      <div
        aria-hidden={phase === "thankyou" || showPrivacy}
        style={{
          position: "absolute",
          top: HEADER_H, left: 0, right: 0,
          height: 250 - HEADER_H,
          display: "grid",
          gridTemplateColumns: "150px 150px",
          gridTemplateRows: `${ROW_H}px ${ROW_H}px`,
          gap: 1,
          background: theme.gridLine,
        }}
      >
        {[0, 1, 2, 3].map((gridIdx) => (
          <Quadrant
            key={gridIdx}
            answerText={q.answers[GRID_TO_ANSWER[gridIdx]]}
            side={gridIdx % 2 === 0 ? "left" : "right"}
            isSelected={selectedIdx === gridIdx}
            isOther={selectedIdx !== null && selectedIdx !== gridIdx}
            isHovered={effectiveHover === gridIdx && phase === "question"}
            visible={textVisible}
            onSelect={() => handleSelect(gridIdx)}
            onHover={() => phase === "question" && setHoveredIdx(gridIdx)}
            onLeave={() => setHoveredIdx(null)}
            disabled={phase !== "question"}
            theme={theme}
          />
        ))}
      </div>

      {phase !== "thankyou" && !showPrivacy && (
        <ProgressRing completedCount={completedCount} total={total} theme={theme} />
      )}

      {phase !== "thankyou" && !showPrivacy && (
        <TimerCircle
          timeLeft={timeLeft} isRunning={isRunning}
          timerExpired={timerExpired}
          centerPulse={centerPulse} visible={textVisible}
          theme={theme}
        />
      )}

      {!showPrivacy && phase !== "thankyou" && (
        <button
          onClick={openPrivacy}
          aria-label="Privacy information"
          style={{
            position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)",
            background: theme.quad, border: "none", cursor: "pointer",
            color: theme.privacyLink, fontSize: 8.5,
            zIndex: 7, padding: "3px 8px", letterSpacing: "0.02em", lineHeight: 1,
            borderRadius: 4,
          }}
        >
          ⓘ Privacy
        </button>
      )}
    </div>
  );
}
