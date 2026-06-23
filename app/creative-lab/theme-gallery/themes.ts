// Prototype only — /creative-lab/theme-gallery
// No production dependencies. Fully removable by deleting /creative-lab/.

export type SurveyQuestion = {
  text: string;
  answers: [string, string, string, string];
};

export interface ThemeAnalytics {
  prominenceScore: number;
  interactionPotential: number;
  readabilityScore: number;
  mobileFriendliness: number;
  accessibilityScore: number;
  recommendedUseCase: string;
}

export interface Theme {
  id: string;
  name: string;
  feeling: string;

  canvas: string;        // deep background
  quad: string;          // quadrant base colour
  gridLine: string;      // 1px gap between quads

  outerBorder: string;
  outerShadow: string;

  text: string;
  accent: string;        // primary accent (border, timer ring, badge text)

  // Two-colour gradient — smooth, no hard transitions
  gradient: string;
  // Reversed version: used on top quadrants in Variant B so colours
  // meet seamlessly at the header / quadrant boundary
  reversedGradient: string;

  selectedBg: string;    // flood colour when quadrant is chosen
  selectedText: string;  // text on selected quadrant
  hoverBg: string;
  hoverGlow: string;
  dimOpacity: number;    // opacity of non-selected quadrants (spec: 60% → 0.6)

  circle: string;
  circleBorder: string;
  pulseGlow: string;

  timerRing: string;
  timerText: string;
  progressRing: string;

  badge: { bg: string; border: string; text: string };
  header: { bg: string; text: string; meta: string };

  overlay: {
    bg: string; text: string; title: string; accent: string;
    border: string; closeBg: string; closeText: string;
    tagBg: string; tagText: string;
  };

  thankYou: {
    bg: string; check: string; checkBg: string;
    heading: string; body: string; tagline: string;
  };

  analytics: ThemeAnalytics;
}

// ─── 1. Fanometrix Premium ────────────────────────────────────────────────────

const fanometrix: Theme = {
  id: "fanometrix",
  name: "Fanometrix Premium",
  feeling: "Executive · Research · Agency",
  canvas: "#041B33",
  quad: "#0B1929",
  gridLine: "rgba(215,184,122,0.12)",
  outerBorder: "rgba(215,184,122,0.5)",
  outerShadow: "0 8px 32px rgba(0,0,0,0.6)",
  text: "#ffffff",
  accent: "#D7B87A",
  gradient: "linear-gradient(180deg, #D7B87A 0%, #A8864A 100%)",
  reversedGradient: "linear-gradient(180deg, #A8864A 0%, #D7B87A 100%)",
  selectedBg: "linear-gradient(180deg, #D7B87A 0%, #A8864A 100%)",
  selectedText: "#041B33",
  hoverBg: "rgba(215,184,122,0.08)",
  hoverGlow: "inset 0 0 28px rgba(215,184,122,0.1)",
  dimOpacity: 0.6,
  circle: "#041B33",
  circleBorder: "rgba(215,184,122,0.35)",
  pulseGlow: "0 0 0 5px rgba(215,184,122,0.11), 0 0 18px rgba(215,184,122,0.06)",
  timerRing: "#D7B87A",
  timerText: "#ffffff",
  progressRing: "#D7B87A",
  badge: { bg: "#041B33", border: "rgba(215,184,122,0.5)", text: "#D7B87A" },
  header: { bg: "linear-gradient(180deg, #D7B87A 0%, #A8864A 100%)", text: "#041B33", meta: "rgba(4,27,51,0.6)" },
  overlay: {
    bg: "#041B33", text: "rgba(255,255,255,0.7)", title: "#D7B87A", accent: "#D7B87A",
    border: "rgba(215,184,122,0.15)", closeBg: "rgba(215,184,122,0.08)", closeText: "#D7B87A",
    tagBg: "rgba(215,184,122,0.06)", tagText: "rgba(255,255,255,0.4)",
  },
  thankYou: {
    bg: "#041B33", check: "#D7B87A", checkBg: "rgba(215,184,122,0.12)",
    heading: "#ffffff", body: "rgba(255,255,255,0.65)", tagline: "#D7B87A",
  },
  analytics: {
    prominenceScore: 8, interactionPotential: 8, readabilityScore: 9,
    mobileFriendliness: 8, accessibilityScore: 9,
    recommendedUseCase: "Research & Brand Presentations",
  },
};

// ─── 2. Electric Football ─────────────────────────────────────────────────────

const electricFootball: Theme = {
  id: "electric-football",
  name: "Electric Football",
  feeling: "Modern · Energetic · Technology · Gaming",
  canvas: "#061A2F",
  quad: "#082038",
  gridLine: "rgba(0,245,160,0.12)",
  outerBorder: "rgba(0,245,160,0.45)",
  outerShadow: "0 8px 32px rgba(0,245,160,0.15)",
  text: "#ffffff",
  accent: "#00F5A0",
  gradient: "linear-gradient(180deg, #00F5A0 0%, #00C2FF 100%)",
  reversedGradient: "linear-gradient(180deg, #00C2FF 0%, #00F5A0 100%)",
  selectedBg: "linear-gradient(180deg, #00F5A0 0%, #00C2FF 100%)",
  selectedText: "#061A2F",
  hoverBg: "rgba(0,245,160,0.07)",
  hoverGlow: "inset 0 0 28px rgba(0,245,160,0.1)",
  dimOpacity: 0.6,
  circle: "#061A2F",
  circleBorder: "rgba(0,245,160,0.35)",
  pulseGlow: "0 0 0 5px rgba(0,245,160,0.14), 0 0 18px rgba(0,245,160,0.07)",
  timerRing: "#00F5A0",
  timerText: "#ffffff",
  progressRing: "#00F5A0",
  badge: { bg: "#061A2F", border: "rgba(0,245,160,0.45)", text: "#00F5A0" },
  header: { bg: "linear-gradient(180deg, #00F5A0 0%, #00C2FF 100%)", text: "#061A2F", meta: "rgba(6,26,47,0.6)" },
  overlay: {
    bg: "#061A2F", text: "rgba(255,255,255,0.7)", title: "#00F5A0", accent: "#00F5A0",
    border: "rgba(0,245,160,0.15)", closeBg: "rgba(0,245,160,0.08)", closeText: "#00F5A0",
    tagBg: "rgba(0,245,160,0.06)", tagText: "rgba(255,255,255,0.4)",
  },
  thankYou: {
    bg: "#061A2F", check: "#00F5A0", checkBg: "rgba(0,245,160,0.12)",
    heading: "#ffffff", body: "rgba(255,255,255,0.65)", tagline: "#00F5A0",
  },
  analytics: {
    prominenceScore: 9, interactionPotential: 10, readabilityScore: 8,
    mobileFriendliness: 9, accessibilityScore: 8,
    recommendedUseCase: "Gaming & Technology",
  },
};

// ─── 3. Fan Energy ────────────────────────────────────────────────────────────

const fanEnergy: Theme = {
  id: "fan-energy",
  name: "Fan Energy",
  feeling: "Social · Fun · Youthful · Premium",
  canvas: "#170B2E",
  quad: "#21103D",
  gridLine: "rgba(255,79,163,0.12)",
  outerBorder: "rgba(255,79,163,0.45)",
  outerShadow: "0 8px 32px rgba(255,79,163,0.2)",
  text: "#ffffff",
  accent: "#FF4FA3",
  gradient: "linear-gradient(180deg, #FF4FA3 0%, #A855F7 100%)",
  reversedGradient: "linear-gradient(180deg, #A855F7 0%, #FF4FA3 100%)",
  selectedBg: "linear-gradient(180deg, #FF4FA3 0%, #A855F7 100%)",
  selectedText: "#ffffff",
  hoverBg: "rgba(255,79,163,0.07)",
  hoverGlow: "inset 0 0 28px rgba(255,79,163,0.1)",
  dimOpacity: 0.6,
  circle: "#170B2E",
  circleBorder: "rgba(255,79,163,0.35)",
  pulseGlow: "0 0 0 5px rgba(255,79,163,0.14), 0 0 18px rgba(255,79,163,0.07)",
  timerRing: "#FF4FA3",
  timerText: "#ffffff",
  progressRing: "#FF4FA3",
  badge: { bg: "#170B2E", border: "rgba(255,79,163,0.45)", text: "#FF4FA3" },
  header: { bg: "linear-gradient(180deg, #FF4FA3 0%, #A855F7 100%)", text: "#ffffff", meta: "rgba(255,255,255,0.65)" },
  overlay: {
    bg: "#170B2E", text: "rgba(255,255,255,0.7)", title: "#FF4FA3", accent: "#FF4FA3",
    border: "rgba(255,79,163,0.15)", closeBg: "rgba(255,79,163,0.08)", closeText: "#FF4FA3",
    tagBg: "rgba(255,79,163,0.06)", tagText: "rgba(255,255,255,0.4)",
  },
  thankYou: {
    bg: "#170B2E", check: "#FF4FA3", checkBg: "rgba(255,79,163,0.12)",
    heading: "#ffffff", body: "rgba(255,255,255,0.65)", tagline: "#FF4FA3",
  },
  analytics: {
    prominenceScore: 9, interactionPotential: 9, readabilityScore: 7,
    mobileFriendliness: 8, accessibilityScore: 7,
    recommendedUseCase: "Social Media & Entertainment",
  },
};

// ─── 4. Electric Purple ───────────────────────────────────────────────────────

const electricPurple: Theme = {
  id: "electric-purple",
  name: "Electric Purple",
  feeling: "Spotify · Entertainment · Premium",
  canvas: "#140B2E",
  quad: "#1E0D36",
  gridLine: "rgba(217,70,239,0.12)",
  outerBorder: "rgba(217,70,239,0.45)",
  outerShadow: "0 8px 32px rgba(217,70,239,0.2)",
  text: "#ffffff",
  accent: "#D946EF",
  gradient: "linear-gradient(180deg, #D946EF 0%, #7C3AED 100%)",
  reversedGradient: "linear-gradient(180deg, #7C3AED 0%, #D946EF 100%)",
  selectedBg: "linear-gradient(180deg, #D946EF 0%, #7C3AED 100%)",
  selectedText: "#ffffff",
  hoverBg: "rgba(217,70,239,0.07)",
  hoverGlow: "inset 0 0 28px rgba(217,70,239,0.1)",
  dimOpacity: 0.6,
  circle: "#140B2E",
  circleBorder: "rgba(217,70,239,0.35)",
  pulseGlow: "0 0 0 5px rgba(217,70,239,0.14), 0 0 18px rgba(217,70,239,0.07)",
  timerRing: "#D946EF",
  timerText: "#ffffff",
  progressRing: "#D946EF",
  badge: { bg: "#140B2E", border: "rgba(217,70,239,0.45)", text: "#D946EF" },
  header: { bg: "linear-gradient(180deg, #D946EF 0%, #7C3AED 100%)", text: "#ffffff", meta: "rgba(255,255,255,0.65)" },
  overlay: {
    bg: "#140B2E", text: "rgba(255,255,255,0.7)", title: "#D946EF", accent: "#D946EF",
    border: "rgba(217,70,239,0.15)", closeBg: "rgba(217,70,239,0.08)", closeText: "#D946EF",
    tagBg: "rgba(217,70,239,0.06)", tagText: "rgba(255,255,255,0.4)",
  },
  thankYou: {
    bg: "#140B2E", check: "#D946EF", checkBg: "rgba(217,70,239,0.12)",
    heading: "#ffffff", body: "rgba(255,255,255,0.65)", tagline: "#D946EF",
  },
  analytics: {
    prominenceScore: 9, interactionPotential: 9, readabilityScore: 7,
    mobileFriendliness: 8, accessibilityScore: 7,
    recommendedUseCase: "Streaming & Entertainment",
  },
};

// ─── 5. Sky Pulse ─────────────────────────────────────────────────────────────

const skyPulse: Theme = {
  id: "sky-pulse",
  name: "Sky Pulse",
  feeling: "Fresh · Technology · Trustworthy",
  canvas: "#071625",
  quad: "#0A2033",
  gridLine: "rgba(125,211,252,0.1)",
  outerBorder: "rgba(125,211,252,0.45)",
  outerShadow: "0 8px 32px rgba(125,211,252,0.1)",
  text: "#ffffff",
  accent: "#7DD3FC",
  gradient: "linear-gradient(180deg, #7DD3FC 0%, #3B82F6 100%)",
  reversedGradient: "linear-gradient(180deg, #3B82F6 0%, #7DD3FC 100%)",
  selectedBg: "linear-gradient(180deg, #7DD3FC 0%, #3B82F6 100%)",
  selectedText: "#071625",
  hoverBg: "rgba(125,211,252,0.07)",
  hoverGlow: "inset 0 0 28px rgba(125,211,252,0.08)",
  dimOpacity: 0.6,
  circle: "#071625",
  circleBorder: "rgba(125,211,252,0.35)",
  pulseGlow: "0 0 0 5px rgba(125,211,252,0.14), 0 0 18px rgba(125,211,252,0.07)",
  timerRing: "#7DD3FC",
  timerText: "#ffffff",
  progressRing: "#7DD3FC",
  badge: { bg: "#071625", border: "rgba(125,211,252,0.45)", text: "#7DD3FC" },
  header: { bg: "linear-gradient(180deg, #7DD3FC 0%, #3B82F6 100%)", text: "#071625", meta: "rgba(7,22,37,0.6)" },
  overlay: {
    bg: "#071625", text: "rgba(255,255,255,0.7)", title: "#7DD3FC", accent: "#7DD3FC",
    border: "rgba(125,211,252,0.15)", closeBg: "rgba(125,211,252,0.08)", closeText: "#7DD3FC",
    tagBg: "rgba(125,211,252,0.06)", tagText: "rgba(255,255,255,0.4)",
  },
  thankYou: {
    bg: "#071625", check: "#7DD3FC", checkBg: "rgba(125,211,252,0.12)",
    heading: "#ffffff", body: "rgba(255,255,255,0.65)", tagline: "#7DD3FC",
  },
  analytics: {
    prominenceScore: 8, interactionPotential: 8, readabilityScore: 9,
    mobileFriendliness: 9, accessibilityScore: 9,
    recommendedUseCase: "Technology & News Platforms",
  },
};

// ─── 6. Ocean ─────────────────────────────────────────────────────────────────

const ocean: Theme = {
  id: "ocean",
  name: "Ocean",
  feeling: "Modern · Clean · Data Platform",
  canvas: "#081421",
  quad: "#0B1C2D",
  gridLine: "rgba(114,212,241,0.1)",
  outerBorder: "rgba(114,212,241,0.45)",
  outerShadow: "0 8px 32px rgba(114,212,241,0.1)",
  text: "#ffffff",
  accent: "#72D4F1",
  gradient: "linear-gradient(180deg, #7DD3FC 0%, #2563EB 100%)",
  reversedGradient: "linear-gradient(180deg, #2563EB 0%, #7DD3FC 100%)",
  selectedBg: "linear-gradient(180deg, #7DD3FC 0%, #2563EB 100%)",
  selectedText: "#081421",
  hoverBg: "rgba(114,212,241,0.07)",
  hoverGlow: "inset 0 0 28px rgba(114,212,241,0.08)",
  dimOpacity: 0.6,
  circle: "#081421",
  circleBorder: "rgba(114,212,241,0.35)",
  pulseGlow: "0 0 0 5px rgba(114,212,241,0.14), 0 0 18px rgba(114,212,241,0.07)",
  timerRing: "#72D4F1",
  timerText: "#ffffff",
  progressRing: "#72D4F1",
  badge: { bg: "#081421", border: "rgba(114,212,241,0.45)", text: "#72D4F1" },
  header: { bg: "linear-gradient(180deg, #7DD3FC 0%, #2563EB 100%)", text: "#081421", meta: "rgba(8,20,33,0.6)" },
  overlay: {
    bg: "#081421", text: "rgba(255,255,255,0.7)", title: "#72D4F1", accent: "#72D4F1",
    border: "rgba(114,212,241,0.15)", closeBg: "rgba(114,212,241,0.08)", closeText: "#72D4F1",
    tagBg: "rgba(114,212,241,0.06)", tagText: "rgba(255,255,255,0.4)",
  },
  thankYou: {
    bg: "#081421", check: "#72D4F1", checkBg: "rgba(114,212,241,0.12)",
    heading: "#ffffff", body: "rgba(255,255,255,0.65)", tagline: "#72D4F1",
  },
  analytics: {
    prominenceScore: 8, interactionPotential: 8, readabilityScore: 9,
    mobileFriendliness: 9, accessibilityScore: 9,
    recommendedUseCase: "Data Platforms & Publishers",
  },
};

// ─── 7. Lime Energy ───────────────────────────────────────────────────────────

const limeEnergy: Theme = {
  id: "lime-energy",
  name: "Lime Energy",
  feeling: "Impossible to ignore · High salience · Energetic",
  canvas: "#10120B",
  quad: "#1A1F0E",
  gridLine: "rgba(248,243,43,0.12)",
  outerBorder: "rgba(248,243,43,0.45)",
  outerShadow: "0 8px 32px rgba(248,243,43,0.1)",
  text: "#ffffff",
  accent: "#F8F32B",
  gradient: "linear-gradient(180deg, #F8F32B 0%, #A3D92F 100%)",
  reversedGradient: "linear-gradient(180deg, #A3D92F 0%, #F8F32B 100%)",
  selectedBg: "linear-gradient(180deg, #F8F32B 0%, #A3D92F 100%)",
  selectedText: "#0B1929",
  hoverBg: "rgba(248,243,43,0.07)",
  hoverGlow: "inset 0 0 28px rgba(248,243,43,0.08)",
  dimOpacity: 0.6,
  circle: "#10120B",
  circleBorder: "rgba(248,243,43,0.35)",
  pulseGlow: "0 0 0 5px rgba(248,243,43,0.14), 0 0 18px rgba(248,243,43,0.07)",
  timerRing: "#F8F32B",
  timerText: "#ffffff",
  progressRing: "#F8F32B",
  badge: { bg: "#10120B", border: "rgba(248,243,43,0.45)", text: "#F8F32B" },
  header: { bg: "linear-gradient(180deg, #F8F32B 0%, #A3D92F 100%)", text: "#10120B", meta: "rgba(16,18,11,0.65)" },
  overlay: {
    bg: "#10120B", text: "rgba(255,255,255,0.7)", title: "#F8F32B", accent: "#F8F32B",
    border: "rgba(248,243,43,0.15)", closeBg: "rgba(248,243,43,0.08)", closeText: "#F8F32B",
    tagBg: "rgba(248,243,43,0.06)", tagText: "rgba(255,255,255,0.4)",
  },
  thankYou: {
    bg: "#10120B", check: "#F8F32B", checkBg: "rgba(248,243,43,0.12)",
    heading: "#ffffff", body: "rgba(255,255,255,0.65)", tagline: "#F8F32B",
  },
  analytics: {
    prominenceScore: 10, interactionPotential: 9, readabilityScore: 7,
    mobileFriendliness: 8, accessibilityScore: 7,
    recommendedUseCase: "High-Impact Advertising",
  },
};

// ─── 8. Stadium Green ─────────────────────────────────────────────────────────

const stadiumGreen: Theme = {
  id: "stadium-green",
  name: "Stadium Green",
  feeling: "Football · Grass · Matchday",
  canvas: "#07150B",
  quad: "#10210F",
  gridLine: "rgba(100,221,23,0.12)",
  outerBorder: "rgba(100,221,23,0.45)",
  outerShadow: "0 8px 32px rgba(100,221,23,0.12)",
  text: "#ffffff",
  accent: "#64DD17",
  gradient: "linear-gradient(180deg, #64DD17 0%, #0B5D1E 100%)",
  reversedGradient: "linear-gradient(180deg, #0B5D1E 0%, #64DD17 100%)",
  selectedBg: "linear-gradient(180deg, #64DD17 0%, #0B5D1E 100%)",
  selectedText: "#07150B",
  hoverBg: "rgba(100,221,23,0.07)",
  hoverGlow: "inset 0 0 28px rgba(100,221,23,0.08)",
  dimOpacity: 0.6,
  circle: "#07150B",
  circleBorder: "rgba(100,221,23,0.35)",
  pulseGlow: "0 0 0 5px rgba(100,221,23,0.14), 0 0 18px rgba(100,221,23,0.07)",
  timerRing: "#64DD17",
  timerText: "#ffffff",
  progressRing: "#64DD17",
  badge: { bg: "#07150B", border: "rgba(100,221,23,0.45)", text: "#64DD17" },
  header: { bg: "linear-gradient(180deg, #64DD17 0%, #0B5D1E 100%)", text: "#ffffff", meta: "rgba(255,255,255,0.65)" },
  overlay: {
    bg: "#07150B", text: "rgba(255,255,255,0.7)", title: "#64DD17", accent: "#64DD17",
    border: "rgba(100,221,23,0.15)", closeBg: "rgba(100,221,23,0.08)", closeText: "#64DD17",
    tagBg: "rgba(100,221,23,0.06)", tagText: "rgba(255,255,255,0.4)",
  },
  thankYou: {
    bg: "#07150B", check: "#64DD17", checkBg: "rgba(100,221,23,0.12)",
    heading: "#ffffff", body: "rgba(255,255,255,0.65)", tagline: "#64DD17",
  },
  analytics: {
    prominenceScore: 9, interactionPotential: 9, readabilityScore: 8,
    mobileFriendliness: 8, accessibilityScore: 8,
    recommendedUseCase: "Sports & Matchday Activations",
  },
};

// ─────────────────────────────────────────────────────────────────────────────

export const THEMES: Theme[] = [
  fanometrix,
  electricFootball,
  fanEnergy,
  electricPurple,
  skyPulse,
  ocean,
  limeEnergy,
  stadiumGreen,
];

export const DEFAULT_THEME = THEMES[0];
