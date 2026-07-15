"use client";

import { useState, useRef, useLayoutEffect } from "react";
import { PrivacyOverlay } from "./PrivacyOverlay";
import type { Theme, SurveyQuestion } from "./themes";
import { DEFAULT_THEME } from "./themes";
import { type TypographyMode, fontQ, fontA } from "./typography";

const GRID_TO_ANSWER = [0, 1, 3, 2];

const DEMO_QUESTIONS: Array<{ text: string; answers: [string, string, string, string] }> = [
  { text: "Why do you watch football?",                   answers: ["Entertainment\n& Escape",  "Friends\n& Family",  "Inspiration\n& Ambition", "Identity &\nCommunity"] },
  { text: "What keeps you coming back to the stadium?",   answers: ["The\nAtmosphere",           "The\nResult",        "Social\nExperience",       "Player\nPerformance"]  },
  { text: "What drives your club loyalty?",               answers: ["Local\nPride",              "Family\nTradition",  "Winning\nCulture",         "Player\nHeritage"]     },
];

const CIRCLE_D = 122;
const CIRCLE_R = 61;

export type SurveyEvent = { variant: "A"; type: string; detail: string };

// ── Progress badge ────────────────────────────────────────────────────────────

function ProgressBadge({ step, total, visible, theme, typography }: {
  step: number; total: number; visible: boolean; theme: Theme; typography: TypographyMode;
}) {
  return (
    <div
      aria-live="polite"
      aria-label={`Question ${step + 1} of ${total}`}
      style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        background: theme.badge.bg,
        border: `1px solid ${theme.badge.border}`,
        borderTop: "none",
        borderRadius: "0 0 6px 6px",
        padding: "4px 18px",
        zIndex: 5, pointerEvents: "none",
        opacity: visible ? 1 : 0, transition: "opacity 0.22s ease",
        lineHeight: 1, whiteSpace: "nowrap",
      }}
    >
      <span style={{
        color: theme.badge.text,
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontFamily: fontA(typography),
      }}>
        {step + 1} OF {total}
      </span>
    </div>
  );
}

// ── Centre circle with auto-scaling question text ─────────────────────────────

function CentreCircle({ text, pulse, visible, theme, typography }: {
  text: string; pulse: boolean; visible: boolean; theme: Theme; typography: TypographyMode;
}) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const MAX_TEXT_H = 70;

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    let size = 24;
    el.style.fontSize = `${size}px`;
    while (el.scrollHeight > MAX_TEXT_H && size > 14) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
  }, [text, typography]);

  return (
    <div
      style={{
        position: "absolute",
        left: 150 - CIRCLE_R, top: 125 - CIRCLE_R,
        width: CIRCLE_D, height: CIRCLE_D,
        borderRadius: "50%",
        background: theme.circle,
        border: `1.5px solid ${theme.circleBorder}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 4, boxSizing: "border-box",
        padding: "12px 14px", textAlign: "center",
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
          fontWeight: typography === "electric" ? 600 : 700,
          fontFamily: fontQ(typography),
          lineHeight: 1.1,
          letterSpacing: typography === "electric" ? "-0.02em" : undefined,
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
  answerText, side, isSelected, isOther, isHovered, visible,
  onSelect, onHover, onLeave, disabled, theme, typography,
}: {
  answerText: string; side: "left" | "right";
  isSelected: boolean; isOther: boolean; isHovered: boolean; visible: boolean;
  onSelect: () => void; onHover: () => void; onLeave: () => void;
  disabled: boolean; theme: Theme; typography: TypographyMode;
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
        display: "flex", alignItems: "center",
        justifyContent: side === "left" ? "flex-start" : "flex-end",
        cursor: disabled ? "default" : "pointer",
        userSelect: "none", position: "relative", overflow: "hidden",
        opacity: isOther ? theme.dimOpacity : 1,
        transform: `scale(${scale})`,
        transition: "background 0.25s ease, opacity 0.25s ease, transform 0.15s ease, box-shadow 0.15s ease",
        boxShadow: isHovered && !isSelected && !isOther ? theme.hoverGlow : "none",
        paddingLeft: side === "left" ? 16 : 0,
        paddingRight: side === "right" ? 16 : 0,
      }}
    >
      <span style={{
        color: textColor,
        fontSize: typography === "electric" ? 14 : 12,
        fontWeight: typography === "electric" ? 500 : 700,
        fontFamily: fontA(typography),
        lineHeight: 1.35,
        textAlign: side,
        whiteSpace: "pre-line",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.22s ease, color 0.22s ease",
        pointerEvents: "none",
      }}>
        {answerText}
      </span>
    </div>
  );
}

// ── Thank you screen ──────────────────────────────────────────────────────────

function ThankYouScreen({ theme, typography }: { theme: Theme; typography: TypographyMode }) {
  const t = theme.thankYou;
  return (
    <div style={{
      position: "absolute", inset: 0, background: t.bg,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      textAlign: "center", padding: "20px 24px", gap: 8, zIndex: 10,
      animation: "tgFadeIn 0.4s ease forwards",
    }}>
      <style>{`@keyframes tgFadeIn{from{opacity:0}to{opacity:1}}`}</style>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: t.checkBg, border: `2px solid ${t.check}`, display: "flex", alignItems: "center", justifyContent: "center", color: t.check, fontSize: 20, fontWeight: 700, flexShrink: 0, marginBottom: 2 }}>
        ✓
      </div>
      <p style={{
        color: t.heading, fontSize: 22, margin: 0, letterSpacing: "-0.02em",
        fontFamily: fontQ(typography),
        fontWeight: typography === "electric" ? 600 : 700,
      }}>
        Thank You
      </p>
      <p style={{ color: t.body, fontSize: 13, margin: 0, lineHeight: 1.55, maxWidth: 210, fontFamily: fontA(typography), fontWeight: 400 }}>
        Your anonymous feedback helps improve the football experience for fans everywhere.
      </p>
      <p style={{ color: t.tagline, fontSize: 11, fontWeight: 500, margin: "2px 0 0", letterSpacing: "0.04em", fontFamily: fontA(typography) }}>
        Fan voice counted.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface VariantAProps {
  theme?: Theme;
  typography?: TypographyMode;
  questions?: SurveyQuestion[];
  simulatedHoverGridIdx?: number | null;
  onEvent?: (e: SurveyEvent) => void;
}

export function VariantA({ theme = DEFAULT_THEME, typography = "system", questions: propQuestions, simulatedHoverGridIdx, onEvent }: VariantAProps) {
  const questions = propQuestions ?? DEMO_QUESTIONS;
  const total = questions.length;
  const [step, setStep] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<"question" | "selecting" | "thankyou">("question");
  const [textVisible, setTextVisible] = useState(true);
  const [centerPulse, setCenterPulse] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const advancingRef = useRef(false);

  const q = DEMO_QUESTIONS[step];
  const effectiveHover =
    simulatedHoverGridIdx !== undefined && simulatedHoverGridIdx !== null
      ? simulatedHoverGridIdx : hoveredIdx;

  function emit(type: string, detail: string) { onEvent?.({ variant: "A", type, detail }); }

  function handleSelect(gridIdx: number) {
    if (advancingRef.current || phase !== "question") return;
    advancingRef.current = true;
    emit("answered", `Q${step + 1} → "${q.answers[GRID_TO_ANSWER[gridIdx]].replace(/\n/g, " ")}"`);
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
      }
      advancingRef.current = false;
    }, 650);
  }

  return (
    <div
      style={{
        width: 300, height: 250,
        background: theme.canvas,
        position: "relative", overflow: "hidden",
        fontFamily: fontA(typography),
        boxSizing: "border-box",
        border: `1px solid ${theme.outerBorder}`,
        borderRadius: 12,
        boxShadow: theme.outerShadow,
      }}
      role="region"
      aria-label="Fan survey, Variant A"
    >
      {showPrivacy && (
        <PrivacyOverlay theme={theme} typography={typography} onClose={() => { setShowPrivacy(false); emit("privacy_close", `Resumed at Q${step + 1}`); }} />
      )}
      {phase === "thankyou" && <ThankYouScreen theme={theme} typography={typography} />}

      <div
        aria-hidden={phase === "thankyou" || showPrivacy}
        style={{
          position: "absolute", inset: 0,
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
            typography={typography}
          />
        ))}
      </div>

      <CentreCircle text={q.text} pulse={centerPulse} visible={textVisible} theme={theme} typography={typography} />

      {phase !== "thankyou" && !showPrivacy && (
        <ProgressBadge step={step} total={total} visible={textVisible} theme={theme} typography={typography} />
      )}

      {!showPrivacy && phase !== "thankyou" && (
        <button
          onClick={() => { setShowPrivacy(true); emit("privacy_open", `On Q${step + 1}`); }}
          aria-label="Privacy information"
          style={{
            position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)",
            background: theme.quad, border: "none", cursor: "pointer",
            color: `${theme.accent}88`, fontSize: 8.5,
            zIndex: 5, padding: "3px 8px", letterSpacing: "0.02em", lineHeight: 1,
            fontFamily: fontA(typography), borderRadius: 4,
          }}
        >
          ⓘ Privacy
        </button>
      )}
    </div>
  );
}
