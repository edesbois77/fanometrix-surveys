"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const QUESTIONS = [
  {
    id: "q1",
    text: "How often do you attend live events?",
    options: ["Never", "1–2 times a year", "3–5 times a year", "5+ times a year"],
  },
  {
    id: "q2",
    text: "Rate your overall fan experience?",
    options: ["Poor", "Average", "Good", "Excellent"],
  },
  {
    id: "q3",
    text: "Likely to recommend us to a friend?",
    options: ["Not likely", "Somewhat likely", "Likely", "Very likely"],
  },
];

const S = {
  wrap: {
    width: 300,
    height: 250,
    overflow: "hidden" as const,
    fontFamily: "system-ui, -apple-system, sans-serif",
    background: "linear-gradient(160deg, #312e81 0%, #1e1b4b 100%)",
    display: "flex",
    flexDirection: "column" as const,
    boxSizing: "border-box" as const,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 12px 7px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
  },
  logo: {
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.02em",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#818cf8",
    display: "inline-block",
  },
  step: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: 600,
  },
  body: {
    flex: 1,
    padding: "10px 12px 8px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  question: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.35,
    minHeight: 32,
  },
  options: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    flex: 1,
  },
  option: (selected: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "5px 9px",
    borderRadius: 6,
    border: `1px solid ${selected ? "rgba(165,180,252,0.8)" : "rgba(255,255,255,0.15)"}`,
    background: selected ? "rgba(99,102,241,0.45)" : "rgba(255,255,255,0.06)",
    cursor: "pointer" as const,
    transition: "all 0.12s",
  }),
  radio: (selected: boolean) => ({
    width: 12,
    height: 12,
    borderRadius: "50%",
    border: `2px solid ${selected ? "#a5b4fc" : "rgba(255,255,255,0.4)"}`,
    background: selected ? "#a5b4fc" : "transparent",
    flexShrink: 0,
    boxSizing: "border-box" as const,
  }),
  optionLabel: {
    color: "#e0e7ff",
    fontSize: 10.5,
    fontWeight: 500,
    lineHeight: 1,
  },
  btn: (disabled: boolean) => ({
    background: disabled ? "rgba(255,255,255,0.2)" : "#fff",
    color: disabled ? "rgba(255,255,255,0.4)" : "#312e81",
    border: "none",
    borderRadius: 7,
    padding: "7px 0",
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" as const : "pointer" as const,
    width: "100%",
    letterSpacing: "0.03em",
    transition: "opacity 0.12s",
  }),
  successWrap: {
    width: 300,
    height: 250,
    overflow: "hidden" as const,
    background: "linear-gradient(160deg, #312e81 0%, #1e1b4b 100%)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "system-ui, -apple-system, sans-serif",
    gap: 8,
    textAlign: "center" as const,
    padding: 20,
    boxSizing: "border-box" as const,
  },
  successIcon: { fontSize: 36, lineHeight: 1 },
  successTitle: { color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 },
  successSub: { color: "rgba(255,255,255,0.6)", fontSize: 11, margin: 0, lineHeight: 1.4 },
  poweredBy: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 9,
    marginTop: 4,
    letterSpacing: "0.04em",
  },
};

function EmbedSurvey() {
  const params = useSearchParams();
  const campaign  = params.get("campaign")  ?? "default";
  const publisher = params.get("publisher") ?? "";
  const placement = params.get("placement") ?? "";
  const country   = params.get("country")   ?? "";
  const segment   = params.get("segment")   ?? "";

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const q = QUESTIONS[step];
  const selected = answers[q?.id ?? ""];
  const isLast = step === QUESTIONS.length - 1;

  async function handleNext() {
    if (!selected) return;
    if (!isLast) { setStep((s) => s + 1); return; }

    setStatus("submitting");
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: campaign,
        publisher:   publisher || null,
        placement:   placement || null,
        q1:          answers.q1 ?? null,
        q2:          answers.q2 ?? null,
        q3:          answers.q3 ?? null,
        country:     country  || null,
        fan_segment: segment  || null,
      }),
    });
    setStatus(res.ok ? "success" : "error");
  }

  if (status === "success") {
    return (
      <div style={S.successWrap}>
        <div style={S.successIcon}>🎉</div>
        <p style={S.successTitle}>Thank you!</p>
        <p style={S.successSub}>Your feedback has been recorded and will help us improve the fan experience.</p>
        <p style={S.poweredBy}>POWERED BY FANOMETRIX PULSE</p>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logo}>
          <span style={S.dot} />
          Fanometrix Pulse
        </div>
        <span style={S.step}>{step + 1} of {QUESTIONS.length}</span>
      </div>

      {/* Body */}
      <div style={S.body}>
        <p style={S.question}>{q.text}</p>

        <div style={S.options}>
          {q.options.map((opt) => {
            const isSelected = selected === opt;
            return (
              <div
                key={opt}
                style={S.option(isSelected)}
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onKeyDown={(e) => e.key === " " && setAnswers((a) => ({ ...a, [q.id]: opt }))}
              >
                <div style={S.radio(isSelected)} />
                <span style={S.optionLabel}>{opt}</span>
              </div>
            );
          })}
        </div>

        {status === "error" && (
          <p style={{ color: "#fca5a5", fontSize: 9, margin: 0 }}>
            Something went wrong. Please try again.
          </p>
        )}

        <button
          style={S.btn(!selected || status === "submitting")}
          onClick={handleNext}
          disabled={!selected || status === "submitting"}
        >
          {status === "submitting" ? "Submitting…" : isLast ? "Submit ✓" : "Next →"}
        </button>
      </div>
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ width: 300, height: 250, background: "#1e1b4b" }} />}>
      <EmbedSurvey />
    </Suspense>
  );
}
