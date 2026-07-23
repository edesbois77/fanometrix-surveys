"use client";

// The creative gallery: what fans were actually shown.
//
// These are the production embed components, not mockups or screenshots. A
// screenshot goes stale the moment a design is edited and nobody notices for
// six months; rendering the real component means the gallery is correct by
// construction and a reader is looking at the same unit their audience saw.
//
// `isPreview` hard-gates event emission in both ClassicSurvey and ThemedSurvey
// (see their sendEvent), so nothing here writes a SURVEY_RENDER, a SURVEY_START
// or a response. That matters more than usual: these units belong to campaigns
// that are still collecting, and a gallery that fired impressions would corrupt
// the very figures the report is quoting.
//
// The design data is passed in from the server. The obvious alternative, having
// the client fetch /api/creative-designs, does not work here and should not: a
// report reader has no Fanometrix account, and that route is behind the session
// gate for good reason.

import { ThemedSurvey } from "@/app/embed/ThemedSurvey";
import { ClassicSurvey } from "@/app/embed/ClassicSurvey";
import { buildEmbedThemeFromState } from "@/lib/creative-theme-builder";
import type { CreativeUsed } from "@/lib/reports/types";
import { INK, SANS } from "../theme";

/** The survey shown in the gallery is the one that actually ran, so the reader
 *  sees the real questions rather than lorem ipsum. */
export type GalleryQuestion = {
  id: string;
  text: string;
  options: { id: number; text: string }[];
};

const int = (n: number) => Math.round(n).toLocaleString("en-GB");

export function CreativeGallery({
  creatives,
  questions,
}: {
  creatives: CreativeUsed[];
  questions: GalleryQuestion[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`,
        gap: 28,
        alignItems: "start",
      }}
    >
      {creatives.map((c) => {
        const isThemed = c.layout === "timer" || c.layout === "invitation";
        const customTheme =
          isThemed && c.builderState ? buildEmbedThemeFromState(c.builderState) : undefined;

        return (
          <figure
            key={c.slug}
            style={{
              margin: 0,
              border: `1px solid ${INK.hairline}`,
              borderRadius: 12,
              overflow: "hidden",
              background: INK.surface,
              breakInside: "avoid",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                background: INK.page,
                padding: "26px 20px",
                display: "flex",
                justifyContent: "center",
                borderBottom: `1px solid ${INK.hairline}`,
                minHeight: 300,
                alignItems: "center",
              }}
            >
              {isThemed && customTheme ? (
                <ThemedSurvey
                  key={c.slug}
                  themeId={c.slug}
                  customTheme={customTheme}
                  questions={questions}
                  thankYouTitle="Thank you"
                  thankYouBody="Your response has been recorded."
                  isPreview
                  intro={c.layout === "invitation"}
                  campaignId="preview"
                  surveyId={null}
                  publisher={null}
                  placement={null}
                  placementId={null}
                  creativeId={null}
                  club={null}
                  competition={null}
                  country={null}
                  segment={null}
                  device={null}
                  browser={null}
                  groupId={null}
                  countryCode={null}
                  market={null}
                  surveyLanguage="en"
                  sessionId=""
                />
              ) : (
                <ClassicSurvey
                  key={c.slug}
                  questions={questions}
                  thankYouTitle="Thank you"
                  thankYouBody="Your response has been recorded."
                  isPreview
                  campaignId="preview"
                  surveyId={null}
                  questionSetId={null}
                  publisher={null}
                  placement={null}
                  placementId={null}
                  creativeId={null}
                  club={null}
                  competition={null}
                  country={null}
                  segment={null}
                  device={null}
                  browser={null}
                  groupId={null}
                  countryCode={null}
                  market={null}
                  surveyLanguage="en"
                  urlLang={null}
                  sessionId=""
                />
              )}
            </div>

            <figcaption style={{ padding: "22px 24px 24px", flex: 1 }}>
              <div
                style={{
                  font: SANS,
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  color: INK.primary,
                  marginBottom: 10,
                }}
              >
                {c.name}
              </div>
              <p
                style={{
                  font: SANS,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: INK.secondary,
                  margin: "0 0 16px",
                }}
              >
                {c.purpose}
              </p>
              <div
                style={{
                  font: SANS,
                  fontSize: 12,
                  color: INK.tertiary,
                  borderTop: `1px solid ${INK.hairlineSoft}`,
                  paddingTop: 14,
                  display: "grid",
                  gap: 4,
                }}
              >
                <span>
                  {int(c.loads)} impressions · {int(c.completed)} completed responses
                </span>
                <span>Ran in {c.markets.join(", ")}</span>
              </div>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
