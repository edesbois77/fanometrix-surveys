"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const NAVY = "#0B1929";
const GOLD = "#D7B87A";

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

const PRIVACY_SLIDES = [
  {
    title: "About Fanometrix",
    text: "Fanometrix delivers short fan sentiment surveys inside digital media placements on behalf of sports clubs, rights holders, and their media partners.",
    bullets: null as string[] | null,
  },
  {
    title: "What we collect",
    text: null as string | null,
    bullets: [
      "Multiple-choice survey answers only",
      "Country — country level only, via ad server",
      "Device type and browser",
      "Time taken to complete",
      "No names, emails, IPs, or cookies — ever",
    ],
  },
  {
    title: "Your rights",
    text: "We collect no data that can identify you. Responses feed aggregated fan insight reports only — no individual is profiled or targeted. Questions? Email privacy@fanometrix.com",
    bullets: null as string[] | null,
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
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\//i.test(ua)) return "Opera";
  if (/chrome|chromium|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua)) return "Safari";
  return "Other";
}

// ─── Privacy modal ──────────────────────────────────────────────────────────

function PrivacyModal({
  slide,
  onClose,
  onNav,
}: {
  slide: number;
  onClose: () => void;
  onNav: (dir: -1 | 1) => void;
}) {
  const s = PRIVACY_SLIDES[slide];
  const isFirst = slide === 0;
  const isLast  = slide === PRIVACY_SLIDES.length - 1;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Modal header — 40px */}
      <div
        style={{
          height: 40,
          minHeight: 40,
          background: NAVY,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          flexShrink: 0,
          boxSizing: "border-box",
        }}
      >
        <span style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: "0.03em" }}>
          Privacy
        </span>
        <button
          onClick={onClose}
          aria-label="Close privacy"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "rgba(255,255,255,0.7)",
            fontSize: 15,
            lineHeight: 1,
            padding: "3px 4px",
          }}
        >
          ✕
        </button>
      </div>

      {/* Slide content — flex:1 = 174px */}
      <div
        style={{
          flex: 1,
          padding: "10px 14px 6px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 7,
          minHeight: 0,
        }}
      >
        <p style={{ color: NAVY, fontSize: 11.5, fontWeight: 700, margin: 0, flexShrink: 0 }}>
          {s.title}
        </p>

        {s.text && (
          <p style={{ color: "#374151", fontSize: 9.5, lineHeight: 1.5, margin: 0 }}>
            {s.text}
          </p>
        )}

        {s.bullets && (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
            {s.bullets.map((b) => (
              <li key={b} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <span style={{ color: GOLD, fontSize: 8, marginTop: 2, flexShrink: 0 }}>●</span>
                <span style={{ color: "#374151", fontSize: 9.5, lineHeight: 1.4 }}>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Nav footer — 36px */}
      <div
        style={{
          height: 36,
          minHeight: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 8px",
          background: "#F9FAFB",
          borderTop: "1px solid #E5E7EB",
          flexShrink: 0,
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={() => onNav(-1)}
          disabled={isFirst}
          aria-label="Previous slide"
          style={{
            background: "none",
            border: "none",
            cursor: isFirst ? "default" : "pointer",
            color: isFirst ? "#D1D5DB" : NAVY,
            fontSize: 20,
            lineHeight: 1,
            padding: "2px 8px",
            fontWeight: 700,
          }}
        >
          ‹
        </button>

        <span style={{ color: "#6B7280", fontSize: 9.5, fontWeight: 500 }}>
          {slide + 1} of {PRIVACY_SLIDES.length}
        </span>

        <button
          onClick={() => onNav(1)}
          disabled={isLast}
          aria-label="Next slide"
          style={{
            background: "none",
            border: "none",
            cursor: isLast ? "default" : "pointer",
            color: isLast ? "#D1D5DB" : NAVY,
            fontSize: 20,
            lineHeight: 1,
            padding: "2px 8px",
            fontWeight: 700,
          }}
        >
          ›
        </button>
      </div>
    </div>
  );
}

// ─── Shared header ──────────────────────────────────────────────────────────

function AdHeader({ step, total }: { step?: number; total?: number }) {
  return (
    <div
      style={{
        height: 46,
        minHeight: 46,
        background: NAVY,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        flexShrink: 0,
        boxSizing: "border-box",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/Fanometrix_Logo.png"
        alt="Fanometrix"
        style={{ height: 17, objectFit: "contain", objectPosition: "left" }}
      />
      {step !== undefined && total !== undefined && (
        <span style={{ color: GOLD, fontSize: 10, fontWeight: 600, letterSpacing: "0.03em", flexShrink: 0 }}>
          {step} of {total}
        </span>
      )}
    </div>
  );
}

// ─── Main survey component ──────────────────────────────────────────────────

function EmbedSurvey() {
  const params = useSearchParams();

  const campaign      = params.get("campaign")    ?? "default";
  const surveyId      = params.get("survey")      ?? null;
  const questionSetId = params.get("qset")        ?? null;
  const publisher     = params.get("publisher")   ?? null;
  const placement     = params.get("placement")   ?? null;
  const club          = params.get("club")        ?? null;
  const competition   = params.get("competition") ?? null;
  const country       = resolveCountry(params.get("country") ?? "");
  const segment       = params.get("segment")     ?? null;

  const [device,  setDevice]  = useState<string | null>(null);
  const [browser, setBrowser] = useState<string | null>(null);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    setDevice(detectDevice());
    setBrowser(detectBrowser());
    startRef.current = Date.now();
  }, []);

  const [step,        setStep]        = useState(0);
  const [answers,     setAnswers]     = useState<Record<string, string>>({});
  const [status,      setStatus]      = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [advancing,   setAdvancing]   = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [privacySlide, setPrivacySlide] = useState(0);

  const q      = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;

  // Progress percentage: 1-indexed step / total
  const progressPct = status === "success"
    ? 100
    : ((step + 1) / QUESTIONS.length) * 100;

  function openPrivacy() {
    setPrivacySlide(0);
    setShowPrivacy(true);
  }

  function handleSelect(opt: string) {
    if (advancing) return;
    const newAnswers = { ...answers, [q.id]: opt };
    setAnswers(newAnswers);
    setAdvancing(true);

    setTimeout(async () => {
      if (!isLast) {
        setStep((s) => s + 1);
        setAdvancing(false);
        return;
      }

      setStatus("submitting");
      const duration = Math.round((Date.now() - startRef.current) / 1000);
      try {
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
            q1:                        newAnswers.q1 ?? null,
            q2:                        newAnswers.q2 ?? null,
            q3:                        newAnswers.q3 ?? null,
            country:                   country || null,
            fan_segment:               segment,
            device,
            browser,
            response_duration_seconds: duration,
          }),
        });
        setStatus(res.ok ? "success" : "error");
      } catch {
        setStatus("error");
      }
      setAdvancing(false);
    }, 350);
  }

  return (
    /* Outer frame — exactly 300×250, overflow hidden */
    <div
      style={{
        width: 300,
        height: 250,
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* Privacy modal overlays both survey and thank-you states */}
      {showPrivacy && (
        <PrivacyModal
          slide={privacySlide}
          onClose={() => setShowPrivacy(false)}
          onNav={(dir) =>
            setPrivacySlide((s) =>
              Math.max(0, Math.min(PRIVACY_SLIDES.length - 1, s + dir))
            )
          }
        />
      )}

      {status === "success" ? (
        /* ── Thank-you screen ─────────────────────────────────────────── */
        <>
          {/* Header — 46px, no step counter */}
          <AdHeader />

          {/* Progress bar — 100% gold — 3px */}
          <div style={{ height: 3, minHeight: 3, background: `rgba(215,184,122,0.2)`, flexShrink: 0 }}>
            <div style={{ height: "100%", width: "100%", background: GOLD }} />
          </div>

          {/* Body — flex:1, navy background */}
          <div
            style={{
              flex: 1,
              background: NAVY,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px 20px",
              textAlign: "center",
              gap: 8,
              minHeight: 0,
            }}
          >
            <div style={{ fontSize: 30, lineHeight: 1 }}>🎉</div>
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0 }}>Thank you!</p>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 10.5, margin: 0, lineHeight: 1.4 }}>
              Your feedback has been recorded and will help improve the fan experience.
            </p>
          </div>

          {/* Thank-you footer — 22px, centred, #E0E1DD text */}
          <div
            style={{
              height: 22,
              minHeight: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: NAVY,
              flexShrink: 0,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span style={{ color: "rgba(224,225,221,0.45)", fontSize: 8.5, letterSpacing: "0.05em" }}>
              POWERED BY FANOMETRIX
            </span>
            <span
              onClick={openPrivacy}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openPrivacy()}
              style={{
                color: "#E0E1DD",
                fontSize: 8.5,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              ⓘ Privacy
            </span>
          </div>
        </>
      ) : (
        /* ── Survey question screen ───────────────────────────────────── */
        <>
          {/* Header — 46px */}
          <AdHeader step={step + 1} total={QUESTIONS.length} />

          {/* Gold progress bar — 3px */}
          <div style={{ height: 3, minHeight: 3, background: "rgba(215,184,122,0.2)", flexShrink: 0 }}>
            <div
              style={{
                height: "100%",
                width: `${progressPct}%`,
                background: GOLD,
                transition: "width 0.3s ease",
              }}
            />
          </div>

          {/* Body — white, flex:1 = 179px, top-anchored, no gap */}
          <div
            style={{
              flex: 1,
              background: "#fff",
              padding: "10px 12px 0",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            {/* Fixed-height question area — exactly 2 lines (rule 3 & 10) */}
            <div
              style={{
                height: 33,
                minHeight: 33,
                overflow: "hidden",
                flexShrink: 0,
                marginBottom: 8,
              }}
            >
              {status === "error" ? (
                <p style={{ color: "#DC2626", fontSize: 10.5, fontWeight: 600, lineHeight: 1.35, margin: 0 }}>
                  Something went wrong — tap an answer to try again.
                </p>
              ) : (
                <p style={{ color: NAVY, fontSize: 11.5, fontWeight: 700, lineHeight: 1.35, margin: 0 }}>
                  {q.text}
                </p>
              )}
            </div>

            {/* Answer options — top-anchored, no flex:1 (rules 4 & 5) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {q.options.map((opt) => {
                const isSel = answers[q.id] === opt;
                return (
                  <div
                    key={opt}
                    role="radio"
                    aria-checked={isSel}
                    tabIndex={0}
                    onClick={() => handleSelect(opt)}
                    onKeyDown={(e) => e.key === " " && handleSelect(opt)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 10px",
                      borderRadius: 8,
                      background: isSel ? "rgba(215,184,122,0.10)" : "#FAFAFA",
                      boxShadow: isSel
                        ? "0 0 0 1.5px #D7B87A, 0 2px 6px rgba(215,184,122,0.18)"
                        : "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)",
                      cursor: advancing ? "default" : "pointer",
                      flexShrink: 0,
                      boxSizing: "border-box",
                      transition: "box-shadow 0.15s, background 0.15s",
                    }}
                  >
                    {/* Radio icon */}
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        border: `2px solid ${isSel ? GOLD : "#9CA3AF"}`,
                        background: isSel ? GOLD : "transparent",
                        flexShrink: 0,
                        boxSizing: "border-box",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    />
                    <span style={{ color: NAVY, fontSize: 10.5, fontWeight: 500, lineHeight: 1 }}>
                      {opt}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Privacy footer — dedicated band, 22px, top border (rules 6 & 7) */}
          <div
            style={{
              height: 22,
              minHeight: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#F8F9FA",
              flexShrink: 0,
              borderTop: "1.5px solid #E5E7EB",
            }}
          >
            <span
              onClick={openPrivacy}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openPrivacy()}
              style={{
                color: "#6B7280",
                fontSize: 9.5,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              ⓘ Anonymous insights. No personal information collected.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ width: 300, height: 250, background: NAVY }} />}>
      <EmbedSurvey />
    </Suspense>
  );
}
