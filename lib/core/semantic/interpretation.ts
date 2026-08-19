// ── Fanometrix Analytical Core — interpretation helpers (Stage 5R.2) ──────────
// The SINGLE authority read-path. Construct authority lives canonically on a
// Result's ConstructInterpretation (Standard v1.2 §45). A Finding derives its
// authority from that interpretation — it never carries an independent, mutable
// authority value alongside one. `constructAuthorityOf` is the only function
// ranking/eligibility use to read authority, so Finding and Result can never
// disagree.

import type { Finding } from "../findings/types";
import type { ConstructInterpretation, ConstructAuthority, SemanticProvenance } from "./authority";

/** The governing interpretation attached to any of a Finding's Results, if any. */
export function interpretationOf(f: Finding | undefined): ConstructInterpretation | undefined {
  return (f?.results ?? []).map((r) => r.interpretation).find((i): i is ConstructInterpretation => !!i);
}

/** The construct authority governing a Finding (Standard v1.2 §44/§45):
 *  the Result interpretation's authority when present (canonical), else the
 *  Finding's fallback `constructAuthority` (interpretation-less / legacy findings),
 *  else undefined (no novel construct → normal ranking). A REJECTED interpretation
 *  confers no authority (such a Finding should not have been projected). */
export function constructAuthorityOf(f: Finding | undefined): ConstructAuthority | undefined {
  const interp = interpretationOf(f);
  if (interp) return interp.decision === "rejected" ? undefined : interp.authority;
  return f?.constructAuthority;
}

/** Build the PROVISIONAL interpretation for a model-approved novel grouping
 *  (Stage 5R.2). Decision = approved (plausible), authority = provisional (model
 *  judgement alone), provenance = model_proposed. It carries an explicit review
 *  requirement and never self-escalates. */
export function buildProvisionalInterpretation(candidateId: string, label: string, reasons?: string[]): ConstructInterpretation {
  return {
    id: `${candidateId}#interp`,
    label,
    construct: label,
    decision: "approved",
    authority: "provisional",
    provenance: "model_proposed" as SemanticProvenance,
    reviewRequired: true,
    caveats: [
      "semantic authority is provisional — established by model proposal only, pending independent validation",
      ...(reasons ?? []),
    ],
  };
}
