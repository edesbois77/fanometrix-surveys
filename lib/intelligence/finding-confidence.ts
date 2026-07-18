// Presentation-layer derivation of a finding's confidence + source diversity
// from the evidence that ALREADY supports it. This is NOT a second AI pass and
// does not change how findings are generated (docs/analysis-workspace-blueprint.md
// §2, §8.3): given a finding's existing supporting evidence, it computes a
// High/Medium/Low grade, an evidence-based rationale ("why this confidence"), the
// distinct source types, and the evidence count — purely, deterministically.
//
// Confidence is NEVER a simple average (blueprint §11.4). It weighs: evidence
// volume, relevance, per-item classifier confidence, source diversity, and
// internal agreement (sentiment split — a proxy for a contradiction until
// cross-source contradictions land). More/stronger/diverse/agreeing evidence
// raises it; thin, weak, or conflicting evidence lowers it. Source diversity is
// modelled now even though only conversations contribute today, so the surface
// expands unchanged when surveys and documents begin classifying into aspects.

export type FindingSourceType = "survey" | "conversation" | "document";
export type ConfidenceLevel = "High" | "Medium" | "Low";

export type EvidenceForConfidence = {
  type: FindingSourceType;
  relevanceScore: number | null;        // 0–1
  relevanceConfidence: string | null;   // 'High' | 'Medium' | 'Low'
  sentiment: string | null;             // 'Positive' | 'Neutral' | 'Negative' | …
};

// One line of the "Why this confidence?" breakdown. `state` drives its icon/tone:
// on = a strength present, off = a weakness/absence, info = a neutral measure.
export type ConfidenceFactor = { label: string; state: "on" | "off" | "info" };

export type FindingConfidence = {
  level: ConfidenceLevel;
  rationale: string;                     // plain-language "why this confidence" (one line)
  factors: ConfidenceFactor[];           // the deterministic breakdown behind the grade
  evidenceCount: number;
  sources: FindingSourceType[];          // distinct source types present, in canonical order
};

const SOURCE_ORDER: FindingSourceType[] = ["survey", "conversation", "document"];
const SOURCE_PLURAL: Record<FindingSourceType, string> = {
  survey: "survey responses", conversation: "conversations", document: "document passages",
};
const SOURCE_LABEL: Record<FindingSourceType, string> = {
  survey: "Survey", conversation: "Conversation", document: "Document",
};

const isStrong = (e: EvidenceForConfidence): boolean =>
  (typeof e.relevanceScore === "number" && e.relevanceScore >= 0.75) ||
  (e.relevanceConfidence ?? "").toLowerCase() === "high";

/** Derive confidence for a finding from its supporting evidence. Pure. */
export function deriveFindingConfidence(evidence: EvidenceForConfidence[]): FindingConfidence {
  const n = evidence.length;
  const sources = SOURCE_ORDER.filter(s => evidence.some(e => e.type === s));

  if (n === 0) {
    return {
      level: "Low", rationale: "No supporting evidence is attached to this finding.",
      factors: [{ label: "No supporting evidence attached", state: "off" }],
      evidenceCount: 0, sources,
    };
  }

  // ── Factors ────────────────────────────────────────────────────────────────
  const strong = evidence.filter(isStrong).length;
  const rels = evidence.map(e => e.relevanceScore).filter((v): v is number => typeof v === "number");
  const meanRel = rels.length ? rels.reduce((a, b) => a + b, 0) / rels.length : null;
  const highConfShare = evidence.filter(e => (e.relevanceConfidence ?? "").toLowerCase() === "high").length / n;
  const diversity = sources.length;

  // Internal agreement: among determinate sentiments, is there a clear majority?
  const pos = evidence.filter(e => e.sentiment === "Positive").length;
  const neg = evidence.filter(e => e.sentiment === "Negative").length;
  const determinate = pos + neg;
  const dominantShare = determinate > 0 ? Math.max(pos, neg) / determinate : 1;
  const split = determinate >= 3 && dominantShare < 0.6;   // a proxy contradiction

  // ── Weighted score (not an average) ─────────────────────────────────────────
  const volumePts    = n >= 6 ? 2 : n >= 3 ? 1 : 0;
  const relevancePts = meanRel === null ? 0 : meanRel >= 0.7 ? 2 : meanRel >= 0.55 ? 1 : 0;
  const confPts      = highConfShare >= 0.5 ? 1 : 0;
  const diversityPts = diversity >= 3 ? 2 : diversity === 2 ? 1 : 0;
  const tensionPen   = split ? 1 : 0;
  const score = Math.max(0, volumePts + relevancePts + confPts + diversityPts - tensionPen);

  let level: ConfidenceLevel = score >= 4 ? "High" : score >= 2 ? "Medium" : "Low";
  // A single piece of evidence can never be High, however relevant.
  if (n <= 1 && level === "High") level = "Medium";

  const dominant = pos >= neg ? "positive" : "negative";
  return {
    level,
    rationale: buildRationale({ n, strong, sources, split, pos, neg, dominant, determinate }),
    factors: buildFactors({ n, meanRel, split, pos, neg, determinate, sources }),
    evidenceCount: n,
    sources,
  };
}

// The deterministic breakdown a user sees under "Why this confidence?". Each line
// is a fact from the calculation above — nothing here is invented or inferred.
function buildFactors(f: {
  n: number; meanRel: number | null; split: boolean; pos: number; neg: number;
  determinate: number; sources: FindingSourceType[];
}): ConfidenceFactor[] {
  const out: ConfidenceFactor[] = [];

  out.push({ label: `${f.n} supporting evidence item${f.n === 1 ? "" : "s"}`, state: "info" });
  if (f.meanRel !== null) out.push({ label: `Average relevance: ${Math.round(f.meanRel * 100)}%`, state: "info" });

  if (f.split) out.push({ label: `Sentiment split across evidence (${f.pos} positive / ${f.neg} negative)`, state: "off" });
  else if (f.determinate >= 3) out.push({ label: "Strong agreement across evidence", state: "on" });
  else out.push({ label: "Limited sentiment signal to assess agreement", state: "info" });

  // Source coverage — what you have, then what's still missing. This is the
  // source-diversity dimension, spelled out per source type.
  const present = f.sources;
  const absent = SOURCE_ORDER.filter(s => !present.includes(s));
  for (const s of present) out.push({ label: `${SOURCE_LABEL[s]} evidence available`, state: "on" });
  for (const s of absent) out.push({ label: `No ${SOURCE_LABEL[s]} evidence yet`, state: "off" });

  return out;
}

function buildRationale(f: {
  n: number; strong: number; sources: FindingSourceType[];
  split: boolean; pos: number; neg: number; dominant: string; determinate: number;
}): string {
  const sourceWord = f.sources.length === 1 ? SOURCE_PLURAL[f.sources[0]] : "pieces of evidence";
  const parts: string[] = [];

  // Volume + relevance
  let vol = `${f.n} ${f.n === 1 ? sourceWord.replace(/s$/, "") : sourceWord} ${f.n === 1 ? "supports" : "support"} this finding`;
  if (f.strong > 0) vol += `, ${f.strong} highly relevant to the research question`;
  parts.push(vol);

  // Agreement (a proxy for internal contradiction)
  if (f.split) {
    parts.push(`but sentiment is split (${f.pos} positive / ${f.neg} negative)`);
  } else if (f.determinate >= 3) {
    parts.push(`with consistent ${f.dominant} sentiment`);
  }

  // Source diversity
  const diversityClause = f.sources.length >= 2
    ? `Triangulated across ${f.sources.map(s => SOURCE_PLURAL[s]).join(", ")}`
    : `Drawn from a single source (${SOURCE_PLURAL[f.sources[0]]})`;

  return `${capitalise(parts.join(", "))}. ${diversityClause}.`;
}

const capitalise = (s: string): string => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

// ── UI helpers ───────────────────────────────────────────────────────────────

/** Restrained tone tokens for a confidence level. Reserves strong colour for
 *  sentiment (per the workspace design language); confidence reads as navy for
 *  High, neutral for Medium, muted-warm for Low. */
export function confidenceTone(level: ConfidenceLevel): { ink: string; bg: string; border: string } {
  switch (level) {
    case "High":   return { ink: "var(--accent-ink)", bg: "var(--accent-wash)", border: "#ECDCB8" };
    case "Medium": return { ink: "var(--text-secondary)", bg: "var(--surface-sunken)", border: "var(--border-subtle)" };
    case "Low":    return { ink: "#8A4B33", bg: "#F6EEEA", border: "#E4D2C8" };
  }
}
