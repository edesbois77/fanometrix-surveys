// ── Survey Studio — FedEx UCL QA FIXTURE (QA only, pure, no DB, no prod data write) ──
// A hermetic rebuild of the two real FedEx UCL Sponsorship 26/27 surveys (n=196 + n=78,
// combined n=274) in the SAME governed aggregate shape Analysis consumes. Numbers are the
// real governed Study Results (see ~/Downloads/FedEx-UCL-Study-Survey-Results.csv). Used by
// the FedEx capability QA harness and control comparison ONLY — never by production paths.

import type { StudyResultGroup, StudyResultSource } from "@/lib/studio/study-results";
import type { OptionResult } from "@/lib/studio/survey-results";

export const FEDEX_OBJECTIVE =
  "Understand how football fans perceive FedEx as a UEFA Champions League sponsor, and what sponsors could offer fans, to guide FedEx's UCL sponsorship activation.";

const opt = (id: string, label: string, count: number, base: number): OptionResult => ({ optionId: id, label, count, percentage: base > 0 ? count / base : null });

function src(id: string, name: string, key: string, label: string, labels: Record<string, string>, counts: Record<string, number>): StudyResultSource {
  const base = Object.values(counts).reduce((a, b) => a + b, 0);
  return { surveyId: id, surveyName: name, questionIndex: 0, questionId: key, canonicalQuestionKey: key, label, resultMode: "historical", completedResponses: base, base, shown: null, displayLanguage: "en", options: Object.keys(labels).map((oid) => opt(oid, labels[oid], counts[oid] ?? 0, base)) };
}

function combinedOf(labels: Record<string, string>, base: number, counts: Record<string, number>): StudyResultGroup["combined"] {
  return { base, sourceCount: 2, options: Object.keys(labels).map((oid) => opt(oid, labels[oid], counts[oid] ?? 0, base)) };
}

// ── Q1 — FedEx as a Champions League sponsor? ────────────────────────────────
const Q1 = { "1": "Strong natural fit", "2": "Relevant but unclear", "3": "Mostly brand visibility", "4": "Never noticed them" };
const q1: StudyResultGroup = {
  canonicalQuestionKey: "q_fit", label: "FedEx as a Champions League sponsor?", comparability: "combined",
  combined: combinedOf(Q1, 274, { "1": 92, "2": 85, "3": 29, "4": 68 }),
  sources: [
    src("s1", "Survey 1", "q_fit", "FedEx as a Champions League sponsor?", Q1, { "1": 62, "2": 58, "3": 23, "4": 53 }),
    src("s2", "Survey v2", "q_fit", "FedEx as a Champions League sponsor?", Q1, { "1": 30, "2": 27, "3": 6, "4": 15 }),
  ],
};

// ── Q2 — What should sponsors offer fans? ────────────────────────────────────
const Q2 = { "1": "Exclusive access", "2": "Rewards and benefits", "3": "Better fan experiences", "4": "Investment in grassroots" };
const q2: StudyResultGroup = {
  canonicalQuestionKey: "q_offer", label: "What should sponsors offer fans?", comparability: "combined",
  combined: combinedOf(Q2, 274, { "1": 59, "2": 100, "3": 60, "4": 55 }),
  sources: [
    src("s1", "Survey 1", "q_offer", "What should sponsors offer fans?", Q2, { "1": 41, "2": 66, "3": 41, "4": 48 }),
    src("s2", "Survey v2", "q_offer", "What should sponsors offer fans?", Q2, { "1": 18, "2": 34, "3": 19, "4": 7 }),
  ],
};

// ── Q3 — How could FedEx help fans most? ─────────────────────────────────────
const Q3 = { "1": "Access to experiences", "2": "Connecting football fans", "3": "Exclusive football content", "4": "Supporting local communities" };
const q3: StudyResultGroup = {
  canonicalQuestionKey: "q_help", label: "How could FedEx help fans most?", comparability: "combined",
  combined: combinedOf(Q3, 274, { "1": 90, "2": 67, "3": 58, "4": 59 }),
  sources: [
    src("s1", "Survey 1", "q_help", "How could FedEx help fans most?", Q3, { "1": 61, "2": 49, "3": 47, "4": 39 }),
    src("s2", "Survey v2", "q_help", "How could FedEx help fans most?", Q3, { "1": 29, "2": 18, "3": 11, "4": 20 }),
  ],
};

export function buildFedexStudy() {
  return {
    study: { id: "fedex-ucl", name: "FedEx UCL Sponsorship 26/27", objective: FEDEX_OBJECTIVE, surveyCount: 2, completedResponses: 274, surveyIds: ["s1", "s2"] },
    resultGroups: [q1, q2, q3] as StudyResultGroup[],
  };
}

// ── Real per-country distributions (pooled across both surveys; from live probe) ──
// UK≈121, France 51, Germany 44, Spain 35, Italy 22. Used to exercise the AUDIENCE layer.
import type { SegmentQuestion } from "@/lib/studio/study-segments";
const COUNTRY = { FR: "France", DE: "Germany", IT: "Italy", ES: "Spain", UK: "the UK" };
function segGroup(key: keyof typeof COUNTRY, labels: Record<string, string>, counts: Record<string, number>) {
  const base = Object.values(counts).reduce((a, b) => a + b, 0);
  return { key, label: COUNTRY[key], base, options: Object.keys(labels).map((oid) => opt(oid, labels[oid], counts[oid] ?? 0, base)) };
}
function segQ(key: string, question: string, labels: Record<string, string>, combined: StudyResultGroup["combined"], perCountry: Record<keyof typeof COUNTRY, Record<string, number>>): SegmentQuestion {
  return {
    canonicalQuestionKey: key, question, dimension: "country",
    overall: combined!.options.map((o) => ({ optionId: String(o.optionId), label: o.label, count: o.count, percentage: o.percentage })),
    overallBase: combined!.base,
    groups: (Object.keys(perCountry) as (keyof typeof COUNTRY)[]).map((c) => segGroup(c, labels, perCountry[c])),
  };
}

export function buildFedexSegments(): SegmentQuestion[] {
  return [
    segQ("q_fit", "FedEx as a Champions League sponsor?", Q1, q1.combined, {
      FR: { "1": 20, "2": 15, "3": 6, "4": 10 }, DE: { "1": 9, "2": 12, "3": 5, "4": 18 },
      IT: { "1": 9, "2": 4, "3": 3, "4": 6 }, ES: { "1": 9, "2": 13, "3": 2, "4": 11 }, UK: { "1": 45, "2": 41, "3": 12, "4": 23 },
    }),
    segQ("q_offer", "What should sponsors offer fans?", Q2, q2.combined, {
      FR: { "1": 12, "2": 16, "3": 11, "4": 12 }, DE: { "1": 10, "2": 17, "3": 9, "4": 8 },
      IT: { "1": 5, "2": 9, "3": 1, "4": 7 }, ES: { "1": 8, "2": 9, "3": 6, "4": 12 }, UK: { "1": 24, "2": 48, "3": 33, "4": 16 },
    }),
    segQ("q_help", "How could FedEx help fans most?", Q3, q3.combined, {
      FR: { "1": 18, "2": 7, "3": 11, "4": 15 }, DE: { "1": 14, "2": 12, "3": 14, "4": 4 },
      IT: { "1": 9, "2": 4, "3": 4, "4": 5 }, ES: { "1": 13, "2": 8, "3": 7, "4": 7 }, UK: { "1": 36, "2": 36, "3": 22, "4": 27 },
    }),
  ];
}
