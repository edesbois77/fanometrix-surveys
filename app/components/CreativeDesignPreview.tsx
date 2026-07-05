"use client";

import { ThemedSurvey } from "@/app/embed/ThemedSurvey";
import { ClassicSurvey } from "@/app/embed/ClassicSurvey";
import { designById } from "@/lib/creative-designs";

const PREVIEW_QUESTIONS = [
  { id: "p1", text: "Why do you watch football?",     options: [{ id:1, text:"Entertainment\n& Escape" }, { id:2, text:"Friends\n& Family" },   { id:3, text:"Inspiration\n& Ambition" }, { id:4, text:"Identity &\nCommunity" }] },
  { id: "p2", text: "What shapes your match day?",    options: [{ id:1, text:"The\nAtmosphere" },          { id:2, text:"The\nResult" },          { id:3, text:"Social\nExperience" },      { id:4, text:"Player\nPerformance" }]  },
  { id: "p3", text: "What drives your club loyalty?", options: [{ id:1, text:"Local\nPride" },              { id:2, text:"Family\nTradition" },    { id:3, text:"Winning\nCulture" },         { id:4, text:"Player\nHeritage" }]     },
];

/**
 * Live preview of a Creative Design, using the same production components
 * (ThemedSurvey / ClassicSurvey) the embed actually renders — so what you
 * see here is exactly what a real deployment inheriting or set to this
 * design will look like. Renders nothing when no design is selected or the
 * id isn't recognised.
 */
export function CreativeDesignPreview({ designId }: { designId: string | null | undefined }) {
  const design = designById(designId);
  if (!design) return null;

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Preview — {design.name}
      </p>
      <div className="flex justify-center py-2">
        {design.layout === "timer" ? (
          <ThemedSurvey
            key={design.id}
            themeId={design.id}
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
            key={design.id}
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
