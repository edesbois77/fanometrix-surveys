// ── Survey Studio — Manage → Survey → Results (pure) ─────────────────────────
// "What are respondents telling us?" — QUESTION-BASED descriptive results derived
// from the survey's ACTUAL ordered questions (1–5), never a q1/q2/q3 assumption.
//
// Canonical sources (settled data contract):
//   • ANSWER DISTRIBUTIONS + ANSWERED ← response_answers (answer_value = the
//     canonical option id as a string; partials included; real-only). Aggregated
//     by (question_index, option id) so a translated label never fragments a count.
//   • QUESTION SHOWN ← survey events: QUESTION_1_SHOWN = Q1 shown; QUESTION_k_REACHED
//     = Qk shown (k = 2..5). One dashboard_event_counts call supplies all.
//     NOT SURVEY_START — that means "the first answer was SELECTED" and always has
//     (see lib/survey-events.ts). Using it as "Q1 shown" understated the shown base
//     and made every per-question completion rate wrong. QUESTION_1_SHOWN is absent
//     from all pre-2026-08 history, so `shown` correctly reads UNAVAILABLE (null)
//     for historical surveys rather than a fabricated number.
//   • FULL SURVEY COMPLETION is a SEPARATE metric (vw_campaign_stats) — NEVER
//     summed with response_answers.
//
// This module is pure: it consumes resolved counts and computes distributions,
// answered, shown and question-completion. No DB, no q-position assumptions.

import type { LocalisedQuestion, LocalisedText, LangCode } from "@/lib/survey-locale";
import { questionShownEvent } from "@/lib/survey-events";

// ── Question shown (canonical events only) ───────────────────────────────────
/** The canonical "shown" event for a 0-indexed question: Q1 = QUESTION_1_SHOWN,
 *  Qk = QUESTION_k_REACHED (k = qi+1, for qi ≥ 1). Delegates to the one event
 *  vocabulary so a renderer and a reader can never disagree. */
export const shownEventFor = questionShownEvent;

const nonNeg = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/** Per-question shown counts (index-aligned to the survey's questions). */
export function mapShownCounts(rows: { event_type: string; event_count: number }[], questionCount: number): number[] {
  const m = new Map(rows.map((r) => [r.event_type, nonNeg(r.event_count)]));
  return Array.from({ length: Math.max(0, questionCount) }, (_, qi) => m.get(shownEventFor(qi)) ?? 0);
}

// ── Answer aggregation (by canonical option identity) ────────────────────────
export type AnswerRow = { question_index: number; answer_value: string };

/** Group answers → question_index → (option id → count). Partials included; the
 *  key is the canonical option id, so translations never split a count. */
export function aggregateAnswers(rows: AnswerRow[]): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  for (const r of rows) {
    if (!Number.isInteger(r.question_index) || typeof r.answer_value !== "string") continue;
    const q = out.get(r.question_index) ?? new Map<string, number>();
    q.set(r.answer_value, (q.get(r.answer_value) ?? 0) + 1);
    out.set(r.question_index, q);
  }
  return out;
}

function resolveLabel(text: LocalisedText, lang: string): string {
  const t = text as Record<string, string>;
  return t[lang] ?? t[lang as LangCode] ?? t.en ?? Object.values(t)[0] ?? "";
}

// ── Per-question results ─────────────────────────────────────────────────────
export type OptionResult = { optionId: string; label: string; count: number; percentage: number | null };
export type QuestionResult = {
  questionIndex: number;
  questionId: string;
  text: string;
  /** Respondents who reached/saw this question (from events). NULL = unavailable
   *  (e.g. a historical survey with no question-level instrumentation) — NOT zero. */
  shown: number | null;
  /** Valid answers recorded for this question (the distribution base). */
  answered: number;
  /** answered ÷ shown, or null when shown is unavailable or 0 (never divide by zero). */
  completionRate: number | null;
  /** n used for the distribution = answered. */
  base: number;
  options: OptionResult[];
};

/**
 * Build the ordered per-question results. Distribution counts come ONLY from the
 * survey's canonical options (so percentages sum to 100 and stray/legacy values
 * never distort the base). `shown` is index-aligned; `displayLang` selects the
 * label language without changing any count (counts are by option id).
 */
export function buildQuestionResults(
  questions: LocalisedQuestion[],
  shown: (number | null)[],
  aggregated: Map<number, Map<string, number>>,
  displayLang: string,
): QuestionResult[] {
  return questions.map((q, qi) => {
    const counts = aggregated.get(qi) ?? new Map<string, number>();
    const options: OptionResult[] = q.options.map((o) => ({
      optionId: String(o.id),
      label: resolveLabel(o.text, displayLang),
      count: counts.get(String(o.id)) ?? 0,
      percentage: null, // filled below once base is known
    }));
    const base = options.reduce((a, o) => a + o.count, 0);
    for (const o of options) o.percentage = base > 0 ? o.count / base : null;
    // `?? null` (not `?? 0`) so an ABSENT/undefined shown stays unavailable, while a
    // genuine 0 (Studio-native, nobody shown) stays 0. null = unavailable, never 0.
    const s = shown[qi] ?? null;
    return {
      questionIndex: qi,
      questionId: q.id,
      text: resolveLabel(q.text, displayLang),
      shown: s,
      answered: base,
      completionRate: s != null && s > 0 ? base / s : null,
      base,
      options,
    };
  });
}

// ── Legacy (historical completed) answers — read-time compatibility ──────────
// Historical Surveys pre-date response_answers: their answers live in the completed
// `responses.q1/q2/q3` columns (canonical option ids stored as strings). This turns
// those rows into the SAME AnswerRow shape the Studio-native path aggregates, so ONE
// distribution engine serves both. Only q1..q3 are ever read — Q4/Q5 are never
// fabricated. A stored value that matches no canonical option id is left out of the
// distribution (never silently mis-mapped).
export function legacyAnswerRows(rows: Record<string, unknown>[], questionCount: number): AnswerRow[] {
  const cols = ["q1", "q2", "q3"].slice(0, Math.max(0, Math.min(3, questionCount)));
  const out: AnswerRow[] = [];
  for (const r of rows) {
    cols.forEach((c, qi) => {
      const v = r[c];
      if (typeof v === "string" && v) out.push({ question_index: qi, answer_value: v });
      else if (typeof v === "number") out.push({ question_index: qi, answer_value: String(v) });
    });
  }
  return out;
}

// ── Filters (reduce to a permitted campaign-slug subset) ─────────────────────
export type FilterableCampaign = {
  campaign_id: string;
  publisher_org_id: string | null;
  market: string | null;
  country_code: string | null;
  survey_language: string | null;
};
export type ResultsFilters = { publisher?: string | null; market?: string | null; campaign?: string | null; language?: string | null };

/** The campaign slugs matching the active filters — always within the ALREADY
 *  owner-permitted campaign set passed in. Empty filters → all permitted slugs. */
export function filterCampaignSlugs(campaigns: FilterableCampaign[], f: ResultsFilters): string[] {
  return campaigns
    .filter((c) =>
      (!f.publisher || c.publisher_org_id === f.publisher) &&
      (!f.market || c.market === f.market || c.country_code === f.market) &&
      (!f.campaign || c.campaign_id === f.campaign) &&
      (!f.language || c.survey_language === f.language))
    .map((c) => c.campaign_id);
}

export type FilterOptions = {
  publishers: { id: string; label: string }[];
  markets: { id: string; label: string }[];
  campaigns: { id: string; label: string }[];
  languages: { id: string; label: string }[];
};

/** Distinct filter options from the survey's permitted campaigns. */
export function buildFilterOptions(campaigns: FilterableCampaign[], publisherName: (id: string) => string): FilterOptions {
  const uniq = <T,>(arr: T[], key: (t: T) => string) => {
    const seen = new Set<string>(); const out: T[] = [];
    for (const t of arr) { const k = key(t); if (k && !seen.has(k)) { seen.add(k); out.push(t); } }
    return out;
  };
  return {
    publishers: uniq(campaigns.map((c) => c.publisher_org_id).filter((x): x is string => !!x), (x) => x).map((id) => ({ id, label: publisherName(id) })),
    markets: uniq(campaigns.map((c) => c.market ?? c.country_code).filter((x): x is string => !!x), (x) => x).map((m) => ({ id: m, label: m })),
    campaigns: campaigns.map((c) => ({ id: c.campaign_id, label: `${publisherName(c.publisher_org_id ?? "")} · ${c.market ?? c.country_code ?? ""}`.trim() })),
    languages: uniq(campaigns.map((c) => c.survey_language).filter((x): x is string => !!x), (x) => x).map((l) => ({ id: l, label: l.toUpperCase() })),
  };
}
