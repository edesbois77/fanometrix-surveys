"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const NAVY = "#071B2F";
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

type Bullet = { text: string; highlight?: boolean };

const PRIVACY_SLIDES: Array<{
  title: string;
  text: string | null;
  bullets: Bullet[] | null;
}> = [
  {
    title: "About Fanometrix",
    text: "Fanometrix runs short anonymous football fan surveys on behalf of clubs, competitions and media partners.",
    bullets: null,
  },
  {
    title: "What we collect",
    text: null,
    bullets: [
      { text: "Multiple-choice survey answers only" },
      { text: "Country, country level only, via ad server" },
      { text: "Device type and browser" },
      { text: "Time taken to complete" },
      { text: "No names, emails, IPs or cookies, ever", highlight: true },
    ],
  },
  {
    // Slide 3 is rendered as a special centred layout — title/text/bullets unused
    title: "",
    text: null,
    bullets: null,
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
// Layout: header 40px + content flex:1 (174px) + nav 36px = 250px

const SUPPORTED_LANGS = new Set(["en","de","fr","es","it","pt","sv","zh","hi"]);
function resolvePrivacyLang(lang: string): string {
  return SUPPORTED_LANGS.has(lang) ? lang : "en";
}

function PrivacyModal({
  slide,
  onClose,
  onNav,
  lang = "en",
}: {
  slide: number;
  onClose: () => void;
  onNav: (dir: -1 | 1) => void;
  lang?: string;
}) {
  const s      = PRIVACY_SLIDES[slide];
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
      {slide === 2 ? (
        /* ── Slide 3: centred redesign ── */
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px 20px",
            textAlign: "center",
            gap: 7,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>🛡️</div>
          <p
            style={{
              color: NAVY,
              fontSize: 10.5,
              fontWeight: 700,
              lineHeight: 1.3,
              margin: 0,
              flexShrink: 0,
            }}
          >
            Your responses cannot identify you
          </p>
          <p style={{ color: "#4B5563", fontSize: 9.5, lineHeight: 1.45, margin: 0 }}>
            Responses are analysed in aggregate and cannot be linked back to individuals.
          </p>
          <p style={{ color: "#6B7280", fontSize: 9, margin: 0, lineHeight: 1.5 }}>
            Questions?{" "}
            <a
              href="mailto:privacy@fanometrix.com"
              style={{ color: GOLD, textDecoration: "none", fontWeight: 600 }}
            >
              privacy@fanometrix.com
            </a>
          </p>
          <a
            href={`/${resolvePrivacyLang(lang)}/privacy`}
            target="_blank"
            rel="noopener"
            style={{
              display: "inline-block",
              marginTop: 2,
              background: NAVY,
              color: GOLD,
              fontSize: 9.5,
              fontWeight: 700,
              padding: "5px 16px",
              borderRadius: 20,
              textDecoration: "none",
              letterSpacing: "0.02em",
            }}
          >
            Privacy Policy →
          </a>
        </div>
      ) : (
        /* ── Slides 1 & 2: standard layout ── */
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
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              {s.bullets.map((b) => (
                <li key={b.text} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span
                    style={{ color: GOLD, fontSize: 8, marginTop: 2, flexShrink: 0 }}
                  >
                    ●
                  </span>
                  <span
                    style={{
                      color: b.highlight ? GOLD : "#374151",
                      fontSize: 9.5,
                      lineHeight: 1.4,
                      fontWeight: b.highlight ? 700 : 400,
                    }}
                  >
                    {b.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
        style={{ height: 15, objectFit: "contain", objectPosition: "left" }}
      />
      {step !== undefined && total !== undefined && (
        <span
          style={{
            color: GOLD,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.03em",
            flexShrink: 0,
          }}
        >
          {step} of {total}
        </span>
      )}
    </div>
  );
}

// ─── Main survey component ──────────────────────────────────────────────────
// Outer frame: 300×250px
// Header: 46px | Progress: 3px | Body: flex:1 (179px) | Footer: 22px

type Question = { id: string; text: string; options: string[] };

function EmbedSurvey() {
  const params = useSearchParams();

  const campaign      = params.get("campaign")    ?? "default";
  const groupSlug     = params.get("group")       ?? null;
  const lang          = params.get("lang")        ?? "en";
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

  // Survey questions — defaults to hardcoded fallback, replaced when a survey is linked
  const [questions,      setQuestions]      = useState<Question[]>(QUESTIONS);
  const [thankYouTitle,  setThankYouTitle]  = useState("Thank you!");
  const [thankYouBody,   setThankYouBody]   = useState("Your anonymous feedback helps improve the football experience for fans everywhere.");
  const [errorMsg,       setErrorMsg]       = useState("Something went wrong — tap an answer to try again.");

  // In group mode the campaign_id comes from the API (so responses link to the
  // specific campaign served, not just the group slug).
  const [resolvedCampaignId, setResolvedCampaignId] = useState<string>(campaign);
  const [groupReady,         setGroupReady]         = useState(!groupSlug);

  useEffect(() => {
    setDevice(detectDevice());
    setBrowser(detectBrowser());
    startRef.current = Date.now();
  }, []);

  // Group mode: resolve which campaign to serve and fetch its questions
  useEffect(() => {
    if (!groupSlug) return;
    fetch(`/api/embed/group?slug=${encodeURIComponent(groupSlug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.campaign_id && data?.questions?.length) {
          setResolvedCampaignId(data.campaign_id);
          setQuestions(data.questions);
          setThankYouTitle(data.thank_you_title ?? thankYouTitle);
          setThankYouBody(data.thank_you_body   ?? thankYouBody);
        }
        // If no eligible campaign, groupReady stays false → blank frame
        setGroupReady(!!data?.campaign_id);
      })
      .catch(() => setGroupReady(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSlug]);

  // Single-campaign mode: fetch survey questions when a survey UUID is provided
  useEffect(() => {
    if (groupSlug || !surveyId) return;
    fetch(`/api/embed/survey?id=${surveyId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.questions?.length) {
          setQuestions(data.questions);
          setThankYouTitle(data.thank_you_title);
          setThankYouBody(data.thank_you_body);
        }
      })
      .catch(() => {/* keep fallback questions */});
  }, [surveyId, groupSlug]);

  const [step,         setStep]         = useState(0);
  const [answers,      setAnswers]      = useState<Record<string, string>>({});
  const [status,       setStatus]       = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [advancing,    setAdvancing]    = useState(false);
  const [showPrivacy,  setShowPrivacy]  = useState(false);
  const [privacySlide, setPrivacySlide] = useState(0);

  const q      = questions[step];
  const isLast = step === questions.length - 1;

  const progressPct = status === "success"
    ? 100
    : ((step + 1) / questions.length) * 100;

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

      // Map answers by question index (not hardcoded q1/q2/q3 keys) so
      // surveys with non-standard question IDs still submit correctly.
      const q1ans = newAnswers[questions[0]?.id] ?? null;
      const q2ans = newAnswers[questions[1]?.id] ?? null;
      const q3ans = newAnswers[questions[2]?.id] ?? null;

      try {
        const res = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaign_id:               resolvedCampaignId,
            survey_id:                 surveyId,
            question_set_id:           questionSetId,
            publisher,
            placement,
            club,
            competition,
            q1:                        q1ans,
            q2:                        q2ans,
            q3:                        q3ans,
            country:                   country || null,
            fan_segment:               segment,
            device,
            browser,
            response_duration_seconds: duration,
          }),
        });
        if (res.ok) {
          setStatus("success");
        } else {
          const json = await res.json().catch(() => ({}));
          const msg = json.error ?? "Something went wrong — tap an answer to try again.";
          console.error("[Fanometrix embed] Submission failed:", res.status, msg);
          setErrorMsg(msg);
          setStatus("error");
        }
      } catch (err) {
        console.error("[Fanometrix embed] Network error:", err);
        setErrorMsg("Network error — please check your connection and try again.");
        setStatus("error");
      }
      setAdvancing(false);
    }, 350);
  }

  // Group mode: don't render until the group API has resolved.
  // If no eligible campaign exists, render transparent (publisher sees nothing).
  if (groupSlug && !groupReady) {
    return <div style={{ width: 300, height: 250, background: "transparent" }} />;
  }

  return (
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
      {showPrivacy && (
        <PrivacyModal
          slide={privacySlide}
          lang={lang}
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
          <AdHeader />

          {/* Progress bar — 100% */}
          <div style={{ height: 3, minHeight: 3, background: "rgba(215,184,122,0.2)", flexShrink: 0 }}>
            <div style={{ height: "100%", width: "100%", background: GOLD }} />
          </div>

          {/* Body — navy, centred */}
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
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0 }}>
              {thankYouTitle}
            </p>
            <p style={{ color: "rgba(255,255,255,0.78)", fontSize: 10.5, margin: 0, lineHeight: 1.4 }}>
              {thankYouBody}
            </p>
          </div>

          {/* Thank-you footer — "Powered by Fanometrix • Privacy" */}
          <div
            style={{
              height: 22,
              minHeight: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: NAVY,
              flexShrink: 0,
              borderTop: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <span style={{ color: "#8C9DB5", fontSize: 9, letterSpacing: "0.01em" }}>
              Powered by Fanometrix{" "}
              <span style={{ color: "#8C9DB5" }}>•</span>{" "}
            </span>
            <span
              onClick={openPrivacy}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openPrivacy()}
              style={{
                color: GOLD,
                fontSize: 9,
                cursor: "pointer",
                textDecoration: "underline",
                textDecorationColor: "rgba(215,184,122,0.5)",
              }}
            >
              Privacy
            </span>
          </div>
        </>
      ) : (
        /* ── Survey question screen ───────────────────────────────────── */
        <>
          <AdHeader step={step + 1} total={questions.length} />

          {/* Gold progress bar */}
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

          {/* Body — white, top-anchored */}
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
            {/* Fixed two-line question container */}
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
                <p
                  style={{
                    color: "#DC2626",
                    fontSize: 10.5,
                    fontWeight: 600,
                    lineHeight: 1.35,
                    margin: 0,
                  }}
                >
                  {errorMsg}
                </p>
              ) : (
                <p
                  style={{
                    color: NAVY,
                    fontSize: 11.5,
                    fontWeight: 700,
                    lineHeight: 1.35,
                    margin: 0,
                  }}
                >
                  {q.text}
                </p>
              )}
            </div>

            {/* Answer options — top-anchored */}
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
                    <span
                      style={{
                        color: NAVY,
                        fontSize: 10.5,
                        fontWeight: 500,
                        lineHeight: 1,
                      }}
                    >
                      {opt}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Privacy footer — shield, higher contrast */}
          <div
            style={{
              height: 22,
              minHeight: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#EDEEF0",
              flexShrink: 0,
              borderTop: "1.5px solid #C9CDD6",
            }}
          >
            <span
              onClick={openPrivacy}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openPrivacy()}
              style={{
                color: "#374151",
                fontSize: 9.5,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              🛡 Anonymous insights • No personal data collected
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
