// ── Survey Studio — Analysis STRESS FIXTURE (QA only, pure) ──────────────────
// A hermetic synthetic Study in the SAME governed aggregate shape Analysis consumes.
// It is deliberately hard: 6 surveys (market/publisher audiences), 12 questions, 100+
// evidence items, engineered to contain a clear positive, a clear negative, a mixed
// result, a boring distribution, a trivial group difference, a MATERIAL group
// difference, a leader reversal, a cross-question pattern, an apparent contradiction,
// an important minority, an obvious majority, multi-survey consistency, a single-survey
// outlier, materially different bases, and two non-comparable look-alike questions.
// No production data. Used by the stress test + unit tests.

import type { StudyResultGroup, StudyResultSource } from "@/lib/studio/study-results";
import type { OptionResult } from "@/lib/studio/survey-results";

type Sv = { id: string; name: string };
export const STRESS_SURVEYS: Sv[] = [
  { id: "s1", name: "UK · FotMob" }, { id: "s2", name: "DE · FotMob" }, { id: "s3", name: "UK · LiveScore" },
  { id: "s4", name: "FR · OneFootball" }, { id: "s5", name: "ES · Publisher" }, { id: "s6", name: "IT · Publisher" },
];

const opt = (id: string, label: string, count: number, base: number): OptionResult => ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });

/** Build one group. perSurvey[i] = option counts for STRESS_SURVEYS[i] (null = question
 *  not asked in that survey). comparability "combined" pools the sources. */
function mkGroup(key: string, label: string, comparability: StudyResultGroup["comparability"], optLabels: string[], perSurvey: (number[] | null)[], qi: number): StudyResultGroup {
  const ids = optLabels.map((_, i) => String(i + 1));
  const sources: StudyResultSource[] = [];
  STRESS_SURVEYS.forEach((sv, si) => {
    const counts = perSurvey[si];
    if (!counts) return;
    const base = counts.reduce((a, b) => a + b, 0);
    sources.push({ surveyId: sv.id, surveyName: sv.name, questionIndex: qi, questionId: key, canonicalQuestionKey: key, label, resultMode: "studio_native", completedResponses: base, base, shown: null, displayLanguage: "en", options: ids.map((id, oi) => opt(id, optLabels[oi], counts[oi], base)) });
  });
  let combined = null as StudyResultGroup["combined"];
  if (comparability === "combined") {
    const totals = ids.map((_, oi) => sources.reduce((a, s) => a + s.options[oi].count, 0));
    const base = totals.reduce((a, b) => a + b, 0);
    combined = { base, sourceCount: sources.length, options: ids.map((id, oi) => opt(id, optLabels[oi], totals[oi], base)) };
  }
  return { canonicalQuestionKey: key, label, comparability, combined, sources };
}

// Six audiences, each ~n per question. Counts chosen to engineer the scenarios noted.
export function buildStressStudy(): { study: { id: string; name: string; objective: string | null; surveyCount: number; completedResponses: number; surveyIds: string[] }; resultGroups: StudyResultGroup[] } {
  const groups: StudyResultGroup[] = [
    // Q1 CLEAR POSITIVE overall fit, but s4 (FR) MATERIALLY negative (material group diff).
    mkGroup("q_fit", "Brand X as a football sponsor — how natural is the fit?", "combined",
      ["Strong natural fit", "Relevant but unclear", "Mostly brand visibility", "Doesn't belong"],
      [[210, 110, 50, 30], [190, 120, 50, 40], [200, 120, 50, 30], [40, 70, 90, 200], [195, 120, 55, 30], [185, 125, 55, 35]], 0),
    // Q2 CLEAR NEGATIVE awareness (contradiction with Q1: good fit but low awareness).
    mkGroup("q_aware", "How aware are you of Brand X's football sponsorship?", "combined",
      ["Very aware", "Somewhat aware", "Barely aware", "Never noticed it"],
      [[60, 100, 120, 120], [55, 95, 130, 120], [50, 100, 125, 125], [45, 90, 130, 135], [60, 100, 120, 120], [55, 100, 120, 125]], 1),
    // Q3 High stated importance of sustainability.
    mkGroup("q_sust_importance", "How important is sustainability to you in football sponsorship?", "combined",
      ["Very important", "Important", "Neutral", "Not important"],
      [[230, 130, 30, 10], [240, 120, 30, 10], [225, 135, 30, 10], [235, 125, 30, 10], [230, 130, 30, 10], [228, 132, 30, 10]], 2),
    // Q4 LOW appeal of sustainability-led activation (CONTRADICTION with Q3).
    mkGroup("q_sust_activation", "How appealing is a sustainability-led sponsorship activation to you?", "combined",
      ["Very appealing", "Somewhat", "Not really", "Not at all"],
      [[45, 95, 140, 120], [40, 90, 145, 125], [42, 100, 140, 118], [44, 92, 140, 124], [46, 96, 138, 120], [43, 98, 140, 119]], 3),
    // Q5 LEADER REVERSAL: rewards leads in some audiences, experiences in others.
    mkGroup("q_benefit", "What should a sponsor offer fans?", "combined",
      ["Rewards and benefits", "Access to experiences", "Exclusive content", "Community investment"],
      [[170, 120, 60, 50], [110, 190, 60, 40], [175, 115, 60, 50], [105, 195, 55, 45], [165, 125, 60, 50], [115, 185, 55, 45]], 4),
    // Q6 MIXED overall sentiment.
    mkGroup("q_sentiment", "Overall, how do you feel about Brand X in football?", "combined",
      ["Positive", "Neutral", "Negative"],
      [[150, 140, 110], [140, 150, 110], [150, 140, 110], [120, 140, 140], [150, 140, 110], [145, 145, 110]], 5),
    // Q7 BORING near-uniform distribution (no story).
    mkGroup("q_boring", "Which matchday moment do you enjoy most?", "combined",
      ["Kick-off", "Half-time", "Goals", "Final whistle"],
      [[100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100], [100, 100, 100, 100]], 6),
    // Q8 TRIVIAL group difference (31% vs 33% on the leader, otherwise identical).
    mkGroup("q_trivial", "Do you follow the sponsor's social channels?", "combined",
      ["Yes", "No", "Not sure"],
      [[124, 200, 76], [132, 196, 72], [125, 199, 76], [126, 198, 76], [124, 200, 76], [127, 197, 76]], 7),
    // Q9 IMPORTANT MINORITY: small "would pay a premium" but commercially important.
    mkGroup("q_premium", "Would you pay a premium for a product tied to this sponsorship?", "combined",
      ["Definitely", "Maybe", "No"],
      [[32, 120, 248], [30, 118, 252], [34, 122, 244], [28, 116, 256], [33, 121, 246], [31, 119, 250]], 8),
    // Q10 OBVIOUS MAJORITY (large but uninteresting).
    mkGroup("q_watch", "Do you watch live football regularly?", "combined",
      ["Yes", "No"],
      [[350, 50], [345, 55], [352, 48], [340, 60], [350, 50], [348, 52]], 9),
    // Q11 SINGLE-SURVEY OUTLIER: s4 very different from the consistent others.
    mkGroup("q_trust", "How much do you trust brands that sponsor football?", "combined",
      ["A lot", "Somewhat", "A little", "Not at all"],
      [[150, 160, 60, 30], [148, 162, 60, 30], [150, 158, 62, 30], [40, 80, 120, 160], [150, 160, 60, 30], [149, 161, 60, 30]], 10),
    // Q12a & Q12b NON-COMPARABLE look-alikes (different canonical keys, similar wording).
    mkGroup("q_expect_a", "What do you most want from a football sponsor?", "separate",
      ["Save me money", "Better experiences", "Support the game"],
      [[130, 160, 110], null, null, null, null, null], 11),
    mkGroup("q_expect_b", "What should a football sponsor provide?", "separate",
      ["Discounts", "Experiences", "Grassroots funding", "Content"],
      [null, [90, 140, 90, 60], null, null, null, null], 12),
  ];
  const completedResponses = 2400; // operational total across audiences (illustrative)
  return {
    study: { id: "stress", name: "Brand X Football Perception Study", objective: null, surveyCount: 6, completedResponses, surveyIds: STRESS_SURVEYS.map((s) => s.id) },
    resultGroups: groups,
  };
}

export const STRESS_OBJECTIVE =
  "Evaluate whether Brand X has a credible role in football, understand what drives positive and negative perceptions, identify how perceptions differ across market and publisher audiences, and determine the strongest opportunities for the brand to create value for fans.";
