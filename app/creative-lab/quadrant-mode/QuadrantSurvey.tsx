"use client";

import { useState, useRef } from "react";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";

// Grid display order: [TL=0, TR=1, BL=2, BR=3]
// Maps to answer array: Answer1=TL, Answer2=TR, Answer3=BR, Answer4=BL
const GRID_TO_ANSWER = [0, 1, 3, 2];

export interface QMQuestion {
  text: string;
  answers: [string, string, string, string];
}

const DEFAULT_QUESTIONS: QMQuestion[] = [
  {
    text: "Why do you watch football?",
    answers: [
      "Entertainment\n& Escape",
      "Friends\n& Family",
      "Inspiration\n& Ambition",
      "Identity &\nCommunity",
    ],
  },
  {
    text: "What shapes your match day?",
    answers: [
      "The\nAtmosphere",
      "The Result",
      "Social\nExperience",
      "Player\nPerformance",
    ],
  },
  {
    text: "What drives your club loyalty?",
    answers: [
      "Local\nPride",
      "Family\nTradition",
      "Winning\nCulture",
      "Player\nHeritage",
    ],
  },
];

// ── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({ step, total }: { step: number; total: number }) {
  const R = 50;
  const cx = 54;
  const cy = 54;
  const circ = 2 * Math.PI * R;
  const progress = (step + 1) / total;
  const offset = circ * (1 - progress);

  return (
    <svg
      width={108}
      height={108}
      viewBox="0 0 108 108"
      style={{
        position: "absolute",
        left: 150 - 54,
        top: 125 - 54,
        pointerEvents: "none",
        zIndex: 3,
      }}
      aria-hidden
    >
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke="rgba(215,184,122,0.18)"
        strokeWidth={2.5}
      />
      <circle
        cx={cx} cy={cy} r={R}
        fill="none"
        stroke={GOLD}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={`${circ}`}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }}
      />
    </svg>
  );
}

// ── Centre circle ─────────────────────────────────────────────────────────────

function CentreCircle({
  text,
  step,
  total,
  pulse,
  textVisible,
}: {
  text: string;
  step: number;
  total: number;
  pulse: boolean;
  textVisible: boolean;
}) {
  return (
    <div
      aria-live="polite"
      style={{
        position: "absolute",
        left: 150 - 45,
        top: 125 - 45,
        width: 90,
        height: 90,
        borderRadius: "50%",
        background: NAVY,
        border: `1.5px solid rgba(215,184,122,0.35)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 4,
        boxSizing: "border-box",
        padding: "8px 7px",
        textAlign: "center",
        boxShadow: pulse
          ? `0 0 0 5px rgba(215,184,122,0.22), 0 0 20px rgba(215,184,122,0.14)`
          : `0 0 0 0px rgba(215,184,122,0)`,
        transition: "box-shadow 0.35s ease",
      }}
    >
      <p
        style={{
          color: "#fff",
          fontSize: 7.5,
          fontWeight: 700,
          lineHeight: 1.3,
          margin: 0,
          marginBottom: 4,
          opacity: textVisible ? 1 : 0,
          transition: "opacity 0.22s ease",
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {text}
      </p>
      <span
        style={{
          color: GOLD,
          fontSize: 7,
          fontWeight: 600,
          letterSpacing: "0.05em",
          opacity: textVisible ? 1 : 0,
          transition: "opacity 0.22s ease",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {step + 1} / {total}
      </span>
    </div>
  );
}

// ── Individual quadrant ───────────────────────────────────────────────────────

function Quadrant({
  gridIdx,
  answerText,
  isSelected,
  isOther,
  isHovered,
  textVisible,
  onSelect,
  onHover,
  onLeave,
  disabled,
}: {
  gridIdx: number;
  answerText: string;
  isSelected: boolean;
  isOther: boolean;
  isHovered: boolean;
  textVisible: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
  disabled: boolean;
}) {
  const bg = isSelected
    ? GOLD
    : isHovered
    ? `rgba(20, 42, 65, 1)`
    : NAVY;

  const textColor = isSelected ? NAVY : "#fff";
  const scale = isHovered && !isSelected && !isOther ? 1.025 : 1;

  // Aria label uses plain text (strip newlines)
  const label = answerText.replace(/\n/g, " ");

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(e) =>
        !disabled && (e.key === "Enter" || e.key === " ") && onSelect()
      }
      onMouseEnter={disabled ? undefined : onHover}
      onMouseLeave={disabled ? undefined : onLeave}
      style={{
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        userSelect: "none",
        position: "relative",
        overflow: "hidden",
        opacity: isOther ? 0.62 : 1,
        transform: `scale(${scale})`,
        transition:
          "background 0.22s ease, opacity 0.25s ease, transform 0.14s ease, box-shadow 0.14s ease",
        boxShadow:
          isHovered && !isSelected && !isOther
            ? `inset 0 0 24px rgba(215,184,122,0.07)`
            : "none",
      }}
    >
      <span
        style={{
          color: textColor,
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1.3,
          textAlign: "center",
          whiteSpace: "pre-line",
          opacity: textVisible ? 1 : 0,
          transition: "opacity 0.22s ease, color 0.22s ease",
          padding: "0 10px",
          maxWidth: 120,
          pointerEvents: "none",
        }}
      >
        {answerText}
      </span>
    </div>
  );
}

// ── Privacy screen ────────────────────────────────────────────────────────────

function PrivacyScreen({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Privacy information"
      style={{
        position: "absolute",
        inset: 0,
        background: NAVY,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        border: `1px solid rgba(215,184,122,0.2)`,
        animation: "qmFadeIn 0.2s ease",
      }}
    >
      <style>{`@keyframes qmFadeIn{from{opacity:0}to{opacity:1}}`}</style>

      {/* Header */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          borderBottom: `1px solid rgba(215,184,122,0.15)`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: GOLD,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          Privacy
        </span>
        <button
          onClick={onClose}
          aria-label="Close privacy"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.55)",
            fontSize: 15,
            padding: "4px 6px",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          padding: "14px 16px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 9,
          overflow: "hidden",
        }}
      >
        <p
          style={{
            color: "#fff",
            fontSize: 10.5,
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          Anonymous survey responses only.
        </p>
        {[
          "No personal information is collected.",
          "No email addresses are collected.",
          "No cookies are required.",
          "Responses are aggregated and used solely for football fan insights.",
        ].map((line) => (
          <p
            key={line}
            style={{
              color: "rgba(255,255,255,0.68)",
              fontSize: 9.5,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {line}
          </p>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 14px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 7,
          flexShrink: 0,
          borderTop: `1px solid rgba(215,184,122,0.12)`,
        }}
      >
        <a
          href="/en/privacy"
          target="_blank"
          rel="noopener"
          style={{
            display: "block",
            textAlign: "center",
            background: "rgba(215,184,122,0.1)",
            border: `1px solid rgba(215,184,122,0.35)`,
            color: GOLD,
            fontSize: 9.5,
            fontWeight: 700,
            padding: "7px",
            borderRadius: 6,
            textDecoration: "none",
            letterSpacing: "0.03em",
          }}
        >
          Read Full Privacy Policy →
        </a>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.4)",
            fontSize: 9,
            letterSpacing: "0.02em",
            padding: "2px",
            textAlign: "center",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Thank you screen ──────────────────────────────────────────────────────────

function ThankYouScreen() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: NAVY,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "20px 24px",
        gap: 10,
        zIndex: 10,
        animation: "qmFadeIn 0.4s ease forwards",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: "50%",
          background: `rgba(215,184,122,0.12)`,
          border: `2px solid ${GOLD}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: GOLD,
          fontSize: 20,
          fontWeight: 700,
          flexShrink: 0,
          marginBottom: 2,
        }}
      >
        ✓
      </div>
      <p
        style={{
          color: "#fff",
          fontSize: 16,
          fontWeight: 700,
          margin: 0,
          letterSpacing: "-0.01em",
        }}
      >
        Thank You
      </p>
      <p
        style={{
          color: "rgba(255,255,255,0.65)",
          fontSize: 10,
          margin: 0,
          lineHeight: 1.55,
          maxWidth: 210,
        }}
      >
        Your anonymous feedback helps improve the football experience for fans
        everywhere.
      </p>
      <p
        style={{
          color: GOLD,
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: "0.1em",
          margin: "4px 0 0",
          textTransform: "uppercase",
        }}
      >
        Fan voice counted
      </p>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function QuadrantSurvey({
  questions = DEFAULT_QUESTIONS,
}: {
  questions?: QMQuestion[];
}) {
  const [step, setStep] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<"question" | "selecting" | "thankyou">(
    "question"
  );
  const [textVisible, setTextVisible] = useState(true);
  const [centerPulse, setCenterPulse] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const advancingRef = useRef(false);

  const q = questions[step];
  const total = questions.length;
  const isLast = step === total - 1;

  function handleSelect(gridIdx: number) {
    if (advancingRef.current || phase !== "question") return;
    advancingRef.current = true;

    setSelectedIdx(gridIdx);
    setPhase("selecting");
    setCenterPulse(true);

    setTimeout(() => setCenterPulse(false), 200);

    // Fade out text at 350ms
    setTimeout(() => setTextVisible(false), 350);

    // Advance at 650ms
    setTimeout(() => {
      if (isLast) {
        setPhase("thankyou");
      } else {
        setStep((s) => s + 1);
        setSelectedIdx(null);
        setHoveredIdx(null);
        setPhase("question");
        // Brief delay lets React flush new question text before fading in
        setTimeout(() => setTextVisible(true), 40);
      }
      advancingRef.current = false;
    }, 650);
  }

  return (
    <div
      style={{
        width: 300,
        height: 250,
        background: NAVY,
        position: "relative",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        boxSizing: "border-box",
      }}
      role="region"
      aria-label="Fan survey"
    >
      {/* Overlays */}
      {showPrivacy && (
        <PrivacyScreen onClose={() => setShowPrivacy(false)} />
      )}
      {phase === "thankyou" && <ThankYouScreen />}

      {/* 2×2 quadrant grid — gap creates the gold grid lines */}
      <div
        aria-hidden={phase === "thankyou" || showPrivacy}
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns: "150px 150px",
          gridTemplateRows: "125px 125px",
          gap: 1,
          background: "rgba(215,184,122,0.13)",
        }}
      >
        {[0, 1, 2, 3].map((gridIdx) => (
          <Quadrant
            key={gridIdx}
            gridIdx={gridIdx}
            answerText={q.answers[GRID_TO_ANSWER[gridIdx]]}
            isSelected={selectedIdx === gridIdx}
            isOther={selectedIdx !== null && selectedIdx !== gridIdx}
            isHovered={hoveredIdx === gridIdx && phase === "question"}
            textVisible={textVisible}
            onSelect={() => handleSelect(gridIdx)}
            onHover={() => phase === "question" && setHoveredIdx(gridIdx)}
            onLeave={() => setHoveredIdx(null)}
            disabled={phase !== "question"}
          />
        ))}
      </div>

      {/* Ring + circle sit above the grid */}
      <ProgressRing step={step} total={total} />
      <CentreCircle
        text={q.text}
        step={step}
        total={total}
        pulse={centerPulse}
        textVisible={textVisible}
      />

      {/* Privacy trigger */}
      {!showPrivacy && phase !== "thankyou" && (
        <button
          onClick={() => setShowPrivacy(true)}
          aria-label="Privacy information"
          style={{
            position: "absolute",
            bottom: 5,
            right: 7,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: `rgba(215,184,122,0.5)`,
            fontSize: 8.5,
            zIndex: 5,
            padding: "3px 4px",
            letterSpacing: "0.02em",
            lineHeight: 1,
          }}
        >
          ⓘ Privacy
        </button>
      )}
    </div>
  );
}
