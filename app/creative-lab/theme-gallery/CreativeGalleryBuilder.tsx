"use client";

// Production authoring + browsing tool — every Design (the 9 original
// built-ins and everything authored here) is a real row in creative_designs
// (via /api/creative-designs), immediately available in the Research Project
// and Campaigns Creative Design pickers. Click any design below to edit it
// in place, duplicate it as a new colour variant, or delete it.

import { useState, useEffect, useMemo } from "react";
import { ThemedSurvey } from "@/app/embed/ThemedSurvey";
import { ClassicSurvey } from "@/app/embed/ClassicSurvey";
import {
  hexToRgba, buildGradientCss, buildEmbedThemeFromState,
  DEFAULT_GRADIENT_STATE,
  type BuilderState, type GradientDirection,
} from "@/lib/creative-theme-builder";
import { DESIGN_CATEGORIES, type DesignCategory } from "@/lib/creative-designs";

const GOLD      = "#D7B87A";
const DARK_NAVY = "#0B1929";

const PREVIEW_QUESTIONS = [
  { id: "p1", text: "Why do you watch football?",     options: [{ id:1, text:"Entertainment\n& Escape" }, { id:2, text:"Friends\n& Family" },   { id:3, text:"Inspiration\n& Ambition" }, { id:4, text:"Identity &\nCommunity" }] },
  { id: "p2", text: "What shapes your match day?",    options: [{ id:1, text:"The\nAtmosphere" },          { id:2, text:"The\nResult" },          { id:3, text:"Social\nExperience" },      { id:4, text:"Player\nPerformance" }]  },
  { id: "p3", text: "What drives your club loyalty?", options: [{ id:1, text:"Local\nPride" },              { id:2, text:"Family\nTradition" },    { id:3, text:"Winning\nCulture" },         { id:4, text:"Player\nHeritage" }]     },
];

const DIRECTIONS: { label: string; value: GradientDirection }[] = [
  { label: "Top → Bottom",   value: "180deg" },
  { label: "Bottom → Top",   value: "0deg"   },
  { label: "Left → Right",   value: "90deg"  },
  { label: "Diagonal ↘",     value: "135deg" },
];

type Design = {
  id: string;
  slug: string;
  name: string;
  theme: DesignCategory;
  sub_theme: string | null;
  publisher_id: string | null;
  publisher_name: string | null;
  layout: "timer" | "classic";
  builder_state: BuilderState;
};

// ── Shared sub-components (small, presentational — kept local to avoid any
// coupling to the prototype's CustomThemeBuilder.tsx) ───────────────────────

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

function designSwatch(d: Design): string {
  try { return buildEmbedThemeFromState(d.builder_state).gradient; } catch { return "#0B1929"; }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function CreativeGalleryBuilder({ dark: _dark }: { dark: boolean }) {
  const [state, setState] = useState<BuilderState>(DEFAULT_GRADIENT_STATE);
  const [theme, setTheme] = useState<DesignCategory>("fanometrix");
  const [subTheme, setSubTheme] = useState("");
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [publishers, setPublishers] = useState<{ id: string; name: string }[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsClassic, setEditingIsClassic] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState("");
  const [surveyKey, setSurveyKey] = useState(0);

  const loadDesigns = () => {
    fetch("/api/creative-designs")
      .then(r => r.ok ? r.json() : null)
      .then(json => setDesigns(json?.data ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    loadDesigns();
    fetch("/api/publishers")
      .then(r => r.ok ? r.json() : null)
      .then(json => setPublishers(json?.data ?? []))
      .catch(() => {});
  }, []);

  const set = <K extends keyof BuilderState>(key: K, val: BuilderState[K]) =>
    setState(s => ({ ...s, [key]: val }));

  const customTheme = buildEmbedThemeFromState(state);

  const gradientColors = state.useThirdColor
    ? [state.gradientColor1, state.gradientColor2, state.gradientColor3]
    : [state.gradientColor1, state.gradientColor2];
  const gradientPreview = state.mode === "gradient"
    ? buildGradientCss(gradientColors, state.gradientDirection)
    : state.headerColor;

  // Grouped Theme → Sub-theme browse tree, built from every fetched design.
  const grouped = useMemo(() => {
    const byTheme = new Map<DesignCategory, Map<string, Design[]>>();
    for (const d of designs) {
      const label = d.theme === "publisher" ? (d.publisher_name ?? "Unknown publisher") : (d.sub_theme ?? "General");
      if (!byTheme.has(d.theme)) byTheme.set(d.theme, new Map());
      const subMap = byTheme.get(d.theme)!;
      if (!subMap.has(label)) subMap.set(label, []);
      subMap.get(label)!.push(d);
    }
    return byTheme;
  }, [designs]);

  // Sub-theme reuse: every distinct freeform sub-theme name across ALL
  // themes, so e.g. "Count Down Clock" is one click to reuse under Brand or
  // Tournament instead of retyped.
  const subThemeSuggestions = useMemo(() => (
    Array.from(new Set(designs.map(d => d.sub_theme).filter((s): s is string => !!s))).sort()
  ), [designs]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function resetForm() {
    setState(DEFAULT_GRADIENT_STATE);
    setTheme("fanometrix");
    setSubTheme("");
    setPublisherId(null);
    setEditingId(null);
    setEditingIsClassic(false);
    setIsDuplicating(false);
    setSurveyKey(k => k + 1);
  }

  function loadForEdit(d: Design) {
    setState(d.builder_state);
    setTheme(d.theme);
    setSubTheme(d.sub_theme ?? "");
    setPublisherId(d.publisher_id);
    setEditingId(d.id);
    setEditingIsClassic(d.layout === "classic");
    setIsDuplicating(false);
    setSurveyKey(k => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function duplicateDesign(d: Design) {
    setState({ ...d.builder_state, name: `${d.name} (copy)` });
    setTheme(d.theme);
    setSubTheme(d.sub_theme ?? "");
    setPublisherId(d.publisher_id);
    setEditingId(null);
    setEditingIsClassic(false); // a duplicate is always a real, editable Timer variant
    setIsDuplicating(true);
    setSurveyKey(k => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    setErrorMsg("");
    if (!state.name.trim()) { setErrorMsg("Give this design a name."); return; }
    if (theme === "publisher" && !publisherId) { setErrorMsg("Select a publisher for the Publisher theme."); return; }

    setSaving(true);
    const payload = {
      name: state.name.trim(),
      theme,
      sub_theme: theme === "publisher" ? null : (subTheme.trim() || null),
      publisher_id: theme === "publisher" ? publisherId : null,
      builder_state: state,
    };
    const url = editingId ? `/api/creative-designs/${editingId}` : "/api/creative-designs";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json();
    setSaving(false);

    if (!res.ok) { setErrorMsg(json.error ?? "Failed to save."); return; }
    showToast(editingId ? "Design updated." : "Design saved — it's now available in Research Projects and Campaigns.");
    loadDesigns();
    if (!editingId) resetForm();
  }

  async function deleteDesign(d: Design) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    const res = await fetch(`/api/creative-designs/${d.id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      if (res.status === 409 && confirm(`${json.error} Delete anyway?`)) {
        await fetch(`/api/creative-designs/${d.id}?force=true`, { method: "DELETE" });
      } else {
        showToast(json.error ?? "Could not delete design.");
        return;
      }
    }
    showToast("Design deleted.");
    loadDesigns();
    if (editingId === d.id) resetForm();
  }

  const saveLabel = saving ? "Saving…" : editingId ? "Save changes" : isDuplicating ? "Save as new variant" : "Save design";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "14px 18px" }}>
        <p style={{ color: "#fff", fontSize: 13, fontWeight: 700, margin: "0 0 4px", letterSpacing: "-0.01em" }}>Creative Gallery</p>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, margin: 0, lineHeight: 1.5 }}>
          Every creative design — built-in and custom — lives here, organised by Theme and Sub-theme. Click one to
          edit its colours and save the change, or save it as a new colour variant. New designs appear immediately
          in the Research Project and Campaigns Creative Design pickers — no deploy needed.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 380px) 1fr", gap: 24, alignItems: "start" }}>

        {/* ── Left: controls ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

          <SectionLabel>Design</SectionLabel>
          <div style={{ marginBottom: 12 }}>
            <span style={{ color: "#fff", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>Name</span>
            <input type="text" value={state.name}
              onChange={e => set("name", e.target.value)}
              style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 11, padding: "6px 10px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={{ color: "#fff", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>Theme</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {DESIGN_CATEGORIES.map(cat => (
                <button key={cat.id} onClick={() => setTheme(cat.id)}
                  style={{
                    background: theme === cat.id ? GOLD : "rgba(255,255,255,0.05)",
                    border: "none", borderRadius: 6, cursor: "pointer",
                    color: theme === cat.id ? DARK_NAVY : "rgba(255,255,255,0.6)",
                    fontSize: 9, fontWeight: theme === cat.id ? 700 : 400,
                    padding: "4px 10px", fontFamily: "inherit",
                  }}>{cat.label}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={{ color: "#fff", fontSize: 10, fontWeight: 600, display: "block", marginBottom: 4 }}>
              {theme === "publisher" ? "Publisher" : "Sub-theme (optional)"}
            </span>
            {theme === "publisher" ? (
              <select value={publisherId ?? ""} onChange={e => setPublisherId(e.target.value || null)}
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 11, padding: "6px 10px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}>
                <option value="" style={{ color: "#000" }}>— Select publisher —</option>
                {publishers.map(pub => <option key={pub.id} value={pub.id} style={{ color: "#000" }}>{pub.name}</option>)}
              </select>
            ) : (
              <>
                <input type="text" value={subTheme} onChange={e => setSubTheme(e.target.value)}
                  placeholder="e.g. Count Down Clock"
                  style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 11, padding: "6px 10px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                {subThemeSuggestions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {subThemeSuggestions.map(s => (
                      <button key={s} onClick={() => setSubTheme(s)}
                        style={{
                          background: subTheme === s ? GOLD : "rgba(255,255,255,0.05)",
                          border: "none", borderRadius: 5, cursor: "pointer",
                          color: subTheme === s ? DARK_NAVY : "rgba(255,255,255,0.5)",
                          fontSize: 8.5, fontWeight: subTheme === s ? 700 : 400,
                          padding: "3px 8px", fontFamily: "inherit",
                        }}>{s}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {editingIsClassic ? (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "10px 12px", marginTop: 4 }}>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 9.5, lineHeight: 1.5, margin: 0 }}>
                This is the plain classic-list format — it has no colours to customise. You can rename it or move it
                to a different Sub-theme, but not recolour it. To create a coloured variant, use Duplicate on a
                Timer design instead.
              </p>
            </div>
          ) : (
            <>
              <SectionLabel>Gradient</SectionLabel>
              <ColorRow label="Colour 1" hint="Start colour" value={state.gradientColor1} onChange={v => set("gradientColor1", v)} />
              <ColorRow label="Colour 2" hint="End colour"   value={state.gradientColor2} onChange={v => set("gradientColor2", v)} />
              <Toggle label="Use third colour" value={state.useThirdColor} onChange={v => set("useThirdColor", v)} />
              {state.useThirdColor && (
                <ColorRow label="Colour 3" hint="Mid stop" value={state.gradientColor3} onChange={v => set("gradientColor3", v)} />
              )}
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
              <div style={{ marginBottom: 10 }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, display: "block", marginBottom: 5 }}>Header gradient preview</span>
                <div style={{ height: 22, borderRadius: 6, background: gradientPreview, border: "1px solid rgba(255,255,255,0.1)" }} />
              </div>

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
          )}

          {errorMsg && <p style={{ color: "#F87171", fontSize: 10, margin: "4px 0" }}>{errorMsg}</p>}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <Btn label={saveLabel} onClick={save} gold />
            {(editingId || isDuplicating) && <Btn label="Cancel" onClick={resetForm} />}
          </div>
        </div>

        {/* ── Right: preview + browse tree ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 10px" }}>
              Live preview — {state.name || "Untitled"}
            </p>
            {editingIsClassic ? (
              <ClassicSurvey
                key={`gallery-preview-${surveyKey}`}
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
            ) : (
              <ThemedSurvey
                key={`gallery-preview-${surveyKey}`}
                themeId="fanometrix"
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
            )}
          </div>

          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "12px 14px" }}>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 10px" }}>
              All designs ({designs.length})
            </p>
            {designs.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 9.5, fontStyle: "italic", margin: 0 }}>No designs saved yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {DESIGN_CATEGORIES.map(cat => {
                  const subMap = grouped.get(cat.id);
                  if (!subMap || subMap.size === 0) return null;
                  return (
                    <div key={cat.id}>
                      <p style={{ color: GOLD, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 6px" }}>
                        {cat.label}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {Array.from(subMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([label, list]) => (
                          <details key={label} open style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
                            <summary style={{ cursor: "pointer", padding: "6px 10px", fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                              {label} <span style={{ color: "rgba(255,255,255,0.3)" }}>({list.length})</span>
                            </summary>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 8px 8px" }}>
                              {list.map(d => (
                                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 8px" }}>
                                  <div style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0, background: designSwatch(d), border: "1px solid rgba(255,255,255,0.15)" }} />
                                  <span style={{ color: "#fff", fontSize: 10, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {d.name}
                                  </span>
                                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                    <Btn label="Edit" onClick={() => loadForEdit(d)} gold small />
                                    <Btn label="Duplicate" onClick={() => duplicateDesign(d)} small />
                                    <Btn label="Delete" onClick={() => deleteDesign(d)} small danger />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: DARK_NAVY, color: GOLD, fontSize: 11, fontWeight: 600, padding: "10px 16px", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", zIndex: 50 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
