import { test } from "node:test";
import assert from "node:assert/strict";
import { isAnalysisEligible, ineligibleReason, type SearchReviewSnapshot } from "./project-searches";

// The Evidence Validation gate as Analysis reads it: "Approved + awaiting
// re-approval". The rule is a pure function of a search's review status and
// whether it has ever been approved, so it is decided here without a database.

const snap = (reviewStatus: string, approvedAt: string | null = null): SearchReviewSnapshot =>
  ({ reviewStatus, approvedAt });

const WAS_APPROVED = "2026-07-20T00:00:00Z";

// ── Eligible: settled approvals ──────────────────────────────────────────────

test("an approved search is eligible", () => {
  assert.equal(isAnalysisEligible(snap("approved", WAS_APPROVED)), true);
});

test("an archived search is eligible — archiving preserves the prior approval", () => {
  assert.equal(isAnalysisEligible(snap("archived", WAS_APPROVED)), true);
});

// ── Eligible: awaiting re-approval ───────────────────────────────────────────

test("a previously-approved search reverted to pending_approval stays eligible", () => {
  // The delta-review loop: a new collection run flips an approved search back to
  // pending_approval but leaves approved_at in place. It must not vanish.
  assert.equal(isAnalysisEligible(snap("pending_approval", WAS_APPROVED)), true);
  assert.equal(ineligibleReason(snap("pending_approval", WAS_APPROVED)), null);
});

// ── Excluded: never crossed the bar ──────────────────────────────────────────

test("a first-time pending_approval search (never approved) is NOT eligible", () => {
  assert.equal(isAnalysisEligible(snap("pending_approval", null)), false);
  assert.equal(
    ineligibleReason(snap("pending_approval", null)),
    "Submitted for approval but not yet approved",
  );
});

test("draft and collecting searches are NOT eligible and read as not-yet-reviewed", () => {
  for (const s of ["draft", "collecting"]) {
    assert.equal(isAnalysisEligible(snap(s)), false, s);
    assert.equal(
      ineligibleReason(snap(s)),
      "Not yet reviewed for Analysis (draft or collecting)",
      s,
    );
  }
});

// ── The two held-back reasons are distinct ───────────────────────────────────

test("the never-reviewed reason and the awaiting-first-approval reason differ", () => {
  assert.notEqual(
    ineligibleReason(snap("draft")),
    ineligibleReason(snap("pending_approval", null)),
  );
});

test("an eligible search has no ineligible reason", () => {
  assert.equal(ineligibleReason(snap("approved", WAS_APPROVED)), null);
  assert.equal(ineligibleReason(snap("archived", WAS_APPROVED)), null);
});
