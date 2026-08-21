"use client";

// Self-contained production survey creative — "Stack".
// No imports from /creative-lab/. Safe to deploy independently and coexists
// with ClassicSurvey (classic) and ThemedSurvey (timer/invitation): it is only
// ever rendered when the resolved design layout is "stack" (see app/embed/page.tsx).
//
// Visual system: the approved "Fanometrix Stack — Simplified" language in the
// established Countdown palette (deep navy + warm gold, Space Grotesk + Inter).
// One gold question header over four full-width navy answer regions; the gold
// gradient runs darker-at-top -> lighter-at-bottom throughout. No progress UI.
//
// Journey: Intro -> Gender -> Age -> Q1 -> Q2 -> Q3 -> Thank You.
// Answer states: navy (available) -> gold gradient (hover/considering) ->
// richer gold + brief glow-pulse (accepted), then auto-advance.
// Hover motion is a design setting: "fade" or "swipe" (identical end state).

import { useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode, CSSProperties } from "react";
import { Space_Grotesk, Inter } from "next/font/google";
import { resolveSystemPrivacy, privacyPolicyHref } from "@/lib/system-privacy";
import { STACK_RESEARCH_START, stackThankYouStep, stackResearchCounter } from "./stack-frames";
import { questionShownEvent } from "@/lib/survey-events";
import {
  sendEvent as beacon, recordAnswer, submitResponse,
  type EmbedAnswer, type EmbedEvidenceContext,
} from "./evidence";

// Self-hosted via next/font (compile-time, same-origin, size-matched fallback),
// exactly as ThemedSurvey does — avoids a flash-of-fallback on each impression.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const FONT_Q = spaceGrotesk.style.fontFamily; // display: headline, question, CTA
const FONT_A = inter.style.fontFamily;         // body: labels, answers, metadata

// ── Palette (Countdown "Fanometrix Premium" family; matches lib/creative-theme-builder) ──
const NAVY     = "#0B1929"; // primary canvas (answers, intro)
const NAVY_INK = "#041B33"; // deep navy — text on gold
const GOLD     = "#D7B87A";
const GOLD_LO  = "#A8864A";
const GRID     = "rgba(215,184,122,0.12)"; // fine answer separators (quadrant gridline)
const LOGO_SRC = "/Fanometrix_Logo.png";   // gold master wordmark (Thank You only)

type EmbedOption   = { id: number; text: string };
// Identity (`id`, and `canonical_question_key` where the survey carries one) travels
// with every question so each recorded answer names the question it belongs to.
type EmbedQuestion = { id: string; text: string; options: EmbedOption[]; canonical_question_key?: string };

export type StackHoverVariant = "fade" | "swipe";

// Localisation-ready demographic copy. English defaults; a design/survey may
// override. Options can wrap; nothing is hard-locked to a single line.
export interface StackDemographics {
  genderLabel?:   string;
  genderOptions?: string[];
  ageLabel?:      string;
  ageOptions?:    string[];
}

const DEFAULT_DEMOGRAPHICS: Required<StackDemographics> = {
  genderLabel:   "What gender are you?",
  genderOptions: ["Female", "Male", "Non-Binary", "Prefer not to say"],
  ageLabel:      "How old are you?",
  ageOptions:    ["16 - 24 years of age", "25 - 34 years of age", "35 - 44 years of age", "45+ years of age"],
};

export interface StackSurveyProps {
  questions:      EmbedQuestion[];
  thankYouTitle:  string;
  thankYouBody:   string;
  isPreview:      boolean;

  // Interaction setting — Fade (default) or Swipe. Same final hover appearance.
  hoverVariant?:  StackHoverVariant;
  // Intro content hierarchy — "a" (approved default) or "b" (topic-led). Under
  // review; the default is unchanged.
  introVariant?:  "a" | "b";
  // Completion behaviour. "standard" (default) = the simple Thank You.
  // "panel" = the Panel Recruitment completion. Architected as a setting so
  // further completion actions can be added later without reworking the flow.
  completionMode?: "standard" | "panel";
  // Panel Recruitment CTA destination. When unset (no panel landing page yet)
  // the JOIN FANOMETRIX CTA is inert — it never creates a broken live link.
  panelUrl?: string | null;
  // Optional subject shown as small gold metadata on the Intro (e.g. "Women's Football").
  topic?:         string | null;
  demographics?:  StackDemographics;

  // ── Phase 3 Survey-journey props (additive) ──
  // Survey-level intro toggle. Stack historically had an always-on intro at step 0;
  // undefined preserves that (always shown). Explicit false SKIPS the intro and
  // opens on the first journey step (Gender). Explicit true shows it with the
  // authored copy below.
  surveyIntroEnabled?: boolean;
  // Already-resolved localised Intro copy; absent ⇒ existing hardcoded copy.
  introTitle?:    string;
  introBody?:     string;
  // Thank-You toggle. undefined (default) = authored Thank-You (historical always-on);
  // false = minimal "Response recorded" terminal. Completion still fires either way.
  thankYouEnabled?: boolean;

  // Preview-only: render the creative starting on a given flow step (0-based).
  // Ignored in normal operation (defaults to the Intro). Lets the Creative Lab
  // gallery show every frame at once using the real renderer.
  previewStartStep?: number;
  // Preview-only: freeze one answer in its hover or accepted state for static
  // captures. No effect on live behaviour (used by the Creative Lab only).
  previewAnswerIndex?: number;
  previewAnswerState?: "hover" | "accepted";

  // Submit payload / context — passed from EmbedSurvey, identical to ThemedSurvey.
  campaignId:     string;
  surveyId:       string | null;
  publisher:      string | null;
  placement:      string | null;
  placementId:    string | null;
  creativeId:     string | null;
  club:           string | null;
  competition:    string | null;
  country:        string | null;
  segment:        string | null;
  device:         string | null;
  browser:        string | null;
  groupId:        string | null;
  /** WP1: the configuration revision the SERVER selected for this serve.
   *  Echoed on every write, never recomputed, fixed for this iframe's life. */
  configurationRevisionId: string | null;
  countryCode:    string | null;
  market:         string | null;
  surveyLanguage: string;
  sessionId:      string;
}

// ── Scoped styles ──────────────────────────────────────────────────────────────
// Prefixed (.fmstk-*) so nothing leaks; injected once per mount like ThemedSurvey's.
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
/* Variant B — swipe (same gradient, revealed left->right) */
.fmstk-vb .fmstk-ans::before{opacity:1;clip-path:inset(0 100% 0 0);transition:clip-path .3s cubic-bezier(.4,0,.2,1)}
@media (hover:hover) and (pointer:fine){.fmstk-vb .fmstk-ans:hover::before{clip-path:inset(0 0 0 0)}}
.fmstk-vb .fmstk-ans:active::before{clip-path:inset(0 0 0 0)}
/* text turns navy under gold, both variants */
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
/* preview-only: freeze the hover end-state for static Creative Lab captures */
.fmstk-ans.fmstk-hoverdemo::before{opacity:1;clip-path:inset(0 0 0 0)}
.fmstk-ans.fmstk-hoverdemo .fmstk-lbl{color:${NAVY_INK};font-weight:600}

/* intro */
.fmstk-introcontent{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;padding-bottom:48px}
.fmstk-mid{flex:1 1 auto;display:flex;flex-direction:column;text-align:center;padding:18px 24px 0}
.fmstk-group{display:flex;flex-direction:column;align-items:center}
.fmstk-sp{flex:1 1 0}
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

/* discreet privacy — legal/utility metadata, extreme bottom-right over the final
   answer. Tiny mid-dark gold that nearly disappears into the navy; padded so the
   tap target stays usable despite the small type. Independent link (a sibling of
   the answers), so a tap opens privacy and never selects the answer beneath. */
.fmstk-privacy{position:absolute;bottom:1px;right:3px;z-index:5;font-family:var(--fmstk-fa);
  font-size:6.5px;font-weight:600;letter-spacing:.04em;color:#977B41;text-decoration:none;
  padding:5px 6px;line-height:1;transition:opacity .18s ease}
@media (hover:hover) and (pointer:fine){.fmstk-privacy:hover{color:#B89551}}
.fmstk-privacy:focus-visible{outline:2px solid #A9884A;outline-offset:1px;opacity:1}
/* Layering: when the FINAL answer takes the gold (hover / swipe / accepted), the
   gold visually covers Privacy — done by fading + disabling it (not a z-index
   overlap, which can't stay clickable), so it recedes as the row fills and
   returns when the hover ends. Purely visual; Privacy stays a real focusable link. */
.fmstk-unit:has(.fmstk-ans:last-child:hover) .fmstk-privacy,
.fmstk-unit:has(.fmstk-ans:last-child:active) .fmstk-privacy,
.fmstk-unit:has(.fmstk-ans:last-child.fmstk-hoverdemo) .fmstk-privacy,
.fmstk-unit:has(.fmstk-ans:last-child.fmstk-sel) .fmstk-privacy{opacity:0;pointer-events:none}
/* For Swipe, hold Privacy until the gradient has reached the right edge. */
.fmstk-unit:has(.fmstk-vb .fmstk-ans:last-child:hover) .fmstk-privacy{transition-delay:.17s}

/* Panel Recruitment completion (preview mode) */
.fmstk-panelmid{position:absolute;left:0;right:0;top:0;bottom:48px;z-index:2;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:16px 18px;gap:7px}
.fmstk-panel-logo{height:9px;width:auto;opacity:.96;margin-bottom:15px}
.fmstk-panel-title{font-family:var(--fmstk-fq);margin:0;color:#fff;font-size:20px;font-weight:600;letter-spacing:-.02em}
.fmstk-panel-q{font-family:var(--fmstk-fq);margin:3px 0 0;color:#fff;font-size:13px;font-weight:600;letter-spacing:-.01em;text-wrap:balance;max-width:240px}
.fmstk-panel-sub{margin:1px 0 0;color:rgba(255,255,255,.66);font-size:11px;line-height:1.45;max-width:236px;text-wrap:pretty}

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

// Flow: 0 Intro · 1 Gender · 2 Age · 3.. research questions · last Thank You.
const HOLD_MS = 620; // accepted confirmation before auto-advance (matches ThemedSurvey feel)

export function StackSurvey(props: StackSurveyProps) {
  const {
    questions, thankYouTitle, thankYouBody, isPreview,
    hoverVariant = "fade", topic = null,
    introVariant = "b", completionMode = "standard", panelUrl = null,
    demographics, previewStartStep, previewAnswerIndex, previewAnswerState,
    surveyIntroEnabled, introTitle, introBody, thankYouEnabled,
    campaignId, surveyId, publisher, placement, placementId, creativeId,
    club, competition, country, segment, device, browser,
    groupId, configurationRevisionId, countryCode, market, surveyLanguage, sessionId,
  } = props;

  const demo = { ...DEFAULT_DEMOGRAPHICS, ...(demographics ?? {}) };
  const nq = questions.length;
  const RESEARCH_START = STACK_RESEARCH_START; // 0 Intro · 1 Gender · 2 Age · 3.. research
  const THANKYOU_STEP  = stackThankYouStep(nq);

  // Undefined preserves the historical always-on intro; explicit false skips it.
  const introEnabled = surveyIntroEnabled ?? true;
  // First journey step when there is no intro (Gender = step 1).
  const FIRST_JOURNEY_STEP = 1;
  // Authored intro copy with fallback to the historical hardcoded copy.
  const introLead = introTitle ?? "Football fans deserve a voice.";
  const introSub  = introBody  ?? "Help shape better football experiences by sharing yours.";

  const [step, setStep] = useState<number>(
    previewStartStep != null
      ? Math.max(0, Math.min(previewStartStep, THANKYOU_STEP))
      : (introEnabled ? 0 : FIRST_JOURNEY_STEP)
  );
  // The accepted answer currently pulsing, so we hold it visibly before advancing.
  const [accepted, setAccepted] = useState<{ step: number; idx: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const advancingRef = useRef(false);
  const startRef     = useRef<number>(0);    // completion timer — set on Start press
  const answersRef   = useRef<Record<string, number>>({}); // research answers by question id
  const genderRef    = useRef<string | null>(null);
  const ageRef       = useRef<string | null>(null);
  const hasRendered  = useRef(false);
  const hasVisible   = useRef(false);
  const hasShownQ1   = useRef(false);     // QUESTION_1_SHOWN = Q1 displayed (once)
  const hasStarted   = useRef(false);     // SURVEY_START = first answer selected (once)
  const hasIntroViewed = useRef(false);   // INTRO_VIEWED (once)
  const hasContinued   = useRef(false);   // INTRO_CONTINUED (once)
  const hasCompleted = useRef(false);

  // ── The shared evidence contract (app/embed/evidence.ts) ──────────────────
  // Identical to every other production renderer.
  const evidenceCtx = useCallback((): EmbedEvidenceContext => ({
    isPreview,
    sessionId,
    campaignId,
    surveyId,
    publisher, placement, placementId, creativeId,
    country, segment, market,
    device, browser,
    renderer: "stack",
    groupId: groupId,
    configurationRevisionId: configurationRevisionId,
  }), [isPreview, sessionId, campaignId, surveyId, publisher, placement, placementId, creativeId, country, segment, market, device, browser]);

  const sendEvent = useCallback((eventType: string) => {
    beacon(evidenceCtx(), eventType);
  }, [evidenceCtx]);

  /** The full ordered RESEARCH answer set, for the completion backfill. Gender and
   *  Age are journey furniture (they land on responses.gender / age_band) and are
   *  never questions, so they never appear here or occupy a question index. */
  const answerSet = useCallback((): EmbedAnswer[] => {
    const given = answersRef.current;
    return questions
      .map((q, qi) => ({ q, qi }))
      .filter(({ q }) => given[q.id] != null)
      .map(({ q, qi }) => ({
        questionIndex: qi,
        answerValue: String(given[q.id]),
        questionId: q.id,
        canonicalQuestionKey: q.canonical_question_key ?? null,
      }));
  }, [questions]);

  // SURVEY_RENDER once on mount (an impression), regardless of viewport.
  useEffect(() => {
    if (previewStartStep != null) return;      // gallery tiles are not impressions
    if (!hasRendered.current) { hasRendered.current = true; sendEvent("SURVEY_RENDER"); }
  }, [sendEvent, previewStartStep]);

  // SURVEY_VISIBLE once on genuine viewport entry.
  useEffect(() => {
    if (previewStartStep != null) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !document.hidden && !hasVisible.current) {
        hasVisible.current = true; sendEvent("SURVEY_VISIBLE");
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [sendEvent, previewStartStep]);

  // Journey milestones at entry. With the intro shown it is INTRO_VIEWED here.
  // NOTE: unlike the other creatives, entering this journey does NOT display Q1 —
  // the Gender and Age frames come first. QUESTION_1_SHOWN therefore fires from the
  // step watcher below, when the first RESEARCH question is actually on screen.
  // SURVEY_START is reserved for the first ANSWER (its historical meaning).
  useEffect(() => {
    if (previewStartStep != null) return;   // gallery tiles are not impressions
    if (introEnabled) {
      if (!hasIntroViewed.current) { hasIntroViewed.current = true; sendEvent("INTRO_VIEWED"); }
    } else if (startRef.current === 0) {
      // Journey-entry origin for the completion timer (effect, not render).
      startRef.current = Date.now();
    }
  }, [sendEvent, previewStartStep, introEnabled]);

  // Q1 DISPLAYED — the first research frame, after the demographic furniture.
  useEffect(() => {
    if (previewStartStep != null) return;
    if (step >= RESEARCH_START && step < THANKYOU_STEP && !hasShownQ1.current) {
      hasShownQ1.current = true;
      sendEvent(questionShownEvent(0));
    }
  }, [step, sendEvent, previewStartStep, RESEARCH_START, THANKYOU_STEP]);

  function handleStart() {
    // Continuing from the intro moves into the journey (Gender first, not Q1).
    if (!hasContinued.current) { hasContinued.current = true; sendEvent("INTRO_CONTINUED"); }
    if (startRef.current === 0) startRef.current = Date.now();
    setStep(FIRST_JOURNEY_STEP);
  }

  async function submitCompletedResponse() {
    if (isPreview) return;
    // eslint-disable-next-line react-hooks/purity
    const duration = Math.round((Date.now() - startRef.current) / 1000);
    const a = answersRef.current;
    // SURVEY_COMPLETED is emitted by submitResponse() and ONLY once the server has
    // confirmed the response was written — this creative previously fired it
    // unconditionally, so a failed submit still produced a "completion".
    const outcome = await submitResponse(evidenceCtx(), {
      campaign_id: campaignId, survey_id: surveyId,
      publisher, placement, placement_id: placementId, creative_id: creativeId,
      club, competition,
      // Legacy positional projection only; `answers` is authoritative and is the
      // only representation that can carry Q4/Q5.
      q1: a[questions[0]?.id] ?? null,
      q2: a[questions[1]?.id] ?? null,
      q3: a[questions[2]?.id] ?? null,
      country, fan_segment: segment, device, browser,
      response_duration_seconds: duration,
      group_id: groupId, country_code: countryCode, market, survey_language: surveyLanguage,
      // Demographics collected by the Stack flow. /api/submit persists these to
      // responses.gender / responses.age_band (dimensions alongside the research
      // answers) — they are NOT questions and never occupy a question index.
      gender: genderRef.current, age: ageRef.current,
    }, answerSet());
    hasCompleted.current = outcome.recorded;
  }

  // Select an answer on the current frame -> accepted -> hold -> advance.
  function selectAnswer(idx: number, value: string) {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setAccepted({ step, idx });

    if (step === 1) {
      // Journey furniture, not a survey question — lands on responses.gender.
      genderRef.current = value;
    } else if (step === 2) {
      // Journey furniture, not a survey question — lands on responses.age_band.
      ageRef.current = value;
    } else {
      const qi = step - RESEARCH_START;   // 0-based RESEARCH index, never the frame
      const q = questions[qi];
      const opt = q?.options[idx];
      if (opt) {
        answersRef.current[q.id] = opt.id;
        // SURVEY_START fires on the FIRST research answer (historical meaning).
        const isFirstAnswer = !hasStarted.current;
        if (isFirstAnswer) hasStarted.current = true;
        void recordAnswer(evidenceCtx(), {
          questionIndex: qi,
          answerValue: String(opt.id),
          questionId: q.id,
          canonicalQuestionKey: q.canonical_question_key ?? null,
        }, isFirstAnswer);
      }
    }

    window.setTimeout(async () => {
      const next = step + 1;
      // The next RESEARCH question is now displayed (generic over 1-5 questions).
      // Demographic frames are skipped: next-RESEARCH_START is the question index.
      const nextQi = next - RESEARCH_START;
      if (nextQi >= 1 && nextQi < nq) sendEvent(questionShownEvent(nextQi));
      if (step === THANKYOU_STEP - 1) await submitCompletedResponse();
      setAccepted(null);
      setStep(next);
      advancingRef.current = false;
    }, isPreview ? 260 : HOLD_MS);
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  const variantClass = hoverVariant === "swipe" ? "fmstk-vb" : "fmstk-va";

  function renderAnswers(options: string[]) {
    return (
      <div className={`fmstk-answers ${variantClass}`}>
        {options.map((text, i) => {
          const isSel = (accepted?.step === step && accepted?.idx === i)
            || (previewAnswerState === "accepted" && previewAnswerIndex === i);
          const isHoverDemo = previewAnswerState === "hover" && previewAnswerIndex === i;
          return (
            <button
              key={i}
              type="button"
              className={`fmstk-ans${isSel ? " fmstk-sel" : ""}${isHoverDemo ? " fmstk-hoverdemo" : ""}`}
              onClick={() => selectAnswer(i, text)}
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
        {/* Independent link overlaying the final answer's bottom-right. stopPropagation
            keeps a Privacy tap from ever selecting the answer beneath it. */}
        <a className="fmstk-privacy" href={privacyPolicyHref(surveyLanguage)}
          target="_blank" rel="noopener"
          onClick={(e) => e.stopPropagation()}>{resolveSystemPrivacy(surveyLanguage).label}</a>
        <div className="fmstk-frame" />
      </>
    );
  }

  let body: ReactNode;
  if (step === 0) {
    // Unified V1 estimate: ~5s per research question + 5s for the intro, min 10,
    // to 5s (Gender/Age demographics and the terminal Thank-You are not counted —
    // consistent with the other mechanics). The displayed count is the research
    // question count (nq), the survey's actual questions.
    const estSeconds = Math.max(10, 5 * nq + 5);
    const particText = `~${estSeconds} seconds · ${nq} question${nq === 1 ? "" : "s"} · In banner`;
    const topicEl = topic
      ? <p className="fmstk-topic"><span className="fmstk-tk">Topic:</span> {topic}</p>
      : null;
    // Version A (approved default): proposition group, then topic sits lower.
    // Version B (under review): topic-led, participation returns to gold.
    const introMid = introVariant === "b" ? (
      <div className="fmstk-mid fmstk-mid-b">
        {topicEl}
        <div className="fmstk-group">
          <p className="fmstk-lead">{introLead}</p>
          <p className="fmstk-sub">{introSub}</p>
          <p className="fmstk-partic fmstk-partic-gold">{particText}</p>
        </div>
      </div>
    ) : (
      <div className="fmstk-mid">
        <div className="fmstk-group">
          <p className="fmstk-lead">{introLead}</p>
          <p className="fmstk-sub">{introSub}</p>
          <p className="fmstk-partic">{particText}</p>
        </div>
        <span className="fmstk-sp" />
        {topicEl}
        <span className="fmstk-sp" />
      </div>
    );
    body = (
      <>
        <div className="fmstk-introcontent">{introMid}</div>
        <button className="fmstk-cta" type="button" onClick={handleStart} aria-label="Start survey">
          Start Survey <span className="fmstk-arw" aria-hidden>→</span>
          <span className="fmstk-shine" aria-hidden />
        </button>
        <div className="fmstk-frame" />
      </>
    );
  } else if (step === 1) {
    // Gender is a demographic frame — journey furniture, NOT a Survey question, so
    // it carries a neutral label and never a "Question X of N" counter.
    body = renderQuestionFrame("About you", demo.genderLabel, demo.genderOptions);
  } else if (step === 2) {
    body = renderQuestionFrame("About you", demo.ageLabel, demo.ageOptions);
  } else if (step < THANKYOU_STEP) {
    const qi = step - RESEARCH_START;
    const q = questions[qi];
    // Counter is over SURVEY questions only: research question qi → "Question qi+1 of nq".
    // In the Studio preview the questions ARE the live draft (rendered inline), so nq
    // is the live count and the counter is correct without any override.
    const { position, total } = stackResearchCounter(qi, nq);
    body = renderQuestionFrame(
      `Question ${position} of ${total}`,
      q?.text ?? "",
      (q?.options ?? []).map(o => o.text),
    );
  } else if (completionMode === "panel") {
    // Panel Recruitment completion — PREVIEW ONLY. The CTA is intentionally inert
    // (no navigation) until a Fanometrix panel landing page exists; this mode is
    // never the production default (completionMode defaults to "standard").
    body = (
      <>
        <div className="fmstk-panelmid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="fmstk-panel-logo" src={LOGO_SRC} alt="Fanometrix" />
          <p className="fmstk-panel-title">{thankYouTitle}</p>
          <p className="fmstk-panel-q">Want your voice heard more often?</p>
          <p className="fmstk-panel-sub">Join the Fanometrix Panel and help shape what football asks next.</p>
        </div>
        {panelUrl ? (
          <a className="fmstk-cta" href={panelUrl} target="_blank" rel="noopener" aria-label="Join Fanometrix">
            Join Fanometrix <span className="fmstk-arw" aria-hidden>→</span>
            <span className="fmstk-shine" aria-hidden />
          </a>
        ) : (
          // No panel landing page configured yet — inert CTA (no navigation).
          <button className="fmstk-cta" type="button" aria-label="Join Fanometrix"
            onClick={() => {/* inert until a panel URL is configured */}}>
            Join Fanometrix <span className="fmstk-arw" aria-hidden>→</span>
            <span className="fmstk-shine" aria-hidden />
          </button>
        )}
        <div className="fmstk-frame" />
      </>
    );
  } else if (thankYouEnabled === false) {
    // Authored Thank-You suppressed — minimal system acknowledgement. Submit +
    // SURVEY_COMPLETED already fired on the final answer (see submitResponse).
    body = (
      <div className="fmstk-ty">
        <p className="fmstk-ty-title" style={{ fontSize: 16, fontWeight: 500 }}>Response recorded</p>
      </div>
    );
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
        <p className="fmstk-ty-title">{thankYouTitle}</p>
        <p className="fmstk-ty-body">{thankYouBody}</p>
        <p className="fmstk-ty-tag">Fan voice counted.</p>
      </div>
    );
  }

  const fontVars = { "--fmstk-fq": FONT_Q, "--fmstk-fa": FONT_A } as unknown as CSSProperties;

  return (
    <div
      ref={containerRef}
      className="fmstk-unit"
      style={fontVars}
      role="group"
      aria-label="Fanometrix football fan survey"
    >
      <style>{STACK_CSS}</style>
      {body}
    </div>
  );
}
