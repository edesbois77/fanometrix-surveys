// Rich survey observations for Analysis (Phase 1 calibration objective 3).
//
// The gatherer used to reduce a survey to its top four options above a 15% share
// and nothing else, discarding the long tail, every market, every segment and
// every cross-question relationship the survey actually measured. This turns the
// same raw responses into the full evidence base a consultant would read:
//   - every option of every question, minorities included (no share floor);
//   - where each market diverges most from the overall picture;
//   - where each fan segment diverges most on the lead question.
//
// PURE, and every figure is COMPUTED here from real counts, never written by a
// model — the same contract gather.ts holds for the crude version it replaces, so
// a claim may still only quote a number the platform calculated. Testable without
// a database.
import type { LocalisedQuestion } from "@/lib/survey-locale";

export type SurveyResponseRow = {
  q1: string | null;
  q2: string | null;
  q3: string | null;
  country: string | null;
  fan_segment: string | null;
};

/** One survey observation, ready to become a FramedItem. The observation unit is
 *  still the completed response and the dedup key is still the instrument, so
 *  every one of these draws on the SAME pool of respondents (source-contract.ts):
 *  richer evidence, not double-counted evidence. */
export type SurveyObservation = { content: string; provenance: string };

/** A market or segment must carry at least this many responses before a
 *  cross-tab off it reads as anything but noise. */
const MIN_SUBGROUP = 20;
/** Below this gap a subgroup is not meaningfully different from the whole, and
 *  reporting it as a "difference" would be reading noise as signal. */
const MIN_DIVERGENCE_PCT = 5;
/** Markets and segments to cross-tab, most responses first. */
const MAX_MARKETS = 4;
const MAX_SEGMENTS = 3;

const QUESTION_KEYS = ["q1", "q2", "q3"] as const;
type QuestionKey = (typeof QUESTION_KEYS)[number];

function resolveLabel(question: LocalisedQuestion, raw: string | null): string | null {
  if (raw == null || raw === "") return null;
  const option = question.options.find(o => o.id === Number(raw));
  return option?.text.en ?? String(raw);
}

type Dist = { answered: number; byLabel: Map<string, number> };

/** The answer distribution for one question over a set of rows: label → percent,
 *  plus how many answered (the base every percent is of). */
function distribution(rows: SurveyResponseRow[], question: LocalisedQuestion, key: QuestionKey): Dist {
  const counts = new Map<string, number>();
  let answered = 0;
  for (const r of rows) {
    const label = resolveLabel(question, r[key]);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    answered++;
  }
  const byLabel = new Map<string, number>();
  for (const [label, count] of counts) byLabel.set(label, answered ? Math.round((count / answered) * 100) : 0);
  return { answered, byLabel };
}

function topGroups(rows: SurveyResponseRow[], field: "country" | "fan_segment", limit: number): { label: string; rows: SurveyResponseRow[] }[] {
  const byGroup = new Map<string, SurveyResponseRow[]>();
  for (const r of rows) {
    const v = (r[field] ?? "").trim();
    if (!v) continue;
    const list = byGroup.get(v) ?? [];
    list.push(r);
    byGroup.set(v, list);
  }
  return [...byGroup.entries()]
    .map(([label, groupRows]) => ({ label, rows: groupRows }))
    .filter(g => g.rows.length >= MIN_SUBGROUP)
    .sort((a, b) => b.rows.length - a.rows.length)
    .slice(0, limit);
}

/** The option where a subgroup diverges most from the overall distribution, if
 *  that divergence clears the noise floor. Null when the subgroup tracks the
 *  whole. */
function widestDivergence(overall: Dist, subgroup: Dist): { label: string; subPct: number; overallPct: number } | null {
  let best: { label: string; subPct: number; overallPct: number; gap: number } | null = null;
  const labels = new Set<string>([...overall.byLabel.keys(), ...subgroup.byLabel.keys()]);
  for (const label of labels) {
    const overallPct = overall.byLabel.get(label) ?? 0;
    const subPct = subgroup.byLabel.get(label) ?? 0;
    const gap = Math.abs(subPct - overallPct);
    if (!best || gap > best.gap) best = { label, subPct, overallPct, gap };
  }
  return best && best.gap >= MIN_DIVERGENCE_PCT
    ? { label: best.label, subPct: best.subPct, overallPct: best.overallPct }
    : null;
}

/** Turn a survey's raw responses into the full set of observations Analysis
 *  should reason over. */
export function surveyObservations(opts: {
  surveyName: string;
  questions: LocalisedQuestion[];
  responses: SurveyResponseRow[];
}): SurveyObservation[] {
  const questions = opts.questions.slice(0, 3);
  const out: SurveyObservation[] = [];

  questions.forEach((question, i) => {
    if (!question) return;
    const key = QUESTION_KEYS[i];
    const questionText = question.text.en ?? `Question ${i + 1}`;
    const overall = distribution(opts.responses, question, key);
    if (overall.answered === 0) return;

    // Every option, minorities included, ranked. This IS the distribution: the
    // long tail the 15% floor used to erase is exactly where a "meaningful
    // minority" lives.
    const ranked = [...overall.byLabel.entries()].sort((a, b) => b[1] - a[1]);
    for (const [label, pct] of ranked) {
      const minorityNote = pct > 0 && pct < 15 ? " (a notable minority)" : "";
      out.push({
        content: `${pct}% of ${overall.answered} respondents chose "${label}" for "${questionText}"${minorityNote}.`,
        provenance: questionText,
      });
    }

    // Market differences: where each top market diverges most from the whole,
    // stated as a contrast so a contradiction reads as one.
    for (const market of topGroups(opts.responses, "country", MAX_MARKETS)) {
      const sub = distribution(market.rows, question, key);
      const div = widestDivergence(overall, sub);
      if (!div) continue;
      out.push({
        content: `Among ${market.label} respondents (n=${sub.answered}), "${div.label}" was chosen by ${div.subPct}% for "${questionText}", versus ${div.overallPct}% overall, the widest gap in this market.`,
        provenance: `${opts.surveyName} · ${market.label}`,
      });
    }
  });

  // Segment differences on the lead question only, to keep the segment lens from
  // swamping the market lens.
  const lead = questions[0];
  if (lead) {
    const leadText = lead.text.en ?? "Question 1";
    const overall = distribution(opts.responses, lead, "q1");
    if (overall.answered > 0) {
      for (const segment of topGroups(opts.responses, "fan_segment", MAX_SEGMENTS)) {
        const sub = distribution(segment.rows, lead, "q1");
        const div = widestDivergence(overall, sub);
        if (!div) continue;
        out.push({
          content: `Among ${segment.label} fans (n=${sub.answered}), "${div.label}" was chosen by ${div.subPct}% for "${leadText}", versus ${div.overallPct}% overall.`,
          provenance: `${opts.surveyName} · ${segment.label}`,
        });
      }
    }
  }

  return out;
}
