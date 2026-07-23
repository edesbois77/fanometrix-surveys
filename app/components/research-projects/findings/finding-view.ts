// View-model helpers for the analyst surface. The UI is typed against ITS OWN
// shapes, not against the reasoning layer's, so the internal vocabulary
// (assertion type, contribution kind, admissibility) never reaches a person and
// never couples a component to lib/analysis (docs/intelligence-model.md §8:
// the reasoning model is not the interface). The API sends these shapes already;
// this file only maps them to tone and plain language.
import type { Tone } from "@/app/components/workspace-ui";
import type { ConfidenceLevel as MeterLevel } from "@/app/components/workspace-ui";

export type ConfidenceWord = "High" | "Medium" | "Low";
export type StrengthWord = "strong" | "moderate" | "limited";
export type RunStatus = "queued" | "running" | "completed" | "failed";

export type EvidenceView = {
  id: string;
  evidence_ref: string;
  stance: "establishes" | "illustrates" | "qualifies" | "contests";
  snippet: string | null;
  provenance: string | null;
  contribution_kind: string;
  evidence_role: string;
  observations: number;
  bearing: number | null;
  rejected: boolean;
  rejected_reason: string | null;
};

export type FindingView = {
  id: string;
  need_id: string;
  need_text: string;
  requirement_text: string;
  aspect: string | null;
  statement: string;
  assertion_type: string;
  scope: string | null;
  warrant: string | null;
  reading: string | null;
  is_null: boolean;
  rank: number;
  status: "candidate" | "in_review" | "approved" | "rejected" | "superseded";
  published: boolean;
  confidence_level: ConfidenceWord;
  evidence_strength: StrengthWord;
  override_confidence: ConfidenceWord | null;
  override_reason: string | null;
  disconfirmed: boolean;
  disconfirmation: { searched?: number; contesting?: number; qualifying?: number; note?: string } | null;
  assessment: {
    confidence?: { level: ConfidenceWord; rationale: string; factors: { label: string; state: "on" | "off" | "info" }[]; what_would_raise_it: string[] };
    strength?: { level: StrengthWord; rationale: string; independence: { supporting: number; contesting: number; items: number }; kinds: string[] };
  } | null;
  reviewed_by: string | null;
  analyst_note: string | null;
};

export type NeedGroup = {
  needId: string;
  need: string;
  requirement: string;
  aspect: string | null;
  candidate: FindingView | null;
  rivals: FindingView[];
};

// ── Confidence, as a person reads it ─────────────────────────────────────────
// The effective grade is the analyst's override where one exists, and the
// derived value where it does not. Both are always available; the surface leads
// with the one the organisation stands behind.

export const effectiveConfidence = (f: FindingView): ConfidenceWord =>
  f.override_confidence ?? f.confidence_level;

const CONF_METER: Record<ConfidenceWord, MeterLevel> = { High: "high", Medium: "medium", Low: "low" };
export const confidenceMeter = (w: ConfidenceWord): MeterLevel => CONF_METER[w];

const STRENGTH_LABEL: Record<StrengthWord, string> = {
  strong: "Strong evidence", moderate: "Moderate evidence", limited: "Limited evidence",
};
export const strengthLabel = (s: StrengthWord): string => STRENGTH_LABEL[s];

// ── Status, as a board reads it ──────────────────────────────────────────────

export const STATUS_TONE: Record<FindingView["status"], Tone> = {
  candidate: "neutral", in_review: "info", approved: "success", rejected: "danger", superseded: "neutral",
};
export const STATUS_LABEL: Record<FindingView["status"], string> = {
  candidate: "Awaiting review", in_review: "In review", approved: "Approved", rejected: "Set aside", superseded: "Superseded",
};

// ── The kind of claim, only where it helps ───────────────────────────────────
// Never surfaced as "assertion type". Named only when it explains something, in
// the language of what the claim asserts.

const ASSERTION_WORD: Record<string, string> = {
  descriptive: "Observation", comparative: "Comparison", magnitude: "Measurement",
  temporal: "Trend", causal: "Cause", predictive: "Forecast", absence: "Not established",
};
export const assertionWord = (a: string): string => ASSERTION_WORD[a] ?? "Finding";

// ── Evidence stance ──────────────────────────────────────────────────────────

export const STANCE_META: Record<EvidenceView["stance"], { label: string; tone: Tone }> = {
  establishes: { label: "Supports", tone: "success" },
  qualifies:   { label: "Qualifies", tone: "warning" },
  contests:    { label: "Points the other way", tone: "danger" },
  illustrates: { label: "Illustrates", tone: "neutral" },
};

const KIND_LABEL: Record<string, string> = {
  elicited_perception: "Survey", unprompted_discourse: "Conversation",
  documented_activity: "News", interested_claim: "Stated claim",
  expert_judgement: "Expert view", established_knowledge: "Research", unknown: "Evidence",
};
export const kindLabel = (k: string): string => KIND_LABEL[k] ?? "Evidence";

/** What an analyst should look at first, computed from the finding as the
 *  pipeline computed it. Not a quality score: a flag that the automatic choice is
 *  doing something a person ought to see. */
export function attentionFlags(f: FindingView, rivalCount: number): string[] {
  const out: string[] = [];
  if (f.is_null) out.push("The evidence does not answer this question.");
  if (effectiveConfidence(f) === "Low") out.push("The best available reading is only weakly supported.");
  if ((f.disconfirmation?.contesting ?? 0) > 0) out.push("Evidence points the other way and has not been resolved.");
  if (!f.disconfirmed) out.push("This claim was never tested against evidence that would contradict it.");
  if (rivalCount > 0) out.push(`${rivalCount} other reading${rivalCount === 1 ? "" : "s"} of this evidence ${rivalCount === 1 ? "was" : "were"} proposed.`);
  return out;
}
