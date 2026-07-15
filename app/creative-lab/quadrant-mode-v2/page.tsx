"use client";

import { useState, useCallback, useRef } from "react";
import { VariantA, type SurveyEvent as EventA } from "./VariantA";
import { VariantB, type SurveyEvent as EventB } from "./VariantB";
import { THEMES, DEFAULT_THEME, type Theme } from "./themes";

type Variant = "A" | "B";
type DeviceFrame = "desktop" | "mobile";
type SurveyEvent = EventA | EventB;

const LAB_GOLD = "#D7B87A";
const LAB_NAVY = "#0B1929";

// ── Event log ─────────────────────────────────────────────────────────────────

function EventLog({ events }: { events: Array<SurveyEvent & { id: number; time: string }> }) {
  return (
    <div style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: events.length ? LAB_GOLD : "rgba(255,255,255,0.2)", flexShrink: 0, display: "inline-block" }} />
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Event Log
        </span>
      </div>
      <div style={{ height: 110, overflowY: "auto", padding: "4px 0" }}>
        {events.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, margin: "8px 10px", fontStyle: "italic" }}>
            Interact with the survey to see events…
          </p>
        ) : (
          [...events].reverse().map((e) => (
            <div key={e.id} style={{ padding: "3px 10px", display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 8, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{e.time}</span>
              <span style={{ color: LAB_GOLD, fontSize: 8, flexShrink: 0 }}>[{e.variant}]</span>
              <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 8.5, lineHeight: 1.3 }}>
                <span style={{ color: "rgba(255,255,255,0.35)" }}>{e.type}</span>
                {" "}{e.detail}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Theme swatch panel ────────────────────────────────────────────────────────

function ThemeSwatches({
  themes,
  active,
  onSelect,
}: {
  themes: Theme[];
  active: Theme;
  onSelect: (t: Theme) => void;
}) {
  return (
    <div>
      <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 8px" }}>
        Themes
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {themes.map((t) => {
          const isActive = t.id === active.id;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              title={t.name}
              style={{
                width: "calc(33.33% - 4px)",
                background: isActive ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                border: isActive ? `1px solid ${LAB_GOLD}` : "1px solid rgba(255,255,255,0.07)",
                borderRadius: 7,
                padding: "7px 8px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                fontFamily: "system-ui, -apple-system, sans-serif",
                textAlign: "left",
                transition: "border-color 0.15s ease, background 0.15s ease",
              }}
            >
              {/* 4 colour swatches */}
              <div style={{ display: "flex", gap: 3 }}>
                {[t.swatches.bg, t.swatches.accent, t.swatches.selected, t.swatches.extra].map((swatch, i) => (
                  <div
                    key={i}
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 2,
                      background: swatch,
                      border: "1px solid rgba(255,255,255,0.1)",
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>
              {/* Theme name */}
              <span
                style={{
                  color: isActive ? "#fff" : "rgba(255,255,255,0.45)",
                  fontSize: 8.5,
                  fontWeight: isActive ? 600 : 400,
                  lineHeight: 1.2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.name}
              </span>
            </button>
          );
        })}
      </div>
      {/* Swatch legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
        {["Background", "Accent", "Selected", "Extra"].map((label) => (
          <span key={label} style={{ color: "rgba(255,255,255,0.2)", fontSize: 7.5, letterSpacing: "0.04em" }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Device frame wrappers ─────────────────────────────────────────────────────

function DesktopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ background: "#1C2732", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", borderRadius: "6px 6px 0 0", height: 28, display: "flex", alignItems: "center", padding: "0 10px", gap: 5 }}>
        {["#E8654A", LAB_GOLD, "#4ADE80"].map((c, i) => (
          <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: c, opacity: 0.6 }} />
        ))}
        <div style={{ flex: 1, marginLeft: 8, height: 14, background: "rgba(255,255,255,0.06)", borderRadius: 3, maxWidth: 220 }} />
      </div>
      <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderTop: "none", borderRadius: "0 0 4px 4px" }}>
        {children}
      </div>
    </div>
  );
}

function MobileFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#111", border: "2px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "20px 8px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ width: 60, height: 8, background: "rgba(255,255,255,0.1)", borderRadius: 4, flexShrink: 0 }} />
      <div>{children}</div>
      <div style={{ width: 40, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, flexShrink: 0 }} />
    </div>
  );
}

// ── Control button ────────────────────────────────────────────────────────────

function CtrlBtn({ label, onClick, active, disabled, accent }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; accent?: boolean; }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? LAB_GOLD : accent ? "rgba(215,184,122,0.12)" : "rgba(255,255,255,0.06)",
        border: active ? "none" : accent ? "1px solid rgba(215,184,122,0.3)" : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        color: active ? LAB_NAVY : accent ? LAB_GOLD : "rgba(255,255,255,0.7)",
        fontSize: 10,
        fontWeight: active ? 700 : 500,
        padding: "6px 12px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "all 0.15s ease",
        whiteSpace: "nowrap",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {label}
    </button>
  );
}

// ── Main testing panel ────────────────────────────────────────────────────────

export default function QuadrantModeV2Page() {
  const [variant, setVariant] = useState<Variant>("A");
  const [surveyKey, setSurveyKey] = useState(0);
  const [deviceFrame, setDeviceFrame] = useState<DeviceFrame>("desktop");
  const [simHoverIdx, setSimHoverIdx] = useState<number | null>(null);
  const [forceExpire, setForceExpire] = useState(0);
  const [events, setEvents] = useState<Array<SurveyEvent & { id: number; time: string }>>([]);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const eventIdRef = useRef(0);

  const handleEvent = useCallback((e: SurveyEvent) => {
    const now = new Date();
    const time = `${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    setEvents((prev) => [...prev, { ...e, id: ++eventIdRef.current, time }].slice(-20));
  }, []);

  function restart() {
    setSurveyKey((k) => k + 1);
    setSimHoverIdx(null);
    setForceExpire(0);
    setEvents([]);
    eventIdRef.current = 0;
  }

  function cycleSimHover() {
    setSimHoverIdx((prev) => {
      if (prev === null) return 0;
      if (prev >= 3) return null;
      return prev + 1;
    });
  }

  // Theme switching does NOT reset survey state — theme is purely a prop
  function handleThemeSelect(t: Theme) {
    setTheme(t);
    // Log theme change to event log
    const now = new Date();
    const time = `${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    setEvents((prev) =>
      [...prev, { variant, type: "theme_change", detail: t.name, id: ++eventIdRef.current, time } as SurveyEvent & { id: number; time: string }]
        .slice(-20)
    );
  }

  const preview = variant === "A" ? (
    <VariantA
      key={surveyKey}
      theme={theme}
      simulatedHoverGridIdx={simHoverIdx}
      onEvent={handleEvent as (e: EventA) => void}
    />
  ) : (
    <VariantB
      key={surveyKey}
      theme={theme}
      simulatedHoverGridIdx={simHoverIdx}
      forceExpire={forceExpire}
      onEvent={handleEvent as (e: EventB) => void}
    />
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#07101A",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 16px 60px",
        boxSizing: "border-box",
      }}
    >
      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <div style={{ display: "inline-block", background: "rgba(215,184,122,0.1)", border: "1px solid rgba(215,184,122,0.3)", color: LAB_GOLD, fontSize: 8, fontWeight: 700, letterSpacing: "0.14em", padding: "3px 11px", borderRadius: 20, marginBottom: 10, textTransform: "uppercase" }}>
          Creative Lab · V2 Prototype
        </div>
        <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
          Quadrant Mode V2
        </h1>
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, margin: "5px 0 0", lineHeight: 1.5 }}>
          Internal prototype, not for production deployment
        </p>
      </div>

      {/* ── Variant toggle ── */}
      <div
        role="tablist"
        aria-label="Variant selector"
        style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 3, gap: 2, marginBottom: 20 }}
      >
        {(["A", "B"] as Variant[]).map((v) => {
          const active = variant === v;
          const labels: Record<Variant, string> = { A: "Variant A, Question in circle", B: "Variant B, Question above + timer" };
          return (
            <button
              key={v}
              role="tab"
              aria-selected={active}
              onClick={() => { setVariant(v); restart(); }}
              style={{
                background: active ? LAB_GOLD : "transparent",
                border: "none",
                cursor: "pointer",
                color: active ? LAB_NAVY : "rgba(255,255,255,0.5)",
                fontSize: 10.5,
                fontWeight: active ? 700 : 500,
                padding: "6px 16px",
                borderRadius: 20,
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
            >
              {labels[v]}
            </button>
          );
        })}
      </div>

      {/* ── Active theme label ── */}
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 2, background: theme.swatches.selected, flexShrink: 0 }} />
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
          {theme.name}
        </span>
      </div>

      {/* ── Preview canvas ── */}
      <div style={{ marginBottom: 8 }}>
        {deviceFrame === "desktop" ? <DesktopFrame>{preview}</DesktopFrame> : <MobileFrame>{preview}</MobileFrame>}
      </div>

      <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 20px" }}>
        300 × 250 MPU
      </p>

      {/* ── Controls ── */}
      <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Theme swatch selector */}
        <ThemeSwatches themes={THEMES} active={theme} onSelect={handleThemeSelect} />

        {/* Separator */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

        {/* Survey controls */}
        <div>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 7px" }}>Survey controls</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <CtrlBtn label="↺ Restart survey" onClick={restart} accent />
            <CtrlBtn
              label={simHoverIdx === null ? "Simulate hover: off" : `Hover: Q${["TL", "TR", "BL", "BR"][simHoverIdx]}`}
              onClick={cycleSimHover}
              active={simHoverIdx !== null}
            />
          </div>
        </div>

        {/* Timer controls (Variant B only) */}
        {variant === "B" && (
          <div>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 7px" }}>Timer controls (Variant B)</p>
            <div style={{ display: "flex", gap: 6 }}>
              <CtrlBtn label="⏩ Simulate timer expiry" onClick={() => setForceExpire((n) => n + 1)} accent />
            </div>
          </div>
        )}

        {/* Device frame */}
        <div>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 7px" }}>Device frame</p>
          <div style={{ display: "flex", gap: 6 }}>
            <CtrlBtn label="🖥 Desktop" onClick={() => setDeviceFrame("desktop")} active={deviceFrame === "desktop"} />
            <CtrlBtn label="📱 Mobile" onClick={() => setDeviceFrame("mobile")} active={deviceFrame === "mobile"} />
          </div>
        </div>

        {/* Event log */}
        <div>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 7px" }}>Event log</p>
          <EventLog events={events} />
        </div>

        {/* Isolation notice */}
        <p style={{ color: "rgba(255,255,255,0.18)", fontSize: 8.5, lineHeight: 1.6, margin: 0, textAlign: "center" }}>
          Prototype isolated at{" "}
          <code style={{ color: "rgba(215,184,122,0.4)", background: "rgba(215,184,122,0.05)", padding: "1px 5px", borderRadius: 3, fontSize: 8 }}>
            /creative-lab/quadrant-mode-v2
          </code>
          . Removable without affecting production.
        </p>
      </div>
    </div>
  );
}
