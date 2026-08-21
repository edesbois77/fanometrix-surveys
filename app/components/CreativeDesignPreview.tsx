"use client";

import { useState, useEffect } from "react";
import { ThemedSurvey } from "@/app/embed/ThemedSurvey";
import { ClassicSurvey } from "@/app/embed/ClassicSurvey";
import { StudioClassicSurvey } from "@/app/embed/StudioClassicSurvey";
import { StackSurvey } from "@/app/embed/StackSurvey";
import { resolveStackPreviewStep } from "@/app/embed/stack-frames";
import { buildEmbedThemeFromState, type BuilderState } from "@/lib/creative-theme-builder";
import { coerceStackConfig } from "@/lib/stack-config";

/** Durable strangler distinction: the refreshed Studio Classic identity carries
 *  config.renderer === "studio-classic". Historical `classic` designs (config
 *  null) render via the unchanged ClassicSurvey. Never keyed on layout alone. */
function rendererOf(config: unknown): string | null {
  return config && typeof config === "object" ? ((config as Record<string, unknown>).renderer as string) ?? null : null;
}

const PREVIEW_QUESTIONS = [
  { id: "p1", text: "Why do you watch football?",     options: [{ id:1, text:"Entertainment\n& Escape" }, { id:2, text:"Friends\n& Family" },   { id:3, text:"Inspiration\n& Ambition" }, { id:4, text:"Identity &\nCommunity" }] },
  { id: "p2", text: "What shapes your match day?",    options: [{ id:1, text:"The\nAtmosphere" },          { id:2, text:"The\nResult" },          { id:3, text:"Social\nExperience" },      { id:4, text:"Player\nPerformance" }]  },
  { id: "p3", text: "What drives your club loyalty?", options: [{ id:1, text:"Local\nPride" },              { id:2, text:"Family\nTradition" },    { id:3, text:"Winning\nCulture" },         { id:4, text:"Player\nHeritage" }]     },
];

export type CreativeDesignRow = {
  slug: string;
  name: string;
  layout: "timer" | "classic" | "invitation" | "stack";
  builder_state?: BuilderState;
  config?: unknown;
};

/**
 * Live preview of a Creative Design, using the same production components
 * (ThemedSurvey / ClassicSurvey / the Stack /embed iframe) the embed actually
 * renders — so what you see is exactly what a real deployment set to this design
 * looks like. Renders nothing when no design resolves.
 *
 * Options (all additive; defaults keep the original behaviour):
 *   • `design`  — supply the row directly to SKIP the internal /api fetch (e.g. a
 *     card grid that already has the rows). Falls back to fetching by `designId`.
 *   • `variant` — "full" (default): a labelled, centred preview. "bare": only the
 *     creative at its native 300×250 size, no header/padding — for a scaled
 *     thumbnail. Caller is responsible for scaling/clipping/pointer-events.
 */
/** Draft Survey journey supplied by the Survey stage. When present, the real
 *  selected creative is rendered with THIS content instead of the sample
 *  PREVIEW_QUESTIONS — so the Survey stage previews exactly what a fan will see. */
export type SurveyDraftPreview = {
  surveyId: string;
  questions: { id: string; text: string; options: { id: number; text: string }[] }[];
  introEnabled?: boolean;
  introTitle?: string;
  introBody?: string;
  /** Short optional survey subject (surveys.topic) shown on the intro frame. */
  introTopic?: string;
  /** Active editing/delivery language code — so the Stack iframe (which resolves
   *  language server-side via ?lang) renders in the selected language. */
  lang?: string;
  thankYouEnabled?: boolean;
  thankYouTitle?: string;
  thankYouBody?: string;
  /** true ⇒ the mandatory system-owned Thank-You (copy supplied centrally). */
  thankYouSystem?: boolean;
};

/** Which journey frame the integrated Survey-stage preview should show. Absent ⇒
 *  the default representative frame (Creative-stage behaviour, unchanged). */
export type PreviewFrame =
  | { kind: "intro" }
  | { kind: "question"; index: number }
  | { kind: "thankyou" };

export function CreativeDesignPreview({
  designId, topic, design: designProp, variant = "full", staticFrame = false, surveyDraft, frame,
}: {
  designId?: string | null;
  topic?: string | null;
  design?: CreativeDesignRow;
  variant?: "full" | "bare";
  /** Render a still, non-animated REPRESENTATIVE QUESTION frame (for library
   *  cards): Countdown freezes its countdown; Stack starts on a research
   *  question (not the intro); Classic is already static. Preview-only — no
   *  effect on live embeds. */
  staticFrame?: boolean;
  /** Optional: render the real creative with a DRAFT survey journey (Survey stage).
   *  Absent ⇒ the Creative stage keeps using the sample content (unchanged). */
  surveyDraft?: SurveyDraftPreview;
  /** Optional: which journey frame to freeze (Survey stage integrated preview).
   *  Reuses each renderer's preview-only frame controls — no live effect. */
  frame?: PreviewFrame;
}) {
  const [rows, setRows] = useState<CreativeDesignRow[]>([]);

  useEffect(() => {
    if (designProp) return; // row supplied — no fetch needed
    fetch("/api/creative-designs")
      .then(r => r.ok ? r.json() : null)
      .then(json => setRows(json?.data ?? []))
      .catch(() => {/* leave empty on failure */});
  }, [designProp]);

  const design = designProp ?? (designId ? rows.find(d => d.slug === designId) : undefined);
  if (!design) return null;

  const { name, layout, slug } = design;

  // Draft journey content (Survey stage) or the sample (Creative stage, unchanged).
  const journeyQuestions = surveyDraft?.questions ?? PREVIEW_QUESTIONS;
  const journeyTyTitle = surveyDraft?.thankYouTitle ?? "Thank You";
  const journeyTyBody  = surveyDraft?.thankYouBody ?? "Your anonymous feedback helps improve the football experience for fans everywhere.";
  const introTopic = surveyDraft?.introTopic ?? (topic ?? undefined);
  // The active editing/delivery language for the Survey-stage preview (default en
  // for the Creative-stage sample). Drives the system Privacy language in the prop
  // renderers so a German preview shows the German Privacy experience + policy CTA.
  const previewLang = surveyDraft?.lang ?? "en";
  // Map the requested journey frame to the React renderers' preview-frame prop.
  const rendererFrame: number | "intro" | "thankyou" | undefined =
    frame == null ? undefined
    : frame.kind === "intro" ? "intro"
    : frame.kind === "thankyou" ? "thankyou"
    : frame.index;
  // When previewing the Intro frame, force the intro visible so the author sees
  // what they are editing even if the survey's intro toggle is off.
  const introEnabledForFrame = frame?.kind === "intro" ? true : surveyDraft?.introEnabled;
  // The React renderers pick up `previewFrame` in their useState INITIALISERS,
  // which only run on mount. Including the selected frame in their `key` forces a
  // remount when the Journey selection changes, so the frozen preview actually
  // lands on the new frame. (Live content edits keep the same key ⇒ no remount ⇒
  // props flow through and the current frame updates in place.)
  const frameKey = frame == null ? "f" : frame.kind === "question" ? `fq${frame.index}` : `f${frame.kind}`;

  // The real creative element (identical config to a live impression).
  let rendered: React.ReactNode;
  if (layout === "stack") {
    const cfg = coerceStackConfig(design.config);
    if (surveyDraft) {
      // ── Survey stage: render the Stack INLINE with the LIVE draft ───────────
      // The same production StackSurvey component, driven by the live in-memory
      // draft as props — exactly like the other renderers. ONE source of truth
      // (the live draft), so it updates instantly on every add/edit with no
      // iframe / DB round-trip / autosave wait, and the counter's N is simply the
      // live question count. The step for the selected frame maps intro→0,
      // question:N→its research step (never Thank You), thankyou→terminal.
      const step = frame ? resolveStackPreviewStep(frame, journeyQuestions.length) : undefined;
      rendered = (
        <StackSurvey
          key={`${slug}-${frameKey}`}
          questions={journeyQuestions}
          thankYouTitle={journeyTyTitle}
          thankYouBody={journeyTyBody}
          isPreview
          hoverVariant={cfg.hoverVariant}
          completionMode={cfg.completionMode}
          panelUrl={cfg.panelUrl}
          topic={introTopic ?? null}
          surveyIntroEnabled={introEnabledForFrame}
          introTitle={surveyDraft.introTitle}
          introBody={surveyDraft.introBody}
          thankYouEnabled={surveyDraft.thankYouEnabled}
          previewStartStep={step}
          campaignId="preview" surveyId={null} publisher={null} placement={null}
          placementId={null} creativeId={null}
          club={null} competition={null} country={null} segment={null}
          device={null} browser={null} groupId={null} configurationRevisionId={null} countryCode={null}
          market={null} surveyLanguage={previewLang} sessionId=""
        />
      );
    } else {
      // ── Design-gallery / static representative card → iframe with the sample ──
      // No live draft here; the design-level card shows sample content, optionally
      // frozen on a representative frame. Unchanged.
      const qp = new URLSearchParams({ preview: "1", layout: "stack", hover: cfg.hoverVariant, completion: cfg.completionMode });
      if (introTopic && introTopic.trim()) qp.set("topic", introTopic.trim());
      if (staticFrame) { qp.set("frame", "3"); qp.set("astate", "hover"); }
      rendered = (
        <iframe title={`Preview, ${name}`} src={`/embed?${qp.toString()}`}
          width={300} height={250} style={{ width: 300, height: 250, border: 0 }} />
      );
    }
  } else {
    const isTimerLike = layout === "timer" || layout === "invitation";
    const customTheme = isTimerLike && design.builder_state ? buildEmbedThemeFromState(design.builder_state) : undefined;
    rendered = isTimerLike ? (
      <ThemedSurvey
        key={`${slug}-${frameKey}`}
        themeId={slug}
        customTheme={customTheme}
        questions={journeyQuestions}
        thankYouTitle={journeyTyTitle}
        thankYouBody={journeyTyBody}
        isPreview={true}
        intro={layout === "invitation"}
        surveyIntroEnabled={introEnabledForFrame}
        introTitle={surveyDraft?.introTitle}
        introBody={surveyDraft?.introBody}
        introTopic={introTopic}
        thankYouEnabled={surveyDraft?.thankYouEnabled}
        thankYouSystem={surveyDraft?.thankYouSystem}
        previewFrame={rendererFrame}
        staticFrame={staticFrame}
        campaignId="preview" surveyId={null} publisher={null} placement={null}
        placementId={null} creativeId={null}
        club={null} competition={null} country={null} segment={null}
        device={null} browser={null} groupId={null} configurationRevisionId={null} countryCode={null}
        market={null} surveyLanguage={previewLang} sessionId=""
      />
    ) : rendererOf(design.config) === "studio-classic" ? (
      <StudioClassicSurvey
        key={`${slug}-${frameKey}`}
        questions={journeyQuestions}
        thankYouTitle={journeyTyTitle}
        thankYouBody={journeyTyBody}
        isPreview={true}
        surveyIntroEnabled={introEnabledForFrame}
        introTitle={surveyDraft?.introTitle}
        introBody={surveyDraft?.introBody}
        introTopic={introTopic}
        thankYouEnabled={surveyDraft?.thankYouEnabled}
        thankYouSystem={surveyDraft?.thankYouSystem}
        previewFrame={rendererFrame}
        staticFrame={staticFrame}
        campaignId="preview" surveyId={null} questionSetId={null} publisher={null} placement={null}
        placementId={null} creativeId={null}
        club={null} competition={null} country={null} segment={null}
        device={null} browser={null} groupId={null} configurationRevisionId={null} countryCode={null}
        market={null} surveyLanguage={previewLang} sessionId="" urlLang={surveyDraft ? previewLang : null}
      />
    ) : (
      // Historical `classic` (frozen ClassicSurvey) has no Survey-journey props — it
      // takes the draft questions + thank-you copy only; there is no Classic intro.
      <ClassicSurvey
        key={`${slug}-${frameKey}`}
        questions={journeyQuestions}
        thankYouTitle={journeyTyTitle}
        thankYouBody={journeyTyBody}
        isPreview={true}
        campaignId="preview" surveyId={null} questionSetId={null} publisher={null} placement={null}
        placementId={null} creativeId={null}
        club={null} competition={null} country={null} segment={null}
        device={null} browser={null} groupId={null} configurationRevisionId={null} countryCode={null}
        market={null} surveyLanguage="en" sessionId="" urlLang={null}
      />
    );
  }

  if (variant === "bare") return <>{rendered}</>;

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview, {name}</p>
      <div className="flex justify-center py-2">{rendered}</div>
    </div>
  );
}
