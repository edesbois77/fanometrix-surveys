/**
 * Derives a full ThemedSurvey render palette (EmbedTheme) from the simple
 * colour/gradient inputs an admin fills in via the Creative Gallery's design
 * builder (app/creative-lab/theme-gallery). Ported from the prototype-only
 * app/creative-lab/theme-gallery/customThemeUtils.ts's buildThemeFromState,
 * trimmed to exactly the fields ThemedSurvey.tsx's EmbedTheme needs (drops
 * gallery-only extras: feeling, badge, overlay, thankYou, analytics,
 * dimOpacity, timerText, id, name).
 *
 * Used by:
 *  - the embed API routes, to resolve a dynamically-authored creative_design
 *    (one not in lib/creative-designs.ts's static catalog) into render tokens
 *  - the Creative Gallery authoring UI, for its live preview
 */

import type { EmbedTheme } from "@/app/embed/ThemedSurvey";

export type GradientDirection = "180deg" | "0deg" | "90deg" | "135deg";

export interface BuilderState {
  mode: "gradient" | "solid";
  name: string;

  // Gradient mode
  gradientColor1: string;
  gradientColor2: string;
  gradientColor3: string;
  useThirdColor: boolean;
  gradientDirection: GradientDirection;
  mirrorTopQuadrants: boolean;

  // Shared colours
  background: string;
  quadrantBase: string;
  border: string;
  glowHex: string;
  glowAlpha: number;
  text: string;
  selectedText: string;
  timer: string;
  headerText: string;

  // Solid mode only
  headerColor: string;
  selectedColor: string;
}

export const DEFAULT_GRADIENT_STATE: BuilderState = {
  mode: "gradient",
  name: "My Custom Theme",
  gradientColor1: "#00F5A0",
  gradientColor2: "#00C2FF",
  gradientColor3: "#7C3AED",
  useThirdColor: false,
  gradientDirection: "180deg",
  mirrorTopQuadrants: true,
  background: "#061A2F",
  quadrantBase: "#082038",
  border: "#00F5A0",
  glowHex: "#00F5A0",
  glowAlpha: 0.35,
  text: "#FFFFFF",
  selectedText: "#061A2F",
  timer: "#00F5A0",
  headerText: "#061A2F",
  headerColor: "#D7B87A",
  selectedColor: "#D7B87A",
};

export const DEFAULT_SOLID_STATE: BuilderState = {
  mode: "solid",
  name: "My Solid Theme",
  gradientColor1: "#D7B87A",
  gradientColor2: "#A8864A",
  gradientColor3: "#7C3AED",
  useThirdColor: false,
  gradientDirection: "180deg",
  mirrorTopQuadrants: false,
  background: "#041B33",
  quadrantBase: "#0B1929",
  border: "#D7B87A",
  glowHex: "#D7B87A",
  glowAlpha: 0.25,
  text: "#FFFFFF",
  selectedText: "#041B33",
  timer: "#D7B87A",
  headerText: "#041B33",
  headerColor: "#D7B87A",
  selectedColor: "#D7B87A",
};

export function hexToRgba(hex: string, alpha: number): string {
  let clean = hex.replace("#", "");
  if (clean.length === 3) clean = clean.split("").map(c => c + c).join("");
  if (clean.length !== 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(0,0,0,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildGradientCss(colors: string[], direction: string): string {
  if (colors.length === 2) {
    return `linear-gradient(${direction}, ${colors[0]} 0%, ${colors[1]} 100%)`;
  }
  return `linear-gradient(${direction}, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`;
}

/** Simple logo-URL branding fields stored on a creative_designs row — see
 * supabase-migration-050.sql. No upload infrastructure; just hosted URLs. */
export interface BrandingConfig {
  fanometrix_logo_url?: string | null;
  fanometrix_logo_visible?: boolean;
  publisher_logo_url?: string | null;
  publisher_logo_visible?: boolean;
  brand_logo_url?: string | null;
  brand_logo_visible?: boolean;
  sponsor_logo_url?: string | null;
  sponsor_logo_visible?: boolean;
}

/** Resolves stored branding config into the ordered list of logo URLs that
 * should actually render — a slot with no URL, or explicitly hidden, is
 * skipped. Visible defaults to true once a URL is set. */
export function resolveBrandingLogos(branding: BrandingConfig | null | undefined): string[] {
  if (!branding) return [];
  const slots: Array<[string | null | undefined, boolean | undefined]> = [
    [branding.fanometrix_logo_url, branding.fanometrix_logo_visible],
    [branding.publisher_logo_url, branding.publisher_logo_visible],
    [branding.brand_logo_url, branding.brand_logo_visible],
    [branding.sponsor_logo_url, branding.sponsor_logo_visible],
  ];
  return slots
    .filter(([url, visible]) => !!url && visible !== false)
    .map(([url]) => url as string);
}

export function buildEmbedThemeFromState(s: BuilderState): EmbedTheme {
  const glow = hexToRgba(s.glowHex, s.glowAlpha);

  let accent: string, gradient: string, reversedGradient: string, selectedBg: string, hoverBg: string, hoverGlow: string, headerBg: string;

  if (s.mode === "gradient") {
    const colors = s.useThirdColor
      ? [s.gradientColor1, s.gradientColor2, s.gradientColor3]
      : [s.gradientColor1, s.gradientColor2];

    const gradientCss = buildGradientCss(colors, s.gradientDirection);
    const reversedCss = s.mirrorTopQuadrants
      ? buildGradientCss([...colors].reverse(), s.gradientDirection)
      : gradientCss;

    accent = s.gradientColor1;
    gradient = gradientCss;
    reversedGradient = reversedCss;
    selectedBg = gradientCss;
    hoverBg = hexToRgba(accent, 0.07);
    hoverGlow = `inset 0 0 28px ${hexToRgba(accent, 0.1)}`;
    headerBg = gradientCss;
  } else {
    accent = s.selectedColor;
    gradient = s.selectedColor;
    reversedGradient = s.selectedColor;
    selectedBg = s.selectedColor;
    hoverBg = hexToRgba(s.selectedColor, 0.08);
    hoverGlow = `inset 0 0 28px ${hexToRgba(s.glowHex, 0.1)}`;
    headerBg = s.headerColor;
  }

  const bdrHalf   = hexToRgba(s.border, 0.45);
  const bdrFaint  = hexToRgba(s.border, 0.35);
  const bdrLine   = hexToRgba(s.border, 0.12);
  const timerSoft = hexToRgba(s.timer, 0.14);
  const timerFaint = hexToRgba(s.timer, 0.07);

  return {
    canvas: s.background,
    quad: s.quadrantBase,
    gridLine: bdrLine,
    outerBorder: bdrHalf,
    outerShadow: `0 8px 32px ${glow}`,
    text: s.text,
    accent,
    gradient,
    reversedGradient,
    selectedBg,
    selectedText: s.selectedText,
    hoverBg,
    hoverGlow,
    circle: s.background,
    circleBorder: bdrFaint,
    pulseGlow: `0 0 0 5px ${timerSoft}, 0 0 18px ${timerFaint}`,
    timerRing: s.timer,
    progressRing: s.timer,
    header: { bg: headerBg, text: s.headerText, meta: hexToRgba(s.headerText, 0.6) },
  };
}
