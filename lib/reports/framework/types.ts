// The Fanometrix Report framework — content model.
//
// A report is DATA, not a layout. Everything on the page is described by a
// serialisable `ReportConfig`: the hero, the intelligence panel, and an ordered
// list of typed `Section` blocks. The framework renders it; a new report is a
// new config, never new framework code.
//
// Two rules make this a platform rather than one page:
//
//   1. Every section carries `enabled` and its array position is its order, so a
//      report's shape is edited in config — turn a section off, move it, done —
//      without touching a component.
//   2. Sections are a discriminated union keyed by `type`, resolved through a
//      registry at render time. A future module (video, map, downloads, an AI
//      summary, live survey data, comments) is a new `type` + one registry
//      entry; the framework is closed to modification, open to extension.
//
// This file is imported by both server (route, access, views) and client
// (shell, sections), so it must stay pure types + data — no functions, no React.

/* ─────────────────────────── Shared value types ─────────────────────────── */

/** Confidence tone maps to app/reports/theme.ts CONFIDENCE_TONE. Label is always
 *  rendered beside the swatch — tone is never the only signal. */
export type Confidence = "high" | "moderate" | "early";

export type EvidenceStrength = "robust" | "moderate" | "limited";

/** A single large figure in the executive dashboard / stat wall. */
export type Stat = {
  /** The number itself, pre-formatted for display (e.g. "274", "34%", "$36.3M"). */
  value: string;
  /** Numeric target for the count-up animation. Omit for non-numeric values
   *  ("$36.3M") — the value renders statically. */
  countTo?: number;
  /** Optional prefix/suffix the count-up preserves ("$", "%", "M"). */
  prefix?: string;
  suffix?: string;
  label: string;
  /** One supporting line under the label. */
  detail?: string;
  /** Larger, visually dominant tile. Use sparingly — one or two per wall. */
  emphasis?: boolean;
  /** Optional source note (e.g. "YouGov Sport, 2026"). */
  source?: string;
};

/** One answer option within a survey question. */
export type ChartOption = {
  label: string;
  count: number;
  pct: number; // 0–100, pre-computed
  /** Marks the option the narrative leans on — rendered a touch stronger. */
  highlight?: boolean;
};

/** Per-market split for a question — the "by market" expansion. */
export type MarketSplit = {
  market: string; // e.g. "United Kingdom"
  code: string; // e.g. "UK"
  /** pct per option, index-aligned with the question's `options`. */
  values: number[]; // 0–100
  n: number; // answered in this market
};

export type SurveyQuestion = {
  id: string;
  number: string; // "Q1"
  title: string;
  /** Editorial title for the question block (e.g. "FedEx has earned credibility"). */
  displayTitle?: string;
  n: number; // answered
  options: ChartOption[];
  markets?: MarketSplit[];
  /** Observation shown in italics under the chart (e.g. market consistency). */
  note?: string;
  /** "Key Insight" paragraph rendered beneath the chart. */
  keyInsight?: string;
  /** "Strategic Implication" paragraph rendered beneath the key insight. */
  strategicImplication?: string;
};

/** A named research publication behind a finding. `url` (if present) makes the
 *  evidence tag a link that opens the source in a new tab — paywalled sources
 *  still link to their official article page. */
export type EvidenceRef = { label: string; url?: string };

export type Finding = {
  index: string; // "01"
  title: string;
  body?: string;
  confidence?: Confidence;
  confidenceLabel?: string; // "High", "Medium–High"
  /** Evidence attributions — the specific research pieces that support the
   *  finding, each optionally linked to its source. */
  supportedBy?: EvidenceRef[];
  /** A short "Strategic Implication" line rendered beneath the finding. */
  implication?: string;
};

export type Quote = {
  text: string;
  attribution?: string;
  context?: string;
};

export type Benchmark = {
  name: string;
  tag: string; // short descriptor, e.g. "Connected model"
  body: string;
  /** Optional headline stat for the card (e.g. "+6% consideration"). */
  metric?: string;
  metricLabel?: string;
  tone?: "positive" | "neutral" | "caution";
};

export type StrategyTrack = {
  key: string; // "A" / "B" / "C"
  role: string; // "engine" / "lead" / "amplifier"
  label: string;
  lead?: boolean; // the recommended track — drawn strongest
};

export type Principle = {
  index: string;
  title: string;
  body: string;
};

export type Recommendation = {
  index: string;
  title: string;
  body?: string;
  horizon?: string; // optional tag pill (e.g. "Illustrative Territory")
  /** When present, rendered as a "Hypothesis." framed line — used to present an
   *  idea as an illustrative hypothesis rather than a recommendation. */
  hypothesis?: string;
  /** Optional "Consistent with:" / "Supports:" line tying it to the evidence. */
  supports?: string;
};

export type ConfidenceRow = {
  source: string;
  /** Confidence label exactly as approved, e.g. "High" / "Medium". */
  confidence: string;
  /** Tone for the confidence pill. */
  tone?: "high" | "medium" | "low";
  /** "Basis for confidence" cell. */
  basis: string;
};

/** A named evidence source with a short description (Our Evidence Base). */
export type EvidenceSourceItem = {
  title: string;
  body: string;
};

/* ───────────────────────────── Section blocks ───────────────────────────── */

/** A concise commercial takeaway shown at the end of a chapter — brings the
 *  reader back to "why this matters" before the next section. */
export type Takeaway = {
  label?: string; // default "Why this matters"
  text: string;
};

/** Every section shares these. `navLabel` drives the TOC + scroll-spy; a section
 *  with no navLabel still renders but stays out of the contents rail. */
export type SectionBase = {
  id: string;
  /** Default true. `false` removes the section from the page AND the TOC without
   *  deleting its config — the per-report on/off switch. */
  enabled?: boolean;
  navLabel?: string;
  /** Uppercase gold eyebrow above the section title. */
  kicker?: string;
  /** Two-digit chapter marker (e.g. "01") shown faintly beside the kicker. */
  chapter?: string;
  /** Visual band, driving the report's light/dark rhythm:
   *  "white" (primary reading surface, charts, long-form),
   *  "grey"  (#F7F8FA — transitions, dashboard, methodology, supporting),
   *  "navy"  (high-emphasis moments — strategy, philosophy).
   *  Gold and cream are never full surfaces. */
  tone?: "white" | "grey" | "navy";
  /** Optional end-of-chapter commercial takeaway. */
  takeaway?: Takeaway;
};

export type HeroSection = SectionBase & {
  type: "hero";
  title: string;
  subtitle?: string;
  researchQuestion?: string;
  eyebrow?: string; // e.g. "Fanometrix · Independent Football Intelligence"
  meta: IntelligenceMeta;
};

export type ProseSection = SectionBase & {
  type: "prose";
  heading?: string;
  lede?: string;
  paragraphs?: string[];
};

export type ExecutiveSummarySection = SectionBase & {
  type: "executive-summary";
  heading?: string;
  assessmentKicker?: string;
  assessment: string;
  findings: Finding[];
};

export type StatWallSection = SectionBase & {
  type: "stat-wall";
  heading?: string;
  lede?: string;
  /** Narrative paragraphs shown at reading width before the stat cards. */
  paragraphs?: string[];
  stats: Stat[];
  /** An optional second row framed as context (industry evidence). */
  contextHeading?: string;
  contextStats?: Stat[];
  /** A highlighted editorial callout shown after the stat cards. */
  callout?: { label?: string; paragraphs: string[] };
};

export type SurveyEvidenceSection = SectionBase & {
  type: "survey-evidence";
  heading?: string;
  lede?: string;
  sampleNote?: string;
  questions: SurveyQuestion[];
};

export type FindingsLadderSection = SectionBase & {
  type: "findings-ladder";
  heading?: string;
  lede?: string;
  /** Intro paragraphs shown before the ladder. */
  paragraphs?: string[];
  findings: Finding[];
};

export type InsightSection = SectionBase & {
  type: "insight";
  heading?: string;
  lede?: string;
  /** Each callout may lead with a large `metric` (e.g. "65%") or a small
   *  `overline` category label above its title. */
  callouts?: { metric?: string; overline?: string; title: string; body: string }[];
  quotes?: Quote[];
};

export type BenchmarkSection = SectionBase & {
  type: "benchmark";
  heading?: string;
  lede?: string;
  benchmarks: Benchmark[];
};

export type StrategyFrameworkSection = SectionBase & {
  type: "strategy-framework";
  heading?: string;
  lede?: string;
  frameworkName?: string;
  /** Optional connected-track diagram. Omit to render principles alone. */
  tracks?: StrategyTrack[];
  statement?: string;
  principles?: Principle[];
};

export type RecommendationsSection = SectionBase & {
  type: "recommendations";
  heading?: string;
  lede?: string;
  /** Intro paragraphs shown before the list (e.g. the DHL inspiration). */
  paragraphs?: string[];
  /** A prominent disclaimer shown above the list (e.g. "these are illustrative,
   *  not recommendations"). */
  caveat?: string;
  recommendations: Recommendation[];
  /** An emphasised research-next-step panel rendered after the list. */
  phase2?: {
    label?: string;
    intro: string;
    dimensions: string[];
    objective?: string;
  };
};

export type MethodologySection = SectionBase & {
  type: "methodology";
  heading?: string;
  lede?: string;
  paragraphs?: string[];
  /** Named evidence sources with descriptions (rendered as a titled list). */
  sources?: EvidenceSourceItem[];
  confidenceHeading?: string;
  rows?: ConfidenceRow[];
  /** Small print under the confidence table. */
  confidenceNote?: string;
};

export type ClosingSection = SectionBase & {
  type: "closing";
  opener?: string;
  belief: string;
  signature?: string;
  signatureLine?: string;
};

/** A full-bleed editorial image band — a cinematic chapter break. Renders the
 *  photo at `src` (a /public path) under a navy scrim, with an optional overlaid
 *  editorial line. With no `src` it falls back to a designed navy "atmosphere"
 *  gradient, so the band is always premium even before photography is dropped in. */
export type ImageSection = SectionBase & {
  type: "image";
  src?: string;
  alt?: string;
  overline?: string;
  headline?: string;
  caption?: string;
  height?: "band" | "tall";
  /** Darkness of the navy scrim over the photo, 0–1 (bottom, where the text sits).
   *  Higher = darker = more legible over bright images. Default 0.72. */
  scrim?: number;
};

/** The core section union. Extension modules widen it structurally through the
 *  registry (see UnknownSection handling) without editing this union. */
export type Section =
  | HeroSection
  | ProseSection
  | ExecutiveSummarySection
  | StatWallSection
  | SurveyEvidenceSection
  | FindingsLadderSection
  | InsightSection
  | BenchmarkSection
  | StrategyFrameworkSection
  | RecommendationsSection
  | MethodologySection
  | ClosingSection
  | ImageSection
  /** Forward-compatibility: an unknown/bespoke module the core doesn't know.
   *  The registry resolves it by `type`; unresolved types render nothing in
   *  production and a visible placeholder in development. */
  | (SectionBase & { type: string; [key: string]: unknown });

/* ─────────────────────────── Intelligence panel ─────────────────────────── */

export type ReportStatus = "complete" | "in-progress" | "draft";

/** The live metadata panel beside the hero. Every field is optional so a report
 *  shows only what it has. `views` is injected at request time from the store;
 *  everything else is authored. */
export type IntelligenceMeta = {
  preparedFor?: string;
  preparedBy?: string;
  date?: string; // "July 2026"
  classification?: string;
  version?: string; // "1.0"
  status?: ReportStatus;
  statusLabel?: string; // "Complete"
  lastUpdated?: string; // "27 July 2026, 09:15 BST"
  readingTime?: string; // "12 min read"
  evidenceSources?: number;
  primaryResearch?: string; // "274 fans across 5 markets"
  /** Headline scope figures shown prominently at the top of the intelligence
   *  panel, so it reads as an executive summary rather than a metadata list. */
  highlights?: { value: string; label: string }[];
};

/* ──────────────────────────────── Report ────────────────────────────────── */

export type ReportAccess = {
  /** Stable id — the unlock cookie and view counter key off this. Never change
   *  it for a published report or existing unlock cookies stop matching. */
  id: string;
  /** Env var holding the bcrypt password hash for this report. */
  passwordEnv: string;
  /** Seed added to real recorded views so a freshly-published report doesn't
   *  read "0 views". Honest by construction — real visits accrue on top. */
  viewSeed?: number;
};

export type ReportConfig = {
  /** URL path under /reports, e.g. "fedex/ucl-sponsorship". Informational. */
  slug: string;
  /** Short title used in the (generic, pre-unlock) document <title>. */
  documentTitle: string;
  access: ReportAccess;
  sections: Section[];
};

/** Runtime values the server injects into the client shell. */
export type ReportRuntime = {
  views: number | null;
};
