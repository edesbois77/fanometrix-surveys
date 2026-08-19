// Stage 3.1 — synthesis-does-not-outrank-components + temporal-comparability cap.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Finding } from "../findings/types";
import type { RankingInput } from "./ranking";
import { assignPriority, applySynthesisConstraint } from "./ranking";
import { assessEligibility } from "./eligibility";
import { assessFindings } from "./assess";
import { fedexCandidates, FEDEX_CONTEXT } from "./fedex-fixture";

const V = { standardVersion: "1.1", coreVersion: "0.1.0", runProvenance: null };
const mkFinding = (o: Partial<Finding>): Finding => ({ id: "f", statement: "s", evidence: [], version: V, status: "candidate", ...o } as Finding);
const baseInput = (over: Partial<RankingInput> = {}): RankingInput => ({
  eligibility: { level: "eligible", reasons: [], caveats: [], governanceIssueIds: [], assessor: "deterministic" },
  confidence: { level: "high", reasons: [], constraints: [], assessor: "deterministic" },
  materiality: { level: "high", reasons: [], constraints: [], assessor: "deterministic-heuristic", modelAssistedNeeded: [] },
  relevance: { level: "high", reasons: [], assessor: "deterministic-heuristic" },
  redundancy: { subsumedBy: null, kind: "none", reason: null, semanticReviewNeeded: false },
  ...over,
});

// ── Synthesis ─────────────────────────────────────────────────────────────────
test("synthesis does not automatically outrank its strongest surfaced component", () => {
  const f = mkFinding({ derivedFrom: ["a", "b"] });
  const r = applySynthesisConstraint(f, "primary", ["primary", "secondary"]);
  assert.equal(r.priority, "secondary"); // one below the strongest (primary) component
  assert.ok(r.reasons.includes("synthesis_does_not_exceed_component_story"));
  assert.ok(r.reasons.includes("synthesis_elevation_requires_governed_route"));
});

test("synthesis elevation is allowed only with an explicit GOVERNED route (not a model signal)", () => {
  const f = mkFinding({ derivedFrom: ["a"], synthesisElevation: { route: "governed_review" } });
  const r = applySynthesisConstraint(f, "primary", ["primary"]);
  assert.equal(r.priority, "primary");
  assert.ok(r.reasons.includes("synthesis_elevated_by_review"));
});

test("a non-elevated synthesis is never Primary — even with no surfaced components (5R.6 authority cap)", () => {
  // No surfaced components → no double-count risk, but a model-only synthesis still
  // cannot be Primary: capped at Secondary.
  assert.equal(applySynthesisConstraint(mkFinding({ derivedFrom: ["a"] }), "primary", ["suppressed"]).priority, "secondary");
  // An unrelated cross-question Finding (no derivedFrom) is NOT treated as a synthesis.
  assert.equal(applySynthesisConstraint(mkFinding({ questions: ["q1", "q2"] }), "primary", []).priority, "primary");
});

// ── Temporal comparability cap ────────────────────────────────────────────────
test("a wave difference with unresolved comparability is capped at contextual", () => {
  const f = mkFinding({ change: { state: "dataset_difference", comparability: "not_comparable" } });
  const r = assignPriority(baseInput({ finding: f, materiality: { level: "high", reasons: [], constraints: [], assessor: "deterministic-heuristic", modelAssistedNeeded: [] } }));
  assert.equal(r.priority, "contextual");
  assert.ok(r.reasons.includes("priority_capped_by_unresolved_comparability"));
});

test("governed comparable_change removes the prominence cap", () => {
  const f = mkFinding({ change: { state: "comparable_change", comparability: "equivalent" } });
  const r = assignPriority(baseInput({ finding: f }));
  assert.notEqual(r.priority, "contextual"); // free to rank on normal materiality/confidence
});

test("an unsupported trend claim stays governance-INELIGIBLE, not merely capped", () => {
  const f = mkFinding({ statement: "Interest grew over the period.", assertionType: "temporal", evidence: [{ id: "e1", kind: "base", contribution: "elicited_perception", sourceType: "survey", sourceId: "s", denominator: 274 }] });
  assert.equal(assessEligibility(f).level, "ineligible");
});

// ── FedEx revised hierarchy (human-reviewed expectation) ──────────────────────
test("FedEx 3.1 hierarchy matches the human-reviewed expectation", () => {
  const byId = new Map(assessFindings(fedexCandidates(), FEDEX_CONTEXT).map((a) => [a.findingId, a.priority]));
  const expected: Record<string, string> = {
    "mf-1": "primary", "mf-2": "primary",
    "mf-3": "secondary", "mf-4": "secondary",
    "mf-5": "contextual", "may-1": "contextual", "may-3": "contextual", "inv-55": "contextual",
    "inv-69": "suppressed", "inv-dominant": "suppressed",
  };
  for (const [id, prio] of Object.entries(expected)) assert.equal(byId.get(id), prio, `${id} expected ${prio}, got ${byId.get(id)}`);
});
