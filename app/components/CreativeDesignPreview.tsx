"use client";

import { useState, useEffect } from "react";
import { ThemedSurvey } from "@/app/embed/ThemedSurvey";
import { ClassicSurvey } from "@/app/embed/ClassicSurvey";
import { buildEmbedThemeFromState, type BuilderState } from "@/lib/creative-theme-builder";
import { coerceStackConfig } from "@/lib/stack-config";

const PREVIEW_QUESTIONS = [
  { id: "p1", text: "Why do you watch football?",     options: [{ id:1, text:"Entertainment\n& Escape" }, { id:2, text:"Friends\n& Family" },   { id:3, text:"Inspiration\n& Ambition" }, { id:4, text:"Identity &\nCommunity" }] },
  { id: "p2", text: "What shapes your match day?",    options: [{ id:1, text:"The\nAtmosphere" },          { id:2, text:"The\nResult" },          { id:3, text:"Social\nExperience" },      { id:4, text:"Player\nPerformance" }]  },
  { id: "p3", text: "What drives your club loyalty?", options: [{ id:1, text:"Local\nPride" },              { id:2, text:"Family\nTradition" },    { id:3, text:"Winning\nCulture" },         { id:4, text:"Player\nHeritage" }]     },
];

type DesignRow = { slug: string; name: string; layout: "timer" | "classic" | "invitation" | "stack"; builder_state: BuilderState; config?: unknown };

/**
 * Live preview of a Creative Design, using the same production components
 * (ThemedSurvey / ClassicSurvey) the embed actually renders — so what you
 * see here is exactly what a real deployment inheriting or set to this
 * design will look like. Renders nothing when no design is selected or the
 * id isn't recognised (yet).
 */
export function CreativeDesignPreview({ designId, topic }: { designId: string | null | undefined; topic?: string | null }) {
  const [rows, setRows] = useState<DesignRow[]>([]);

  useEffect(() => {
    fetch("/api/creative-designs")
      .then(r => r.ok ? r.json() : null)
      .then(json => setRows(json?.data ?? []))
      .catch(() => {/* leave empty on failure */});
  }, []);

  const design = designId ? rows.find(d => d.slug === designId) : undefined;

  if (!design) return null;

  const { name, layout } = design;

  // Stack renders via the REAL production renderer over an /embed iframe (same
  // path a live impression takes), so the preview is exactly what ships.
  if (layout === "stack") {
    const cfg = coerceStackConfig(design.config);
    const qp = new URLSearchParams({ preview: "1", layout: "stack", hover: cfg.hoverVariant, completion: cfg.completionMode });
    // Topic is survey/campaign content — supplied by the caller (e.g. the campaign editor), not the design.
    if (topic && topic.trim()) qp.set("topic", topic.trim());
    return (
      <div className="space-y-2 pt-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview, {name}</p>
        <div className="flex justify-center py-2">
          <iframe title={`Preview, ${name}`} src={`/embed?${qp.toString()}`}
            width={300} height={250} style={{ width: 300, height: 250, border: 0 }} />
        </div>
      </div>
    );
  }

  const isTimerLike = layout === "timer" || layout === "invitation";
  const customTheme = isTimerLike ? buildEmbedThemeFromState(design.builder_state) : undefined;

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Preview, {name}
      </p>
      <div className="flex justify-center py-2">
        {isTimerLike ? (
          <ThemedSurvey
            key={designId}
            themeId={design.slug}
            customTheme={customTheme}
            questions={PREVIEW_QUESTIONS}
            thankYouTitle="Thank You"
            thankYouBody="Your anonymous feedback helps improve the football experience for fans everywhere."
            isPreview={true}
            intro={layout === "invitation"}
            campaignId="preview" surveyId={null} publisher={null} placement={null}
            placementId={null} creativeId={null}
            club={null} competition={null} country={null} segment={null}
            device={null} browser={null} groupId={null} countryCode={null}
            market={null} surveyLanguage="en" sessionId=""
          />
        ) : (
          <ClassicSurvey
            key={designId}
            questions={PREVIEW_QUESTIONS}
            thankYouTitle="Thank You"
            thankYouBody="Your anonymous feedback helps improve the football experience for fans everywhere."
            isPreview={true}
            campaignId="preview" surveyId={null} questionSetId={null} publisher={null} placement={null}
            placementId={null} creativeId={null}
            club={null} competition={null} country={null} segment={null}
            device={null} browser={null} groupId={null} countryCode={null}
            market={null} surveyLanguage="en" sessionId="" urlLang={null}
          />
        )}
      </div>
    </div>
  );
}
