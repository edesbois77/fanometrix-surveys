"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ThemedSurvey, type EmbedTheme } from "./ThemedSurvey";
import { ClassicSurvey } from "./ClassicSurvey";
import { DESIGN_LAYOUTS } from "@/lib/creative-designs";

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
// design's layout maps to (see DESIGN_LAYOUTS in lib/creative-designs.ts).
// Each creative component (ThemedSurvey, ClassicSurvey) is self-contained —
// it owns its own event tracking and submit call, not shared with this parent.

export type EmbedOption = { id: number; text: string };
export type Question = { id: string; text: string; options: EmbedOption[] };

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
  const creativeId    = params.get("creative_id")  ?? null;
  const club          = params.get("club")         ?? null;
  const competition   = params.get("competition")  ?? null;
  const countryParam  = params.get("country")      ?? "";
  const country       = resolveCountry(countryParam);
  const marketParam   = params.get("market")       ?? null;
  const segment       = params.get("segment")      ?? null;

  const [device,  setDevice]  = useState<string | null>(null);
  const [browser, setBrowser] = useState<string | null>(null);

  const [questions,      setQuestions]      = useState<Question[]>(
    (!groupSlug && (!campaign || campaign === "default")) ? QUESTIONS : []
  );
  const [thankYouTitle,  setThankYouTitle]  = useState("Thank you!");
  const [thankYouBody,   setThankYouBody]   = useState("Your anonymous feedback helps improve the football experience for fans everywhere.");

  const [resolvedCampaignId, setResolvedCampaignId] = useState<string>(campaign);
  const [groupReady,         setGroupReady]         = useState(!groupSlug);
  const [creativeDesign,     setCreativeDesign]     = useState<string | null>(null);
  const [customTheme,        setCustomTheme]        = useState<EmbedTheme | null>(null);
  const [resolvedGroupId,      setResolvedGroupId]      = useState<string | null>(null);
  const [resolvedSurveyLang,   setResolvedSurveyLang]   = useState<string>(urlLang ?? "en");
  const [resolvedCountryCode,  setResolvedCountryCode]  = useState<string | null>(countryParam || null);
  const [resolvedMarket,       setResolvedMarket]       = useState<string | null>(marketParam);

  const sessionId = useRef<string>(typeof crypto !== "undefined" ? crypto.randomUUID() : "");

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
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.campaign_id && data?.questions?.length) {
          setResolvedCampaignId(data.campaign_id);
          setQuestions(data.questions);
          setThankYouTitle(data.thank_you_title ?? thankYouTitle);
          setThankYouBody(data.thank_you_body   ?? thankYouBody);
          setResolvedGroupId(data.group_id ?? groupSlug);
          setResolvedSurveyLang(urlLang ?? data.survey_language ?? "en");
          setResolvedCountryCode(data.country_code ?? (countryParam || null));
          setResolvedMarket(data.market ?? marketParam);
          setCreativeDesign(data.creative_design ?? null);
          setCustomTheme(data.custom_theme ?? null);
        }
        setGroupReady(!!data?.campaign_id);
      })
      .catch(() => setGroupReady(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSlug]);

  // Campaign mode
  const hasCampaignSlug = !groupSlug && !!campaign && campaign !== "default";
  useEffect(() => {
    if (!hasCampaignSlug) return;
    const p = new URLSearchParams({ campaign_id: campaign });
    if (urlLang) p.set("lang", urlLang);
    if (isPreview) p.set("preview", "1");
    fetch(`/api/embed/campaign?${p.toString()}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.questions?.length) {
          setQuestions(data.questions);
          setThankYouTitle(data.thank_you_title ?? thankYouTitle);
          setThankYouBody(data.thank_you_body   ?? thankYouBody);
          setResolvedSurveyLang(data.survey_language ?? urlLang ?? "en");
          setCreativeDesign(data.creative_design ?? null);
          setCustomTheme(data.custom_theme ?? null);
        }
      })
      .catch(() => {/* keep fallback questions */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign, hasCampaignSlug]);

  // Survey-only mode
  useEffect(() => {
    if (groupSlug || hasCampaignSlug || !surveyId) return;
    const surveyApiUrl = `/api/embed/survey?id=${surveyId}&lang=${encodeURIComponent(urlLang ?? "en")}${isPreview ? "&preview=1" : ""}`;
    fetch(surveyApiUrl)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.questions?.length) {
          setQuestions(data.questions);
          setThankYouTitle(data.thank_you_title);
          setThankYouBody(data.thank_you_body);
          setResolvedSurveyLang(urlLang ?? "en");
        }
      })
      .catch(() => {/* keep fallback questions */});
  }, [surveyId, groupSlug, hasCampaignSlug]);

  if ((groupSlug && !groupReady) || questions.length === 0) {
    return <div style={{ width: 300, height: 250, background: "transparent" }} />;
  }

  // Layout registry: unknown/missing design id (including every campaign
  // with creative_design left null today) resolves to "classic" — zero
  // behavior change for anything live before this feature shipped. A
  // resolved customTheme means the design is a dynamically-authored one
  // from the Creative Gallery, which is always Timer layout.
  const layout = customTheme ? "timer" : (creativeDesign ? (DESIGN_LAYOUTS[creativeDesign] ?? "classic") : "classic");

  if (layout === "timer") {
    return (
      <ThemedSurvey
        themeId={creativeDesign!}
        customTheme={customTheme ?? undefined}
        questions={questions}
        thankYouTitle={thankYouTitle}
        thankYouBody={thankYouBody}
        isPreview={isPreview}
        campaignId={resolvedCampaignId}
        surveyId={surveyId}
        publisher={publisher}
        placement={placement}
        placementId={placementId}
        creativeId={creativeId}
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
        sessionId={sessionId.current}
      />
    );
  }

  return (
    <ClassicSurvey
      questions={questions}
      thankYouTitle={thankYouTitle}
      thankYouBody={thankYouBody}
      isPreview={isPreview}
      campaignId={resolvedCampaignId}
      surveyId={surveyId}
      questionSetId={questionSetId}
      publisher={publisher}
      placement={placement}
      placementId={placementId}
      creativeId={creativeId}
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
      sessionId={sessionId.current}
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
