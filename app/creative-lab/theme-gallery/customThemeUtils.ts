// Prototype only — /creative-lab/theme-gallery
// No production dependencies.

import type { Theme } from "./themes";

// ── Types ─────────────────────────────────────────────────────────────────────

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

export interface SavedTheme {
  id: string;
  state: BuilderState;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

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

// ── Colour helpers ────────────────────────────────────────────────────────────

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

export function parseRgba(rgba: string): { hex: string; alpha: number } {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return { hex: "#000000", alpha: 0.35 };
  const r = parseInt(m[1]);
  const g = parseInt(m[2]);
  const b = parseInt(m[3]);
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  const hex = "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
  return { hex, alpha: a };
}

export function buildGradientCss(colors: string[], direction: string): string {
  if (colors.length === 2) {
    return `linear-gradient(${direction}, ${colors[0]} 0%, ${colors[1]} 100%)`;
  }
  return `linear-gradient(${direction}, ${colors[0]} 0%, ${colors[1]} 50%, ${colors[2]} 100%)`;
}

// ── Theme builder ─────────────────────────────────────────────────────────────

export function buildThemeFromState(s: BuilderState): Theme {
  const glow     = hexToRgba(s.glowHex, s.glowAlpha);
  const glowSoft = hexToRgba(s.glowHex, s.glowAlpha * 0.4);

  if (s.mode === "gradient") {
    const colors = s.useThirdColor
      ? [s.gradientColor1, s.gradientColor2, s.gradientColor3]
      : [s.gradientColor1, s.gradientColor2];

    const gradientCss  = buildGradientCss(colors, s.gradientDirection);
    const reversedCss  = s.mirrorTopQuadrants
      ? buildGradientCss([...colors].reverse(), s.gradientDirection)
      : gradientCss;
    const accent = s.gradientColor1;

    return mkTheme(s, {
      accent,
      gradient: gradientCss,
      reversedGradient: reversedCss,
      selectedBg: gradientCss,
      hoverBg: hexToRgba(accent, 0.07),
      hoverGlow: `inset 0 0 28px ${hexToRgba(accent, 0.1)}`,
      headerBg: gradientCss,
      glow,
      glowSoft,
    });
  } else {
    const accent = s.selectedColor;
    return mkTheme(s, {
      accent,
      gradient: s.selectedColor,
      reversedGradient: s.selectedColor,
      selectedBg: s.selectedColor,
      hoverBg: hexToRgba(s.selectedColor, 0.08),
      hoverGlow: `inset 0 0 28px ${hexToRgba(s.glowHex, 0.1)}`,
      headerBg: s.headerColor,
      glow,
      glowSoft,
    });
  }
}

function mkTheme(s: BuilderState, d: {
  accent: string; gradient: string; reversedGradient: string;
  selectedBg: string; hoverBg: string; hoverGlow: string;
  headerBg: string; glow: string; glowSoft: string;
}): Theme {
  const bdrHalf = hexToRgba(s.border, 0.45);
  const bdrFaint = hexToRgba(s.border, 0.35);
  const bdrLine  = hexToRgba(s.border, 0.12);
  const timerSoft = hexToRgba(s.timer, 0.14);
  const timerFaint = hexToRgba(s.timer, 0.07);

  return {
    id: "custom-preview",
    name: s.name || "Custom Theme",
    feeling: "Custom",
    canvas: s.background,
    quad: s.quadrantBase,
    gridLine: bdrLine,
    outerBorder: bdrHalf,
    outerShadow: `0 8px 32px ${d.glow}`,
    text: s.text,
    accent: d.accent,
    gradient: d.gradient,
    reversedGradient: d.reversedGradient,
    selectedBg: d.selectedBg,
    selectedText: s.selectedText,
    hoverBg: d.hoverBg,
    hoverGlow: d.hoverGlow,
    dimOpacity: 0.6,
    circle: s.background,
    circleBorder: bdrFaint,
    pulseGlow: `0 0 0 5px ${timerSoft}, 0 0 18px ${timerFaint}`,
    timerRing: s.timer,
    timerText: s.text,
    progressRing: s.timer,
    badge: { bg: s.background, border: bdrHalf, text: d.accent },
    header: {
      bg: d.headerBg,
      text: s.headerText,
      meta: hexToRgba(s.headerText, 0.6),
    },
    overlay: {
      bg: s.background,
      text: "rgba(255,255,255,0.7)",
      title: d.accent,
      accent: d.accent,
      border: hexToRgba(s.border, 0.15),
      closeBg: hexToRgba(d.accent, 0.08),
      closeText: d.accent,
      tagBg: hexToRgba(d.accent, 0.06),
      tagText: "rgba(255,255,255,0.4)",
    },
    thankYou: {
      bg: s.background,
      check: d.accent,
      checkBg: hexToRgba(d.accent, 0.12),
      heading: s.text,
      body: "rgba(255,255,255,0.65)",
      tagline: d.accent,
    },
    analytics: {
      prominenceScore: 8, interactionPotential: 8, readabilityScore: 8,
      mobileFriendliness: 8, accessibilityScore: 8,
      recommendedUseCase: "Custom Theme",
    },
  };
}

// ── JSON serialisation ────────────────────────────────────────────────────────

export function stateToJson(s: BuilderState): object {
  const glow = hexToRgba(s.glowHex, s.glowAlpha);
  if (s.mode === "gradient") {
    return {
      name: s.name,
      mode: "gradient",
      gradient: {
        colors: s.useThirdColor
          ? [s.gradientColor1, s.gradientColor2, s.gradientColor3]
          : [s.gradientColor1, s.gradientColor2],
        direction: s.gradientDirection,
        mirrorTopQuadrants: s.mirrorTopQuadrants,
      },
      colors: {
        background: s.background,
        quadrantBase: s.quadrantBase,
        border: s.border,
        glow,
        text: s.text,
        selectedText: s.selectedText,
        timer: s.timer,
        headerText: s.headerText,
      },
    };
  } else {
    return {
      name: s.name,
      mode: "solid",
      colors: {
        header: s.headerColor,
        background: s.background,
        quadrantBase: s.quadrantBase,
        selected: s.selectedColor,
        border: s.border,
        glow,
        text: s.text,
        selectedText: s.selectedText,
        timer: s.timer,
        headerText: s.headerText,
      },
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function jsonToState(raw: unknown, fallback: BuilderState): BuilderState {
  try {
    const j = raw as Record<string, unknown>;
    if (j.mode === "gradient") {
      const grad = j.gradient as Record<string, unknown>;
      const cols = j.colors as Record<string, string>;
      const glowParsed = parseRgba(cols.glow ?? "rgba(0,0,0,0.35)");
      const gradColors = (grad.colors as string[]) ?? [];
      return {
        ...DEFAULT_GRADIENT_STATE,
        name: (j.name as string) ?? "Imported",
        mode: "gradient",
        gradientColor1: gradColors[0] ?? "#00F5A0",
        gradientColor2: gradColors[1] ?? "#00C2FF",
        gradientColor3: gradColors[2] ?? "#7C3AED",
        useThirdColor: gradColors.length >= 3,
        gradientDirection: (grad.direction as GradientDirection) ?? "180deg",
        mirrorTopQuadrants: (grad.mirrorTopQuadrants as boolean) ?? true,
        background: cols.background ?? "#061A2F",
        quadrantBase: cols.quadrantBase ?? "#082038",
        border: cols.border ?? "#00F5A0",
        glowHex: glowParsed.hex,
        glowAlpha: glowParsed.alpha,
        text: cols.text ?? "#FFFFFF",
        selectedText: cols.selectedText ?? "#061A2F",
        timer: cols.timer ?? "#00F5A0",
        headerText: cols.headerText ?? "#061A2F",
      };
    } else if (j.mode === "solid") {
      const cols = j.colors as Record<string, string>;
      const glowParsed = parseRgba(cols.glow ?? "rgba(0,0,0,0.25)");
      return {
        ...DEFAULT_SOLID_STATE,
        name: (j.name as string) ?? "Imported",
        mode: "solid",
        headerColor: cols.header ?? "#D7B87A",
        background: cols.background ?? "#041B33",
        quadrantBase: cols.quadrantBase ?? "#0B1929",
        selectedColor: cols.selected ?? "#D7B87A",
        border: cols.border ?? "#D7B87A",
        glowHex: glowParsed.hex,
        glowAlpha: glowParsed.alpha,
        text: cols.text ?? "#FFFFFF",
        selectedText: cols.selectedText ?? "#041B33",
        timer: cols.timer ?? "#D7B87A",
        headerText: cols.headerText ?? "#041B33",
      };
    }
  } catch { /* fall through */ }
  return fallback;
}

// ── localStorage ──────────────────────────────────────────────────────────────

export const STORAGE_KEY = "tg_custom_themes_v1";

export function loadSaved(): SavedTheme[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedTheme[]) : [];
  } catch { return []; }
}

export function persistSaved(themes: SavedTheme[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(themes)); } catch { /* full */ }
}
