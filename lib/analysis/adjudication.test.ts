import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reframeCitations, recompute, citationsFrom, canMerge, canTransition, looksLikeTwoClaims,
  REJECT_REASON, type FindingStatus,
} from "./adjudication";
import type { EvidenceRow, StoredFinding } from "./finding-store";
import type { ContributionKind } from "./types";

// Adjudication is what a research consultant does to a claim, not what a reviewer
// does to AI output. These tests cover the pure rules: what survives a rewrite,
// what may merge, what a status may become. The database writes are thin wrappers
// over these.

let seq = 0;
const ev = (over: Partial<EvidenceRow> = {}): EvidenceRow => {
  seq += 1;
  return {
    finding_id: "f1", evidence_ref: `e${seq}`, stance: "establishes",
    admissibility: "admissible", constraint_note: null,
    contribution_kind: "unprompted_discourse" as ContributionKind, evidence_role: "direct",
    observation_key: `unit-${seq}`, observations: 1, bearing: 0.85,
    rejected: false, rejected_reason: null, snippet: "a quote", provenance: "Reddit · UK",
    ...over,
  };
};

// ── The platform argues back ─────────────────────────────────────────────────

test("rewriting a description as a cause strips the evidence that cannot support a cause", () => {
  // The central act. An analyst turning "fans discuss price" into "price drives
  // churn" has changed the kind of claim, and conversation alone cannot carry a
  // cause. The claim may be rewritten; its grounds do not come along for free.
  const rows = [ev(), ev(), ev()];   // all unprompted_discourse
  const { kept, stripped } = reframeCitations(rows, "magnitude");
  // conversation cannot establish population magnitude at all
  assert.equal(kept.length, 0);
  assert.equal(stripped.length, 3);
  assert.ok(stripped[0].rejected);
  assert.ok(stripped[0].rejected_reason);
});

test("a rewrite that tightens admissibility keeps the citation but records the limit", () => {
  const rows = [ev({ contribution_kind: "established_knowledge" as ContributionKind })];
  const { kept } = reframeCitations(rows, "descriptive");
  assert.equal(kept.length, 1);
  assert.equal(kept[0].admissibility, "admissible_with_limits");
  assert.ok(kept[0].constraint_note);
});

test("the grade recomputes from what survives the rewrite, so a stripped claim reads as weaker", () => {
  const rows = [ev(), ev(), ev()];
  const asDescription = recompute({ assertion: "descriptive", disconfirmed: true, examined: 3, rows });
  const { kept, stripped } = reframeCitations(rows, "magnitude");
  const asMagnitude = recompute({ assertion: "magnitude", disconfirmed: true, examined: 3, rows: [...kept, ...stripped] });

  assert.equal(asDescription.confidence.level, "High");
  assert.equal(asMagnitude.confidence.level, "Low", "a claim whose grounds were stripped cannot stay confident");
});

test("rejected citations never count toward a grade", () => {
  const rows = [ev(), ev({ rejected: true, rejected_reason: "withdrawn" })];
  assert.equal(citationsFrom(rows).length, 1);
});

// ── Merging is a claim operation ─────────────────────────────────────────────

const finding = (over: Partial<StoredFinding> = {}): StoredFinding =>
  ({ assertion_type: "descriptive", need_id: "need_1", ...over } as StoredFinding);

test("two claims of the same kind about the same question may merge", () => {
  assert.equal(canMerge(finding(), finding()).ok, true);
});

test("claims of different kinds may not merge, because the merged claim would assert something neither did", () => {
  const verdict = canMerge(finding({ assertion_type: "descriptive" }), finding({ assertion_type: "causal" }));
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reason?.includes("different kinds"));
});

test("claims answering different questions may not merge", () => {
  const verdict = canMerge(finding({ need_id: "need_1" }), finding({ need_id: "need_2" }));
  assert.equal(verdict.ok, false);
  assert.ok(verdict.reason?.includes("different questions"));
});

// ── The status machine ───────────────────────────────────────────────────────

test("a candidate can be approved, rejected or taken into review", () => {
  assert.ok(canTransition("candidate", "approved"));
  assert.ok(canTransition("candidate", "rejected"));
  assert.ok(canTransition("candidate", "in_review"));
});

test("an approved claim can be reopened, which is not an error", () => {
  // New evidence, a challenge or a second reader can all reasonably unsettle a
  // sign-off.
  assert.ok(canTransition("approved", "in_review"));
  assert.ok(canTransition("approved", "rejected"));
});

test("a superseded claim is terminal", () => {
  for (const to of ["candidate", "in_review", "approved", "rejected"] as FindingStatus[]) {
    assert.equal(canTransition("superseded", to), false);
  }
});

// ── The advisory split heuristic ─────────────────────────────────────────────

test("a conjunction of two falsifiable claims is flagged as maybe two claims", () => {
  assert.ok(looksLikeTwoClaims("Price is the barrier and trust is falling."));
  assert.ok(looksLikeTwoClaims("Fans value access; they resent the queues."));
});

test("a single claim with an incidental 'and' is not flagged", () => {
  assert.equal(looksLikeTwoClaims("Fans value access and community."), false);
});

// ── Rejection classes are professional judgements, not a bin ─────────────────

test("a rejection carries a class, so 'wrong' and 'immaterial' stay distinct", () => {
  assert.ok(REJECT_REASON.unwarranted.includes("does not support"));
  assert.ok(REJECT_REASON.immaterial.includes("does not bear on the decision"));
  assert.notEqual(REJECT_REASON.unwarranted, REJECT_REASON.immaterial);
});

test("no adjudication copy uses an em-dash", () => {
  for (const r of Object.values(REJECT_REASON)) assert.ok(!/[—–]/.test(r), r);
});
