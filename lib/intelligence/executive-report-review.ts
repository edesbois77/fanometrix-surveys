// Deterministic, read-only review aid for the Executive Report — the
// same philosophy as lib/intelligence/full-research-report-review.ts: it
// ONLY detects and surfaces, it never rewrites, repairs, regenerates,
// blocks or stores anything. These are Review Prompts for a human, not
// errors and not a failed validation. The report is completely unchanged
// by this file.
//
// Two independent, deliberately-narrow detectors, both detect-and-surface
// only (never auto-edit):
//
// 1. THEME SCOPE (flagThemeCoherence) — a theme whose name is scoped to a
//    single specific market but which includes a supporting finding about
//    a DIFFERENT market ("Brand sentiment in Spain" carrying a Germany
//    finding). A human resolves it (rename or move the finding). It does
//    NOT judge semantic coherence, author names, or detect subject-scope
//    mismatches — those are handled by the strengthened Call 1
//    collective-scope instruction.
//
// 2. CONSTRUCT COMPARABILITY (flagConstructComparability) — an Area of
//    Difference whose findings may not measure the same construct, and so
//    may not be a genuine contradiction. The dominant, detectable case: one
//    finding measures general attitude toward the subject itself (like /
//    dislike / hate the brand), while another measures sentiment about a
//    specific activity (its sponsorship / campaign / partnership) — two
//    different constructs that can both be true, so opposite valence is not
//    a contradiction. This is the strengthened Call 1 "CONSTRUCT
//    COMPARABILITY GATE"'s safety net for when generation still slips. It
//    is GENERAL (any brand/subject and any activity, no project-specific
//    logic) and conservative: it fires only when one finding is clearly a
//    subject-attitude measure and another is clearly an activity-sentiment
//    measure, and stays silent when both findings measure the same kind of
//    thing (e.g. two sponsorship-sentiment figures that genuinely disagree
//    — a real contradiction that must NOT be suppressed). Construct
//    comparability is ultimately semantic, so this never removes an Area of
//    Difference — it only surfaces a suspected one for the reviewer.
//
// Both are pure and framework-free so they run at render time from the
// report object the page already holds — no fetch, no stored field, no
// migration.
import type { ExecutiveReport } from "@/lib/intelligence/analysts/analyseExecutiveReport";

export type ExecutiveReportReviewFlag = {
  /** The theme whose name may not represent all its findings' scope. */
  theme: string;
  /** The single market the theme's NAME is scoped to. */
  themeMarket: string;
  /** The supporting findings that are about a different market than the
   * theme's name — the ones causing the suspected mismatch. */
  offending: { findingNumber: number; market: string; text: string }[];
  /** One line for the reviewer. */
  why: string;
};

// Full country names (case-insensitive) plus the two-letter market codes
// the Conversation Search findings actually use ("ES", "DE", …), matched
// case-sensitively/uppercase-only to avoid flagging incidental letter
// pairs in prose. Kept to the markets this platform's evidence actually
// carries — extend only when a real new market appears.
const MARKET_NAMES: [RegExp, string][] = [
  [/\bspain\b|\bspanish\b/i,                              "Spain"],
  [/\bgermany\b|\bgerman\b/i,                             "Germany"],
  [/\bfrance\b|\bfrench\b/i,                              "France"],
  [/\bgreat britain\b|\bunited kingdom\b|\bbritish\b/i,   "GB/UK"],
  [/\bitaly\b|\bitalian\b/i,                              "Italy"],
  [/\bnetherlands\b|\bdutch\b/i,                          "Netherlands"],
  [/\bbelgium\b|\bbelgian\b/i,                            "Belgium"],
  [/\bireland\b|\birish\b/i,                              "Ireland"],
];
const MARKET_CODES: [RegExp, string][] = [
  [/\bES\b/, "Spain"], [/\bDE\b/, "Germany"], [/\bFR\b/, "France"],
  [/\bGB\b|\bUK\b/, "GB/UK"], [/\bIT\b/, "Italy"], [/\bNL\b/, "Netherlands"],
  [/\bBE\b/, "Belgium"], [/\bIE\b/, "Ireland"],
];

function marketsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const [re, name] of MARKET_NAMES) if (re.test(text)) out.add(name);
  for (const [re, name] of MARKET_CODES) if (re.test(text)) out.add(name);
  return out;
}

export function flagThemeCoherence(report: ExecutiveReport): ExecutiveReportReviewFlag[] {
  const out: ExecutiveReportReviewFlag[] = [];
  const findingText = (i: number) => report.key_findings[i]?.finding ?? "";

  for (const theme of report.major_themes) {
    const nameMarkets = [...marketsIn(theme.theme)];
    // Only a theme NAMED after exactly one specific market can have a
    // "named too narrowly" mismatch. Zero markets in the name (a subject
    // theme, or an honestly cross-market name like "Regional sentiment")
    // or two-plus markets in the name (already cross-market) are both left
    // alone — that is the conservative bar.
    if (nameMarkets.length !== 1) continue;
    const themeMarket = nameMarkets[0];

    const offending = theme.supporting_findings
      .map(fi => ({ fi, text: findingText(fi), markets: marketsIn(findingText(fi)) }))
      // A finding is offending only if it names a market AND that set does
      // not include the theme's own market — i.e. it is clearly about a
      // DIFFERENT market. A finding naming no market (Gen Z stats, overall
      // figures) is legitimate general context under a market theme and is
      // never flagged.
      .filter(f => f.markets.size > 0 && !f.markets.has(themeMarket))
      .map(f => ({ findingNumber: f.fi + 1, market: [...f.markets].join(", "), text: f.text }));

    if (offending.length) {
      const others = [...new Set(offending.map(o => o.market))].join(", ");
      out.push({
        theme: theme.theme,
        themeMarket,
        offending,
        why: `This theme is named for ${themeMarket}, but ${offending.length === 1 ? "a supporting Key Finding is" : "supporting Key Findings are"} about ${others}. Consider renaming the theme to reflect its full cross-market scope, or moving the out-of-scope finding to its own theme — or leave it if the grouping is deliberate.`,
      });
    }
  }

  return out;
}

// ── Construct comparability (Area of Difference) detector ──────────────

export type ExecutiveReportConstructFlag = {
  /** The Area of Difference finding text being questioned. */
  difference: string;
  /** One line for the reviewer explaining the suspected mismatch. */
  why: string;
  /** Each supporting finding with how it was classified, so the reviewer
   * can see exactly which two constructs are being compared. */
  findings: { findingNumber: number; construct: string; text: string }[];
};

// General, project-agnostic vocabulary. SUBJECT_ATTITUDE = how people feel
// about the brand/product/subject itself (any subject). ACTIVITY_SENTIMENT
// = sentiment about a specific activity the subject undertakes (its
// sponsorship, campaign, partnership, etc.). A finding matching the first
// but not the second is an attitude measure; one matching the second is an
// activity measure. Kept deliberately small and generic — no brand,
// market or topic names.
const SUBJECT_ATTITUDE = /\b(likes?|liking|dislikes?|dislik\w+|hate\w*|love\w*|prefer\w*|favou?rs?|favou?rable opinion|opinion of|attitude toward|how much .* like)\b/i;
const ACTIVITY_SENTIMENT = /\b(sponsorship|sponsor\w*|campaign\w*|marketing|advertis\w*|partnership\w*|initiative\w*|activation\w*|promotion\w*)\b/i;

function classifyConstruct(text: string): "subject_attitude" | "activity_sentiment" | "other" {
  const activity = ACTIVITY_SENTIMENT.test(text);
  const attitude = SUBJECT_ATTITUDE.test(text);
  // Activity sentiment takes precedence only when the finding is genuinely
  // about the activity; a finding that is about liking the brand AND names
  // no activity is a pure attitude measure. A finding that mentions the
  // activity is treated as an activity-sentiment measure (a genuine
  // same-construct pair — two activity figures — will classify both as
  // activity and therefore not trip the mismatch below).
  if (activity) return "activity_sentiment";
  if (attitude) return "subject_attitude";
  return "other";
}

export function flagConstructComparability(report: ExecutiveReport): ExecutiveReportConstructFlag[] {
  const out: ExecutiveReportConstructFlag[] = [];
  const findingText = (i: number) => report.key_findings[i]?.finding ?? "";

  for (const diff of report.areas_of_difference) {
    const classified = (diff.supporting_findings ?? []).map(fi => ({
      findingNumber: fi + 1,
      text: findingText(fi),
      construct: classifyConstruct(findingText(fi)),
    }));
    const hasAttitude = classified.some(c => c.construct === "subject_attitude");
    const hasActivity = classified.some(c => c.construct === "activity_sentiment");
    // Only surface when the two sides genuinely look like different
    // constructs — one an attitude-to-the-subject measure, the other an
    // activity-sentiment measure. Two activity figures, or two attitude
    // figures, are the same construct and are left alone (a genuine
    // contradiction must never be suppressed).
    if (hasAttitude && hasActivity) {
      out.push({
        difference: diff.finding,
        why: "This Area of Difference compares a measure of general attitude toward the subject itself (e.g. liking/disliking the brand) with a measure of sentiment about a specific activity (e.g. its sponsorship). These can measure different constructs, populations or contexts and both be true at once, so opposite sentiment directions may not be a genuine contradiction. Confirm the two findings really measure the same thing before treating this as a contradiction — if not, present them as separate or complementary findings rather than an Area of Difference.",
        findings: classified.map(c => ({
          findingNumber: c.findingNumber,
          construct: c.construct === "subject_attitude" ? "attitude to the subject" : c.construct === "activity_sentiment" ? "sentiment about an activity" : "other",
          text: c.text,
        })),
      });
    }
  }

  return out;
}
