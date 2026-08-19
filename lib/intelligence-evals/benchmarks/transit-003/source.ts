// ── Benchmark 003 — MetroLink commuter experience survey (FROZEN) ──────────────
// EVAL-ONLY. A materially-different domain from FedEx (sponsorship) and NorthAudio
// (earbuds): urban public transport. Realistic (author-constructed) governed
// source; n=410, single wave. Chosen to exercise Stage 5R.9R ordinal capability on
// UNSEEN data: a 5-point ordinal reliability scale WITH a neutral midpoint, a
// 4-point ordinal recommendation scale with NO neutral midpoint, and two nominal
// questions where the largest option is not the story.
//
// IMMUTABLE during Stage 5R.9B (a hash test freezes these counts).

export type Bench003Option = { id: string; label: string; count: number };
export type Bench003Question = { key: string; label: string; base: number; options: Bench003Option[] };

export const TRANSIT_003 = {
  studyId: "transit-003",
  label: "MetroLink Commuter Experience Survey",
  base: 410,
  objective: "Understand how MetroLink commuters rate reliability, whether they would recommend the service, and why they use it, to guide the service-improvement roadmap.",
  questions: [
    {
      key: "q_reliability", label: "How reliable do you find MetroLink services?", base: 410,
      options: [
        { id: "very_reliable",   label: "Very reliable",       count: 84 },
        { id: "reliable",        label: "Reliable",            count: 149 },
        { id: "mixed",           label: "Mixed / it depends",  count: 77 },
        { id: "unreliable",      label: "Unreliable",          count: 61 },
        { id: "very_unreliable", label: "Very unreliable",     count: 39 },
      ],
    },
    {
      key: "q_reason", label: "What is the main reason you use MetroLink?", base: 410,
      options: [
        { id: "cost",          label: "It is cheaper",         count: 112 },
        { id: "no_car",        label: "I have no car",         count: 98 },
        { id: "speed",         label: "It is faster",          count: 92 },
        { id: "environmental", label: "Environmental reasons", count: 68 },
        { id: "convenience",   label: "It is convenient",      count: 40 },
      ],
    },
    {
      key: "q_recommend", label: "How likely are you to recommend MetroLink to a colleague?", base: 410,
      options: [
        { id: "definitely",     label: "Definitely would",     count: 76 },
        { id: "likely",         label: "Likely to",            count: 161 },
        { id: "unlikely",       label: "Unlikely to",          count: 118 },
        { id: "definitely_not", label: "Definitely would not", count: 55 },
      ],
    },
  ] as Bench003Question[],
} as const;

export function bench003Canonical(): string {
  return JSON.stringify({
    id: TRANSIT_003.studyId, base: TRANSIT_003.base,
    q: TRANSIT_003.questions.map((q) => ({ k: q.key, b: q.base, o: q.options.map((o) => [o.id, o.count]) })),
  });
}
