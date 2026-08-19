// ── Benchmark 002 — NorthAudio wireless earbuds post-purchase survey (FROZEN) ──
// EVAL-ONLY. A materially-different study from FedEx (consumer electronics, not
// sports sponsorship) chosen to stress ORDINAL satisfaction/likelihood recodes and
// a no-dominant-option nominal question — methodological features FedEx did not
// stress. Realistic (author-constructed) governed source; n=320, single wave.
//
// IMMUTABLE during Stage 5R.9. A hash test freezes these counts.

export type Bench002Option = { id: string; label: string; count: number };
export type Bench002Question = { key: string; label: string; base: number; options: Bench002Option[] };

export const PRODUCT_FEEDBACK_002 = {
  studyId: "product-feedback-002",
  label: "NorthAudio Wireless Earbuds — Post-Purchase Survey",
  base: 320,
  objective: "Understand how buyers feel about the NorthAudio earbuds, whether they would recommend them, and what most limits everyday use, to guide the product roadmap.",
  questions: [
    {
      key: "q_satisfaction", label: "Overall, how satisfied are you with the earbuds?", base: 320,
      options: [
        { id: "very_satisfied",    label: "Very satisfied",     count: 96 },
        { id: "satisfied",         label: "Satisfied",          count: 118 },
        { id: "neutral",           label: "Neither",            count: 54 },
        { id: "dissatisfied",      label: "Dissatisfied",       count: 32 },
        { id: "very_dissatisfied", label: "Very dissatisfied",  count: 20 },
      ],
    },
    {
      key: "q_blocker", label: "What most limits how much you use them?", base: 320,
      options: [
        { id: "battery_life",  label: "Battery life",        count: 92 },
        { id: "comfort",       label: "Comfort / fit",       count: 84 },
        { id: "connectivity",  label: "Bluetooth dropouts",  count: 70 },
        { id: "app_issues",    label: "Companion app bugs",  count: 74 },
      ],
    },
    {
      key: "q_recommend", label: "How likely are you to recommend them to a friend?", base: 320,
      options: [
        { id: "definitely", label: "Definitely would", count: 90 },
        { id: "probably",   label: "Probably would",   count: 122 },
        { id: "unsure",     label: "Not sure",         count: 70 },
        { id: "unlikely",   label: "Probably would not", count: 38 },
      ],
    },
  ] as Bench002Question[],
} as const;

/** A stable, order-insensitive canonical serialization for hashing. */
export function bench002Canonical(): string {
  return JSON.stringify({
    id: PRODUCT_FEEDBACK_002.studyId, base: PRODUCT_FEEDBACK_002.base,
    q: PRODUCT_FEEDBACK_002.questions.map((q) => ({ k: q.key, b: q.base, o: q.options.map((o) => [o.id, o.count]) })),
  });
}
