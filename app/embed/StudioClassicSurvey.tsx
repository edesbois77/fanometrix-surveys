"use client";

// ── StudioClassicSurvey — refreshed Classic renderer (Survey Studio Create) ──
// A modest VISUAL evolution of ClassicSurvey: same mechanic (clear question on
// top, vertically stacked answer choices, immediate selection, no countdown, no
// card-stack) but cleaner typography, spacing, answer cards, hover/selected
// states and a subtle progress treatment so it belongs alongside Countdown and
// Stack. 300×250.
//
// STRANGLER: this is ADDITIVE and dispatched ONLY for the new Studio Classic
// identity (creative_designs.config.renderer === "studio-classic"). Historical/
// live `classic` campaigns continue to render via ClassicSurvey — unchanged.
//
// Event tracking + submit plumbing is IDENTICAL to ClassicSurvey (SURVEY_RENDER/
// VISIBLE/START/QUESTION_n_REACHED/COMPLETED, /api/answer per selection, /api/
// submit q1/q2/q3), so it is a fully working fan-facing creative.
//
// BRAND: not baked — the accent colour and any logos come from Creative
// configuration (`accent` + `branding`), so future global/generic and
// publisher-specific Classic variants are supported without renderer changes.
//
// JOURNEY-READY (not implemented here): questions iterate dynamically
// (questions.length, never hardcoded 3) and phases are separable, so the agreed
// optional Intro → 1–5 Questions → optional Thank You journey can be added later
// (Phase 3 / Q4-Q5). No temporary journey logic is added now.

import { useState, useEffect, useRef, useCallback } from "react";
import type { Question } from "./page";
import { resolveSystemPrivacy, privacyPolicyHref } from "@/lib/system-privacy";

const NAVY = "#0B1E33";
const GOLD = "#D7B87A";

// ─── Privacy modal — Fanometrix SYSTEM content, resolved for the active delivery
//     language (lib/system-privacy). NOT Publisher-authored; the full policy CTA
//     routes to the localised /[lang]/privacy page.

function PrivacyModal({ slide, onClose, onNav, lang = "en", accent }: {
  slide: number; onClose: () => void; onNav: (dir: -1 | 1) => void; lang?: string; accent: string;
}) {
  const sp = resolveSystemPrivacy(lang);
  const s = sp.slides[slide];
  const isFirst = slide === 0;
  const isLast = slide === sp.slides.length - 1;
  return (
    <div style={{ position: "absolute", inset: 0, background: "#fff", display: "flex", flexDirection: "column", zIndex: 20, overflow: "hidden", boxSizing: "border-box" }}>
      <div style={{ height: 40, minHeight: 40, background: NAVY, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", flexShrink: 0 }}>
        <span style={{ color: accent, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em" }}>{sp.label}</span>
        <button onClick={onClose} aria-label="Close privacy" style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 15, lineHeight: 1, padding: "3px 4px" }}>✕</button>
      </div>
      {slide === 2 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 20px", textAlign: "center", gap: 7, minHeight: 0, overflow: "hidden" }}>
          <div style={{ fontSize: 24, lineHeight: 1 }}>🛡️</div>
          <p style={{ color: NAVY, fontSize: 11, fontWeight: 700, lineHeight: 1.3, margin: 0 }}>{sp.aggregateHeading}</p>
          <p style={{ color: "#4B5563", fontSize: 9.5, lineHeight: 1.45, margin: 0 }}>{sp.aggregateBody}</p>
          <p style={{ color: "#6B7280", fontSize: 9, margin: 0, lineHeight: 1.5 }}>{sp.contactPrompt} <a href="mailto:privacy@fanometrix.com" style={{ color: accent, textDecoration: "none", fontWeight: 600 }}>privacy@fanometrix.com</a></p>
          <a href={privacyPolicyHref(lang)} target="_blank" rel="noopener" style={{ display: "inline-block", marginTop: 2, background: NAVY, color: accent, fontSize: 9.5, fontWeight: 700, padding: "5px 16px", borderRadius: 20, textDecoration: "none", letterSpacing: "0.02em" }}>{sp.policyCtaShort} →</a>
        </div>
      ) : (
        <div style={{ flex: 1, padding: "12px 16px 6px", overflow: "hidden", display: "flex", flexDirection: "column", gap: 7, minHeight: 0 }}>
          <p style={{ color: NAVY, fontSize: 12, fontWeight: 700, margin: 0, flexShrink: 0 }}>{s.title}</p>
          {s.text && <p style={{ color: "#374151", fontSize: 9.5, lineHeight: 1.5, margin: 0 }}>{s.text}</p>}
          {s.bullets && (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
              {s.bullets.map((b) => (
                <li key={b.text} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span style={{ color: accent, fontSize: 8, marginTop: 2, flexShrink: 0 }}>●</span>
                  <span style={{ color: b.highlight ? accent : "#374151", fontSize: 9.5, lineHeight: 1.4, fontWeight: b.highlight ? 700 : 400 }}>{b.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div style={{ height: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px", background: "#F9FAFB", borderTop: "1px solid #E5E7EB", flexShrink: 0 }}>
        <button onClick={() => onNav(-1)} disabled={isFirst} aria-label="Previous slide" style={{ background: "none", border: "none", cursor: isFirst ? "default" : "pointer", color: isFirst ? "#D1D5DB" : NAVY, fontSize: 20, lineHeight: 1, padding: "2px 8px", fontWeight: 700 }}>‹</button>
        <span style={{ color: "#6B7280", fontSize: 9.5, fontWeight: 500 }}>{slide + 1} {sp.slideOf} {sp.slides.length}</span>
        <button onClick={() => onNav(1)} disabled={isLast} aria-label="Next slide" style={{ background: "none", border: "none", cursor: isLast ? "default" : "pointer", color: isLast ? "#D1D5DB" : NAVY, fontSize: 20, lineHeight: 1, padding: "2px 8px", fontWeight: 700 }}>›</button>
      </div>
    </div>
  );
}

// ─── Refreshed header — brand comes from config (logos), NOT baked ────────────
function StudioHeader({ step, total, branding, accent }: { step?: number; total?: number; branding?: string[]; accent: string }) {
  return (
    <div style={{ height: 44, minHeight: 44, background: NAVY, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 13px", flexShrink: 0, boxSizing: "border-box", borderBottom: `2px solid ${accent}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {branding && branding.length > 0
          ? branding.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt="" style={{ height: 16, maxWidth: 66, objectFit: "contain", objectPosition: "left", flexShrink: 0 }} />
            ))
          : <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em" }}>SURVEY</span>}
      </div>
      {step !== undefined && total !== undefined && (
        <span style={{ color: accent, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", flexShrink: 0 }}>{step} / {total}</span>
      )}
    </div>
  );
}

export interface StudioClassicSurveyProps {
  /** Brand accent colour from the selected Creative variant. Defaults to the
   *  Fanometrix gold; publisher/global variants pass their own. */
  accent?: string;
  /** Logo URLs from Creative configuration (never baked into the renderer). */
  branding?: string[];
  /** Legacy reserved flag (kept for compatibility; the intro is now driven by
   *  `surveyIntroEnabled`). */
  intro?: boolean;
  /** Phase 3 Survey-level intro toggle — show a modest Classic intro frame before
   *  the questions. undefined/false = open straight on Q1 (historical behaviour). */
  surveyIntroEnabled?: boolean;
  /** Already-resolved localised Intro copy; absent ⇒ a sensible default. */
  introTitle?: string;
  introBody?: string;
  /** Optional short survey subject shown on the intro frame (surveys.topic). */
  introTopic?: string;
  /** Thank-You toggle. undefined (default) = authored success frame; false =
   *  minimal "Response recorded" terminal. Completion still fires either way. */
  thankYouEnabled?: boolean;
  /** Marks the mandatory system-owned Thank-You (central copy). Reserved for a
   *  future centrally-controlled terminal CTA; V1 renders no CTA. */
  thankYouSystem?: boolean;
  /** Preview-only: render a still representative QUESTION frame for the library
   *  card (skips the intro, mirroring ThemedSurvey's frozen question frame). */
  staticFrame?: boolean;
  /** Preview-only (Survey-stage integrated preview): land on and freeze a specific
   *  journey frame — a question index (number), "intro", or "thankyou". isPreview
   *  only; undefined ⇒ normal flow. */
  previewFrame?: number | "intro" | "thankyou";
  questions: Question[];
  thankYouTitle: string;
  thankYouBody: string;
  isPreview: boolean;
  campaignId: string;
  surveyId: string | null;
  questionSetId: string | null;
  publisher: string | null;
  placement: string | null;
  placementId: string | null;
  creativeId: string | null;
  club: string | null;
  competition: string | null;
  country: string | null;
  segment: string | null;
  device: string | null;
  browser: string | null;
  groupId: string | null;
  countryCode: string | null;
  market: string | null;
  surveyLanguage: string;
  sessionId: string;
  urlLang: string | null;
}

export function StudioClassicSurvey(props: StudioClassicSurveyProps) {
  const {
    accent = GOLD, branding, questions, thankYouTitle, thankYouBody, isPreview, campaignId, surveyId,
    questionSetId, publisher, placement, placementId, creativeId, club,
    competition, country, segment, device, browser, groupId, countryCode,
    market, surveyLanguage, sessionId, urlLang,
    surveyIntroEnabled, introTitle, introBody, introTopic, thankYouEnabled, staticFrame, previewFrame,
  } = props;

  // Preview-only initial frame (Survey-stage integrated preview); gated on isPreview.
  const pf = isPreview ? previewFrame : undefined;
  const previewIsIntro    = pf === "intro";
  const previewIsThankYou = pf === "thankyou";
  const previewStep = typeof pf === "number" ? Math.max(0, Math.min(pf, Math.max(0, questions.length - 1))) : 0;

  // Survey-level intro: shown before the questions when enabled. The library-card
  // still frame (staticFrame) skips the intro so the card shows a question; a
  // preview "intro" frame forces it shown, a question/thankyou frame starts past it.
  const introEnabled = previewIsIntro ? true : (!!surveyIntroEnabled && !staticFrame && !previewIsThankYou && typeof pf !== "number");
  const introHeadline = introTitle ?? "Your view counts";
  const introMessage  = introBody  ?? "A few quick questions — your anonymous answers help shape the football experience.";
  // Unified V1 estimate: ~5s per question + 5s for the intro, min 10, to 5s.
  const introSeconds  = Math.max(10, 5 * questions.length + 5);

  // Set at first answer (SURVEY_START); 0 until then (never used for duration
  // since submit only happens after answering). Avoids an impure call in render.
  const startRef = useRef<number>(0);
  const [introActive, setIntroActive] = useState<boolean>(introEnabled);
  const [step, setStep] = useState(previewStep);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(previewIsThankYou ? "success" : "idle");
  const [advancing, setAdvancing] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [privacySlide, setPrivacySlide] = useState(0);
  const [errorMsg, setErrorMsg] = useState("Something went wrong, tap an answer to try again.");

  const rootRef = useRef<HTMLDivElement>(null);
  const hasRendered = useRef(false);
  const hasVisible = useRef(false);
  const hasStarted = useRef(false);       // SURVEY_START = journey entry (once)
  const hasIntroViewed = useRef(false);   // INTRO_VIEWED (once)
  const hasContinued = useRef(false);     // INTRO_CONTINUED (once)
  const hasCompleted = useRef(false);
  const deviceRef = useRef<string | null>(device);
  const browserRef = useRef<string | null>(browser);
  const campaignIdRef = useRef<string>(campaignId);

  useEffect(() => { campaignIdRef.current = campaignId; }, [campaignId]);
  useEffect(() => { deviceRef.current = device; }, [device]);
  useEffect(() => { browserRef.current = browser; }, [browser]);

  const sendEvent = useCallback((eventType: string) => {
    if (isPreview) return;
    fetch("/api/events", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({
        session_id: sessionId, event_type: eventType, campaign_id: campaignIdRef.current || null,
        publisher: publisher || null, placement: placement || null, placement_id: placementId || null,
        creative_id: creativeId || null, country: country || null,
        device: deviceRef.current || null, browser: browserRef.current || null,
      }),
    }).catch(() => {/* non-fatal */});
  }, [isPreview, sessionId, publisher, placement, placementId, creativeId, country]);

  const sendAnswer = useCallback((questionIndex: number, answerValue: string) => {
    if (isPreview) return;
    fetch("/api/answer", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({
        session_id: sessionId, campaign_id: campaignId || null, survey_id: surveyId || null,
        question_index: questionIndex, answer_value: answerValue,
        country: country || null, fan_segment: segment || null, market: market || null,
      }),
    }).catch(() => {/* non-fatal */});
  }, [isPreview, sessionId, campaignId, surveyId, country, segment, market]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || isPreview || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !hasVisible.current) { hasVisible.current = true; sendEvent("SURVEY_VISIBLE"); obs.disconnect(); }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [isPreview, sendEvent]);

  useEffect(() => {
    if (questions.length > 0 && !hasRendered.current) { hasRendered.current = true; sendEvent("SURVEY_RENDER"); }
  }, [questions.length, sendEvent]);

  // Phase 3 journey milestones at entry. With the intro shown it is INTRO_VIEWED
  // here and SURVEY_START waits for the Start press; with no intro, Q1 is active
  // immediately so SURVEY_START fires now (its new "journey entry" definition).
  useEffect(() => {
    if (isPreview) return;
    if (introActive) {
      if (!hasIntroViewed.current) { hasIntroViewed.current = true; sendEvent("INTRO_VIEWED"); }
    } else if (!hasStarted.current) {
      hasStarted.current = true;
      // Journey-entry origin for the completion timer (effect, not render).
      startRef.current = Date.now();
      sendEvent("SURVEY_START");
    }
  }, [isPreview, introActive, sendEvent]);

  function handleStartSurvey() {
    // Continuing from the intro IS the journey entry: INTRO_CONTINUED + SURVEY_START.
    if (!hasContinued.current) { hasContinued.current = true; sendEvent("INTRO_CONTINUED"); }
    if (!hasStarted.current) {
      hasStarted.current = true;
      startRef.current = Date.now();
      sendEvent("SURVEY_START");
    }
    setIntroActive(false);
  }

  const q = questions[step];
  const isLast = step === questions.length - 1;
  const progressPct = status === "success" ? 100 : ((step + 1) / Math.max(1, questions.length)) * 100;

  function openPrivacy() { setPrivacySlide(0); setShowPrivacy(true); }

  function handleSelect(optId: number) {
    if (advancing || !q) return;
    const newAnswers = { ...answers, [q.id]: optId };
    setAnswers(newAnswers);
    setAdvancing(true);
    // step = question index 0–4; /api/answer accepts 0–4. SURVEY_START is no longer
    // fired here — it now marks journey entry (intro continue, or Q1 active).
    sendAnswer(step, String(optId));

    setTimeout(async () => {
      if (!isLast) {
        const nextStep = step + 1;
        // Reaching the 2nd–5th question (surveys now run 1–5 questions).
        if (nextStep === 1) sendEvent("QUESTION_2_REACHED");
        if (nextStep === 2) sendEvent("QUESTION_3_REACHED");
        if (nextStep === 3) sendEvent("QUESTION_4_REACHED");
        if (nextStep === 4) sendEvent("QUESTION_5_REACHED");
        setStep(nextStep);
        setAdvancing(false);
        return;
      }
      if (isPreview) { hasCompleted.current = true; setStatus("success"); setAdvancing(false); return; }

      setStatus("submitting");
      const duration = Math.round((Date.now() - startRef.current) / 1000);
      // q1/q2/q3 legacy completion cache (first three) — unchanged from the classic
      // creative; Q4/Q5 capture is the separate Phase 6 response-model work.
      const q1ans = newAnswers[questions[0]?.id] ?? null;
      const q2ans = newAnswers[questions[1]?.id] ?? null;
      const q3ans = newAnswers[questions[2]?.id] ?? null;
      try {
        const res = await fetch("/api/submit", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaign_id: campaignId, survey_id: surveyId, question_set_id: questionSetId, session_id: sessionId,
            publisher, placement, placement_id: placementId, creative_id: creativeId, club, competition,
            q1: q1ans, q2: q2ans, q3: q3ans, country: country || null, fan_segment: segment,
            device, browser, response_duration_seconds: duration, group_id: groupId,
            country_code: countryCode, market, survey_language: surveyLanguage,
          }),
        });
        if (res.ok) { hasCompleted.current = true; sendEvent("SURVEY_COMPLETED"); setStatus("success"); }
        else {
          const json = await res.json().catch(() => ({}));
          const msg = json.error ?? "Something went wrong, tap an answer to try again.";
          console.error("[Fanometrix embed] Submission failed:", res.status, msg);
          setErrorMsg(msg); setStatus("error");
        }
      } catch (err) {
        console.error("[Fanometrix embed] Network error:", err);
        setErrorMsg("Network error, please check your connection and try again."); setStatus("error");
      }
      setAdvancing(false);
    }, 340);
  }

  return (
    <div ref={rootRef} style={{ width: 300, height: 250, overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column", boxSizing: "border-box", position: "relative", background: "#fff" }}>
      {showPrivacy && (
        <PrivacyModal slide={privacySlide} accent={accent} lang={urlLang ?? "en"} onClose={() => setShowPrivacy(false)} onNav={(dir) => setPrivacySlide((s) => Math.max(0, Math.min(resolveSystemPrivacy(urlLang ?? "en").slides.length - 1, s + dir)))} />
      )}

      {introActive ? (
        // ── Survey-level intro (Phase 3) — modest, recognisably-Classic: navy
        // field, gold accent, headline + short message, a derived meta line and a
        // "Start survey" button. No countdown, invitation panel or card-stack.
        <>
          <StudioHeader branding={branding} accent={accent} />
          <div style={{ height: 3, minHeight: 3, background: `${accent}22`, flexShrink: 0 }} />
          <div style={{ flex: 1, background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "16px 22px", gap: 9, minHeight: 0, boxSizing: "border-box", borderTop: `1px solid ${accent}33` }}>
            {introTopic && introTopic.trim() && (
              <p style={{ color: accent, fontSize: 11, fontWeight: 700, margin: 0 }}>
                <span style={{ color: `${accent}B3`, fontWeight: 600 }}>Topic: </span>{introTopic.trim()}
              </p>
            )}
            <p style={{ color: "#fff", fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: "-0.01em", lineHeight: 1.2 }}>{introHeadline}</p>
            <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, margin: 0, lineHeight: 1.45, maxWidth: 232 }}>{introMessage}</p>
            <p style={{ color: accent, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", margin: "2px 0 0" }}>
              ~{introSeconds} Seconds · {questions.length} Question{questions.length === 1 ? "" : "s"} · In banner
            </p>
            <button onClick={handleStartSurvey} aria-label="Start survey" style={{ marginTop: 6, background: accent, color: NAVY, border: "none", borderRadius: 8, padding: "9px 22px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", letterSpacing: "0.01em" }}>
              Start Survey
            </button>
          </div>
          <Footer accent={accent} onPrivacy={openPrivacy} dark />
        </>
      ) : status === "success" ? (
        <>
          <StudioHeader branding={branding} accent={accent} />
          <div style={{ height: 3, minHeight: 3, background: `${accent}22`, flexShrink: 0 }}><div style={{ height: "100%", width: "100%", background: accent }} /></div>
          <div style={{ flex: 1, background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "12px 22px", textAlign: "center", gap: 9, minHeight: 0 }}>
            {thankYouEnabled === false ? (
              // Authored Thank-You suppressed — minimal system acknowledgement.
              // Submit + SURVEY_COMPLETED already fired above.
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 500, margin: 0 }}>Response recorded</p>
            ) : (
              <>
                <div style={{ fontSize: 30, lineHeight: 1 }}>🎉</div>
                <p style={{ color: "#fff", fontSize: 15, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>{thankYouTitle}</p>
                <p style={{ color: "rgba(255,255,255,0.8)", fontSize: 10.5, margin: 0, lineHeight: 1.45 }}>{thankYouBody}</p>
              </>
            )}
          </div>
          <Footer accent={accent} onPrivacy={openPrivacy} dark />
        </>
      ) : (
        <>
          <StudioHeader step={step + 1} total={questions.length} branding={branding} accent={accent} />
          <div style={{ height: 3, minHeight: 3, background: `${accent}22`, flexShrink: 0 }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: accent, transition: "width 0.3s ease" }} />
          </div>

          <div style={{ flex: 1, background: "#fff", padding: "13px 14px 0", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden", boxSizing: "border-box" }}>
            {/* Question — stronger typography + hierarchy */}
            <div style={{ minHeight: 38, flexShrink: 0, marginBottom: 10 }}>
              {status === "error" ? (
                <p style={{ color: "#DC2626", fontSize: 11, fontWeight: 600, lineHeight: 1.35, margin: 0 }}>{errorMsg}</p>
              ) : (
                <p style={{ color: NAVY, fontSize: 13.5, fontWeight: 800, lineHeight: 1.28, margin: 0, letterSpacing: "-0.01em" }}>{q?.text ?? ""}</p>
              )}
            </div>

            {/* Answer cards — cleaner rows, clear hover/selected */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(q?.options ?? []).map((opt) => {
                const isSel = q ? answers[q.id] === opt.id : false;
                const isHover = hovered === opt.id && !advancing;
                return (
                  <div
                    key={opt.id}
                    role="radio"
                    aria-checked={isSel}
                    tabIndex={0}
                    onMouseEnter={() => setHovered(opt.id)}
                    onMouseLeave={() => setHovered((h) => (h === opt.id ? null : h))}
                    onClick={() => handleSelect(opt.id)}
                    onKeyDown={(e) => e.key === " " && handleSelect(opt.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10,
                      background: isSel ? `${accent}18` : isHover ? "#F3F4F6" : "#FAFBFC",
                      border: `1.5px solid ${isSel ? accent : isHover ? "#D8DCE2" : "#EAECEF"}`,
                      boxShadow: isSel ? `0 2px 8px ${accent}33` : "none",
                      cursor: advancing ? "default" : "pointer", flexShrink: 0, boxSizing: "border-box",
                      transition: "box-shadow 0.15s, background 0.15s, border-color 0.15s",
                    }}
                  >
                    <div style={{ width: 15, height: 15, borderRadius: "50%", border: `2px solid ${isSel ? accent : "#B3B9C2"}`, background: isSel ? accent : "transparent", flexShrink: 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s, border-color 0.15s" }}>
                      {isSel && <div style={{ width: 5, height: 5, borderRadius: "50%", background: NAVY }} />}
                    </div>
                    <span style={{ color: NAVY, fontSize: 11.5, fontWeight: 600, lineHeight: 1.15 }}>{opt.text}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <Footer accent={accent} onPrivacy={openPrivacy} />
        </>
      )}
    </div>
  );
}

// ─── Shared footer ────────────────────────────────────────────────────────────
function Footer({ accent, onPrivacy, dark = false }: { accent: string; onPrivacy: () => void; dark?: boolean }) {
  return (
    <div style={{ height: 22, minHeight: 22, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: dark ? NAVY : "#EEF0F2", flexShrink: 0, borderTop: dark ? "1px solid rgba(255,255,255,0.10)" : "1px solid #D7DAE0" }}>
      <span style={{ color: dark ? "#8C9DB5" : "#5B6472", fontSize: 9, letterSpacing: "0.01em" }}>Powered by Fanometrix</span>
      <span style={{ color: dark ? "#5D6E86" : "#AEB4BE", fontSize: 9 }}>•</span>
      <span onClick={onPrivacy} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onPrivacy()} style={{ color: accent, fontSize: 9, fontWeight: 600, cursor: "pointer", textDecoration: "underline", textDecorationColor: `${accent}88` }}>Privacy</span>
    </div>
  );
}
