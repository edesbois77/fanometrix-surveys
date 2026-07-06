"use client";

import { useState, useCallback, useRef } from "react";
import { VariantA, type SurveyEvent as EventA } from "./VariantA";
import { VariantB, type SurveyEvent as EventB } from "./VariantB";
import { THEMES, type Theme, type SurveyQuestion } from "./themes";
import { type TypographyMode } from "./typography";

const DEFAULT_QUESTIONS: SurveyQuestion[] = [
  { text: "Why do you watch football?",                 answers: ["Entertainment\n& Escape", "Friends\n& Family",  "Inspiration\n& Ambition", "Identity &\nCommunity"] },
  { text: "What keeps you coming back to the stadium?", answers: ["The\nAtmosphere",         "The\nResult",        "Social\nExperience",       "Player\nPerformance"]  },
  { text: "What drives your club loyalty?",             answers: ["Local\nPride",             "Family\nTradition",  "Winning\nCulture",         "Player\nHeritage"]     },
];

type Variant    = "A" | "B";
const DESIGN_LABEL = "Design — Timer (300×250)";
type Device     = "desktop" | "mobile";
type Tab        = "gallery" | "archive";
type SurveyEvent = EventA | EventB;

const PAGE_BG   = "#07101A";
const GOLD      = "#D7B87A";
const DARK_NAVY = "#0B1929";

// ── Page-level colour system (dark / light mode) ──────────────────────────────

function pc(dark: boolean) {
  return {
    bg:          dark ? "#07101A" : "#F1F3F5",
    surface:     dark ? "rgba(255,255,255,0.02)"  : "#ffffff",
    border:      dark ? "rgba(255,255,255,0.06)"  : "rgba(0,0,0,0.08)",
    borderFaint: dark ? "rgba(255,255,255,0.04)"  : "rgba(0,0,0,0.05)",
    divider:     dark ? "rgba(255,255,255,0.07)"  : "rgba(0,0,0,0.09)",
    text:        dark ? "#ffffff"                 : "#0B1929",
    muted:       dark ? "rgba(255,255,255,0.4)"   : "rgba(11,25,41,0.5)",
    faint:       dark ? "rgba(255,255,255,0.2)"   : "rgba(11,25,41,0.3)",
    vfaint:      dark ? "rgba(255,255,255,0.07)"  : "rgba(11,25,41,0.06)",
    inputBg:     dark ? "rgba(255,255,255,0.05)"  : "rgba(0,0,0,0.04)",
    inputBorder: dark ? "rgba(255,255,255,0.1)"   : "rgba(0,0,0,0.12)",
    stripRow:    dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.02)",
  };
}

// ── Device frames ─────────────────────────────────────────────────────────────

function DesktopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ background: "#1C2732", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", borderRadius: "12px 12px 0 0", height: 26, display: "flex", alignItems: "center", padding: "0 10px", gap: 5 }}>
        {["#E8654A", GOLD, "#4ADE80"].map((c, i) => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: c, opacity: 0.6 }} />
        ))}
        <div style={{ flex: 1, marginLeft: 8, height: 13, background: "rgba(255,255,255,0.06)", borderRadius: 3, maxWidth: 180 }} />
      </div>
      <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderTop: "none", borderRadius: "0 0 4px 4px" }}>
        {children}
      </div>
    </div>
  );
}

function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#111", border: "2px solid rgba(255,255,255,0.1)", borderRadius: 28, padding: "20px 8px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ width: 56, height: 7, background: "rgba(255,255,255,0.1)", borderRadius: 4, flexShrink: 0 }} />
      {children}
      <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, flexShrink: 0 }} />
    </div>
  );
}

// ── Control button ────────────────────────────────────────────────────────────

function Btn({ label, onClick, active, accent, small }: { label: string; onClick: () => void; active?: boolean; accent?: boolean; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? GOLD : accent ? "rgba(215,184,122,0.12)" : "rgba(255,255,255,0.05)",
        border: active ? "none" : accent ? "1px solid rgba(215,184,122,0.3)" : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        color: active ? DARK_NAVY : accent ? GOLD : "rgba(255,255,255,0.7)",
        fontSize: small ? 9 : 10,
        fontWeight: active ? 700 : 500,
        padding: small ? "4px 10px" : "6px 14px",
        cursor: "pointer",
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {label}
    </button>
  );
}

// ── Theme card — single survey + metadata ─────────────────────────────────────

function ThemeCard({
  theme, variant, device, surveyKey, forceExpire, onEvent, typography, questions, dark,
}: {
  theme: Theme; variant: Variant; device: Device;
  surveyKey: number; forceExpire: number;
  onEvent: (e: SurveyEvent) => void; typography: TypographyMode;
  questions: SurveyQuestion[]; dark: boolean;
}) {
  const p = pc(dark);
  const survey = variant === "A"
    ? <VariantA key={`${surveyKey}-${theme.id}`} theme={theme} typography={typography} questions={questions} onEvent={onEvent as (e: EventA) => void} />
    : <VariantB key={`${surveyKey}-${theme.id}`} theme={theme} typography={typography} questions={questions} forceExpire={forceExpire} onEvent={onEvent as (e: EventB) => void} />;

  const wrapped = device === "desktop" ? <DesktopFrame>{survey}</DesktopFrame> : <MobileFrame>{survey}</MobileFrame>;

  const score = theme.analytics.interactionPotential;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {wrapped}
      {/* Theme info */}
      <div style={{ width: "100%", maxWidth: 300, textAlign: "center" }}>
        <p style={{ color: p.text, fontSize: 11, fontWeight: 700, margin: "0 0 2px", letterSpacing: "-0.01em" }}>{theme.name}</p>
        <p style={{ color: p.muted, fontSize: 9, margin: "0 0 6px", lineHeight: 1.4 }}>{theme.feeling}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ color: p.faint, fontSize: 8 }}>Interaction</span>
          <div style={{ width: 60, height: 2.5, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${score * 10}%`, height: "100%", background: theme.accent, borderRadius: 2 }} />
          </div>
          <span style={{ color: theme.accent, fontSize: 8, fontWeight: 700 }}>{score}/10</span>
        </div>
      </div>
    </div>
  );
}

// ── Event log ─────────────────────────────────────────────────────────────────

function EventLog({ events }: { events: Array<SurveyEvent & { id: number; time: string }> }) {
  return (
    <div style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden", height: 100 }}>
      <div style={{ padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: events.length ? GOLD : "rgba(255,255,255,0.15)", flexShrink: 0, display: "inline-block" }} />
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>Event Log</span>
      </div>
      <div style={{ height: 74, overflowY: "auto", padding: "3px 0" }}>
        {events.length === 0
          ? <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 8.5, margin: "7px 10px", fontStyle: "italic" }}>Interact with any survey card to see events…</p>
          : [...events].reverse().map((e) => (
            <div key={e.id} style={{ padding: "2px 10px", display: "flex", gap: 7, alignItems: "baseline" }}>
              <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 7.5, flexShrink: 0 }}>{e.time}</span>
              <span style={{ color: GOLD, fontSize: 7.5, flexShrink: 0 }}>[{e.variant}]</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 8 }}>
                <span style={{ color: "rgba(255,255,255,0.3)" }}>{e.type}</span>{" "}{e.detail}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}


// ── Question editor ───────────────────────────────────────────────────────────

// answers array positions: [0]=TL, [1]=TR, [2]=BR, [3]=BL
const ANSWER_LABELS: [string, string, string, string] = ["Top Left", "Top Right", "Bottom Left", "Bottom Right"];
const ANSWER_IDX:   [number, number, number, number]  = [0, 1, 3, 2]; // display order → array index

function QuestionEditor({ questions, setQuestions, onRestart, dark }: {
  questions: SurveyQuestion[];
  setQuestions: (q: SurveyQuestion[]) => void;
  onRestart: () => void;
  dark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const p = pc(dark);

  function updateQuestion(qi: number, text: string) {
    const next = questions.map((q, i) => i === qi ? { ...q, text } : q);
    setQuestions(next);
  }

  function updateAnswer(qi: number, answerIdx: number, value: string) {
    const next = questions.map((q, i) => {
      if (i !== qi) return q;
      const answers = [...q.answers] as [string, string, string, string];
      answers[answerIdx] = value;
      return { ...q, answers };
    });
    setQuestions(next);
  }

  function resetDefaults() {
    setQuestions(DEFAULT_QUESTIONS.map(q => ({ ...q, answers: [...q.answers] as [string,string,string,string] })));
    onRestart();
  }

  const inputStyle: React.CSSProperties = {
    background: p.inputBg,
    border: `1px solid ${p.inputBorder}`,
    borderRadius: 6,
    color: p.text,
    fontSize: 11,
    padding: "6px 9px",
    outline: "none",
    fontFamily: "system-ui, -apple-system, sans-serif",
    resize: "none" as const,
    width: "100%",
    boxSizing: "border-box" as const,
    lineHeight: 1.4,
  };

  return (
    <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 10 }}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: GOLD, fontSize: 12 }}>✏</span>
          <span style={{ color: p.text, fontSize: 11, fontWeight: 700 }}>Edit Questions &amp; Answers</span>
          <span style={{ color: p.faint, fontSize: 9.5 }}>— changes apply to all 8 cards live</span>
        </div>
        <span style={{ color: p.muted, fontSize: 13, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>▾</span>
      </button>

      {open && (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Reset button */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={resetDefaults}
              style={{ background: "rgba(215,184,122,0.1)", border: "1px solid rgba(215,184,122,0.3)", borderRadius: 7, color: GOLD, fontSize: 9.5, fontWeight: 700, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" }}
            >
              ↺ Reset to defaults
            </button>
          </div>

          {/* 3-column grid of question editors */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {questions.map((q, qi) => (
              <div key={qi} style={{ background: p.vfaint, border: `1px solid ${p.border}`, borderRadius: 8, padding: "12px" }}>
                <p style={{ color: p.muted, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 8px" }}>
                  Question {qi + 1}
                </p>

                {/* Question text */}
                <textarea
                  value={q.text}
                  onChange={e => updateQuestion(qi, e.target.value)}
                  rows={2}
                  placeholder="Question text…"
                  style={{ ...inputStyle, marginBottom: 10 }}
                />

                {/* 2×2 answer grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {([0, 1, 2, 3] as const).map((displayPos) => {
                    const answerIdx = ANSWER_IDX[displayPos];
                    return (
                      <div key={displayPos}>
                        <p style={{ color: p.faint, fontSize: 7.5, margin: "0 0 3px", letterSpacing: "0.04em" }}>
                          {ANSWER_LABELS[displayPos]}
                        </p>
                        <textarea
                          value={q.answers[answerIdx]}
                          onChange={e => updateAnswer(qi, answerIdx, e.target.value)}
                          rows={2}
                          placeholder="Answer…"
                          style={inputStyle}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 8.5, margin: 0, lineHeight: 1.6 }}>
            Use a line break (Enter) inside an answer box to split text across two lines in the creative.
            Click <strong style={{ color: "rgba(255,255,255,0.35)" }}>↺ Reset to defaults</strong> to restore the original demo questions and restart all surveys.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Gallery tab ───────────────────────────────────────────────────────────────

function GalleryTab({
  variant, device, surveyKey, forceExpire, events, onRestart, onForceExpire,
  setDevice, onEvent, typography, setTypography,
  questions, setQuestions, dark,
}: {
  variant: Variant; device: Device; surveyKey: number; forceExpire: number;
  events: Array<SurveyEvent & { id: number; time: string }>;
  onRestart: () => void; onForceExpire: () => void;
  setDevice: (d: Device) => void;
  onEvent: (e: SurveyEvent) => void; typography: TypographyMode;
  setTypography: (t: TypographyMode) => void;
  questions: SurveyQuestion[]; setQuestions: (q: SurveyQuestion[]) => void;
  dark: boolean;
}) {
  const p = pc(dark);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Controls */}
      <div style={{
        background: p.surface,
        border: `1px solid ${p.border}`,
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        alignItems: "center",
      }}>
        {/* Design label */}
        <div style={{ background: GOLD, borderRadius: 20, padding: "5px 16px" }}>
          <span style={{ color: DARK_NAVY, fontSize: 9.5, fontWeight: 700, whiteSpace: "nowrap" }}>
            {DESIGN_LABEL}
          </span>
        </div>

        {/* Device */}
        <div style={{ display: "flex", gap: 5 }}>
          <Btn label="🖥 Desktop" onClick={() => setDevice("desktop")} active={device === "desktop"} small />
          <Btn label="📱 Mobile"  onClick={() => setDevice("mobile")}  active={device === "mobile"}  small />
        </div>

        {/* Typography */}
        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: 2, gap: 2 }}>
          <button
            onClick={() => setTypography("electric")}
            style={{ background: typography === "electric" ? GOLD : "transparent", border: "none", cursor: "pointer", color: typography === "electric" ? DARK_NAVY : "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: typography === "electric" ? 700 : 500, padding: "4px 12px", borderRadius: 18, transition: "all 0.2s ease", whiteSpace: "nowrap", fontFamily: "inherit" }}
          >
            ⚡ Electric Football
          </button>
          <button
            onClick={() => setTypography("system")}
            style={{ background: typography === "system" ? "rgba(255,255,255,0.12)" : "transparent", border: "none", cursor: "pointer", color: typography === "system" ? "#fff" : "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: typography === "system" ? 600 : 400, padding: "4px 12px", borderRadius: 18, transition: "all 0.2s ease", whiteSpace: "nowrap", fontFamily: "inherit" }}
          >
            System UI
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
          <Btn label="↺ Reset all"   onClick={onRestart}     accent small />
          {variant === "B" && <Btn label="⏩ Expire timers" onClick={onForceExpire} small />}
        </div>
      </div>

      {/* 8-card grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: 28,
        justifyItems: "center",
      }}>
        {THEMES.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            variant={variant}
            device={device}
            surveyKey={surveyKey}
            forceExpire={forceExpire}
            onEvent={onEvent}
            typography={typography}
            questions={questions}
            dark={dark}
          />
        ))}
      </div>

      {/* Event log */}
      <div style={{ maxWidth: 640 }}>
        <p style={{ color: p.faint, fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 7px" }}>
          Live event log
        </p>
        <EventLog events={events} />
      </div>

      {/* Question editor */}
      <QuestionEditor questions={questions} setQuestions={setQuestions} onRestart={onRestart} dark={dark} />
    </div>
  );
}

// ── Archive tab — Variant A (circle design) across all 8 themes ──────────────

function ArchiveTab({ surveyKey, typography, questions, dark }: {
  surveyKey: number; typography: TypographyMode; questions: SurveyQuestion[]; dark: boolean;
}) {
  const p = pc(dark);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 10, padding: "14px 18px" }}>
        <p style={{ color: p.text, fontSize: 13, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.01em" }}>Archived — Question in Circle (Variant A)</p>
        <p style={{ color: p.muted, fontSize: 10, margin: 0, lineHeight: 1.5 }}>
          The circle layout was evaluated but not selected for production. Retained here for reference.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 28, justifyItems: "center" }}>
        {THEMES.map((t) => (
          <div key={t.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <VariantA key={`arch-${surveyKey}-${t.id}`} theme={t} typography={typography} questions={questions} />
            <div style={{ width: "100%", maxWidth: 300, textAlign: "center" }}>
              <p style={{ color: p.text, fontSize: 11, fontWeight: 700, margin: "0 0 2px" }}>{t.name}</p>
              <p style={{ color: p.muted, fontSize: 9, margin: 0 }}>{t.feeling}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ThemeGalleryPage() {
  const [activeTab, setActiveTab]     = useState<Tab>("gallery");
  const [variant, setVariant]         = useState<Variant>("B");
  const [device, setDevice]           = useState<Device>("desktop");
  const [typography, setTypography]   = useState<TypographyMode>("electric");
  const [pageMode, setPageMode]       = useState<"dark" | "light">("dark");
  const dark = pageMode === "dark";
  const p = pc(dark);
  const [surveyKey, setSurveyKey]     = useState(0);
  const [forceExpire, setForceExpire] = useState(0);
  const [events, setEvents]           = useState<Array<SurveyEvent & { id: number; time: string }>>([]);
  const [questions, setQuestions]     = useState<SurveyQuestion[]>(
    DEFAULT_QUESTIONS.map(q => ({ ...q, answers: [...q.answers] as [string,string,string,string] }))
  );
  const eventIdRef = useRef(0);

  const handleEvent = useCallback((e: SurveyEvent) => {
    const now  = new Date();
    const time = `${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    setEvents((prev) => [...prev, { ...e, id: ++eventIdRef.current, time }].slice(-30));
  }, []);

  function restart() {
    setSurveyKey((k) => k + 1);
    setForceExpire(0);
    setEvents([]);
    eventIdRef.current = 0;
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "gallery",    label: "Gallery" },
    { id: "archive",    label: "Archive" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: p.bg, transition: "background 0.25s ease" }}>
    <div style={{
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      padding: "28px 24px 72px",
      boxSizing: "border-box",
      maxWidth: 1400,
      margin: "0 auto",
    }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(215,184,122,0.1)", border: "1px solid rgba(215,184,122,0.3)", borderRadius: 20, padding: "3px 12px", marginBottom: 10 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, display: "inline-block" }} />
            <span style={{ color: GOLD, fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Creative Lab · Theme Gallery
            </span>
          </div>
          <h1 style={{ color: p.text, fontSize: 26, fontWeight: 700, margin: "0 0 6px", letterSpacing: "-0.02em", transition: "color 0.25s ease" }}>
            Survey Creative Gallery
          </h1>
          <p style={{ color: p.muted, fontSize: 11, margin: 0, lineHeight: 1.6, maxWidth: 580, transition: "color 0.25s ease" }}>
            Compare survey creative concepts, colour themes and interaction patterns across 8 themes.
            All interactive. Isolated at <code style={{ color: "rgba(215,184,122,0.6)", background: "rgba(215,184,122,0.08)", padding: "1px 5px", borderRadius: 3, fontSize: 9 }}>/creative-lab/theme-gallery</code>
          </p>
        </div>

        {/* Dark / Light toggle */}
        <button
          onClick={() => setPageMode(m => m === "dark" ? "light" : "dark")}
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            flexShrink: 0,
            marginTop: 4,
            background: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: 20,
            padding: "6px 14px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontFamily: "inherit",
            transition: "background 0.2s ease, border-color 0.2s ease",
          }}
        >
          <span style={{ fontSize: 13 }}>{dark ? "☀" : "🌙"}</span>
          <span style={{ color: p.muted, fontSize: 10, fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
            {dark ? "Light mode" : "Dark mode"}
          </span>
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", borderBottom: `1px solid ${p.divider}`, marginBottom: 24, gap: 0 }}>
        {TABS.map(({ id, label }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: active ? p.text : p.muted,
                fontSize: 11.5, fontWeight: active ? 700 : 400,
                padding: "8px 18px 10px",
                borderBottom: active ? `2px solid ${GOLD}` : "2px solid transparent",
                marginBottom: -1,
                transition: "all 0.15s ease",
                fontFamily: "inherit",
                letterSpacing: "-0.01em",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      {activeTab === "gallery" && (
        <GalleryTab
          variant={variant}
          device={device}
          surveyKey={surveyKey}
          forceExpire={forceExpire}
          events={events}
          onRestart={restart}
          onForceExpire={() => setForceExpire((n) => n + 1)}
          setDevice={setDevice}
          onEvent={handleEvent}
          typography={typography}
          setTypography={setTypography}
          questions={questions}
          setQuestions={setQuestions}
          dark={dark}
        />
      )}

      {activeTab === "archive" && (
        <ArchiveTab surveyKey={surveyKey} typography={typography} questions={questions} dark={dark} />
      )}
    </div>
    </div>
  );
}
