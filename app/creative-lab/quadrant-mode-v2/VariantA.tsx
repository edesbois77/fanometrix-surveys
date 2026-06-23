"use client";

import { useState, useRef, useLayoutEffect } from "react";
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

// Centre circle: 122px diameter
const CIRCLE_D = 122;
const CIRCLE_R = 61;

export type SurveyEvent = {
  variant: "A";
  type: string;
  detail: string;
};

// ── Progress badge ─────────────────────────────────────────────────────────────
//
//  ───────┌──────────┐───────
//         │  1 OF 3  │
//  ───────└──────────┘───────

function ProgressBadge({
  step,
  total,
  visible,
  theme,
}: {
  step: number;
  total: number;
  visible: boolean;
  theme: Theme;
}) {
  return (
    <div
      aria-live="polite"
      aria-label={`Question ${step + 1} of ${total}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 22,
        display: "flex",
        alignItems: "center",
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      <div style={{ flex: 1, height: 1, background: theme.badge.line, opacity: visible ? 1 : 0, transition: "opacity 0.22s ease" }} />
      <div
        style={{
          background: theme.badge.bg,
          border: `1px solid ${theme.outerBorder}`,
          padding: "4px 14px",
          flexShrink: 0,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.22s ease",
          lineHeight: 1,
          margin: "0 6px",
        }}
      >
        <span style={{ color: theme.badge.text, fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          {step + 1} OF {total}
        </span>
      </div>
      <div style={{ flex: 1, height: 1, background: theme.badge.line, opacity: visible ? 1 : 0, transition: "opacity 0.22s ease" }} />
    </div>
  );
}

// ── Centre circle with auto-scaling question text ─────────────────────────────

function CentreCircle({
  text,
  pulse,
  visible,
  theme,
}: {
  text: string;
  pulse: boolean;
  visible: boolean;
  theme: Theme;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const MAX_TEXT_H = 70;

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    let size = 24;
    el.style.fontSize = `${size}px`;
    while (el.scrollHeight > MAX_TEXT_H && size > 18) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [text]);

  return (
    <div
      style={{
        position: "absolute",
        left: 150 - CIRCLE_R,
        top: 125 - CIRCLE_R,
        width: CIRCLE_D,
        height: CIRCLE_D,
        borderRadius: "50%",
        background: theme.circle,
        border: `1.5px solid ${theme.circleBorder}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 4,
        boxSizing: "border-box",
        padding: "12px 14px",
        textAlign: "center",
        boxShadow: pulse ? theme.pulseGlow : "0 0 0 0px transparent",
        transition: "box-shadow 0.35s ease",
      }}
    >
      <p
        ref={textRef}
        aria-live="polite"
        style={{
          color: theme.text,
          fontSize: 24,
          fontWeight: 700,
          lineHeight: 1.1,
          margin: 0,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.22s ease",
          overflow: "hidden",
          width: "100%",
        }}
      >
        {text}
      </p>
    </div>
  );
}

// ── Quadrant button ───────────────────────────────────────────────────────────

function Quadrant({
  answerText,
  side,
  isSelected,
  isOther,
  isHovered,
  visible,
  onSelect,
  onHover,
  onLeave,
  disabled,
  theme,
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
          fontSize: 12,
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
        position: "absolute",
        inset: 0,
        background: t.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "20px 24px",
        gap: 10,
        zIndex: 10,
        animation: "qmv2FadeIn 0.4s ease forwards",
      }}
    >
      <style>{`@keyframes qmv2FadeIn{from{opacity:0}to{opacity:1}}`}</style>
      <div
        style={{
          width: 46, height: 46,
          borderRadius: "50%",
          background: t.checkBg,
          border: `2px solid ${t.check}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: t.check, fontSize: 20, fontWeight: 700,
          flexShrink: 0, marginBottom: 2,
        }}
      >
        ✓
      </div>
      <p style={{ color: t.heading, fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
        Thank You
      </p>
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

export interface VariantAProps {
  theme?: Theme;
  simulatedHoverGridIdx?: number | null;
  onEvent?: (e: SurveyEvent) => void;
}

export function VariantA({ theme = DEFAULT_THEME, simulatedHoverGridIdx, onEvent }: VariantAProps) {
  const questions = DEMO_QUESTIONS;
  const total = questions.length;

  const [step, setStep] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<"question" | "selecting" | "thankyou">("question");
  const [textVisible, setTextVisible] = useState(true);
  const [centerPulse, setCenterPulse] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const advancingRef = useRef(false);

  const q = questions[step];

  const effectiveHover =
    simulatedHoverGridIdx !== undefined && simulatedHoverGridIdx !== null
      ? simulatedHoverGridIdx
      : hoveredIdx;

  function emit(type: string, detail: string) {
    onEvent?.({ variant: "A", type, detail });
    console.log(`[Quadrant A] ${type}: ${detail}`);
  }

  function handleSelect(gridIdx: number) {
    if (advancingRef.current || phase !== "question") return;
    advancingRef.current = true;

    const answerText = q.answers[GRID_TO_ANSWER[gridIdx]].replace(/\n/g, " ");
    emit("answered", `Q${step + 1} → "${answerText}"`);

    setSelectedIdx(gridIdx);
    setPhase("selecting");
    setCenterPulse(true);
    setTimeout(() => setCenterPulse(false), 220);
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
        setTimeout(() => setTextVisible(true), 40);
        emit("question_loaded", `Q${next + 1} of ${total}`);
        emit("progress", `${next}/${total} complete`);
      }
      advancingRef.current = false;
    }, 650);
  }

  return (
    <div
      style={{
        width: 300,
        height: 250,
        background: theme.canvas,
        position: "relative",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        boxSizing: "border-box",
        border: `1px solid ${theme.outerBorder}`,
        borderRadius: 12,
        boxShadow: theme.outerShadow,
      }}
      role="region"
      aria-label="Fan survey — Variant A"
    >
      {showPrivacy && (
        <PrivacyOverlay
          theme={theme}
          onClose={() => {
            setShowPrivacy(false);
            emit("privacy_close", `Resumed at Q${step + 1}`);
          }}
        />
      )}

      {phase === "thankyou" && <ThankYouScreen theme={theme} />}

      {/* 2×2 quadrant grid — 1px gap creates themed grid lines */}
      <div
        aria-hidden={phase === "thankyou" || showPrivacy}
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "150px 150px",
          gridTemplateRows: "125px 125px",
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

      <CentreCircle text={q.text} pulse={centerPulse} visible={textVisible} theme={theme} />

      {phase !== "thankyou" && !showPrivacy && (
        <ProgressBadge step={step} total={total} visible={textVisible} theme={theme} />
      )}

      {!showPrivacy && phase !== "thankyou" && (
        <button
          onClick={() => { setShowPrivacy(true); emit("privacy_open", `On Q${step + 1}`); }}
          aria-label="Privacy information"
          style={{
            position: "absolute",
            bottom: 5,
            left: "50%",
            transform: "translateX(-50%)",
            background: theme.quad,
            border: "none",
            cursor: "pointer",
            color: theme.privacyLink,
            fontSize: 8.5,
            zIndex: 5,
            padding: "3px 8px",
            letterSpacing: "0.02em",
            lineHeight: 1,
            borderRadius: 4,
          }}
        >
          ⓘ Privacy
        </button>
      )}
    </div>
  );
}
