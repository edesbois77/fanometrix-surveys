"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ThemedSurvey, type EmbedTheme } from "./ThemedSurvey";
import { ClassicSurvey } from "./ClassicSurvey";
import { StudioClassicSurvey } from "./StudioClassicSurvey";
import { StackSurvey } from "./StackSurvey";
import { parseStackPreviewFrame, resolveStackPreviewStep } from "./stack-frames";
import { coerceStackConfig, DEFAULT_STACK_CONFIG, type StackConfig } from "@/lib/stack-config";
import { initialPhase, phaseForFailure, mayMountSurvey, isPreviewContext as ctxIsPreview,
         suppressEvidence as ctxSuppressEvidence, isDesignSample as ctxIsDesignSample,
         type PreviewPhase } from "@/lib/embed-preview-phase";

const NAVY = "#071B2F";

const QUESTIONS = [
  {
    id: "q1",
    text: "How often do you attend live events?",
    options: [
      { id: 1, text: "Never" },
      { id: 2, text: "1–2 times a year" },
      { id: 3, text: "3–5 times a year" },
      { id: 4, text: "5+ times a year" },
    ],
  },
  {
    id: "q2",
    text: "Rate your overall fan experience?",
    options: [
      { id: 1, text: "Poor" },
      { id: 2, text: "Average" },
      { id: 3, text: "Good" },
      { id: 4, text: "Excellent" },
    ],
  },
  {
    id: "q3",
    text: "Likely to recommend us to a friend?",
    options: [
      { id: 1, text: "Not likely" },
      { id: 2, text: "Somewhat likely" },
      { id: 3, text: "Likely" },
      { id: 4, text: "Very likely" },
    ],
  },
];

// Sample research questions shown in the Stack DESIGN preview (Creative Studio /
// design-section preview, i.e. layout=stack with no campaign). A live campaign
// always uses its assigned survey's questions instead; these are the preview
// sample so the creative demonstrates a realistic Women's Football survey.
const STACK_PREVIEW_QUESTIONS = [
  { id: "q1", text: "What matters most when choosing a match to watch?", options: [
    { id: 1, text: "The teams playing" }, { id: 2, text: "The players involved" },
    { id: 3, text: "The importance of the match" }, { id: 4, text: "How easy it is to watch" } ] },
  { id: "q2", text: "What would make you watch women's football more often?", options: [
    { id: 1, text: "More matches on TV" }, { id: 2, text: "Easier streaming access" },
    { id: 3, text: "More coverage and promotion" }, { id: 4, text: "Nothing, I watch enough" } ] },
  { id: "q3", text: "How do you think women's football will grow over the next 5 years?", options: [
    { id: 1, text: "Significantly" }, { id: 2, text: "Moderately" },
    { id: 3, text: "A little" }, { id: 4, text: "Not at all" } ] },
];

// Preview-only sample content for the Stack creative (long / translated strings),
// used solely to verify wrapping in the embed preview. Never reached outside
// isPreview + ?plong=1 (see the Stack branch below).
const STACK_PREVIEW_LONG_QUESTIONS = [
  { id: "q1", text: "Was zieht dich am meisten in ein Fußballspiel hinein?", options: [
    { id: 1, text: "Die Dramatik und Spannung" }, { id: 2, text: "Die technische Klasse" },
    { id: 3, text: "Die Stimmung im Stadion" }, { id: 4, text: "Die große Rivalität" } ] },
  { id: "q2", text: "Was bringt dich dazu, eine Mannschaft zu unterstützen?", options: [
    { id: 1, text: "Herausragende Spielerinnen" }, { id: 2, text: "Eine großartige Geschichte" },
    { id: 3, text: "Eine lokale Verbindung zur Region" }, { id: 4, text: "Besonders schöner Fußball" } ] },
  { id: "q3", text: "Wie verfolgst du das Spiel heutzutage?", options: [
    { id: 1, text: "Live im Fernsehen" }, { id: 2, text: "Über Streaming-Dienste" },
    { id: 3, text: "Kurze Clips in sozialen Medien" }, { id: 4, text: "Direkt im Stadion vor Ort" } ] },
];
const STACK_PREVIEW_LONG_DEMO = {
  genderLabel: "Mit welchem Geschlecht identifizierst du dich?",
  genderOptions: ["Weiblich", "Männlich", "Nicht-binär", "Keine Angabe machen"],
  ageLabel: "In welcher Altersgruppe befindest du dich?",
  ageOptions: ["16–24 Jahre", "25–34 Jahre", "35–44 Jahre", "45 Jahre und älter"],
};

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

// ─── Main survey component ──────────────────────────────────────────────────
// Resolves campaign/group/survey params to questions + the chosen creative
// design, then hands off entirely to whichever creative component the
// design's layout resolves to (the layout comes back from the embed API,
// which looks it up in the creative_designs table).
// Each creative component (ThemedSurvey, ClassicSurvey) is self-contained —
// it owns its own event tracking and submit call, not shared with this parent.

export type EmbedOption = { id: number; text: string };
// `id` and `canonical_question_key` are the question's IDENTITY, resolved server-side
// and recorded against every answer — so reordering or re-wording a survey's questions
// can never make historical answers ambiguous. Position alone is not an identity.
export type Question = {
  id: string;
  text: string;
  options: EmbedOption[];
  canonical_question_key?: string;
};

// Neutral preview chrome. Deliberately not any creative's palette: a loading or
// unavailable state must never look like a rendered design.
const PREVIEW_NEUTRAL_BG = "#12161C";
const PREVIEW_NEUTRAL_FG = "#C9D1D9";

function EmbedSurvey() {
  const params = useSearchParams();

  const campaign      = params.get("campaign")     ?? "default";
  const groupSlug     = params.get("group")        ?? null;
  const urlLang       = params.get("lang");
  const surveyId      = params.get("survey")       ?? null;
  const isPreview     = params.get("preview")      === "1";
  const questionSetId = params.get("qset")         ?? null;
  const publisher     = params.get("publisher")    ?? null;
  const placement     = params.get("placement")    ?? null;
  const placementId   = params.get("placement_id") ?? null;
  // Explicit ?creative_id= override, for ad tags that name a creative directly.
  // Almost nothing sets it, which is why creative_id was NULL on 100% of rows
  // (1.13M events, 5.3k responses) despite the whole write path working: the
  // embed reported this parameter instead of the design it actually rendered.
  // See docs/m1-migration-plan.md §2. The reported value now falls back to the
  // server-resolved design (creativeDesign, below).
  const creativeIdParam = params.get("creative_id") ?? null;
  const club          = params.get("club")         ?? null;
  const competition   = params.get("competition")  ?? null;
  const countryParam  = params.get("country")      ?? "";
  const country       = resolveCountry(countryParam);
  const marketParam   = params.get("market")       ?? null;
  const segment       = params.get("segment")      ?? null;

  const [device,  setDevice]  = useState<string | null>(null);
  const [browser, setBrowser] = useState<string | null>(null);

  // Ad-ops review token, read from the URL FRAGMENT — never a query parameter.
  //
  // A fragment is not transmitted in any HTTP request, so the token never enters
  // Vercel access logs, never appears in a Referer header, and is not written to
  // the server side of anything. It is read once, stripped from the address bar
  // and history immediately, and exchanged for the payload over POST.
  // Read at FIRST render, not in an effect: the token is known before anything
  // fetches, so a review link never briefly requests without it, and there is no
  // setState-in-effect cascade.
  const [previewToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const m = /(?:^#|&)pt=([A-Za-z0-9_-]{43})(?:&|$)/.exec(window.location.hash);
    return m ? m[1] : null;
  });
  // Strip it from the address bar and history immediately, so a screenshot, a
  // shoulder-surfer or a later "copy URL" cannot leak a working link.
  useEffect(() => {
    if (previewToken && typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [previewToken]);

  // The DESIGN SAMPLE context: Creative Lab / design-card preview, with no
  // campaign, group or survey. It legitimately renders sample questions, and is
  // the ONLY context allowed to show QUESTIONS. Everything else must resolve
  // real content first.
  // ── Preview state machine ──────────────────────────────────────────────────
  // The decisions live in lib/embed-preview-phase.ts as pure functions, so the
  // rules that matter are testable without a DOM. No survey component may mount
  // before the authorised payload AND its creative are fully resolved.
  const embedCtx = {
    hasCampaignSlug: !groupSlug && !!campaign && campaign !== "default",
    hasGroupSlug: !!groupSlug,
    hasSurveyId: !!surveyId,
    previewFlag: isPreview,
    hasPreviewToken: !!previewToken,
  };
  // Readable marker (no credential) left by a previous exchange, so a refreshed
  // tab knows it is a review even when its HttpOnly session has just been
  // revoked — and shows "Preview unavailable" rather than a silent blank frame.
  const hadPreviewSession = typeof document !== "undefined"
    && /(?:^|;\s*)fx_preview_ctx=1(?:;|$)/.test(document.cookie);
  const isDesignSample   = ctxIsDesignSample(embedCtx);
  const isPreviewContext = ctxIsPreview(embedCtx) || hadPreviewSession;
  const [phase, setPhase] = useState<PreviewPhase>(() => initialPhase(embedCtx));

  const [questions,      setQuestions]      = useState<Question[]>(
    isDesignSample ? QUESTIONS : []
  );
  const [thankYouTitle,  setThankYouTitle]  = useState("Thank you!");
  const [thankYouBody,   setThankYouBody]   = useState("Your anonymous feedback helps improve the football experience for fans everywhere.");

  // ── Phase 3 Survey-journey fields (resolved server-side; see the embed routes) ──
  // surveyIntroEnabled: NULL/false ⇒ no survey-level intro. thankYouEnabled:
  // undefined ⇒ enabled (historical default), false ⇒ suppressed. introTitle/Body
  // are already-resolved localised strings (undefined ⇒ renderer fallback copy).
  // Tri-state: undefined = legacy (renderer picks its historical default — Stack
  // keeps its always-on intro, Timer/Studio Classic show none); true/false = a
  // Studio Survey-journey decision. Never coerce NULL→false here.
  const [surveyIntroEnabled, setSurveyIntroEnabled] = useState<boolean | undefined>(undefined);
  const [introTitle,         setIntroTitle]         = useState<string | undefined>(undefined);
  const [introBody,          setIntroBody]          = useState<string | undefined>(undefined);
  const [thankYouEnabled,    setThankYouEnabled]    = useState<boolean | undefined>(undefined);

  const [resolvedCampaignId, setResolvedCampaignId] = useState<string>(campaign);
  const [groupReady,         setGroupReady]         = useState(!groupSlug);
  const [creativeDesign,     setCreativeDesign]     = useState<string | null>(null);
  const [customTheme,        setCustomTheme]        = useState<EmbedTheme | null>(null);
  // The design's creative layout ("timer" | "classic" | "invitation"), resolved
  // server-side. Only "invitation" changes behaviour here (shows the intro
  // screen before Q1); the rest is inferred from customTheme presence below.
  const [resolvedLayout,     setResolvedLayout]     = useState<string | null>(null);
  // Explicit renderer selector resolved server-side (config.renderer ?? layout).
  // "studio-classic" dispatches to the refreshed StudioClassicSurvey; historical
  // classic designs resolve to "classic" → the unchanged ClassicSurvey.
  const [resolvedRenderer,   setResolvedRenderer]   = useState<string | null>(null);
  // Stack-only config resolved server-side from creative_designs.config (null for
  // non-stack designs, and until the config column is migrated → falls back to
  // approved defaults). Preview URL params still override it for the Studio/QA.
  const [stackConfig,        setStackConfig]        = useState<StackConfig | null>(null);
  // Survey/campaign-level Topic (campaigns.topic), shown on the Stack intro. Not a
  // design property — the same Stack design carries a different topic per campaign.
  const [campaignTopic,      setCampaignTopic]      = useState<string | null>(null);
  const [introTopic,         setIntroTopic]         = useState<string | undefined>(undefined);
  // Set from the SERVER's `preview` flag. On a refresh the tab has no token and
  // cannot read the HttpOnly session, so it cannot infer a review context by
  // itself — the server tells it, and evidence stays suppressed.
  const [serverPreview,      setServerPreview]      = useState(false);
  const [branding,           setBranding]           = useState<string[]>([]);
  const [resolvedGroupId,      setResolvedGroupId]      = useState<string | null>(null);
  const [resolvedSurveyLang,   setResolvedSurveyLang]   = useState<string>(urlLang ?? "en");
  const [resolvedCountryCode,  setResolvedCountryCode]  = useState<string | null>(countryParam || null);
  const [resolvedMarket,       setResolvedMarket]       = useState<string | null>(marketParam);

  // A stable per-mount session id (generated once, never changes). Held in lazy
  // useState rather than a ref so it can be read during render without the
  // ref-in-render lint, with identical set-once semantics.
  const [sessionId] = useState<string>(() => (typeof crypto !== "undefined" ? crypto.randomUUID() : ""));

  // ── The single client application path ────────────────────────────────────
  // Every context — group, campaign, survey-based preview and ad-ops review —
  // applies its resolved payload through THIS function. Parity is a property of
  // there being one path, not of three setter blocks agreeing. Adding a field
  // here reaches every surface at once.
  const applyPayload = useCallback((data: Record<string, unknown>) => {
    setQuestions(data.questions as Question[]);
    setThankYouTitle((data.thank_you_title as string) ?? "Thank you!");
    setThankYouBody((data.thank_you_body as string) ?? "");
    // Creative
    setCreativeDesign((data.creative_design as string) ?? null);
    setCustomTheme((data.custom_theme as EmbedTheme) ?? null);
    setResolvedLayout((data.layout as string) ?? null);
    setResolvedRenderer((data.renderer as string) ?? null);
    setStackConfig(coerceStackConfig(data.config));
    setCampaignTopic((data.topic as string) ?? null);
    setBranding((data.branding as string[]) ?? []);
    // Survey journey
    setSurveyIntroEnabled((data.intro_enabled as boolean) ?? undefined);
    setIntroTitle((data.intro_title as string) ?? undefined);
    setIntroBody((data.intro_body as string) ?? undefined);
    // Short survey subject shown as "Topic: …" on the intro frame. Supplied by
    // no embed surface before this — only the Studio builder preview showed it,
    // because it passes its own local state straight to the renderer.
    setIntroTopic((data.intro_topic as string) ?? undefined);
    setThankYouEnabled((data.thank_you_enabled as boolean) ?? undefined);
    setServerPreview(data.preview === true);
    setPhase("resolved");
  }, []);

  /** Classify a failed resolution. 401/403/404 and an invalid grant are
   *  "unavailable"; anything else is "error". Neither renders survey content. */
  const failResolution = useCallback((status: number | null) => {
    setPhase(phaseForFailure(status));
  }, []);

  useEffect(() => {
    setDevice(detectDevice());
    setBrowser(detectBrowser());
  }, []);
  // Group mode: resolve which campaign to serve and fetch its questions
  useEffect(() => {
    if (!groupSlug) return;
    const gParams = new URLSearchParams({ slug: groupSlug });
    if (countryParam)  gParams.set("country",   countryParam);
    if (marketParam)   gParams.set("market",     marketParam);
    if (publisher)     gParams.set("publisher",  publisher);
    if (urlLang)       gParams.set("lang",       urlLang);

    fetch(`/api/embed/group?${gParams.toString()}`)
      .then(async r => (r.ok ? { data: await r.json(), status: r.status } : { data: null, status: r.status }))
      .then(({ data, status }) => {
        if (data?.campaign_id && data?.questions?.length) {
          setResolvedCampaignId(data.campaign_id);
          setResolvedGroupId(data.group_id ?? groupSlug);
          setResolvedSurveyLang(urlLang ?? data.survey_language ?? "en");
          setResolvedCountryCode(data.country_code ?? (countryParam || null));
          setResolvedMarket(data.market ?? marketParam);
          applyPayload(data);            // single shared path
          setGroupReady(true);
        } else {
          failResolution(status);
          setGroupReady(false);
        }
      })
      .catch(() => { failResolution(null); setGroupReady(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSlug]);
  // Campaign mode — production delivery, Deploy inline preview, and anonymous
  // ad-ops review (which carries preview_token instead of a session).
  const hasCampaignSlug = !groupSlug && !!campaign && campaign !== "default";
  useEffect(() => {
    if (!hasCampaignSlug) return;
    const run = previewToken
      // EXCHANGE: the token travels in a POST body, which no access log records.
      ? fetch(`/api/embed/campaign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          referrerPolicy: "no-referrer",
          body: JSON.stringify({ campaign_id: campaign, lang: urlLang, preview_token: previewToken }),
        })
      : (() => {
          const p = new URLSearchParams({ campaign_id: campaign });
          if (urlLang) p.set("lang", urlLang);
          if (isPreview) p.set("preview", "1");
          return fetch(`/api/embed/campaign?${p.toString()}`, { referrerPolicy: "no-referrer" });
        })();

    run
      .then(async r => (r.ok ? { data: await r.json(), status: r.status } : { data: null, status: r.status }))
      .then(({ data, status }) => {
        if (data?.questions?.length) applyPayload(data);   // single shared path
        else failResolution(status);
      })
      .catch(() => failResolution(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, hasCampaignSlug, previewToken]);
  // Survey-only mode — the Studio builder's "Preview full survey". Always
  // authenticated (the API requires a session for the owning organisation);
  // a survey UUID is never a public key to draft content.
  useEffect(() => {
    if (groupSlug || hasCampaignSlug || !surveyId) return;
    const surveyApiUrl = `/api/embed/survey?id=${surveyId}&lang=${encodeURIComponent(urlLang ?? "en")}${isPreview ? "&preview=1" : ""}`;
    fetch(surveyApiUrl, { referrerPolicy: "no-referrer" })
      .then(async r => (r.ok ? { data: await r.json(), status: r.status } : { data: null, status: r.status }))
      .then(({ data, status }) => {
        if (data?.questions?.length) {
          setResolvedSurveyLang(urlLang ?? "en");
          applyPayload(data);            // single shared path
        } else {
          failResolution(status);
        }
      })
      .catch(() => failResolution(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyId, groupSlug, hasCampaignSlug]);

  // ── Render gate ────────────────────────────────────────────────────────────
  // NOTHING that renders survey content may mount before `phase === "resolved"`.
  // The renderer is chosen from resolvedRenderer/resolvedLayout below, which are
  // only ever set by applyPayload, so the selected creative mounts ONCE. There is
  // no intermediate mount to replace, which is what produced the ClassicSurvey
  // flash on every refresh.
  if (!mayMountSurvey(phase) && phase === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading preview"
        style={{
          width: 300, height: 250, display: "flex", alignItems: "center", justifyContent: "center",
          background: PREVIEW_NEUTRAL_BG, color: PREVIEW_NEUTRAL_FG,
          font: "500 12px/1.4 system-ui, -apple-system, sans-serif", letterSpacing: "0.01em",
          borderRadius: 8,
        }}
      >
        {isPreviewContext ? "Loading preview…" : ""}
      </div>
    );
  }

  if (phase === "unavailable" || phase === "error") {
    // Production delivery keeps its historical silent-transparent behaviour, so
    // a failed live impression looks exactly as it always has. Preview contexts
    // get an explicit neutral state — and in NEITHER case is any question,
    // intro, branding or sample content rendered.
    if (!isPreviewContext) {
      return <div style={{ width: 300, height: 250, background: "transparent" }} />;
    }
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          width: 300, height: 250, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 6, padding: 20, textAlign: "center",
          background: PREVIEW_NEUTRAL_BG, color: PREVIEW_NEUTRAL_FG,
          font: "500 12px/1.5 system-ui, -apple-system, sans-serif", borderRadius: 8,
        }}
      >
        <span style={{ fontWeight: 700 }}>Preview unavailable</span>
        <span style={{ opacity: 0.75, fontSize: 11 }}>
          {phase === "unavailable"
            ? "This review link is not valid, has expired, or you do not have access."
            : "The preview could not be loaded. Check your connection and try again."}
        </span>
      </div>
    );
  }

  if (groupSlug && !groupReady) {
    return <div style={{ width: 300, height: 250, background: "transparent" }} />;
  }

  // ── Evidence isolation ─────────────────────────────────────────────────────
  // ONLY genuine production delivery records anything. Every preview context is
  // silent: no impressions, no survey events, no partial answers, no completed
  // responses, no submission logs.
  //
  // Derived from what this embed IS, not from a single flag. `?preview=1` alone
  // was not enough: an ad-ops review link carries preview_token WITHOUT
  // preview=1, so it would otherwise have written real evidence against a real
  // campaign. The design-sample context has no campaign at all and must equally
  // never post.
  // OR-ed with the server's verdict: a refresh authorised by a preview session
  // looks like production delivery from the URL alone, and must still be silent.
  const suppressEvidence = ctxSuppressEvidence(embedCtx) || serverPreview;

  // Stack creative — an independent, self-contained design. Rendered only when
  // the resolved design layout is explicitly "stack" (server-side, via
  // creative_designs), so existing Timer/Classic designs are entirely unaffected.
  // A ?layout=stack override is honoured in preview only, for the Creative Lab.
  const isStack = resolvedLayout === "stack" || (isPreview && params.get("layout") === "stack");
  if (isStack) {
    const reportedStackId = creativeIdParam ?? creativeDesign;
    // Whether this Stack impression is backed by a REAL survey (live campaign, or a
    // Survey-stage draft preview via ?survey=<id>&preview=1&layout=stack) rather than
    // the design-level sample. Drives both the question source and whether the
    // survey's intro/thank-you journey fields apply (sample keeps its own defaults).
    const stackUsesRealSurvey = resolvedLayout === "stack"
      || (!!surveyId && !groupSlug && !hasCampaignSlug);
    // Preview-only viewing aids (Creative Lab / verification): jump to a frame,
    // freeze an answer state, or load long/translated sample copy. All gated on
    // isPreview so live impressions are never affected.
    // Saved config (from creative_designs.config) is the source of truth; the
    // preview-only URL params override it for the Studio/QA preview.
    const cfg = stackConfig ?? DEFAULT_STACK_CONFIG;
    const pvLong  = isPreview && params.get("plong") === "1";
    const astate  = isPreview ? params.get("astate") : null;
    const frameQ  = isPreview ? params.get("frame") : null;
    const fqQ     = isPreview ? params.get("fq")    : null;
    const aidxQ   = isPreview ? params.get("aidx")  : null;
    // Resolve the SEMANTIC preview frame (intro/question/thankyou) against THIS
    // renderer's own question count — the effective questions array below. A
    // question frame clamps to the newest available Survey question and never
    // becomes Thank You, even if the persisted survey is behind the live draft.
    // A raw numeric `frame` (the design-level static card) keeps its old meaning.
    const effQuestions = pvLong ? STACK_PREVIEW_LONG_QUESTIONS
      : stackUsesRealSurvey ? questions
      : STACK_PREVIEW_QUESTIONS;
    const semanticFrame = parseStackPreviewFrame(frameQ, fqQ);
    const previewStartStep = semanticFrame != null
      ? resolveStackPreviewStep(semanticFrame, effQuestions.length)
      : (frameQ != null ? Number(frameQ) : undefined);
    const hoverParam = params.get("hover");
    const effHover = hoverParam === "swipe" ? "swipe" : hoverParam === "fade" ? "fade" : cfg.hoverVariant;
    const completionParam = isPreview ? params.get("completion") : null;
    const effCompletion = completionParam === "panel" ? "panel"
                        : completionParam === "standard" ? "standard" : cfg.completionMode;
    // Intro Version B is the approved default; preview can force A/B via ?introv=.
    const introParam = isPreview ? params.get("introv") : null;
    const introV = introParam === "a" ? "a" : introParam === "b" ? "b" : undefined;
    return (
      <StackSurvey
        questions={effQuestions}                       /* live campaign / draft preview → real survey; else sample */
        demographics={pvLong ? STACK_PREVIEW_LONG_DEMO : undefined}
        thankYouTitle={thankYouTitle}
        thankYouBody={thankYouBody}
        isPreview={suppressEvidence}
        surveyIntroEnabled={stackUsesRealSurvey ? surveyIntroEnabled : undefined}
        introTitle={stackUsesRealSurvey ? introTitle : undefined}
        introBody={stackUsesRealSurvey ? introBody : undefined}
        thankYouEnabled={stackUsesRealSurvey ? thankYouEnabled : undefined}
        hoverVariant={effHover}
        introVariant={introV}
        completionMode={effCompletion}
        panelUrl={cfg.panelUrl}
        topic={params.get("topic") ?? campaignTopic ?? (pvLong ? "Frauenfußball · Weltmeisterschaft" : null)}
        previewStartStep={previewStartStep}
        previewAnswerState={astate === "hover" || astate === "accepted" ? astate : undefined}
        previewAnswerIndex={aidxQ != null ? Number(aidxQ) : undefined}
        campaignId={resolvedCampaignId}
        surveyId={surveyId}
        publisher={publisher}
        placement={placement}
        placementId={placementId}
        creativeId={reportedStackId}
        club={club}
        competition={competition}
        country={country}
        segment={segment}
        device={device}
        browser={browser}
        groupId={resolvedGroupId}
        countryCode={resolvedCountryCode}
        market={resolvedMarket}
        surveyLanguage={resolvedSurveyLang}
        sessionId={sessionId}
      />
    );
  }

  // The API already resolved layout server-side (via creative_designs) — a
  // non-null customTheme means Timer layout; anything else (no design set,
  // classic layout, or an unresolvable design) falls back to Classic.
  const layout = customTheme ? "timer" : "classic";

  // What this impression actually showed. creativeDesign is the design the embed
  // API resolved server-side from the campaign (or its inherited research
  // project) and is what we render with, so it is the truthful answer to "which
  // creative did this fan see". An explicit URL override still wins when present.
  const reportedCreativeId = creativeIdParam ?? creativeDesign;

  if (layout === "timer") {
    return (
      <ThemedSurvey
        themeId={creativeDesign!}
        customTheme={customTheme ?? undefined}
        branding={branding}
        questions={questions}
        thankYouTitle={thankYouTitle}
        thankYouBody={thankYouBody}
        isPreview={suppressEvidence}
        intro={resolvedLayout === "invitation"}
        surveyIntroEnabled={surveyIntroEnabled}
        introTitle={introTitle}
        introBody={introBody}
        introTopic={introTopic}
        thankYouEnabled={thankYouEnabled}
        campaignId={resolvedCampaignId}
        surveyId={surveyId}
        publisher={publisher}
        placement={placement}
        placementId={placementId}
        creativeId={reportedCreativeId}
        club={club}
        competition={competition}
        country={country}
        segment={segment}
        device={device}
        browser={browser}
        groupId={resolvedGroupId}
        countryCode={resolvedCountryCode}
        market={resolvedMarket}
        surveyLanguage={resolvedSurveyLang}
        sessionId={sessionId}
      />
    );
  }

  // Refreshed Studio Classic is dispatched ONLY for the explicit studio-classic
  // renderer identity; historical `classic` (resolvedRenderer "classic"/null)
  // keeps rendering via the unchanged, frozen ClassicSurvey. They are now rendered
  // by SEPARATE elements because only StudioClassicSurvey declares the Phase 3
  // Survey-journey props (surveyIntroEnabled/introTitle/introBody/thankYouEnabled) —
  // ClassicSurvey must NOT receive them.
  if (resolvedRenderer === "studio-classic") {
    return (
      <StudioClassicSurvey
        branding={branding}
        questions={questions}
        thankYouTitle={thankYouTitle}
        thankYouBody={thankYouBody}
        isPreview={suppressEvidence}
        surveyIntroEnabled={surveyIntroEnabled}
        introTitle={introTitle}
        introBody={introBody}
        introTopic={introTopic}
        thankYouEnabled={thankYouEnabled}
        campaignId={resolvedCampaignId}
        surveyId={surveyId}
        questionSetId={questionSetId}
        publisher={publisher}
        placement={placement}
        placementId={placementId}
        creativeId={reportedCreativeId}
        club={club}
        competition={competition}
        country={country}
        segment={segment}
        device={device}
        browser={browser}
        groupId={resolvedGroupId}
        countryCode={resolvedCountryCode}
        market={resolvedMarket}
        surveyLanguage={resolvedSurveyLang}
        sessionId={sessionId}
        urlLang={urlLang}
      />
    );
  }

  return (
    <ClassicSurvey
      branding={branding}
      questions={questions}
      thankYouTitle={thankYouTitle}
      thankYouBody={thankYouBody}
      isPreview={suppressEvidence}
      campaignId={resolvedCampaignId}
      surveyId={surveyId}
      questionSetId={questionSetId}
      publisher={publisher}
      placement={placement}
      placementId={placementId}
      creativeId={reportedCreativeId}
      club={club}
      competition={competition}
      country={country}
      segment={segment}
      device={device}
      browser={browser}
      groupId={resolvedGroupId}
      countryCode={resolvedCountryCode}
      market={resolvedMarket}
      surveyLanguage={resolvedSurveyLang}
      sessionId={sessionId}
      urlLang={urlLang}
    />
  );
}

export default function EmbedPage() {
  return (
    <Suspense fallback={<div style={{ width: 300, height: 250, background: NAVY }} />}>
      <EmbedSurvey />
    </Suspense>
  );
}
