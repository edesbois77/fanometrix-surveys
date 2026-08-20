// ── Research Reasoner PROTOTYPE — output contract (ISOLATED, not wired) ───────
// The model's job is ANALYSIS, not summary. The contract forces it to separate the
// four authority classes so the product (and the verifier) can treat them differently:
//   A. MEASURED FACT  → supportingObservations (directly read off the evidence)
//   B. SYNTHESIS      → insights[type=synthesis]     (a pattern ACROSS supported facts)
//   C. INTERPRETATION → insights[type=interpretation] (a plausible MEANING)
//   D. IMPLICATION    → insights[type=implication]    (a hypothesis the client may consider)
//   E. UNSUPPORTED    → must never appear (the verifier rejects it)

export type InsightType = "synthesis" | "interpretation" | "implication";
export type Confidence = "high" | "moderate" | "low";

export type ReasonerInsight = {
  id: string;
  title: string;
  type: InsightType;
  statement: string;
  whyItMatters: string;
  evidenceRefs: string[];
  counterEvidenceRefs: string[];
  confidence: Confidence;
  caveat: string;
};

export type ReasonerObservation = { statement: string; evidenceRefs: string[] };
export type ReasonerTension = { statement: string; evidenceRefs: string[] };

export type ReasonerOutput = {
  executiveStory: { headline: string; summary: string; evidenceRefs: string[] };
  insights: ReasonerInsight[];
  supportingObservations: ReasonerObservation[];
  tensions: ReasonerTension[];
  openQuestions: string[];
  cannotConclude: string[];
};

/** A compact JSON-shape description embedded in the prompt (the API also runs in
 *  json_object mode). Kept human-readable so the prompt stays legible. */
export const OUTPUT_SHAPE = `{
  "executiveStory": { "headline": string, "summary": string (2-4 sentences), "evidenceRefs": string[] },
  "insights": [ {
      "id": string,
      "title": string (short, plain English),
      "type": "synthesis" | "interpretation" | "implication",
      "statement": string,
      "whyItMatters": string (the commercial / research relevance),
      "evidenceRefs": string[] (refs that SUPPORT this),
      "counterEvidenceRefs": string[] (refs that WEAKEN or complicate this - actively look),
      "confidence": "high" | "moderate" | "low",
      "caveat": string (what would change this / what it does not prove)
  } ],
  "supportingObservations": [ { "statement": string (a single measured fact), "evidenceRefs": string[] } ],
  "tensions": [ { "statement": string (two supported facts that pull against each other), "evidenceRefs": string[] } ],
  "openQuestions": string[] (hypotheses worth exploring in future research),
  "cannotConclude": string[] (important things this survey CANNOT establish)
}`;
