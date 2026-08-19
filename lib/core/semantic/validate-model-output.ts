// ── Fanometrix Analytical Core — model-output validation (Stage 5A, pure) ─────
// Every real model response is UNTRUSTED. Validate structure/enums, reject any
// introduced number (the Core owns arithmetic), and reject invented references.
// Invalid output is REJECTED — never silently repaired into a different claim.

import type { GroupingVerdict, YNU } from "./grouping";
import type { SynthesisVerdict } from "./synthesis";
import type { DisconfirmationStatus, DisconfirmationKind } from "../disconfirmation/types";

const YNU_SET = new Set(["yes", "no", "unclear"]);
const isYNU = (v: unknown): v is YNU => typeof v === "string" && YNU_SET.has(v);
// A computed FIGURE (a percentage/pp, or a decimal) — NOT a reference token like
// "e1"/"e9" (a digit that is part of an identifier is ignored via the lookbehind).
const hasNumber = (s: unknown): boolean =>
  typeof s === "string" && (/(?<![a-z\d])\d+(?:\.\d+)?\s*(?:%|pp|percent)/i.test(s) || /(?<![a-z\d])\d+\.\d+/.test(s));

export type Validated<T> = { ok: boolean; value?: T; reasons: string[] };

/** A model must not introduce a computed figure anywhere in its rationale. */
function noNumbersIn(strings: (string | undefined)[]): string[] {
  return strings.some((s) => hasNumber(s)) ? ["model introduced a number (arithmetic is owned by the Core)"] : [];
}

export function validateGroupingResponse(raw: unknown): Validated<GroupingVerdict> {
  const reasons: string[] = [];
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== "object") return { ok: false, reasons: ["not an object"] };
  for (const f of ["constructCoherent", "labelFaithful", "informationGain"]) if (!isYNU(r[f])) reasons.push(`invalid ${f}`);
  if (r.competingRisk !== "low" && r.competingRisk !== "high") reasons.push("invalid competingRisk");
  if (typeof r.humanReviewRequired !== "boolean") reasons.push("invalid humanReviewRequired");
  const rlist = Array.isArray(r.reasons) ? (r.reasons as unknown[]).filter((x): x is string => typeof x === "string") : [];
  reasons.push(...noNumbersIn([...(rlist), typeof r.construct === "string" ? r.construct : undefined]));
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, value: { constructCoherent: r.constructCoherent as YNU, labelFaithful: r.labelFaithful as YNU, informationGain: r.informationGain as YNU, competingRisk: r.competingRisk as "low" | "high", humanReviewRequired: r.humanReviewRequired as boolean, construct: typeof r.construct === "string" ? r.construct : undefined, reasons: rlist }, reasons: [] };
}

export function validateSynthesisResponse(raw: unknown): Validated<SynthesisVerdict> {
  const reasons: string[] = [];
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== "object") return { ok: false, reasons: ["not an object"] };
  if (!isYNU(r.coherent)) reasons.push("invalid coherent");
  if (typeof r.centralStory !== "boolean") reasons.push("invalid centralStory");
  if (typeof r.humanReviewRequired !== "boolean") reasons.push("invalid humanReviewRequired");
  const rlist = Array.isArray(r.reasons) ? (r.reasons as unknown[]).filter((x): x is string => typeof x === "string") : [];
  reasons.push(...noNumbersIn(rlist)); // a synthesis must not introduce a new share
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, value: { coherent: r.coherent as YNU, centralStory: r.centralStory as boolean, humanReviewRequired: r.humanReviewRequired as boolean, reasons: rlist }, reasons: [] };
}

const DIS_STATUS = new Set(["none_found", "qualified", "materially_weakened", "contradicted"]);
const DIS_KINDS = new Set(["direct_contradiction", "qualification", "counter_pattern", "weak_magnitude", "base_limitation", "construct_mismatch", "alternative_explanation"]);

export function validateDisconfirmationResponse(raw: unknown, allowedEvidenceIds: string[]): Validated<{ status: DisconfirmationStatus; kinds: DisconfirmationKind[]; reasons: string[] }> {
  const reasons: string[] = [];
  const r = raw as Record<string, unknown>;
  if (!r || typeof r !== "object") return { ok: false, reasons: ["not an object"] };
  if (typeof r.status !== "string" || !DIS_STATUS.has(r.status)) reasons.push("invalid status");
  const kinds = Array.isArray(r.kinds) ? (r.kinds as unknown[]).filter((k): k is DisconfirmationKind => typeof k === "string" && DIS_KINDS.has(k)) : [];
  const rlist = Array.isArray(r.reasons) ? (r.reasons as unknown[]).filter((x): x is string => typeof x === "string") : [];
  reasons.push(...noNumbersIn(rlist));
  // If the model cites evidence ids, they must exist.
  const cited = rlist.join(" ").match(/\be\d+\b/g) ?? [];
  const allowed = new Set(allowedEvidenceIds);
  for (const c of cited) if (!allowed.has(c)) reasons.push(`cites unknown evidence id ${c}`);
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, value: { status: r.status as DisconfirmationStatus, kinds, reasons: rlist }, reasons: [] };
}
