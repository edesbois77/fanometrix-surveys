"use client";

// Creative Studio — the dedicated editor for one design (replaces the old
// all-in-one Creative Gallery builder). Two columns: a sticky live preview
// on the left, collapsible configuration sections on the right. Reached from
// the Creative Gallery (../page.tsx) via Edit.

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AdminShell } from "@/app/components/AdminShell";
import { ThemedSurvey } from "@/app/embed/ThemedSurvey";
import { ClassicSurvey } from "@/app/embed/ClassicSurvey";
import {
  hexToRgba, buildGradientCss, buildEmbedThemeFromState, resolveBrandingLogos,
  DEFAULT_GRADIENT_STATE,
  type BuilderState, type GradientDirection, type BrandingConfig,
} from "@/lib/creative-theme-builder";
import { DESIGN_CATEGORIES, type DesignCategory } from "@/lib/creative-designs";

const GOLD = "#D7B87A";
const NAVY = "#0B1929";
const GOLD_TINT = "#FBF5E8";

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

const BRANDING_SLOTS: { urlKey: keyof BrandingConfig; visKey: keyof BrandingConfig; label: string }[] = [
  { urlKey: "fanometrix_logo_url", visKey: "fanometrix_logo_visible", label: "Fanometrix logo" },
  { urlKey: "publisher_logo_url",  visKey: "publisher_logo_visible",  label: "Publisher logo"  },
  { urlKey: "brand_logo_url",      visKey: "brand_logo_visible",      label: "Brand logo"      },
  { urlKey: "sponsor_logo_url",    visKey: "sponsor_logo_visible",     label: "Sponsor logo"    },
];

type Design = {
  id: string;
  slug: string;
  name: string;
  theme: DesignCategory;
  sub_theme: string | null;
  publisher_id: string | null;
  layout: "timer" | "classic";
  status: "active" | "archived";
  is_system: boolean;
  created_at: string;
  updated_at: string;
  builder_state: BuilderState;
  branding: BrandingConfig | null;
};

const INP = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#D7B87A]";

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="bg-white border border-gray-100 rounded-xl shadow-sm group">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-800 select-none list-none flex items-center justify-between">
        {title}
        <span className="text-gray-300 text-xs group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-gray-50">{children}</div>
    </details>
  );
}

function ColorField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">{label}</span>
        <span className="text-[11px] text-gray-400">{hint}</span>
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={safeHex} onChange={e => onChange(e.target.value)}
          className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer p-0.5" />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className={INP + " font-mono"} />
      </div>
    </div>
  );
}

function GlowField({ hex, alpha, onChange }: { hex: string; alpha: number; onChange: (hex: string, alpha: number) => void }) {
  const safeHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000000";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700">Glow</span>
        <span className="text-[11px] text-gray-400">Hover and pulse effect</span>
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={safeHex} onChange={e => onChange(e.target.value, alpha)}
          className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer p-0.5" />
        <input type="range" min={0} max={1} step={0.05} value={alpha}
          onChange={e => onChange(hex, Number(e.target.value))}
          className="flex-1 accent-[#D7B87A]" />
        <span className="text-[11px] text-gray-400 font-mono w-8 text-right">{alpha.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-gray-700">{label}</span>
      <button onClick={() => onChange(!value)}
        className="w-10 h-5.5 rounded-full relative flex-shrink-0 transition-colors"
        style={{ background: value ? GOLD : "#E5E7EB", height: 22, width: 40 }}>
        <span className="absolute top-0.5 rounded-full bg-white shadow transition-all"
          style={{ left: value ? 20 : 2, width: 18, height: 18 }} />
      </button>
    </div>
  );
}

export default function CreativeStudioPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [design, setDesign] = useState<Design | null>(null);

  const [state, setState] = useState<BuilderState>(DEFAULT_GRADIENT_STATE);
  // The design's actual name — the creative_designs.name column, NOT
  // builder_state.name (a vestigial field from the old authoring tool that
  // nothing renders and can go stale, e.g. after a duplicate is renamed).
  const [designName, setDesignName] = useState("");
  const [theme, setTheme] = useState<DesignCategory>("fanometrix");
  const [subTheme, setSubTheme] = useState("");
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [publishers, setPublishers] = useState<{ id: string; name: string }[]>([]);
  const [layout, setLayout] = useState<"timer" | "classic">("timer");
  const [branding, setBranding] = useState<BrandingConfig>({});
  const [allSubThemes, setAllSubThemes] = useState<string[]>([]);

  // Bump to remount the live preview on demand — it's a real ThemedSurvey/
  // ClassicSurvey instance with its own internal state (countdown timer,
  // selected answer, etc.), so colour/gradient edits made after the initial
  // mount don't reset that state by themselves. Refresh gives a clean replay.
  const [previewKey, setPreviewKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/creative-designs/${id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(json => {
        const d = json.data as Design;
        setDesign(d);
        setState(d.builder_state);
        setDesignName(d.name);
        setTheme(d.theme);
        setSubTheme(d.sub_theme ?? "");
        setPublisherId(d.publisher_id);
        setLayout(d.layout);
        setBranding(d.branding ?? {});
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/creative-designs?status=all")
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        const rows = (json?.data ?? []) as { sub_theme: string | null }[];
        setAllSubThemes(Array.from(new Set(rows.map(r => r.sub_theme).filter((s): s is string => !!s))).sort());
      })
      .catch(() => {});
    fetch("/api/publishers")
      .then(r => r.ok ? r.json() : null)
      .then(json => setPublishers(json?.data ?? []))
      .catch(() => {});
  }, []);

  const set = <K extends keyof BuilderState>(key: K, val: BuilderState[K]) =>
    setState(s => ({ ...s, [key]: val }));
  const setBrandField = <K extends keyof BrandingConfig>(key: K, val: BrandingConfig[K]) =>
    setBranding(b => ({ ...b, [key]: val }));

  const customTheme = useMemo(() => buildEmbedThemeFromState(state), [state]);
  const brandingPreview = useMemo(() => resolveBrandingLogos(branding), [branding]);

  const gradientColors = state.useThirdColor
    ? [state.gradientColor1, state.gradientColor2, state.gradientColor3]
    : [state.gradientColor1, state.gradientColor2];
  const gradientPreview = buildGradientCss(gradientColors, state.gradientDirection);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function buildPayload() {
    const name = designName.trim();
    return {
      name,
      theme,
      sub_theme: theme === "publisher" ? null : (subTheme.trim() || null),
      publisher_id: theme === "publisher" ? publisherId : null,
      builder_state: { ...state, name },
      branding,
    };
  }

  async function save() {
    setErrorMsg("");
    if (!designName.trim()) { setErrorMsg("Give this design a name."); return; }
    if (theme === "publisher" && !publisherId) { setErrorMsg("Select a publisher for the Publisher theme."); return; }

    setSaving(true);
    const payload = buildPayload();

    if (design?.is_system) {
      // Protected system design — fork into a new, unprotected variant. If
      // the name wasn't changed from the original, auto-suffix it so the
      // fork isn't indistinguishable from the master in listings.
      const forkName = !payload.name || payload.name === design.name
        ? `${design.name} (edited)`
        : payload.name;
      const res = await fetch("/api/creative-designs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, name: forkName, builder_state: { ...state, name: forkName } }),
      });
      const json = await res.json();
      setSaving(false);
      if (!res.ok) { setErrorMsg(json.error ?? "Failed to save."); return; }
      router.push(`/creative-lab/designs/${json.data.id}`);
      return;
    }

    const res = await fetch(`/api/creative-designs/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setErrorMsg(json.error ?? "Failed to save."); return; }
    showToast("Saved.");
    load();
  }

  async function duplicateNow() {
    setSaving(true);
    const payload = buildPayload();
    const copyName = `${payload.name || "Untitled"} (copy)`;
    const res = await fetch("/api/creative-designs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, name: copyName, builder_state: { ...state, name: copyName } }),
    });
    const json = await res.json();
    setSaving(false);
    if (res.ok) router.push(`/creative-lab/designs/${json.data.id}`);
  }

  if (notFound) {
    return (
      <AdminShell>
        <div className="max-w-md mx-auto mt-24 text-center">
          <p className="text-lg font-semibold text-gray-900">Design not found</p>
          <p className="text-sm text-gray-500 mt-1">It may have been deleted.</p>
          <Link href="/creative-lab/designs" className="inline-block mt-4 text-sm font-semibold" style={{ color: GOLD }}>
            ← Back to Creative Designs
          </Link>
        </div>
      </AdminShell>
    );
  }

  if (loading || !design) {
    return (
      <AdminShell>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      </AdminShell>
    );
  }

  const subThemeSuggestions = allSubThemes.filter(s => s !== subTheme);

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/creative-lab/designs" className="text-xs font-medium text-gray-400 hover:text-gray-600">
              ← Back to Creative Designs
            </Link>
            <div className="flex items-center gap-2 mt-1">
              <h1 className="text-2xl font-bold text-gray-900">{design.name}</h1>
              {design.status === "archived" && (
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Archived</span>
              )}
              {design.is_system && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: GOLD_TINT, color: NAVY }}>
                  System design
                </span>
              )}
            </div>
          </div>
        </div>

        {design.is_system && (
          <div className="bg-white border rounded-xl px-4 py-3 mb-6" style={{ borderColor: GOLD }}>
            <p className="text-sm" style={{ color: NAVY }}>
              This is one of the original built-in designs. It's protected — saving your changes here creates a new,
              independent variant instead of overwriting it.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-8 items-start">
          {/* ── Left: sticky live preview ── */}
          <div className="lg:sticky lg:top-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Live preview</p>
              <button
                onClick={() => setPreviewKey(k => k + 1)}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
                title="Restart the preview — see your edits without saving"
              >
                ↻ Refresh
              </button>
            </div>
            <div className="flex justify-center bg-gray-50 border border-gray-100 rounded-xl p-4">
              {/* flex-shrink-0: the creative is a fixed 300x250 — it must never be
                  compressed by its flex parent. A shrunk outer box previously
                  clipped the (fixed-pixel-width) quadrant grid via overflow:hidden,
                  which looked like a text-fit bug but was actually this. */}
              <div className="flex-shrink-0">
              {layout === "classic" ? (
                <ClassicSurvey
                  key={`studio-preview-${previewKey}`}
                  branding={brandingPreview}
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
                  key={`studio-preview-${previewKey}`}
                  themeId={design.slug}
                  customTheme={customTheme}
                  branding={brandingPreview}
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
            </div>
          </div>

          {/* ── Right: collapsible configuration sections ── */}
          <div className="space-y-4">

            <Section title="General">
              <div>
                <span className="text-xs font-semibold text-gray-700 block mb-1">Name</span>
                <input type="text" value={designName} onChange={e => setDesignName(e.target.value)} className={INP} />
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-700 block mb-1">Theme</span>
                <div className="flex flex-wrap gap-1.5">
                  {DESIGN_CATEGORIES.map(cat => (
                    <button key={cat.id} onClick={() => setTheme(cat.id)}
                      className="px-3 py-1 rounded-full text-xs font-medium"
                      style={theme === cat.id ? { background: GOLD, color: NAVY } : { background: "#F3F4F6", color: "#4B5563" }}>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-700 block mb-1">
                  {theme === "publisher" ? "Publisher" : "Sub-theme (optional)"}
                </span>
                {theme === "publisher" ? (
                  <select value={publisherId ?? ""} onChange={e => setPublisherId(e.target.value || null)} className={INP}>
                    <option value="">— Select publisher —</option>
                    {publishers.map(pub => <option key={pub.id} value={pub.id}>{pub.name}</option>)}
                  </select>
                ) : (
                  <>
                    <input type="text" value={subTheme} onChange={e => setSubTheme(e.target.value)}
                      placeholder="e.g. Count Down Clock" className={INP} />
                    {subThemeSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {subThemeSuggestions.map(s => (
                          <button key={s} onClick={() => setSubTheme(s)}
                            className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 hover:bg-gray-200">
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Section>

            <Section title="Branding">
              <p className="text-xs text-gray-400 -mt-1">
                Simple hosted-image URLs for white-labelled variants (e.g. Fanometrix + Nike). Rendered live on the creative.
              </p>
              {BRANDING_SLOTS.map(slot => {
                const url = (branding[slot.urlKey] as string | undefined) ?? "";
                const visible = (branding[slot.visKey] as boolean | undefined) ?? true;
                return (
                  <div key={slot.urlKey} className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt="" className="max-w-full max-h-full object-contain" />
                      ) : (
                        <span className="text-gray-300 text-[9px]">—</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-semibold text-gray-600 block mb-0.5">{slot.label}</span>
                      <input type="text" value={url} placeholder="https://…"
                        onChange={e => setBrandField(slot.urlKey, e.target.value)}
                        className={INP + " text-xs py-1.5"} />
                    </div>
                    <button onClick={() => setBrandField(slot.visKey, !visible)}
                      className="flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-md border"
                      style={visible ? { borderColor: GOLD, color: NAVY, background: GOLD_TINT } : { borderColor: "#E5E7EB", color: "#9CA3AF" }}>
                      {visible ? "Shown" : "Hidden"}
                    </button>
                  </div>
                );
              })}
            </Section>

            {layout === "timer" && (
              <>
                <Section title="Colours">
                  <ColorField label="Background"    hint="Main MPU background"          value={state.background}   onChange={v => set("background", v)} />
                  <ColorField label="Quadrant base" hint="Default answer button colour"  value={state.quadrantBase} onChange={v => set("quadrantBase", v)} />
                  <ColorField label="Border"        hint="Outer border and timer ring"   value={state.border}       onChange={v => set("border", v)} />
                  <GlowField hex={state.glowHex} alpha={state.glowAlpha} onChange={(h, a) => setState(s => ({ ...s, glowHex: h, glowAlpha: a }))} />
                  <ColorField label="Text"          hint="Answer text colour"            value={state.text}         onChange={v => set("text", v)} />
                  <ColorField label="Selected text" hint="Text on selected answer"       value={state.selectedText} onChange={v => set("selectedText", v)} />
                  <ColorField label="Timer"         hint="Timer ring and progress ring"  value={state.timer}        onChange={v => set("timer", v)} />
                  <ColorField label="Header text"   hint="Text inside the header bar"    value={state.headerText}   onChange={v => set("headerText", v)} />
                </Section>

                <Section title="Gradients">
                  <ColorField label="Colour 1" hint="Start colour" value={state.gradientColor1} onChange={v => set("gradientColor1", v)} />
                  <ColorField label="Colour 2" hint="End colour"   value={state.gradientColor2} onChange={v => set("gradientColor2", v)} />
                  <Toggle label="Use third colour" value={state.useThirdColor} onChange={v => set("useThirdColor", v)} />
                  {state.useThirdColor && (
                    <ColorField label="Colour 3" hint="Mid stop" value={state.gradientColor3} onChange={v => set("gradientColor3", v)} />
                  )}
                  <div>
                    <span className="text-[11px] text-gray-400 block mb-1">Header gradient preview</span>
                    <div className="h-6 rounded-md border border-gray-200" style={{ background: gradientPreview }} />
                  </div>
                </Section>

                <Section title="Layout">
                  <div>
                    <span className="text-xs font-semibold text-gray-700 block mb-1.5">Direction</span>
                    <div className="flex flex-wrap gap-1.5">
                      {DIRECTIONS.map(d => (
                        <button key={d.value} onClick={() => set("gradientDirection", d.value)}
                          className="px-3 py-1 rounded-full text-xs font-medium"
                          style={state.gradientDirection === d.value ? { background: GOLD, color: NAVY } : { background: "#F3F4F6", color: "#4B5563" }}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Toggle label="Mirror top quadrant gradient" value={state.mirrorTopQuadrants} onChange={v => set("mirrorTopQuadrants", v)} />
                </Section>
              </>
            )}

            <Section title="Advanced" defaultOpen={false}>
              <div className="text-xs text-gray-500 space-y-1">
                <p><span className="font-semibold text-gray-600">Slug:</span> <span className="font-mono">{design.slug}</span></p>
                <p><span className="font-semibold text-gray-600">Created:</span> {new Date(design.created_at).toLocaleString()}</p>
                <p><span className="font-semibold text-gray-600">Updated:</span> {new Date(design.updated_at).toLocaleString()}</p>
                {design.is_system && <p className="text-gray-400 italic">Protected system design — edits fork a new variant.</p>}
              </div>
            </Section>

            {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}

            <div className="flex items-center gap-2 pt-2">
              <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: GOLD, color: NAVY }}>
                {saving ? "Saving…" : design.is_system ? "Save as New Variant" : "Save changes"}
              </button>
              <button onClick={duplicateNow} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                Duplicate
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 rounded-lg px-4 py-2.5 text-sm font-semibold shadow-lg z-50"
          style={{ background: NAVY, color: GOLD }}>
          {toast}
        </div>
      )}
    </AdminShell>
  );
}
