"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Self-contained DEMONSTRATION of the production "Fanometrix Stack" creative.
//
// This is a faithful, demo-only reproduction for the WWC landing page. The
// visual system (the scoped .fmstk-* CSS), the frame flow (Intro → Gender → Age
// → Q1 → Q2 → Q3 → Thank You), the hover/accept states and the auto-advance are
// copied verbatim from the real renderer (app/embed/StackSurvey.tsx on main /
// feat/stack-*). The WWC demographics + research questions are the approved
// Women's Football wording (commit 304f748).
//
// IMPORTANT — this is a hard-coded snapshot, NOT the live creative:
//   • no impressions, no responses, no /api/* or database writes
//   • no campaign / deployment dependency
//   • it imports nothing from the shared creative engine and never modifies it
// Clicking an answer simply advances the demo frames. Real publisher campaigns
// continue to use the production Creative Design / deployment system.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef } from "react";
import type { ReactNode, CSSProperties } from "react";
import { Space_Grotesk, Inter } from "next/font/google";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const FONT_Q = spaceGrotesk.style.fontFamily;
const FONT_A = inter.style.fontFamily;

// ── Palette (Countdown "Fanometrix Premium" family) ──────────────────────────
const NAVY     = "#0B1929";
const NAVY_INK = "#041B33";
const GOLD     = "#D7B87A";
const GOLD_LO  = "#A8864A";
const GRID     = "rgba(215,184,122,0.12)";
const LOGO_SRC = "/Fanometrix_Logo.png";

// ── WWC content (approved Women's Football wording, commit 304f748) ───────────
const TOPIC = "Women's Football";
const GENDER = { label: "What gender are you?", options: ["Female", "Male", "Non-Binary", "Prefer not to say"] };
const AGE    = { label: "How old are you?", options: ["16 - 24 years of age", "25 - 34 years of age", "35 - 44 years of age", "45+ years of age"] };
const RESEARCH: { text: string; options: string[] }[] = [
  { text: "What matters most when choosing a match to watch?", options: ["The teams playing", "The players involved", "The importance of the match", "How easy it is to watch"] },
  { text: "What would make you watch women's football more often?", options: ["More matches on TV", "Easier streaming access", "More coverage and promotion", "Nothing, I watch enough"] },
  { text: "How do you think women's football will grow over the next 5 years?", options: ["Significantly", "Moderately", "A little", "Not at all"] },
];
const THANK_YOU_TITLE = "Thank you";
const THANK_YOU_BODY  = "Your anonymous feedback helps improve the football experience for fans everywhere.";

// ── Scoped styles — copied verbatim from the production StackSurvey (.fmstk-*) ─
const STACK_CSS = `
.fmstk-unit{position:relative;width:300px;height:250px;box-sizing:border-box;border-radius:0;overflow:hidden;
  background:${NAVY};color:#fff;isolation:isolate;user-select:none;font-family:var(--fmstk-fa);display:flex;flex-direction:column}
.fmstk-unit *{box-sizing:border-box}
.fmstk-frame{position:absolute;inset:0;z-index:7;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(215,184,122,.3)}

/* gold question header (shallow) */
.fmstk-qhead{flex:0 0 82px;position:relative;background:linear-gradient(180deg,${GOLD},${GOLD_LO});
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8px 16px;gap:8px}
.fmstk-kicker{font-family:var(--fmstk-fa);font-size:8px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;
  color:rgba(4,27,51,.62);line-height:1}
.fmstk-question{font-family:var(--fmstk-fq);margin:0;color:${NAVY_INK};font-weight:600;letter-spacing:-.015em;
  line-height:1.1;font-size:17px;max-width:278px;text-wrap:balance;overflow-wrap:anywhere}

/* navy answer canvas */
.fmstk-answers{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.fmstk-ans{appearance:none;border:0;background:transparent;width:100%;flex:1 1 0;min-height:0;cursor:pointer;
  position:relative;overflow:hidden;font-family:var(--fmstk-fa);
  display:flex;align-items:center;justify-content:center;text-align:center;padding:4px 16px}
.fmstk-ans + .fmstk-ans{box-shadow:inset 0 1px 0 ${GRID}}
.fmstk-lbl{position:relative;z-index:3;color:#fff;font-size:13.5px;font-weight:500;letter-spacing:.005em;
  line-height:1.2;overflow-wrap:anywhere;transition:color .22s ease,font-weight .22s ease}
.fmstk-ans:focus-visible{outline:2px solid ${GOLD};outline-offset:-4px}

/* the single gold hover state (reversed gradient). Motion differs by variant. */
.fmstk-ans::before{content:"";position:absolute;inset:0;z-index:1;opacity:0;
  background:linear-gradient(180deg,${GOLD_LO} 0%,${GOLD} 100%)}
/* Variant A — fade */
.fmstk-va .fmstk-ans::before{transition:opacity .28s ease}
@media (hover:hover) and (pointer:fine){.fmstk-va .fmstk-ans:hover::before{opacity:1}}
.fmstk-va .fmstk-ans:active::before{opacity:1}
/* text turns navy under gold */
@media (hover:hover) and (pointer:fine){.fmstk-ans:hover .fmstk-lbl{color:${NAVY_INK};font-weight:600}}
.fmstk-ans:active .fmstk-lbl{color:${NAVY_INK};font-weight:600}

/* accepted — richer/brighter gold + brief glow-pulse (no green) */
.fmstk-ans.fmstk-sel::before{opacity:1;clip-path:inset(0 0 0 0);
  background:linear-gradient(180deg,#9E7B3E 0%,#E4C88A 100%);filter:brightness(1.03)}
.fmstk-ans.fmstk-sel .fmstk-lbl{color:${NAVY_INK};font-weight:600}
.fmstk-ans.fmstk-sel::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;
  box-shadow:inset 0 0 0 1px rgba(255,246,224,.62),inset 0 0 24px rgba(255,240,210,.34);
  animation:fmstkAccept .6s ease forwards}
@keyframes fmstkAccept{0%{opacity:0}45%{opacity:1}100%{opacity:.82}}

/* intro */
.fmstk-introcontent{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;padding-bottom:48px}
.fmstk-mid{flex:1 1 auto;display:flex;flex-direction:column;text-align:center;padding:18px 24px 0}
.fmstk-group{display:flex;flex-direction:column;align-items:center}
.fmstk-lead{font-family:var(--fmstk-fq);margin:0 0 9px;color:#fff;font-weight:700;letter-spacing:-.03em;line-height:1.12;
  font-size:24px;max-width:250px;text-wrap:balance}
.fmstk-sub{margin:0 0 13px;font-size:11px;font-weight:400;line-height:1.45;color:rgba(255,255,255,.66);max-width:27ch}
.fmstk-partic{margin:0;font-size:10px;font-weight:600;letter-spacing:.02em;color:#fff}
.fmstk-topic{margin:0;align-self:center;font-size:10px;font-weight:600;letter-spacing:.02em;color:${GOLD};
  max-width:27ch;line-height:1.35;text-wrap:balance}
.fmstk-topic .fmstk-tk{color:rgba(215,184,122,.66);font-weight:500}
/* Intro variant B — topic-led; participation returns to gold; content centred as one block */
.fmstk-mid-b{justify-content:center;padding-top:0;padding-bottom:0}
.fmstk-mid-b .fmstk-topic{margin-bottom:16px}
.fmstk-partic-gold{color:${GOLD}}

/* discreet privacy — legal/utility metadata, extreme bottom-right over the final answer */
.fmstk-privacy{position:absolute;bottom:1px;right:3px;z-index:5;font-family:var(--fmstk-fa);
  font-size:6.5px;font-weight:600;letter-spacing:.04em;color:#977B41;text-decoration:none;
  padding:5px 6px;line-height:1;transition:opacity .18s ease}
@media (hover:hover) and (pointer:fine){.fmstk-privacy:hover{color:#B89551}}
.fmstk-privacy:focus-visible{outline:2px solid #A9884A;outline-offset:1px;opacity:1}
.fmstk-unit:has(.fmstk-ans:last-child:hover) .fmstk-privacy,
.fmstk-unit:has(.fmstk-ans:last-child:active) .fmstk-privacy,
.fmstk-unit:has(.fmstk-ans:last-child.fmstk-sel) .fmstk-privacy{opacity:0;pointer-events:none}

.fmstk-cta{position:absolute;left:0;right:0;bottom:0;z-index:3;height:48px;border:0;cursor:pointer;overflow:hidden;
  background:linear-gradient(180deg,${GOLD},${GOLD_LO});color:${NAVY_INK};font-family:var(--fmstk-fq);
  display:flex;align-items:center;justify-content:center;gap:9px;
  font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.fmstk-arw{display:inline-block;animation:fmstkNudge 1.4s ease-in-out infinite}
.fmstk-shine{position:absolute;top:0;bottom:0;left:0;width:56%;pointer-events:none;
  background:linear-gradient(100deg,transparent 22%,rgba(255,248,228,.55) 50%,transparent 78%);
  transform:translateX(-165%);animation:fmstkShine 4.6s ease-in-out infinite}
@keyframes fmstkShine{0%{transform:translateX(-165%)}18%{transform:translateX(255%)}100%{transform:translateX(255%)}}
@keyframes fmstkNudge{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
@media (hover:hover) and (pointer:fine){.fmstk-cta:hover{filter:brightness(1.05)}}
.fmstk-cta:active{filter:brightness(.97)}

/* thank you */
.fmstk-ty{position:absolute;inset:0;z-index:4;background:${NAVY};display:flex;flex-direction:column;
  align-items:center;justify-content:center;text-align:center;padding:20px 24px;gap:8px}
.fmstk-ty-logo{height:9px;width:auto;opacity:.96;margin-bottom:4px}
.fmstk-badge{width:40px;height:40px;border-radius:50%;background:rgba(215,184,122,.14);border:2px solid ${GOLD};
  display:flex;align-items:center;justify-content:center;color:${GOLD};margin-bottom:2px}
.fmstk-ty-title{font-family:var(--fmstk-fq);margin:0;color:#fff;font-size:21px;font-weight:600;letter-spacing:-.02em;text-wrap:balance}
.fmstk-ty-body{margin:0;color:rgba(255,255,255,.66);font-size:12px;line-height:1.5;max-width:230px}
.fmstk-ty-tag{margin:2px 0 0;color:${GOLD};font-size:11px;font-weight:600;letter-spacing:.03em}

@media (prefers-reduced-motion:reduce){
  .fmstk-shine{display:none}.fmstk-arw{animation:none}
  .fmstk-ans.fmstk-sel::after{animation:none;opacity:.82}
}
`;

// Flow: 0 Intro · 1 Gender · 2 Age · 3..5 research · 6 Thank You.
const RESEARCH_START = 3;
const THANKYOU_STEP = RESEARCH_START + RESEARCH.length;   // 6
const TOTAL_ANSWERABLE = 2 + RESEARCH.length;             // 5
const HOLD_MS = 260;                                      // preview-feel auto-advance

export function StackDemo() {
  const [step, setStep] = useState(0);
  const [accepted, setAccepted] = useState<{ step: number; idx: number } | null>(null);
  const advancingRef = useRef(false);

  // Select an answer on the current frame → accepted → hold → advance.
  // Demo-only: no analytics, no submission, no network of any kind.
  function selectAnswer(idx: number) {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setAccepted({ step, idx });
    window.setTimeout(() => {
      setAccepted(null);
      setStep(s => s + 1);
      advancingRef.current = false;
    }, HOLD_MS);
  }

  function renderAnswers(options: string[]) {
    return (
      <div className="fmstk-answers fmstk-va">
        {options.map((text, i) => {
          const isSel = accepted?.step === step && accepted?.idx === i;
          return (
            <button
              key={i}
              type="button"
              className={`fmstk-ans${isSel ? " fmstk-sel" : ""}`}
              onClick={() => selectAnswer(i)}
              aria-label={text}
            >
              <span className="fmstk-lbl">{text}</span>
            </button>
          );
        })}
      </div>
    );
  }

  function renderQuestionFrame(kicker: string, questionText: string, options: string[]) {
    return (
      <>
        <div className="fmstk-qhead">
          <span className="fmstk-kicker">{kicker}</span>
          <p className="fmstk-question">{questionText}</p>
        </div>
        {renderAnswers(options)}
        <a className="fmstk-privacy" href="/privacy" target="_blank" rel="noopener"
          onClick={(e) => e.stopPropagation()}>Privacy</a>
        <div className="fmstk-frame" />
      </>
    );
  }

  let body: ReactNode;
  if (step === 0) {
    const estSeconds = Math.max(15, Math.round((TOTAL_ANSWERABLE * 4) / 5) * 5);
    const particText = `~${estSeconds} Seconds · ${TOTAL_ANSWERABLE} Questions · In banner`;
    // Topic-led intro (variant B) — matches the current Stack studio default.
    body = (
      <>
        <div className="fmstk-introcontent">
          <div className="fmstk-mid fmstk-mid-b">
            <p className="fmstk-topic"><span className="fmstk-tk">Topic:</span> {TOPIC}</p>
            <div className="fmstk-group">
              <p className="fmstk-lead">Football fans deserve a voice.</p>
              <p className="fmstk-sub">Help shape better football experiences by sharing yours.</p>
              <p className="fmstk-partic fmstk-partic-gold">{particText}</p>
            </div>
          </div>
        </div>
        <button className="fmstk-cta" type="button" onClick={() => setStep(1)} aria-label="Start survey">
          Start survey <span className="fmstk-arw" aria-hidden>→</span>
          <span className="fmstk-shine" aria-hidden />
        </button>
        <div className="fmstk-frame" />
      </>
    );
  } else if (step === 1) {
    body = renderQuestionFrame(`Question 1 of ${TOTAL_ANSWERABLE}`, GENDER.label, GENDER.options);
  } else if (step === 2) {
    body = renderQuestionFrame(`Question 2 of ${TOTAL_ANSWERABLE}`, AGE.label, AGE.options);
  } else if (step < THANKYOU_STEP) {
    const qi = step - RESEARCH_START;
    const q = RESEARCH[qi];
    body = renderQuestionFrame(`Question ${qi + 3} of ${TOTAL_ANSWERABLE}`, q.text, q.options);
  } else {
    body = (
      <div className="fmstk-ty">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="fmstk-ty-logo" src={LOGO_SRC} alt="Fanometrix" />
        <div className="fmstk-badge" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="fmstk-ty-title">{THANK_YOU_TITLE}</p>
        <p className="fmstk-ty-body">{THANK_YOU_BODY}</p>
        <p className="fmstk-ty-tag">Fan voice counted.</p>
      </div>
    );
  }

  const fontVars = { "--fmstk-fq": FONT_Q, "--fmstk-fa": FONT_A } as unknown as CSSProperties;

  return (
    <div className="fmstk-unit" style={fontVars} role="group" aria-label="Fanometrix football fan survey (demonstration)">
      <style>{STACK_CSS}</style>
      {body}
    </div>
  );
}
