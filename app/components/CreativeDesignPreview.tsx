"use client";

import { useState, useEffect } from "react";
import { ThemedSurvey } from "@/app/embed/ThemedSurvey";
import { ClassicSurvey } from "@/app/embed/ClassicSurvey";
import { designById } from "@/lib/creative-designs";
import { buildEmbedThemeFromState, type BuilderState } from "@/lib/creative-theme-builder";

const PREVIEW_QUESTIONS = [
  { id: "p1", text: "Why do you watch football?",     options: [{ id:1, text:"Entertainment\n& Escape" }, { id:2, text:"Friends\n& Family" },   { id:3, text:"Inspiration\n& Ambition" }, { id:4, text:"Identity &\nCommunity" }] },
  { id: "p2", text: "What shapes your match day?",    options: [{ id:1, text:"The\nAtmosphere" },          { id:2, text:"The\nResult" },          { id:3, text:"Social\nExperience" },      { id:4, text:"Player\nPerformance" }]  },
  { id: "p3", text: "What drives your club loyalty?", options: [{ id:1, text:"Local\nPride" },              { id:2, text:"Family\nTradition" },    { id:3, text:"Winning\nCulture" },         { id:4, text:"Player\nHeritage" }]     },
];

type DynamicDesignRow = { slug: string; name: string; builder_state: BuilderState };

/**
 * Live preview of a Creative Design, using the same production components
 * (ThemedSurvey / ClassicSurvey) the embed actually renders — so what you
 * see here is exactly what a real deployment inheriting or set to this
 * design will look like. Handles both the static built-in catalog and
 * designs authored dynamically in the Creative Gallery. Renders nothing
 * when no design is selected or the id isn't recognised (yet).
 */
export function CreativeDesignPreview({ designId }: { designId: string | null | undefined }) {
  const [dynamicRows, setDynamicRows] = useState<DynamicDesignRow[]>([]);

  useEffect(() => {
    fetch("/api/creative-designs")
      .then(r => r.ok ? r.json() : null)
      .then(json => setDynamicRows(json?.data ?? []))
      .catch(() => {/* fall back to static-only catalog */});
  }, []);

  const staticDesign = designById(designId);
  const dynamicDesign = !staticDesign && designId ? dynamicRows.find(d => d.slug === designId) : undefined;

  if (!staticDesign && !dynamicDesign) return null;

  const name = staticDesign?.name ?? dynamicDesign!.name;
  const layout = staticDesign?.layout ?? "timer"; // every dynamically-authored design is Timer layout
  const customTheme = dynamicDesign ? buildEmbedThemeFromState(dynamicDesign.builder_state) : undefined;

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Preview — {name}
      </p>
      <div className="flex justify-center py-2">
        {layout === "timer" ? (
          <ThemedSurvey
            key={designId}
            themeId={staticDesign?.id ?? "fanometrix"}
            customTheme={customTheme}
            questions={PREVIEW_QUESTIONS}
            thankYouTitle="Thank You"
            thankYouBody="Your anonymous feedback helps improve the football experience for fans everywhere."
            isPreview={true}
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
