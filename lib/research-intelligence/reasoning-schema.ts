// ── Research Reasoner PROTOTYPE — output contract (ISOLATED, not wired) ───────
export type InsightType = "synthesis" | "interpretation" | "implication";
export type Confidence = "high" | "moderate" | "low";
export type ReasonerInsight = { id: string; title: string; type: InsightType; statement: string; whyItMatters: string; evidenceRefs: string[]; counterEvidenceRefs: string[]; confidence: Confidence; caveat: string };
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
export const OUTPUT_SHAPE = `{
  "executiveStory": { "headline": string, "summary": string (2-4 sentences), "evidenceRefs": string[] },
  "insights": [ {
      "id": string, "title": string (short, plain English),
      "type": "synthesis" | "interpretation" | "implication",
      "statement": string, "whyItMatters": string (commercial/research relevance),
      "evidenceRefs": string[] (ids that SUPPORT this), "counterEvidenceRefs": string[] (ids that WEAKEN it - actively look),
      "confidence": "high" | "moderate" | "low", "caveat": string (what would change this / what it does not prove)
  } ],
  "supportingObservations": [ { "statement": string (a single measured fact), "evidenceRefs": string[] } ],
  "tensions": [ { "statement": string (two supported facts that pull against each other), "evidenceRefs": string[] } ],
  "openQuestions": string[] (hypotheses worth exploring in future research),
  "cannotConclude": string[] (important things this survey CANNOT establish)
}`;
