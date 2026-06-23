// ─────────────────────────────────────────────────────────────────────────────
// Quadrant Mode V2 — Theme system
// Prototype-only. Lives entirely under /creative-lab/quadrant-mode-v2.
// ─────────────────────────────────────────────────────────────────────────────

export interface Theme {
  id: string;
  name: string;

  // Creative canvas
  canvas: string;       // MPU background
  quad: string;         // default quadrant background
  gridLine: string;     // 1px gap between quadrants

  // Outer border (applied to Variant A; Variant B inherits canvas)
  outerBorder: string;
  outerShadow: string;

  // Text
  text: string;         // primary text on quadrants / circles

  // Single accent colour (rings, lines, badge text)
  accent: string;

  // Quadrant states
  selectedBg: string;   // full CSS value — solid or linear-gradient()
  selectedText: string; // text colour when quadrant is selected
  hoverBg: string;      // hovered quadrant background
  hoverGlow: string;    // inset box-shadow value for hover
  dimOpacity: number;   // opacity of non-selected quadrants

  // Centre circle
  circle: string;        // circle background
  circleBorder: string;  // circle border

  // Pulse glow (answer-selection + expired-timer pulse)
  pulseGlow: string;     // full box-shadow value e.g. "0 0 0 7px rgba(...)"

  // Timer (Variant B)
  timerRing: string;          // countdown arc colour
  timerText: string;          // countdown number colour
  timerExpiredAccent: string; // "TIME'S UP" colour

  // Progress arc (completed questions, thin outer ring)
  progressRing: string;

  // Variant A — progress badge
  badge: {
    bg: string;
    border: string;
    text: string;
    line: string; // colour for extending horizontal lines
  };

  // Variant B — header bar
  header: {
    bg: string;    // full CSS value — can be gradient
    text: string;  // question text colour
    meta: string;  // "1 OF 3" secondary colour
  };

  // Privacy trigger link
  privacyLink: string;

  // Privacy overlay
  overlay: {
    bg: string;
    text: string;      // body text
    title: string;     // "Privacy" heading
    accent: string;    // bullets, CTA, close button
    border: string;    // separator lines
    closeBg: string;
    closeText: string;
    tagBg: string;     // metadata tag background
    tagText: string;   // metadata tag text
  };

  // Thank you screen
  thankYou: {
    bg: string;
    check: string;
    checkBg: string;
    heading: string;
    body: string;
    tagline: string;
  };

  // Swatch preview colours for the comparison panel
  swatches: {
    bg: string;
    accent: string;
    selected: string; // CSS value — can be gradient
    extra: string;
  };
}

// ── Hex → rgba helper (used to pre-compute shadow/glow strings) ───────────────

function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// THEME DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

const fanometrix: Theme = {
  id: "fanometrix",
  name: "Fanometrix Premium",
  canvas: "#0B1929",
  quad: "#0B1929",
  gridLine: rgba("#D7B87A", 0.12),
  outerBorder: rgba("#D7B87A", 0.5),
  outerShadow: "0 8px 30px rgba(0,0,0,0.35)",
  text: "#ffffff",
  accent: "#D7B87A",
  selectedBg: "#D7B87A",
  selectedText: "#0B1929",
  hoverBg: "rgba(18,38,62,1)",
  hoverGlow: `inset 0 0 30px ${rgba("#D7B87A", 0.08)}`,
  dimOpacity: 0.6,
  circle: "#0B1929",
  circleBorder: rgba("#D7B87A", 0.4),
  pulseGlow: `0 0 0 5px ${rgba("#D7B87A", 0.11)}, 0 0 18px ${rgba("#D7B87A", 0.06)}`,
  timerRing: "#D7B87A",
  timerText: "#ffffff",
  timerExpiredAccent: "#D7B87A",
  progressRing: "#D7B87A",
  badge: {
    bg: "#0B1929",
    border: "#D7B87A",
    text: "#D7B87A",
    line: rgba("#D7B87A", 0.45),
  },
  header: {
    bg: "#D7B87A",
    text: "#0B1929",
    meta: rgba("#0B1929", 0.55),
  },
  privacyLink: rgba("#D7B87A", 0.5),
  overlay: {
    bg: "#0B1929",
    text: rgba("#ffffff", 0.68),
    title: "#D7B87A",
    accent: "#D7B87A",
    border: rgba("#D7B87A", 0.15),
    closeBg: rgba("#D7B87A", 0.08),
    closeText: "#D7B87A",
    tagBg: rgba("#D7B87A", 0.06),
    tagText: rgba("#ffffff", 0.4),
  },
  thankYou: {
    bg: "#0B1929",
    check: "#D7B87A",
    checkBg: rgba("#D7B87A", 0.12),
    heading: "#ffffff",
    body: rgba("#ffffff", 0.65),
    tagline: "#D7B87A",
  },
  swatches: {
    bg: "#0B1929",
    accent: "#D7B87A",
    selected: "#D7B87A",
    extra: rgba("#D7B87A", 0.4),
  },
};

const electric: Theme = {
  id: "electric",
  name: "Electric Football",
  canvas: "#061A2F",
  quad: "#0B1929",
  gridLine: rgba("#00E5A8", 0.15),
  outerBorder: rgba("#00E5A8", 0.5),
  outerShadow: `0 8px 30px ${rgba("#00F5A0", 0.15)}`,
  text: "#ffffff",
  accent: "#00E5A8",
  selectedBg: "linear-gradient(135deg, #00F5A0, #007CF0)",
  selectedText: "#061A2F",
  hoverBg: rgba("#00F5A0", 0.08),
  hoverGlow: `inset 0 0 30px ${rgba("#00E5A8", 0.12)}`,
  dimOpacity: 0.55,
  circle: "#0B1929",
  circleBorder: rgba("#00E5A8", 0.4),
  pulseGlow: `0 0 0 5px ${rgba("#00E5A8", 0.14)}, 0 0 18px ${rgba("#00E5A8", 0.07)}`,
  timerRing: "#00E5A8",
  timerText: "#ffffff",
  timerExpiredAccent: "#00E5A8",
  progressRing: "#00E5A8",
  badge: {
    bg: "#0B1929",
    border: "#00E5A8",
    text: "#00E5A8",
    line: rgba("#00E5A8", 0.45),
  },
  header: {
    bg: "linear-gradient(135deg, #00F5A0, #00C2FF)",
    text: "#061A2F",
    meta: rgba("#061A2F", 0.55),
  },
  privacyLink: rgba("#00E5A8", 0.55),
  overlay: {
    bg: "#061A2F",
    text: rgba("#ffffff", 0.68),
    title: "#00E5A8",
    accent: "#00E5A8",
    border: rgba("#00E5A8", 0.15),
    closeBg: rgba("#00E5A8", 0.1),
    closeText: "#00E5A8",
    tagBg: rgba("#00E5A8", 0.06),
    tagText: rgba("#ffffff", 0.4),
  },
  thankYou: {
    bg: "#061A2F",
    check: "#00E5A8",
    checkBg: rgba("#00E5A8", 0.12),
    heading: "#ffffff",
    body: rgba("#ffffff", 0.65),
    tagline: "#00E5A8",
  },
  swatches: {
    bg: "#061A2F",
    accent: "#00E5A8",
    selected: "linear-gradient(135deg, #00F5A0, #007CF0)",
    extra: "#00C2FF",
  },
};

const fanEnergy: Theme = {
  id: "fan-energy",
  name: "Fan Energy",
  canvas: "#10091F",
  quad: "#160D2E",
  gridLine: rgba("#FF4D8D", 0.15),
  outerBorder: rgba("#FF4D8D", 0.5),
  outerShadow: `0 8px 30px ${rgba("#9B5CFF", 0.2)}`,
  text: "#ffffff",
  accent: "#FF4D8D",
  selectedBg: "linear-gradient(135deg, #FF5F6D, #FFC371)",
  selectedText: "#10091F",
  hoverBg: rgba("#FF4D8D", 0.08),
  hoverGlow: `inset 0 0 30px ${rgba("#9B5CFF", 0.12)}`,
  dimOpacity: 0.55,
  circle: "#160D2E",
  circleBorder: rgba("#FF4D8D", 0.4),
  pulseGlow: `0 0 0 5px ${rgba("#FF4D8D", 0.14)}, 0 0 18px ${rgba("#FF4D8D", 0.07)}`,
  timerRing: "#FF4D8D",
  timerText: "#ffffff",
  timerExpiredAccent: "#FF4D8D",
  progressRing: "#FF4D8D",
  badge: {
    bg: "#160D2E",
    border: "#FF4D8D",
    text: "#FF4D8D",
    line: rgba("#FF4D8D", 0.45),
  },
  header: {
    bg: "linear-gradient(135deg, #FF4D8D, #9B5CFF)",
    text: "#ffffff",
    meta: rgba("#ffffff", 0.65),
  },
  privacyLink: rgba("#FF4D8D", 0.55),
  overlay: {
    bg: "#10091F",
    text: rgba("#ffffff", 0.68),
    title: "#FF4D8D",
    accent: "#FF4D8D",
    border: rgba("#FF4D8D", 0.15),
    closeBg: rgba("#FF4D8D", 0.1),
    closeText: "#FF4D8D",
    tagBg: rgba("#FF4D8D", 0.06),
    tagText: rgba("#ffffff", 0.4),
  },
  thankYou: {
    bg: "#10091F",
    check: "#FF4D8D",
    checkBg: rgba("#FF4D8D", 0.12),
    heading: "#ffffff",
    body: rgba("#ffffff", 0.65),
    tagline: "#FF4D8D",
  },
  swatches: {
    bg: "#10091F",
    accent: "#FF4D8D",
    selected: "linear-gradient(135deg, #FF5F6D, #FFC371)",
    extra: "#9B5CFF",
  },
};

const stadiumLights: Theme = {
  id: "stadium",
  name: "Stadium Lights",
  canvas: "#071726",
  quad: "#081B33",
  gridLine: rgba("#00E5FF", 0.12),
  outerBorder: rgba("#00E5FF", 0.5),
  outerShadow: `0 8px 30px ${rgba("#0085FF", 0.2)}`,
  text: "#ffffff",
  accent: "#00E5FF",
  selectedBg: "linear-gradient(135deg, #FFB347, #FFCC33)",
  selectedText: "#071726",
  hoverBg: rgba("#00E5FF", 0.07),
  hoverGlow: `inset 0 0 30px ${rgba("#0085FF", 0.12)}`,
  dimOpacity: 0.55,
  circle: "#081B33",
  circleBorder: rgba("#00E5FF", 0.4),
  pulseGlow: `0 0 0 5px ${rgba("#00E5FF", 0.14)}, 0 0 18px ${rgba("#00E5FF", 0.07)}`,
  timerRing: "#00E5FF",
  timerText: "#ffffff",
  timerExpiredAccent: "#00E5FF",
  progressRing: "#00E5FF",
  badge: {
    bg: "#081B33",
    border: "#00E5FF",
    text: "#00E5FF",
    line: rgba("#00E5FF", 0.45),
  },
  header: {
    bg: "linear-gradient(135deg, #00E5FF, #0085FF)",
    text: "#071726",
    meta: rgba("#071726", 0.55),
  },
  privacyLink: rgba("#00E5FF", 0.5),
  overlay: {
    bg: "#071726",
    text: rgba("#ffffff", 0.68),
    title: "#00E5FF",
    accent: "#00E5FF",
    border: rgba("#00E5FF", 0.15),
    closeBg: rgba("#00E5FF", 0.08),
    closeText: "#00E5FF",
    tagBg: rgba("#00E5FF", 0.05),
    tagText: rgba("#ffffff", 0.4),
  },
  thankYou: {
    bg: "#071726",
    check: "#00E5FF",
    checkBg: rgba("#00E5FF", 0.12),
    heading: "#ffffff",
    body: rgba("#ffffff", 0.65),
    tagline: "#00E5FF",
  },
  swatches: {
    bg: "#071726",
    accent: "#00E5FF",
    selected: "linear-gradient(135deg, #FFB347, #FFCC33)",
    extra: "#0085FF",
  },
};

const ultimateTeam: Theme = {
  id: "ultimate",
  name: "Ultimate Team",
  canvas: "#040B14",
  quad: "#0B1020",
  gridLine: rgba("#12C2E9", 0.12),
  outerBorder: rgba("#12C2E9", 0.5),
  outerShadow: `0 8px 30px ${rgba("#6A11CB", 0.3)}`,
  text: "#ffffff",
  accent: "#12C2E9",
  selectedBg: "linear-gradient(135deg, #12C2E9, #C471ED, #F64F59)",
  selectedText: "#040B14",
  hoverBg: rgba("#6A11CB", 0.12),
  hoverGlow: `inset 0 0 30px ${rgba("#12C2E9", 0.1)}`,
  dimOpacity: 0.55,
  circle: "#0B1020",
  circleBorder: rgba("#12C2E9", 0.4),
  pulseGlow: `0 0 0 5px ${rgba("#12C2E9", 0.14)}, 0 0 18px ${rgba("#12C2E9", 0.07)}`,
  timerRing: "#12C2E9",
  timerText: "#ffffff",
  timerExpiredAccent: "#12C2E9",
  progressRing: "#12C2E9",
  badge: {
    bg: "#0B1020",
    border: "#12C2E9",
    text: "#12C2E9",
    line: rgba("#12C2E9", 0.4),
  },
  header: {
    bg: "linear-gradient(135deg, #6A11CB, #2575FC)",
    text: "#ffffff",
    meta: rgba("#ffffff", 0.65),
  },
  privacyLink: rgba("#12C2E9", 0.5),
  overlay: {
    bg: "#040B14",
    text: rgba("#ffffff", 0.68),
    title: "#12C2E9",
    accent: "#12C2E9",
    border: rgba("#12C2E9", 0.15),
    closeBg: rgba("#12C2E9", 0.08),
    closeText: "#12C2E9",
    tagBg: rgba("#12C2E9", 0.05),
    tagText: rgba("#ffffff", 0.4),
  },
  thankYou: {
    bg: "#040B14",
    check: "#12C2E9",
    checkBg: rgba("#12C2E9", 0.12),
    heading: "#ffffff",
    body: rgba("#ffffff", 0.65),
    tagline: "#12C2E9",
  },
  swatches: {
    bg: "#040B14",
    accent: "#12C2E9",
    selected: "linear-gradient(135deg, #12C2E9, #C471ED)",
    extra: "#6A11CB",
  },
};

const cleanResearch: Theme = {
  id: "clean",
  name: "Clean Research",
  canvas: "#ffffff",
  quad: "#F7F8FA",
  gridLine: "rgba(229,231,235,0.9)",
  outerBorder: "rgba(229,231,235,0.9)",
  outerShadow: "0 8px 30px rgba(0,0,0,0.1)",
  text: "#0B1929",
  accent: "#FF9F1C",
  selectedBg: "linear-gradient(135deg, #FF7A00, #FFC300)",
  selectedText: "#0B1929",
  hoverBg: rgba("#FF9F1C", 0.07),
  hoverGlow: `inset 0 0 30px ${rgba("#FF9F1C", 0.08)}`,
  dimOpacity: 0.5,
  circle: "#ffffff",
  circleBorder: "rgba(229,231,235,0.9)",
  pulseGlow: `0 0 0 5px ${rgba("#FF9F1C", 0.11)}, 0 0 18px ${rgba("#FF9F1C", 0.05)}`,
  timerRing: "#FF9F1C",
  timerText: "#0B1929",
  timerExpiredAccent: "#FF9F1C",
  progressRing: "#FF9F1C",
  badge: {
    bg: "#F7F8FA",
    border: "#FF9F1C",
    text: "#FF9F1C",
    line: rgba("#FF9F1C", 0.45),
  },
  header: {
    bg: "linear-gradient(135deg, #FF7A00, #FFC300)",
    text: "#0B1929",
    meta: rgba("#0B1929", 0.55),
  },
  privacyLink: rgba("#FF9F1C", 0.65),
  overlay: {
    bg: "#F7F8FA",
    text: "#374151",
    title: "#0B1929",
    accent: "#FF9F1C",
    border: "#E5E7EB",
    closeBg: rgba("#FF9F1C", 0.1),
    closeText: "#FF7A00",
    tagBg: rgba("#FF9F1C", 0.08),
    tagText: "#6B7280",
  },
  thankYou: {
    bg: "#F7F8FA",
    check: "#FF9F1C",
    checkBg: rgba("#FF9F1C", 0.12),
    heading: "#0B1929",
    body: "#6B7280",
    tagline: "#FF9F1C",
  },
  swatches: {
    bg: "#F7F8FA",
    accent: "#FF9F1C",
    selected: "linear-gradient(135deg, #FF7A00, #FFC300)",
    extra: "#FF7A00",
  },
};

export const THEMES: Theme[] = [
  fanometrix,
  electric,
  fanEnergy,
  stadiumLights,
  ultimateTeam,
  cleanResearch,
];

export const DEFAULT_THEME = fanometrix;
