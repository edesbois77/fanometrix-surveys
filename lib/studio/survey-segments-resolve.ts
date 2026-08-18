// ── Survey Studio → Findings — segment evidence resolver (server, read-only) ─
// Builds per-question distributions broken down by MARKET (respondent country)
// and DEVICE for one survey, over an already-authorised, filter-narrowed set of
// campaign slugs. It REUSES the settled distribution primitives (aggregateAnswers /
// buildQuestionResults / legacyAnswerRows) per segment group — no parallel maths —
// and returns SegmentQuestion[] for buildSegmentDerived, which owns the base gate
// (≥30 per group, ≥2 groups). It reads aggregate rows only; never respondent vectors.
//
// Data reality: studio-native answers (response_answers) carry `country` but NO
// device, so device is resolved only from completed `responses` rows (historical
// AND, where present, studio-native completions). Market uses response_answers.
// country when studio-native, else responses.country.

import { supabaseAdmin } from "@/lib/supabase-admin";
import { aggregateAnswers, buildQuestionResults, legacyAnswerRows, type AnswerRow } from "./survey-results";
import type { LocalisedQuestion } from "@/lib/survey-locale";
import type { SegmentQuestion, SegmentGroupDist } from "./study-segments";
import type { SurveySegmentEvidence } from "./survey-findings-engine";

type Group = { key: string; label: string; rows: AnswerRow[] };

function buildSegmentQuestions(
  questions: LocalisedQuestion[],
  dimension: "market" | "device",
  groups: Group[],
  displayLang: string,
): SegmentQuestion[] {
  if (groups.length < 2) return [];
  const overall = buildQuestionResults(questions, questions.map(() => null), aggregateAnswers(groups.flatMap((g) => g.rows)), displayLang);
  const perGroup = groups.map((g) => ({ g, res: buildQuestionResults(questions, questions.map(() => null), aggregateAnswers(g.rows), displayLang) }));
  return questions
    .map((_, qi): SegmentQuestion => {
      const o = overall[qi];
      const gd: SegmentGroupDist[] = perGroup.map(({ g, res }) => ({ key: g.key, label: g.label, base: res[qi].base, options: res[qi].options }));
      return { canonicalQuestionKey: o.questionId, question: o.text, dimension, overall: o.options, overallBase: o.base, groups: gd };
    })
    .filter((sq) => sq.overallBase > 0);
}

function groupRows(rows: Record<string, unknown>[], field: string, toAnswerRows: (r: Record<string, unknown>) => AnswerRow[]): Group[] {
  const m = new Map<string, AnswerRow[]>();
  for (const r of rows) {
    const key = String(r[field] ?? "").trim();
    if (!key) continue;
    const arr = m.get(key) ?? [];
    arr.push(...toAnswerRows(r));
    m.set(key, arr);
  }
  return [...m.entries()].map(([key, rr]) => ({ key, label: key, rows: rr }));
}

export async function resolveSurveySegmentEvidence(
  survey: { questions: LocalisedQuestion[] },
  effectiveSlugs: string[],
  mode: "studio_native" | "historical_completed_only",
  displayLang: string,
): Promise<SurveySegmentEvidence[]> {
  const questions = survey.questions;
  if (effectiveSlugs.length === 0 || questions.length === 0) return [];
  const out: SurveySegmentEvidence[] = [];

  if (mode === "studio_native") {
    // Market from response_answers.country (partial-aware, option-id valued).
    const { data } = await supabaseAdmin
      .from("response_answers").select("question_index, answer_value, country")
      .in("campaign_id", effectiveSlugs).eq("is_demo", false);
    const rows = (data ?? []) as { question_index: number; answer_value: string; country: string | null }[];
    const byCountry = new Map<string, AnswerRow[]>();
    for (const r of rows) {
      const key = (r.country ?? "").trim();
      if (!key || typeof r.answer_value !== "string") continue;
      const arr = byCountry.get(key) ?? [];
      arr.push({ question_index: r.question_index, answer_value: r.answer_value });
      byCountry.set(key, arr);
    }
    const groups = [...byCountry.entries()].map(([key, rr]) => ({ key, label: key, rows: rr }));
    const market = buildSegmentQuestions(questions, "market", groups, displayLang);
    if (market.length) out.push({ dimension: "market", questions: market });
    return out;
  }

  // Historical: completed responses.q1/q2/q3 + country + device (one query, both dims).
  const cols = ["q1", "q2", "q3"].slice(0, Math.min(3, questions.length));
  const { data } = await supabaseAdmin
    .from("responses").select([...cols, "country", "device"].join(","))
    .in("campaign_id", effectiveSlugs).eq("is_demo", false);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const toRows = (r: Record<string, unknown>) => legacyAnswerRows([r], questions.length);

  const market = buildSegmentQuestions(questions, "market", groupRows(rows, "country", toRows), displayLang);
  if (market.length) out.push({ dimension: "market", questions: market });
  const device = buildSegmentQuestions(questions, "device", groupRows(rows, "device", toRows), displayLang);
  if (device.length) out.push({ dimension: "device", questions: device });
  return out;
}
