"use client";

// Creative Lab preview harness for the Stack creative.
// Internal / non-production. Renders the REAL production renderer
// (app/embed/StackSurvey) — not an approximation — so what you see here is
// exactly what ships. isPreview disables all network beacons.

import { useState } from "react";
import type { CSSProperties } from "react";
import { StackSurvey, type StackHoverVariant, type StackSurveyProps } from "../../embed/StackSurvey";

type Q = { id: string; text: string; options: { id: number; text: string }[] };

const EN_QUESTIONS: Q[] = [
  { id: "q1", text: "What pulls you into a match?", options: [
    { id: 1, text: "The drama" }, { id: 2, text: "The skill" }, { id: 3, text: "The atmosphere" }, { id: 4, text: "The rivalry" } ] },
  { id: "q2", text: "What makes you back a side?", options: [
    { id: 1, text: "Star players" }, { id: 2, text: "A great story" }, { id: 3, text: "A local connection" }, { id: 4, text: "Beautiful football" } ] },
  { id: "q3", text: "How do you follow the game?", options: [
    { id: 1, text: "Live on TV" }, { id: 2, text: "Streaming" }, { id: 3, text: "Social clips" }, { id: 4, text: "At the ground" } ] },
];

// Deliberately long strings (German-style) to prove wrapping / translation resilience.
const LONG_QUESTIONS: Q[] = [
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

const LONG_DEMO = {
  genderLabel: "Mit welchem Geschlecht identifizierst du dich?",
  genderOptions: ["Weiblich", "Männlich", "Nicht-binär", "Keine Angabe machen"],
  ageLabel: "In welcher Altersgruppe befindest du dich?",
  ageOptions: ["16–24 Jahre", "25–34 Jahre", "35–44 Jahre", "45 Jahre und älter"],
};

const CTX: Omit<StackSurveyProps, "questions" | "thankYouTitle" | "thankYouBody" | "isPreview" | "hoverVariant" | "topic" | "previewStartStep" | "demographics"> = {
  campaignId: "preview", surveyId: null, publisher: null, placement: null, placementId: null,
  creativeId: null, club: null, competition: null, country: null, segment: null,
  device: null, browser: null, groupId: null, configurationRevisionId: null, countryCode: null, market: null,
  surveyLanguage: "en", sessionId: "preview",
};

const FRAMES = ["Intro", "Gender", "Age", "Q1", "Q2", "Q3", "Thank You"];

function initialQuery(): { variant: StackHoverVariant; long: boolean } {
  if (typeof window === "undefined") return { variant: "fade", long: false };
  const q = new URLSearchParams(window.location.search);
  return { variant: q.get("hover") === "swipe" ? "swipe" : "fade", long: q.get("long") === "1" };
}

export default function StackPreviewPage() {
  const init = initialQuery();
  const [variant, setVariant] = useState<StackHoverVariant>(init.variant);
  const [long, setLong] = useState(init.long);
  const [liveKey, setLiveKey] = useState(0);

  const questions = long ? LONG_QUESTIONS : EN_QUESTIONS;
  const demographics = long ? LONG_DEMO : undefined;
  const topic = long ? "Frauenfußball · Weltmeisterschaft" : "Women's Football";
  const tyTitle = long ? "Vielen Dank!" : "Thank you!";
  const tyBody = long
    ? "Dein anonymes Feedback hilft, das Fußballerlebnis für Fans überall zu verbessern."
    : "Your anonymous feedback helps improve the football experience for fans everywhere.";

  const shared = { questions, thankYouTitle: tyTitle, thankYouBody: tyBody, isPreview: true, hoverVariant: variant, topic, demographics, ...CTX };
  const stamp = `${variant}-${long ? "long" : "en"}`;

  return (
    <div style={S.page}>
      <header style={S.head}>
        <h1 style={S.h1}>Fanometrix Stack — creative preview</h1>
        <p style={S.sub}>Live output of the production <code>StackSurvey</code> renderer at true 300×250. All beacons disabled (preview).</p>
        <div style={S.controls}>
          <div style={S.group}>
            <span style={S.glabel}>Hover behaviour</span>
            <div style={S.seg}>
              {(["fade", "swipe"] as StackHoverVariant[]).map(v => (
                <button key={v} onClick={() => setVariant(v)}
                  style={{ ...S.segBtn, ...(variant === v ? S.segOn : {}) }}>{v}</button>
              ))}
            </div>
          </div>
          <div style={S.group}>
            <span style={S.glabel}>Content</span>
            <div style={S.seg}>
              <button onClick={() => setLong(false)} style={{ ...S.segBtn, ...(!long ? S.segOn : {}) }}>English</button>
              <button onClick={() => setLong(true)} style={{ ...S.segBtn, ...(long ? S.segOn : {}) }}>Long / translated</button>
            </div>
          </div>
        </div>
      </header>

      <section>
        <h2 style={S.h2}>Complete journey — every frame at 300×250</h2>
        <div style={S.grid}>
          {FRAMES.map((label, i) => (
            <figure key={`${stamp}-${i}`} style={S.fig}>
              <div style={S.crop}>
                <StackSurvey key={`${stamp}-${i}`} {...shared} previewStartStep={i} />
              </div>
              <figcaption style={S.cap}>{i + 1}. {label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2 style={S.h2}>Q1 answer states — {variant} variant</h2>
        <div style={S.grid}>
          {([
            { label: "Resting", extra: {} },
            { label: `Hover (${variant})`, extra: { previewAnswerState: "hover" as const, previewAnswerIndex: 2 } },
            { label: "Accepted", extra: { previewAnswerState: "accepted" as const, previewAnswerIndex: 2 } },
          ]).map((s, i) => (
            <figure key={`${stamp}-state-${i}`} style={S.fig}>
              <div style={S.crop}>
                <StackSurvey key={`${stamp}-state-${i}`} {...shared} previewStartStep={3} {...s.extra} />
              </div>
              <figcaption style={S.cap}>{s.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section>
        <h2 style={S.h2}>Play the real flow</h2>
        <p style={S.sub}>Start on the Intro and click through — Gender → Age → Q1–Q3 → Thank You. Hover an answer to preview the {variant} state; click to accept (auto-advances).</p>
        <div style={S.playRow}>
          <div style={S.crop}>
            <StackSurvey key={`live-${stamp}-${liveKey}`} {...shared} />
          </div>
          <button style={S.reset} onClick={() => setLiveKey(k => k + 1)}>↺ Restart flow</button>
        </div>
      </section>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#0b0f14", color: "#e8ecf1", padding: "40px 28px 80px",
    fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif" },
  head: { maxWidth: 1000, margin: "0 auto 8px" },
  h1: { fontSize: 22, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.01em" },
  sub: { fontSize: 13, color: "#8b95a1", margin: "0 0 18px", lineHeight: 1.5, maxWidth: "70ch" },
  controls: { display: "flex", gap: 26, flexWrap: "wrap", marginBottom: 10 },
  group: { display: "flex", flexDirection: "column", gap: 7 },
  glabel: { fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#7c8794", fontWeight: 600 },
  seg: { display: "flex", gap: 6 },
  segBtn: { appearance: "none", border: "1px solid #232c37", background: "transparent", color: "#c3ccd6",
    fontSize: 13, fontWeight: 500, padding: "7px 14px", borderRadius: 999, cursor: "pointer", textTransform: "capitalize" },
  segOn: { background: "#D7B87A", borderColor: "#D7B87A", color: "#041B33", fontWeight: 700 },
  h2: { fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "#7c8794", fontWeight: 600,
    margin: "34px auto 18px", maxWidth: 1000 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, 300px)", gap: "30px 26px", justifyContent: "center",
    maxWidth: 1000, margin: "0 auto" },
  fig: { margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 },
  crop: { width: 300, height: 250, boxShadow: "0 18px 44px -18px rgba(0,0,0,.6)", flex: "0 0 auto" },
  cap: { fontSize: 12, color: "#9aa4af", fontWeight: 500, letterSpacing: ".02em" },
  playRow: { display: "flex", alignItems: "center", gap: 20, justifyContent: "center", flexWrap: "wrap", maxWidth: 1000, margin: "0 auto" },
  reset: { appearance: "none", border: "1px solid #232c37", background: "transparent", color: "#c3ccd6",
    fontSize: 13, fontWeight: 500, padding: "9px 16px", borderRadius: 10, cursor: "pointer" },
};
