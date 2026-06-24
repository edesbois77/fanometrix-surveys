"use client";

// Prototype only — /creative-lab/theme-gallery
// No production dependencies.

import { useState, useEffect, useRef } from "react";
import { VariantB } from "./VariantB";
import type { SurveyQuestion } from "./themes";
import type { TypographyMode } from "./typography";
import {
  hexToRgba, buildGradientCss, buildThemeFromState,
  stateToJson, jsonToState,
  DEFAULT_GRADIENT_STATE, DEFAULT_SOLID_STATE,
  loadSaved, persistSaved,
  type BuilderState, type SavedTheme, type GradientDirection,
} from "./customThemeUtils";

// ── Constants ─────────────────────────────────────────────────────────────────

const GOLD      = "#D7B87A";
const DARK_NAVY = "#0B1929";
const PAGE_BG   = "#07101A";

const DIRECTIONS: { label: string; value: GradientDirection }[] = [
  { label: "Top → Bottom",   value: "180deg" },
  { label: "Bottom → Top",   value: "0deg"   },
  { label: "Left → Right",   value: "90deg"  },
  { label: "Diagonal ↘",     value: "135deg" },
];

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "16px 0 8px" }}>
      {children}
    </p>
  );
}

function ColorRow({ label, hint, value, onChange }: {
  label: string; hint: string; value: string; onChange: (v: string) => void;
}) {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ color: "#fff", fontSize: 10, fontWeight: 600 }}>{label}</span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8.5 }}>{hint}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <input type="color" value={safeHex} onChange={e => onChange(e.target.value)}
          style={{ width: 30, height: 30, borderRadius: 6, cursor: "pointer", border: "1px solid rgba(255,255,255,0.15)", padding: 2, background: "none", flexShrink: 0 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 10.5, padding: "5px 8px", fontFamily: "monospace", outline: "none" }} />
        <div style={{ width: 20, height: 20, borderRadius: 4, background: value, border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
      </div>
    </div>
  );
}

function GlowRow({ hex, alpha, onChange }: {
  hex: string; alpha: number; onChange: (hex: string, alpha: number) => void;
}) {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  const rgba = hexToRgba(hex, alpha);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ color: "#fff", fontSize: 10, fontWeight: 600 }}>Glow</span>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8.5 }}>Hover and pulse effect</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <input type="color" value={safeHex} onChange={e => onChange(e.target.value, alpha)}
          style={{ width: 30, height: 30, borderRadius: 6, cursor: "pointer", border: "1px solid rgba(255,255,255,0.15)", padding: 2, background: "none", flexShrink: 0 }} />
        <input type="range" min={0} max={1} step={0.05} value={alpha}
          onChange={e => onChange(hex, Number(e.target.value))}
          style={{ flex: 1, accentColor: GOLD }} />
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, fontFamily: "monospace", flexShrink: 0, minWidth: 30, textAlign: "right" }}>
          {alpha.toFixed(2)}
        </span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 4, padding: "3px 8px" }}>
        <span style={{ fontFamily: "monospace", fontSize: 8.5, color: "rgba(255,255,255,0.4)" }}>{rgba}</span>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <span style={{ color: "#fff", fontSize: 10 }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 42, height: 22, borderRadius: 11,
          background: value ? GOLD : "rgba(255,255,255,0.12)",
          border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
          transition: "background 0.2s ease",
        }}
      >
        <div style={{
          position: "absolute", top: 3, left: value ? 22 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: value ? DARK_NAVY : "rgba(255,255,255,0.6)",
          transition: "left 0.2s ease",
        }} />
      </button>
    </div>
  );
}

function Btn({ label, onClick, gold, small, danger }: {
  label: string; onClick: () => void; gold?: boolean; small?: boolean; danger?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      background: gold ? GOLD : danger ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)",
      border: gold ? "none" : danger ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(255,255,255,0.1)",
      borderRadius: 7, cursor: "pointer",
      color: gold ? DARK_NAVY : danger ? "#F87171" : "rgba(255,255,255,0.7)",
      fontSize: small ? 9 : 10, fontWeight: gold ? 700 : 500,
      padding: small ? "4px 10px" : "6px 12px",
      fontFamily: "inherit", whiteSpace: "nowrap",
    }}>{label}</button>
  );
}

// ── Main builder ──────────────────────────────────────────────────────────────

interface Props {
  typography: TypographyMode;
  questions: SurveyQuestion[];
  dark: boolean;
}

export function CustomThemeBuilder({ typography, questions, dark }: Props) {
  const [state, setState]           = useState<BuilderState>(DEFAULT_GRADIENT_STATE);
  const [surveyKey, setSurveyKey]   = useState(0);
  const [saved, setSaved]           = useState<SavedTheme[]>([]);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr]   = useState("");
  const [copied, setCopied]         = useState(false);
  const [renameId, setRenameId]     = useState<string | null>(null);
  const [renameTmp, setRenameTmp]   = useState("");
  const importRef = useRef<HTMLTextAreaElement>(null);

  const p = dark
    ? { surface: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.07)", text: "#fff", muted: "rgba(255,255,255,0.4)" }
    : { surface: "#fff", border: "rgba(0,0,0,0.08)", text: "#0B1929", muted: "rgba(11,25,41,0.5)" };

  useEffect(() => { setSaved(loadSaved()); }, []);

  const set = <K extends keyof BuilderState>(key: K, val: BuilderState[K]) =>
    setState(s => ({ ...s, [key]: val }));

  const builtTheme = buildThemeFromState(state);

  const gradientColors = state.useThirdColor
    ? [state.gradientColor1, state.gradientColor2, state.gradientColor3]
    : [state.gradientColor1, state.gradientColor2];

  const gradientPreview = state.mode === "gradient"
    ? buildGradientCss(gradientColors, state.gradientDirection)
    : state.headerColor;

  const mirroredPreview = state.mode === "gradient"
    ? buildGradientCss([...gradientColors].reverse(), state.gradientDirection)
    : state.headerColor;

  // ── Save / manage ───────────────────────────────────────────────────────────

  function saveTheme() {
    const id = `custom-${Date.now()}`;
    const next = [...saved, { id, state: { ...state } }];
    setSaved(next);
    persistSaved(next);
  }

  function loadTheme(t: SavedTheme) { setState(t.state); setSurveyKey(k => k + 1); }

  function duplicateTheme(t: SavedTheme) {
    const id = `custom-${Date.now()}`;
    const next = [...saved, { id, state: { ...t.state, name: `${t.state.name} (copy)` } }];
    setSaved(next);
    persistSaved(next);
  }

  function deleteTheme(id: string) {
    const next = saved.filter(t => t.id !== id);
    setSaved(next);
    persistSaved(next);
  }

  function commitRename() {
    if (!renameId) return;
    const next = saved.map(t => t.id === renameId ? { ...t, state: { ...t.state, name: renameTmp } } : t);
    setSaved(next);
    persistSaved(next);
    setRenameId(null);
    setRenameTmp("");
  }

  // ── Export / import ─────────────────────────────────────────────────────────

  function copyJson() {
    const json = JSON.stringify(stateToJson(state), null, 2);
    navigator.clipboard.writeText(json).catch(() => { /* fallback */ });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function exportFile() {
    const json = JSON.stringify(stateToJson(state), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${state.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applyImport() {
    setImportErr("");
    try {
      const parsed = JSON.parse(importText);
      const next = jsonToState(parsed, state);
      setState(next);
      setSurveyKey(k => k + 1);
      setImportText("");
    } catch {
      setImportErr("Invalid JSON — check the format and try again.");
    }
  }

  // ── Gradient config panel ───────────────────────────────────────────────────

  function GradientConfig() {
    return (
      <>
        <SectionLabel>Gradient</SectionLabel>
        <ColorRow label="Colour 1" hint="Start colour" value={state.gradientColor1} onChange={v => set("gradientColor1", v)} />
        <ColorRow label="Colour 2" hint="End colour"   value={state.gradientColor2} onChange={v => set("gradientColor2", v)} />

        <Toggle label="Use third colour" value={state.useThirdColor} onChange={v => set("useThirdColor", v)} />
        {state.useThirdColor && (
          <ColorRow label="Colour 3" hint="Mid stop" value={state.gradientColor3} onChange={v => set("gradientColor3", v)} />
        )}

        {/* Direction */}
        <div style={{ marginBottom: 10 }}>
          <span style={{ color: "#fff", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 5 }}>Direction</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {DIRECTIONS.map(d => (
              <button key={d.value} onClick={() => set("gradientDirection", d.value)}
                style={{
                  background: state.gradientDirection === d.value ? GOLD : "rgba(255,255,255,0.05)",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  color: state.gradientDirection === d.value ? DARK_NAVY : "rgba(255,255,255,0.6)",
                  fontSize: 9, fontWeight: state.gradientDirection === d.value ? 700 : 400,
                  padding: "4px 10px", fontFamily: "inherit",
                }}>{d.label}</button>
            ))}
          </div>
        </div>

        <Toggle label="Mirror top quadrant gradient" value={state.mirrorTopQuadrants} onChange={v => set("mirrorTopQuadrants", v)} />

        {/* Preview strips */}
        <div style={{ marginBottom: 10 }}>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, display: "block", marginBottom: 5 }}>Header gradient preview</span>
          <div style={{ height: 22, borderRadius: 6, background: gradientPreview, border: "1px solid rgba(255,255,255,0.1)", marginBottom: 4 }} />
          {state.mirrorTopQuadrants && (
            <>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, display: "block", marginBottom: 5 }}>Top quadrant gradient (mirrored)</span>
              <div style={{ height: 22, borderRadius: 6, background: mirroredPreview, border: "1px solid rgba(255,255,255,0.1)" }} />
            </>
          )}
        </div>
      </>
    );
  }

  // ── Solid config panel ──────────────────────────────────────────────────────

  function SolidConfig() {
    return (
      <>
        <SectionLabel>Solid Colours</SectionLabel>
        <ColorRow label="Header"          hint="Header bar background"        value={state.headerColor}    onChange={v => set("headerColor",    v)} />
        <ColorRow label="Selected Answer" hint="Colour when answer is tapped" value={state.selectedColor}  onChange={v => set("selectedColor",  v)} />
        <div style={{ height: 22, borderRadius: 6, background: state.selectedColor, border: "1px solid rgba(255,255,255,0.1)", marginBottom: 10 }} />
      </>
    );
  }

  // ── Shared colour fields (both modes) ───────────────────────────────────────

  function SharedColors() {
    return (
      <>
        <SectionLabel>Colours</SectionLabel>
        <ColorRow label="Background"    hint="Main MPU background"          value={state.background}   onChange={v => set("background",   v)} />
        <ColorRow label="Quadrant base" hint="Default answer button colour"  value={state.quadrantBase} onChange={v => set("quadrantBase", v)} />
        <ColorRow label="Border"        hint="Outer border and timer ring"   value={state.border}       onChange={v => set("border",       v)} />
        <GlowRow hex={state.glowHex} alpha={state.glowAlpha}
          onChange={(h, a) => setState(s => ({ ...s, glowHex: h, glowAlpha: a }))} />
        <ColorRow label="Text"          hint="Answer text colour"            value={state.text}         onChange={v => set("text",         v)} />
        <ColorRow label="Selected text" hint="Text on selected answer"       value={state.selectedText} onChange={v => set("selectedText", v)} />
        <ColorRow label="Timer"         hint="Timer ring and progress ring"  value={state.timer}        onChange={v => set("timer",        v)} />
        <ColorRow label="Header text"   hint="Text inside the header bar"    value={state.headerText}   onChange={v => set("headerText",   v)} />
      </>
    );
  }

  // ── Saved themes list ───────────────────────────────────────────────────────

  function SavedList() {
    if (saved.length === 0) {
      return <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 9.5, fontStyle: "italic", margin: "8px 0 0" }}>No saved themes yet.</p>;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {saved.map(t => (
          <div key={t.id} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px" }}>
            {renameId === t.id ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input value={renameTmp} onChange={e => setRenameTmp(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && commitRename()}
                  autoFocus
                  style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(215,184,122,0.4)", borderRadius: 5, color: "#fff", fontSize: 10.5, padding: "4px 7px", fontFamily: "inherit", outline: "none" }} />
                <Btn label="✓ Save" onClick={commitRename} gold small />
                <Btn label="✕" onClick={() => { setRenameId(null); setRenameTmp(""); }} small />
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ color: "#fff", fontSize: 10, fontWeight: 600 }}>{t.state.name}</span>
                  <span style={{ background: t.state.mode === "gradient" ? "rgba(0,245,160,0.15)" : "rgba(215,184,122,0.15)", color: t.state.mode === "gradient" ? "#00F5A0" : GOLD, fontSize: 7.5, fontWeight: 700, padding: "1px 6px", borderRadius: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {t.state.mode}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <Btn label="Load" onClick={() => loadTheme(t)} gold small />
                  <Btn label="Rename" onClick={() => { setRenameId(t.id); setRenameTmp(t.state.name); }} small />
                  <Btn label="Duplicate" onClick={() => duplicateTheme(t)} small />
                  <Btn label="Delete" onClick={() => deleteTheme(t.id)} small danger />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header banner */}
      <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 10, padding: "14px 18px" }}>
        <p style={{ color: p.text, fontSize: 13, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.01em" }}>Custom Theme Builder</p>
        <p style={{ color: p.muted, fontSize: 10, margin: 0, lineHeight: 1.5 }}>
          Build and preview custom colour treatments for Design — Timer (300×250). All changes are prototype-only and stay in your browser.
        </p>
      </div>

      {/* 2-column layout: controls + preview */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 24, alignItems: "start" }}>

        {/* ── Left: controls ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

          {/* Theme name */}
          <SectionLabel>Theme</SectionLabel>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#fff", fontSize: 10, fontWeight: 600 }}>Theme name</span>
            </div>
            <input type="text" value={state.name}
              onChange={e => set("name", e.target.value)}
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 11, padding: "6px 10px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Mode toggle */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 3, gap: 2, marginBottom: 12 }}>
            {(["gradient", "solid"] as const).map(m => (
              <button key={m} onClick={() => {
                setState(m === "gradient" ? { ...DEFAULT_GRADIENT_STATE, name: state.name } : { ...DEFAULT_SOLID_STATE, name: state.name });
                setSurveyKey(k => k + 1);
              }}
                style={{
                  flex: 1, background: state.mode === m ? GOLD : "transparent",
                  border: "none", borderRadius: 16, cursor: "pointer",
                  color: state.mode === m ? DARK_NAVY : "rgba(255,255,255,0.5)",
                  fontSize: 10, fontWeight: state.mode === m ? 700 : 400,
                  padding: "5px 0", fontFamily: "inherit",
                  textTransform: "capitalize",
                }}
              >{m === "gradient" ? "⬡ Gradient Mode" : "◼ Solid Mode"}</button>
            ))}
          </div>

          {/* Mode-specific fields */}
          {state.mode === "gradient" ? <GradientConfig /> : <SolidConfig />}
          <SharedColors />

          {/* Actions row */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <Btn label="Save theme" onClick={saveTheme} gold />
            <Btn label="Reset" onClick={() => { setState(state.mode === "gradient" ? DEFAULT_GRADIENT_STATE : DEFAULT_SOLID_STATE); setSurveyKey(k => k + 1); }} />
          </div>
        </div>

        {/* ── Right: preview + saved + JSON ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Live preview */}
          <div>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 10px" }}>
              Live preview — {state.name}
            </p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
              <VariantB
                key={`custom-preview-${surveyKey}`}
                theme={builtTheme}
                typography={typography}
                questions={questions}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <Btn label="↺ Restart preview" onClick={() => setSurveyKey(k => k + 1)} small />
              </div>
            </div>
          </div>

          {/* Saved themes */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 14px" }}>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 10px" }}>Saved themes</p>
            <SavedList />
          </div>

          {/* JSON export */}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>Export / Import</p>

            <div style={{ display: "flex", gap: 6 }}>
              <Btn label={copied ? "✓ Copied!" : "Copy JSON"} onClick={copyJson} gold={copied} />
              <Btn label="Download JSON" onClick={exportFile} />
            </div>

            {/* JSON preview */}
            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "8px 10px", maxHeight: 140, overflow: "auto" }}>
              <pre style={{ color: "rgba(255,255,255,0.45)", fontSize: 8, margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {JSON.stringify(stateToJson(state), null, 2)}
              </pre>
            </div>

            {/* Import */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9 }}>Paste JSON to import</span>
              <textarea
                ref={importRef}
                value={importText}
                onChange={e => { setImportText(e.target.value); setImportErr(""); }}
                placeholder='{ "name": "...", "mode": "gradient", ... }'
                rows={4}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 9.5, padding: "6px 8px", fontFamily: "monospace", resize: "vertical", outline: "none" }}
              />
              {importErr && <p style={{ color: "#F87171", fontSize: 9, margin: 0 }}>{importErr}</p>}
              <Btn label="Apply import" onClick={applyImport} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
