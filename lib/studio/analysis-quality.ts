// ── Survey Analysis — deterministic QUALITY layer (pure, additive) ───────────
// The shared firewall (validateProposals/validateNarrative/validateThemes) answers
// "is the model ALLOWED to say this?". This layer answers the SECOND question:
// "is it WORTH showing to a decision-maker?". It runs AFTER the firewall, over
// already-validated proposals, using ONLY server-owned descriptive facts the run
// already computed (top option %, the leader gap in pp, base, and how many distinct
// questions a proposal cites). It NEVER introduces statistical significance, a
// benchmark, a respondent-level inference, or a causal claim — those remain the
// firewall's job and are untouched. Everything here is pure and unit-tested.
//
// Three jobs: (1) DROP ungrounded prescription (recommendations the survey did not
// test); (2) score MATERIALITY and drop generic restatement below a bar; (3) rank
// the survivors and cap them, so a run prefers 2–4 strong conclusions over filler.

// ── Resolved evidence for one proposal (computed by the caller from the refs) ─
// The service resolves each proposal's governed evidenceRefs to these primitives
// from the frozen snapshot (percentage/base/leader-gap/segment-spread) — this module
// only reasons over the primitives, so it stays free of DB and heavy types.
export type ResolvedProposalEvidence = {
  /** Highest option share cited, 0–100 (from base evidence or a leader fact). */
  topPct: number;
  /** Largest leader→runner-up (or segment spread) gap cited, in percentage points. */
  gapPP: number;
  /** Smallest answered base across cited refs (0 when unknown). */
  minBase: number;
  /** Distinct questions the proposal cites — breadth / synthesis signal. */
  distinctQuestions: number;
  /** Number of governed refs cited. */
  refCount: number;
};

/** The minimal proposal shape this layer needs — StudyAnalysisProposal satisfies it. */
export type QualityProposal = {
  displayType: string; // observation | comparison | pattern | tension | synthesis | implication
  headline: string;
  explanation: string;
  evidenceRefs: string[];
};

// ── Genericness — a "conclusion" that merely restates the absence of a signal ─
// These add almost no decision value; a near-even distribution belongs in Results,
// not a manufactured finding. Matching is on the HEADLINE (the claim).
export const GENERIC_MARKERS: RegExp[] = [
  /\bopinions?\s+(?:is|are|was|were)?\s*(?:split|divided|mixed)\b/i,
  /\bevenly\s+(?:split|divided|matched|balanced)\b/i,
  /\bno\s+(?:single|clear|strong|outright|obvious)?\s*(?:answer|option|winner|preference|consensus|majority|leader)\s+(?:dominates?|emerged?|stands?\s+out|prevail(?:s|ed)?)\b/i,
  /\bno\s+clear\s+(?:winner|preference|consensus|leader|majority|favourite|favorite)\b/i,
  /\bresponses?\s+(?:were|are)\s+(?:mixed|varied|divided|split)\b/i,
  /\bopinions?\s+(?:varied|differ(?:ed)?|were\s+divided)\b/i,
  /\bviews?\s+(?:were|are)\s+(?:mixed|split|divided|varied)\b/i,
  /\bdivided\s+response\b/i,
];
export function isGeneric(headline: string): boolean {
  return GENERIC_MARKERS.some((re) => re.test(headline));
}

// ── Prescription — a directive recommendation the survey did not test ────────
// NARROW by design: it targets action directives and commercial-leverage
// projections, NOT the interpretive language the firewall deliberately allows
// (e.g. "an opportunity to strengthen engagement"). Scans headline + explanation.
export const PRESCRIPTION_MARKERS: RegExp[] = [
  // should / must / needs to / ought to  +  an ACTION verb (the real prescriptions).
  // Deliberately NOT a bare "<actor> should" — that catches question-echoing prose
  // like "…what sponsors should OFFER" (the survey's own framing, not advice).
  /\b(?:should|must|need(?:s)?\s+to|ought\s+to|have\s+to)\s+(?:launch|invest|roll\s+out|deploy|target|run|spend|prioriti[sz]e|focus\s+on|leverage|develop|create|build|introduce|expand|increase\s+spend|boost|drive|capitalis?e|maximis?e|pursue|adopt|implement)\b/i,
  // explicit recommendation / advice framing
  /\b(?:recommend(?:s|ed|ation|ations)?|we\s+advise|it\s+is\s+advis(?:able|ed))\b/i,
  /\bstrategy\s+should\b/i,
  /\bcould\s+improve\s+(?:by|through)\b/i,
  // commercial-leverage projection ("potential to leverage/monetise the sponsorship")
  /\b(?:potential|opportunity)\s+(?:for\s+\w+\s+)?to\s+(?:leverage|capitalis?e\s+on|monetis?e|drive\s+sales|run\s+campaigns?|target\s+(?:new|specific))\b/i,
];
export function hasPrescription(text: string): boolean {
  return PRESCRIPTION_MARKERS.some((re) => re.test(text));
}

// ── Scoring components (each pure + explainable) ─────────────────────────────
export const QUALITY_MIN_SCORE = 40; // below this a proposal is dropped as low-value
export const QUALITY_MAX_KEEP = 4;   // a run shows at most this many AI conclusions
const BASE_SCORE = 15;               // a firewall-valid proposal starts here
const GENERIC_PENALTY = 35;

/** Magnitude: a strong single preference (high top share) and/or a clear lead. */
export function magnitudeScore(topPct: number, gapPP: number): number {
  const pref = topPct >= 50 ? 25 : topPct >= 40 ? 15 : topPct >= 30 ? 8 : 0;
  const lead = gapPP >= 20 ? 20 : gapPP >= 10 ? 12 : gapPP >= 5 ? 5 : 0;
  return pref + lead; // 0–45
}

/** Synthesis: connecting evidence across questions is worth more than restating one. */
export function synthesisScore(displayType: string, distinctQuestions: number): number {
  const multi = displayType === "pattern" || displayType === "tension" || displayType === "synthesis" || displayType === "comparison";
  return (multi ? 25 : 0) + (distinctQuestions >= 2 ? 10 : 0); // 0–35
}

const TOKEN = /[a-z]{4,}/g;
const OBJ_STOP = new Set(["this", "that", "with", "from", "their", "would", "should", "about", "which", "these", "those", "into", "over", "survey", "research", "understand", "measure", "assess"]);
/** A soft boost when the proposal speaks to the stated research objective. */
export function objectiveRelevance(text: string, objective: string | null): number {
  if (!objective) return 0;
  const objTokens = new Set((objective.toLowerCase().match(TOKEN) ?? []).filter((w) => !OBJ_STOP.has(w)));
  if (objTokens.size === 0) return 0;
  const prose = new Set((text.toLowerCase().match(TOKEN) ?? []));
  for (const t of objTokens) if (prose.has(t)) return 10;
  return 0;
}

export type ProposalScore = { score: number; drop: boolean; reasons: string[] };

export function scoreProposal(p: QualityProposal, ev: ResolvedProposalEvidence, objective: string | null): ProposalScore {
  const text = `${p.headline}\n${p.explanation}`;
  const reasons: string[] = [];
  // Hard drop: an ungrounded directive recommendation.
  if (hasPrescription(text)) return { score: 0, drop: true, reasons: ["ungrounded prescription/recommendation"] };

  const mag = magnitudeScore(ev.topPct, ev.gapPP);
  const syn = synthesisScore(p.displayType, ev.distinctQuestions);
  const obj = objectiveRelevance(text, objective);
  const generic = isGeneric(p.headline);
  const score = BASE_SCORE + mag + syn + obj - (generic ? GENERIC_PENALTY : 0);
  if (generic) reasons.push("generic restatement (belongs in Results, not a finding)");
  const drop = score < QUALITY_MIN_SCORE;
  if (drop && !generic) reasons.push(`below materiality bar (${score} < ${QUALITY_MIN_SCORE})`);
  return { score, drop, reasons };
}

// ── Select + rank the worth-showing survivors ────────────────────────────────
export type QualityOutcome<T extends QualityProposal> = {
  kept: T[]; // ranked strongest-first, capped
  dropped: { proposal: T; reasons: string[] }[];
};

/** Keep only the material, non-generic, non-prescriptive proposals, ranked
 *  strongest-first and capped. `resolve` maps a proposal to its server-owned
 *  evidence primitives (the caller resolves refs against the frozen snapshot).
 *  Generic type T lets the service pass StudyAnalysisProposal through unchanged. */
export function selectQualityProposals<T extends QualityProposal>(
  proposals: T[],
  resolve: (p: T) => ResolvedProposalEvidence,
  objective: string | null,
  opts: { max?: number; minScore?: number } = {},
): QualityOutcome<T> {
  const max = opts.max ?? QUALITY_MAX_KEEP;
  const scored = proposals.map((p, i) => ({ p, i, s: scoreProposal(p, resolve(p), objective) }));
  const dropped = scored.filter((x) => x.s.drop).map((x) => ({ proposal: x.p, reasons: x.s.reasons }));
  const kept = scored
    .filter((x) => !x.s.drop)
    .sort((a, b) => b.s.score - a.s.score || a.i - b.i) // strongest first; stable on ties
    .slice(0, max)
    .map((x) => x.p);
  return { kept, dropped };
}
