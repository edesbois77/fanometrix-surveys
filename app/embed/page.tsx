"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const QUESTIONS = [
  {
    id: "q1",
    text: "How often do you attend live events?",
    options: ["Never", "1-2 times a year", "3-5 times a year", "5+ times a year"],
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

const COUNTRY_CODES: Record<string, string> = {
  GB: "United Kingdom", US: "United States", FR: "France", DE: "Germany",
  ES: "Spain", IT: "Italy", BR: "Brazil", AR: "Argentina", AU: "Australia",
  JP: "Japan", NL: "Netherlands", BE: "Belgium", PT: "Portugal", MX: "Mexico",
  ZA: "South Africa", NG: "Nigeria", IN: "India", CA: "Canada",
};

function resolveCountry(val: string): string {
  if (!val) return "";
  return COUNTRY_CODES[val.toUpperCase()] ?? val;
}

function detectDevice(): string {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/edg\//i.test(ua))                    return "Edge";
  if (/opr\//i.test(ua))                    return "Opera";
  if (/chrome|chromium|crios/i.test(ua))    return "Chrome";
  if (/firefox|fxios/i.test(ua))            return "Firefox";
  if (/safari/i.test(ua))                   return "Safari";
  return "Other";
}

// ─── Styles ────────────────────────────────────────────────────────────────

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
    padding: "8px 12px 6px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    flexShrink: 0,
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
    flexShrink: 0,
  },
  step: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: 600,
    flexShrink: 0,
  },
  contextBar: {
    padding: "4px 12px 3px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    flexShrink: 0,
  },
  contextText: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase" as const,
  },
  body: {
    flex: 1,
    padding: "8px 12px 8px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 7,
    minHeight: 0,
  },
  question: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.35,
    margin: 0,
    flexShrink: 0,
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
    transition: "background 0.1s, border-color 0.1s",
    flexShrink: 0,
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
    background: disabled ? "rgba(255,255,255,0.15)" : "#fff",
    color: disabled ? "rgba(255,255,255,0.35)" : "#312e81",
    border: "none",
    borderRadius: 7,
    padding: "7px 0",
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" as const : "pointer" as const,
    width: "100%",
    letterSpacing: "0.03em",
    flexShrink: 0,
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
  successIcon:  { fontSize: 34, lineHeight: 1 },
  successTitle: { color: "#fff", fontSize: 15, fontWeight: 700, margin: 0 },
  successSub:   { color: "rgba(255,255,255,0.6)", fontSize: 11, margin: 0, lineHeight: 1.4 },
  poweredBy:    { color: "rgba(255,255,255,0.28)", fontSize: 9, marginTop: 4, letterSpacing: "0.05em" },
  privacyLink:  { color: "rgba(255,255,255,0.22)", fontSize: 8, marginTop: 2, textDecoration: "underline" as const, cursor: "pointer" as const },
};

// ─── Survey component ───────────────────────────────────────────────────────

function EmbedSurvey() {
  const params = useSearchParams();

  // URL parameters — all optional except campaign
  const campaign      = params.get("campaign")    ?? "default";
  const surveyId      = params.get("survey")      ?? null;
  const questionSetId = params.get("qset")        ?? null;
  const publisher     = params.get("publisher")   ?? null;
  const placement     = params.get("placement")   ?? null;
  const club          = params.get("club")        ?? null;
  const competition   = params.get("competition") ?? null;
  const country       = resolveCountry(params.get("country") ?? "");
  const segment       = params.get("segment")     ?? null;

  // Auto-collected
  const [device,  setDevice]  = useState<string | null>(null);
  const [browser, setBrowser] = useState<string | null>(null);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    setDevice(detectDevice());
    setBrowser(detectBrowser());
    startRef.current = Date.now();
  }, []);

  const [step,    setStep]    = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status,  setStatus]  = useState<"idle" | "submitting" | "success" | "error">("idle");

  const q        = QUESTIONS[step];
  const selected = answers[q?.id ?? ""];
  const isLast   = step === QUESTIONS.length - 1;

  // Context bar — show if club or competition was passed
  const context = [club, competition].filter(Boolean).join(" · ");

  async function handleNext() {
    if (!selected) return;
    if (!isLast) { setStep((s) => s + 1); return; }

    setStatus("submitting");
    const duration = Math.round((Date.now() - startRef.current) / 1000);

    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id:               campaign,
        survey_id:                 surveyId,
        question_set_id:           questionSetId,
        publisher,
        placement,
        club,
        competition,
        q1:                        answers.q1 ?? null,
        q2:                        answers.q2 ?? null,
        q3:                        answers.q3 ?? null,
        country:                   country  || null,
        fan_segment:               segment,
        device,
        browser,
        response_duration_seconds: duration,
      }),
    });
    setStatus(res.ok ? "success" : "error");
  }

  if (status === "success") {
    return (
      <div style={S.successWrap}>
        <div style={S.successIcon}>🎉</div>
        <p style={S.successTitle}>Thank you!</p>
        <p style={S.successSub}>
          Your feedback has been recorded and will help improve the fan experience.
        </p>
        <p style={S.poweredBy}>POWERED BY FANOMETRIX PULSE</p>
        <a href="https://fanometrix-surveys.vercel.app/privacy" target="_blank" rel="noopener" style={S.privacyLink}>ⓘ Privacy</a>
      </div>
    );
  }

  return (
    <div style={S.wrap}>

      {/* Header */}
      <div style={S.header}>
        <div style={S.logo}>
          <span style={S.dot} />
          Fanometrix
        </div>
        <span style={S.step}>{step + 1} of {QUESTIONS.length}</span>
      </div>

      {/* Context bar — only rendered if club/competition passed */}
      {context && (
        <div style={S.contextBar}>
          <span style={S.contextText}>{context}</span>
        </div>
      )}

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
          <p style={{ color: "#fca5a5", fontSize: 9, margin: 0, flexShrink: 0 }}>
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
