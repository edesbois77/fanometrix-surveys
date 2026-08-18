// ── Discover → Overview — editorial assembly & deterministic ranking (pure) ──
// "The latest from your research." This module holds the PURE, tested core of the
// Discover Overview: the typed models, the explicit deterministic ranking rules,
// and the capping/selection. It never touches a DB, a model, or the clock — the
// route resolves governed, entitlement-scoped facts and real data timestamps, then
// calls these functions. Ranking orders by USER VALUE (class) first and real data
// timestamps within a class — never a view/render time, never an opaque score — so
// a mundane recent event can never outrank a meaningful finding, and it is testable.

// ── Caps (explicit, tunable — never hidden in the UI) ────────────────────────
export const INSIGHTS_MAX = 6;        // items in "Latest insights" (excludes the hero)
export const INSIGHTS_PER_SURVEY = 2; // one survey can contribute at most this many
export const ACTIVITY_MAX = 3;   // Latest activity is tightly capped and secondary
export const EXPLORE_MAX = 4;    // compact discovery columns, not the full index
export const LIVE_MAX = 4;       // Live Now surfaces a restrained set
/** Hard ceiling on how many surveys the route runs the (heavier) deterministic
 *  findings engine over per load — only the most-active surveys that lack a
 *  visible analysis. Keeps the landing bounded; never an N-per-survey loop. */
export const MAX_FEATURED_DETERMINISTIC = 4;

// ── Featured findings (the "Did you know?" hero + Latest Findings & Analysis) ─
// A finding surfaced because it is the strongest/latest thing the research is
// SAYING. Two governed sources coexist, clearly distinguished by `source`:
//   • "analysis"      — a completed, entitlement-gated Survey Analysis (real
//                        generation time). The primary, freshest intelligence.
//   • "deterministic" — the existing base-gated Survey Findings engine output
//                        (no generation time; its freshness is the survey's own
//                        response activity). Lets findings LEAD even before any
//                        analysis has been generated.
export type FeaturedFindingSource = "analysis" | "deterministic";

// An Overview insight card. Three governed KINDS coexist in "Latest insights":
//   • "analysis" — a completed, entitlement-gated Survey Analysis verdict.
//   • "finding"  — a base-gated deterministic finding (a claim: a standout majority,
//                  clear lead, or segment contrast).
//   • "result"   — a raw governed answer distribution for a question, surfaced in its
//                  own right (more useful than forcing a weak "opinion is split"
//                  sentence). Server-owned numbers; never a client-inferred claim.
export type InsightKind = "analysis" | "finding" | "result";

export type FeaturedFinding = {
  id: string;
  kind: InsightKind;
  /** The deterministic finding type (finding kind only), used for hero-worthiness
   *  and strength — never for a "result" or "analysis" card. */
  findingType?: string;
  /** Dedup key so one question/analysis can't appear twice (hero + feed, or as both
   *  a finding and a raw result). */
  questionKey?: string;
  source: FeaturedFindingSource;
  /** The one-line conclusion — a narrative verdict, a proposal headline, or a
   *  deterministic finding title. Never internal evidence machinery. */
  headline: string;
  /** Optional short supporting line (analysis: narrative summary; deterministic:
   *  the finding's own secondary line). Kept brief; never model machinery. */
  support?: string;
  /** Transparent top-line numbers for a deterministic finding, so the UI can give
   *  it a "stat/result" treatment straight from the governed distribution the
   *  engine already computed. Absent for analysis findings. */
  metrics?: { option: string; pct: number; runnerUp?: { option: string; pct: number } };
  /** The governed answer distribution behind a DISTRIBUTION-type deterministic
   *  finding (dominant/leading/divided): the ranked top options with their
   *  server-owned percentages, for a restrained mini horizontal-bar treatment.
   *  Server-owned labels/percentages only — never client-inferred. Absent when the
   *  finding is not a distribution (minority/pattern) or is an analysis narrative. */
  distribution?: { label: string; pct: number }[];
  /** Answered base (n) behind the distribution — shown so the bars can never imply
   *  more certainty than the sample supports. */
  base?: number;
  surveyId: string;
  surveyName: string;
  /** WHY it is here, shown to the user (e.g. "New analysis", "Emerging finding"). */
  reason: string;
  /** Genuine generation time (analysis only); null for deterministic findings. */
  generatedAtMs: number | null;
  /** Server-formatted relative time for an analysis finding, or null. */
  generatedLabel?: string | null;
  /** The survey's latest-response time — the freshness proxy for a deterministic
   *  finding, and a secondary sort key. */
  activityMs: number;
  /** Route into the survey's Findings tab. */
  href: string;
};

const freshnessOf = (f: FeaturedFinding): number => (f.generatedAtMs ?? f.activityMs);
const keyOf = (f: FeaturedFinding): string => f.questionKey ?? f.id;

// ── Hero worthiness — "Did you know?" must be genuinely strong ────────────────
// Only STANDOUT findings qualify. Weak/generic ones (divided "opinion is split",
// generic patterns, thin leads, minorities, completion, raw results) NEVER become
// the hero — the section is simply absent when nothing strong exists. Deterministic,
// using ONLY server-owned fields already on the card.
export const HERO_WORTHY_FINDING_TYPES = new Set<string>(["dominant", "market", "device"]);
// An analysis verdict that reads as generic ("opinion is split", "no clear winner")
// is not hero material either — surfaced in the feed, not the hero.
const GENERIC_HEADLINE = /\b(split|divided|mixed|inconclusive|no (clear|single|strong|consensus)|too close)\b/i;

export function isHeroWorthy(f: FeaturedFinding): boolean {
  if (f.kind === "analysis") return !GENERIC_HEADLINE.test(f.headline);
  if (f.kind === "finding") return f.findingType != null && HERO_WORTHY_FINDING_TYPES.has(f.findingType);
  return false; // a raw result distribution is strong material, but not a "did you know?" claim
}

// ── Deterministic insight strength (server-owned; drives ranking) ────────────
// A fresh Analysis leads; then standout findings (majority/clear-lead, segment
// contrast); then strong raw results (by top-option share); weak types sink. Pure.
export function insightStrength(f: FeaturedFinding): number {
  if (f.kind === "analysis") return 100;
  if (f.kind === "finding") {
    const pct = f.metrics?.pct ?? 0, ru = f.metrics?.runnerUp?.pct ?? 0;
    switch (f.findingType) {
      case "dominant": return 70 + Math.min(20, Math.max(pct - 50, pct - ru - 20));
      case "market": case "device": return 68;
      case "leading": return 42;
      case "minority": return 36;
      default: return 30;
    }
  }
  // result: a raw distribution — stronger when one option genuinely stands out.
  const top = f.distribution?.[0]?.pct ?? 0;
  return 25 + Math.min(15, top * 0.3);
}

function rankInsights(items: FeaturedFinding[]): FeaturedFinding[] {
  return [...items].sort(
    (a, b) => insightStrength(b) - insightStrength(a) || freshnessOf(b) - freshnessOf(a) || a.id.localeCompare(b.id),
  );
}

/** Pick the single hero and the deduplicated, per-survey-capped feed. The hero is
 *  the strongest HERO-WORTHY item (or null); the feed excludes it and never repeats
 *  a question/survey beyond the cap, so one survey can't swamp the page and the hero
 *  is never duplicated below. */
export function selectInsights(
  items: FeaturedFinding[],
  opts: { max?: number; perSurvey?: number } = {},
): { hero: FeaturedFinding | null; insights: FeaturedFinding[] } {
  const max = opts.max ?? INSIGHTS_MAX;
  const perSurvey = opts.perSurvey ?? INSIGHTS_PER_SURVEY;
  const ranked = rankInsights(items);
  const heroIdx = ranked.findIndex(isHeroWorthy);
  const hero = heroIdx >= 0 ? ranked[heroIdx] : null;

  const usedKey = new Set<string>();
  const perSurveyCount = new Map<string, number>();
  if (hero) { usedKey.add(keyOf(hero)); perSurveyCount.set(hero.surveyId, 1); }

  const insights: FeaturedFinding[] = [];
  for (let i = 0; i < ranked.length; i++) {
    if (i === heroIdx) continue;
    const it = ranked[i];
    const k = keyOf(it);
    if (usedKey.has(k)) continue; // no question/analysis twice
    const c = perSurveyCount.get(it.surveyId) ?? 0;
    if (c >= perSurvey) continue; // one survey can't swamp the feed
    usedKey.add(k); perSurveyCount.set(it.surveyId, c + 1);
    insights.push(it);
    if (insights.length >= max) break;
  }
  return { hero, insights };
}

// ── Live Now ─────────────────────────────────────────────────────────────────
export type LiveSurvey = {
  id: string;
  name: string;
  responses: number;
  campaignCount: number;
  lastResponseLabel: string | null;
  activityMs: number;
  href: string;
};

export function selectLiveSurveys(surveys: LiveSurvey[], max = LIVE_MAX): LiveSurvey[] {
  return [...surveys].sort((a, b) => b.activityMs - a.activityMs || a.name.localeCompare(b.name)).slice(0, max);
}

// ── Latest activity (events, not intelligence — SECONDARY) ───────────────────
// Meaningful research EVENTS for a research consumer — not a raw audit log. Each
// item is one salient event with an explicit reason and a real data timestamp.
export type FeedKind = "analysis" | "collecting" | "responses" | "new-survey" | "study-updated";

export type ResearchFeedItem = {
  id: string;
  kind: FeedKind;
  title: string;
  detail?: string;
  /** WHY this is surfaced — the answer to "why is this here?". */
  reason: string;
  /** Real data timestamp (ms). The ranking key. NEVER a view/render time. */
  timestampMs: number;
  /** Server-formatted relative-time label, e.g. "2 hours ago". */
  timeLabel: string | null;
  href: string;
};

// Value class: intelligence > current collection > past responses > newly added >
// study touch. Used both to keep the highest-value events (they are not crowded out
// by a mundane event that merely happened later) and as a stable tiebreak.
const KIND_RANK: Record<FeedKind, number> = {
  analysis: 0,
  collecting: 1,
  responses: 2,
  "new-survey": 3,
  "study-updated": 4,
};

export function rankResearchFeed(items: ResearchFeedItem[]): ResearchFeedItem[] {
  return [...items].sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      b.timestampMs - a.timestampMs ||
      a.id.localeCompare(b.id),
  );
}

// ── Account shape — adapts the page to how much research the caller has ──────
// Pure classification so light/empty users get a useful page (Fanometrix content
// leads) rather than a wall of empty/sparse tiles, and heavy users get the full
// analytical treatment. Derived only from governed counts already resolved.
export type AccountShape = "empty" | "light" | "established";
export function classifyAccount(input: { surveys: number; answers: number }): AccountShape {
  if (input.surveys === 0) return "empty";
  if (input.surveys < 2 || input.answers < 100) return "light";
  return "established";
}

/** Choose the activity to show: pick the highest-VALUE (then freshest) events so a
 *  mundane newer event never crowds out a meaningful one, then display those
 *  chronologically (newest first) so the feed reads like recent activity. */
export function selectActivity(items: ResearchFeedItem[], max = ACTIVITY_MAX): ResearchFeedItem[] {
  const chosen = rankResearchFeed(items).slice(0, max); // value-first selection
  return chosen.sort((a, b) => b.timestampMs - a.timestampMs || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.id.localeCompare(b.id));
}

// ── Explore (compact discovery — NOT the full index) ─────────────────────────
export type ExploreItem = { id: string; name: string; href: string; meta?: string; activityMs: number };

export function selectExplore(items: ExploreItem[], max = EXPLORE_MAX): ExploreItem[] {
  return [...items].sort((a, b) => b.activityMs - a.activityMs || a.name.localeCompare(b.name)).slice(0, max);
}

// ── Total Answers — per-mode partition (pure) ────────────────────────────────
// The product's authoritative "questions answered" is per-mode (lib/studio/
// dashboard-metrics): studio-native surveys count via response_answers; historical
// surveys count via the progression-event union. A survey is WHOLLY one mode. To
// compute a scope-wide total without per-survey N+1, we partition the authorised
// slugs by whether they appear in response_answers (studio-native) and count each
// mode with its own batched primitive. This split is the only branch that must be
// exactly right so historical waves are never silently treated as zero.
export function partitionAnswerModes(
  authorisedSlugs: string[],
  studioNativeSlugs: Iterable<string>,
): { studioSlugs: string[]; historicalSlugs: string[] } {
  const studioSet = new Set(studioNativeSlugs);
  const studioSlugs = authorisedSlugs.filter((s) => studioSet.has(s));
  const historicalSlugs = authorisedSlugs.filter((s) => !studioSet.has(s));
  return { studioSlugs, historicalSlugs };
}

// ── Research activity — answers-per-day series (pure windowing) ──────────────
// "Answers collected over time." The route resolves a governed day→count map using
// the SAME per-mode answer split as Total Answers (studio via dashboard_answer_series,
// historical via the progression-event series) so the chart reconciles with the
// metric. This pure helper turns that map into a continuous daily axis. Days with no
// answers are ZERO — genuine gaps, never fabricated activity. endMs is passed in (no
// Date.now) so it stays deterministic and testable.
export type ActivityPoint = { date: string; answers: number };
export const ACTIVITY_WINDOW_DAYS = 90;
export const ACTIVITY_WINDOWS = [7, 30, 90] as const;
const ACTIVITY_DAY_MS = 24 * 60 * 60 * 1000;

export function buildDailyActivity(dayCounts: Record<string, number>, endMs: number, days = ACTIVITY_WINDOW_DAYS): ActivityPoint[] {
  const out: ActivityPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(endMs - i * ACTIVITY_DAY_MS).toISOString().slice(0, 10); // UTC day
    out.push({ date: key, answers: dayCounts[key] ?? 0 });
  }
  return out;
}

/** Minimum answers, in the default window, for the chart to be worth homepage space. */
export const ACTIVITY_MIN_TOTAL = 10;
/** Minimum days-with-activity so a single spike or flat line is hidden, but a genuine
 *  low-but-multi-day pattern still shows. */
export const ACTIVITY_MIN_ACTIVE_DAYS = 2;

/** Is the answers-over-time series worth showing? Evaluated over the chart's DEFAULT
 *  window (30d): it must have real activity spread across ≥2 days AND clear a small
 *  total floor. A flat/near-empty/single-spike series is hidden entirely; a modest
 *  but genuine multi-day pattern is kept (low volume alone never hides it). Pure. */
export function activityWorthShowing(points: ActivityPoint[], windowDays = 30): boolean {
  const w = points.slice(-windowDays);
  const activeDays = w.reduce((n, p) => n + (p.answers > 0 ? 1 : 0), 0);
  const total = w.reduce((a, p) => a + p.answers, 0);
  return activeDays >= ACTIVITY_MIN_ACTIVE_DAYS && total >= ACTIVITY_MIN_TOTAL;
}

// ── Reports (governance-gated; V1 has no per-caller listing → always null) ────
export type ReportLite = { id: string; title: string; dateLabel: string | null; href: string };

// ── The full payload ─────────────────────────────────────────────────────────
export type DiscoverDashboardData = {
  context: { organisationName: string | null; unrestricted: boolean };
  /** How much research the caller has — the page adapts to it (light/empty users get
   *  a useful page led by Fanometrix content, not a wall of sparse tiles). */
  accountShape: AccountShape;
  /** The single "Did you know?" hero — a genuinely STRONG insight, or null (then Live
   *  Now / Fanometrix content / activity leads). Never a weak/generic finding. */
  hero: FeaturedFinding | null;
  /** Actively-collecting surveys — the section is omitted when empty. */
  liveNow: LiveSurvey[];
  /** Orientation numbers (never the hero of the page). */
  glance: { surveys: number; answers: number; live: number; analyses: number };
  /** Latest insights — a mixed, deduplicated feed (analysis + strong findings + raw
   *  result distributions), MINUS the hero (no duplication). */
  insights: FeaturedFinding[];
  /** Governed report listing, or null when no per-caller report access exists yet
   *  (V1). null ⇒ the UI omits the section entirely; [] ⇒ caller has none ⇒ omit. */
  reports: ReportLite[] | null;
  /** Answers-per-day for the last ACTIVITY_WINDOW_DAYS (continuous, zero-filled),
   *  or null when there is no timestamped answer activity to show (UI hides it). */
  researchActivity: { points: ActivityPoint[] } | null;
  /** Latest activity — capped, secondary to intelligence. */
  activity: ResearchFeedItem[];
  /** Compact discovery columns. */
  explore: { surveys: ExploreItem[]; studies: ExploreItem[] };
  /** Full accessible totals (for "View all" affordances), independent of caps. */
  totals: { surveys: number; studies: number };
};
