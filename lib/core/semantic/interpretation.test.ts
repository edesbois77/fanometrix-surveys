// ── Stage 5R.2 — Result truth vs Interpretation authority (deterministic) ──────
// A mathematically valid Result and a semantically authoritative interpretation
// are SEPARATE objects: attaching/rejecting/abstaining on an interpretation never
// changes the Result's arithmetic, and provenance is not authority.
import { test } from "node:test";
import assert from "node:assert/strict";
import { proportion } from "../evidence/scale";
import type { Result } from "../evidence/types";
import type { Finding } from "../findings/types";
import {
  type ConstructInterpretation, type SemanticProvenance,
  MAX_AUTHORITY_FOR_PROVENANCE, authorityWithinProvenance, AUTHORITY_CEILING,
} from "./authority";
import { constructAuthorityOf, interpretationOf, buildProvisionalInterpretation } from "./interpretation";
import { assignPriority, type RankingInput } from "../assessment/ranking";

const V = { standardVersion: "1.2", coreVersion: "0.1.0", runProvenance: null };
const baseResult = (): Result => ({ id: "r", operation: "grouping", quantity: proportion(0.558), numerator: 153, denominator: 274, components: ["q:a", "q:b"], grouping: { kind: "governed_semantic", componentLabels: ["A", "B"], parentConstruct: "structural label" } });
const interp = (over: Partial<ConstructInterpretation>): ConstructInterpretation => ({ id: "i", label: "some meaning", decision: "approved", authority: "provisional", provenance: "model_proposed", reviewRequired: true, caveats: [], ...over });
const findingWith = (r: Result): Finding => ({ id: "f", statement: "s", evidence: [{ id: "e", kind: "base", sourceType: "survey", sourceId: "s", denominator: 274 }], results: [r], version: V, status: "candidate" });

// ── A — a Result may exist with NO interpretation ──────────────────────────────
test("A: a mathematically valid Result is valid with no ConstructInterpretation", () => {
  const r = baseResult();
  assert.equal(r.interpretation, undefined);
  const f = findingWith(r);
  assert.equal(interpretationOf(f), undefined);
  assert.equal(constructAuthorityOf(f), undefined); // no novel construct → normal ranking
});

// ── B — a rejected interpretation does NOT invalidate the Result ────────────────
test("B: a valid Result can carry a REJECTED interpretation without becoming invalid", () => {
  const r: Result = { ...baseResult(), interpretation: interp({ decision: "rejected", label: "visibility problem", caveats: ["cross-construct relabel"] }) };
  // Arithmetic is untouched.
  assert.equal(r.quantity.value, 0.558);
  assert.deepEqual(r.components, ["q:a", "q:b"]);
  assert.equal(r.numerator, 153);
  // A rejected interpretation confers no authority (would not be projected).
  assert.equal(constructAuthorityOf(findingWith(r)), undefined);
});

// ── C — unable_to_establish leaves the Result numerically intact ───────────────
test("C: a valid Result can carry unable_to_establish without changing value/components", () => {
  const r: Result = { ...baseResult(), interpretation: interp({ decision: "unable_to_establish", authority: "provisional" }) };
  assert.equal(r.quantity.value, 0.558);
  assert.deepEqual(r.components, ["q:a", "q:b"]);
  // Uncertainty is not approval and not rejection — authority stays provisional (capped).
  assert.equal(constructAuthorityOf(findingWith(r)), "provisional");
});

// ── D — changing the interpretation label does not touch the arithmetic ────────
test("D: changing an interpretation's label leaves the Result's arithmetic unchanged", () => {
  const r1: Result = { ...baseResult(), interpretation: interp({ label: "meaning one" }) };
  const r2: Result = { ...r1, interpretation: { ...r1.interpretation!, label: "a totally different meaning" } };
  assert.equal(r1.quantity.value, r2.quantity.value);
  assert.deepEqual(r1.components, r2.components);
  assert.equal(r1.numerator, r2.numerator);
});

// ── Provenance is not authority ────────────────────────────────────────────────
test("provenance is not authority: model_proposed caps at provisional, cannot self-escalate", () => {
  assert.equal(MAX_AUTHORITY_FOR_PROVENANCE.model_proposed, "provisional");
  assert.equal(MAX_AUTHORITY_FOR_PROVENANCE.model_synthesised, "provisional");
  assert.equal(authorityWithinProvenance("provisional", "model_proposed"), true);
  assert.equal(authorityWithinProvenance("declared", "model_proposed"), false);
  assert.equal(authorityWithinProvenance("derived", "model_proposed"), false);
  assert.equal(authorityWithinProvenance("attested", "model_proposed"), false);
  // human/source provenances MAY support higher authority (routes built later).
  assert.equal(authorityWithinProvenance("attested", "human_defined"), true);
  assert.equal(authorityWithinProvenance("declared", "source_declared"), true);
});

test("decision != authority: approved does not imply authority above provisional", () => {
  const i = interp({ decision: "approved", authority: "provisional", provenance: "model_proposed" });
  assert.equal(i.decision, "approved");
  assert.equal(i.authority, "provisional");
  assert.equal(AUTHORITY_CEILING[i.authority], "contextual"); // still capped
});

test("the pipeline builder yields decision=approved but authority=provisional / provenance=model_proposed", () => {
  const i = buildProvisionalInterpretation("cand", "perceives at least some relevance");
  assert.equal(i.decision, "approved");
  assert.equal(i.authority, "provisional");
  assert.equal(i.provenance, "model_proposed");
  assert.equal(i.reviewRequired, true);
  assert.equal(authorityWithinProvenance(i.authority, i.provenance), true);
});

// ── Single source of authority truth ───────────────────────────────────────────
test("single source: the interpretation authority governs; it is never duplicated on the Finding", () => {
  // Canonical pipeline-shaped Finding: interpretation present, no explicit field.
  const canonical = findingWith({ ...baseResult(), interpretation: interp({ authority: "provisional" }) });
  assert.equal(canonical.constructAuthority, undefined);       // not duplicated
  assert.equal(constructAuthorityOf(canonical), "provisional"); // read from interpretation
  // Fallback: interpretation-less Finding may carry the explicit field (unit/legacy).
  const fallback: Finding = { ...findingWith(baseResult()), constructAuthority: "provisional" };
  assert.equal(interpretationOf(fallback), undefined);
  assert.equal(constructAuthorityOf(fallback), "provisional");
  // Precedence guard: if both are somehow present, the interpretation WINS — a
  // stale field can never override the canonical interpretation (no silent disagreement).
  const both: Finding = { ...findingWith({ ...baseResult(), interpretation: interp({ authority: "provisional" }) }), constructAuthority: "declared" };
  assert.equal(constructAuthorityOf(both), "provisional");
});

test("the ceiling reads through the single path: a provisional interpretation caps ranking at Contextual", () => {
  const f = findingWith({ ...baseResult(), interpretation: interp({ authority: "provisional" }) });
  const strong: RankingInput = {
    eligibility: { level: "eligible", reasons: [], caveats: [], governanceIssueIds: [], assessor: "deterministic" },
    confidence: { level: "high", reasons: [], constraints: [], assessor: "deterministic" },
    materiality: { level: "critical", reasons: [], constraints: [], assessor: "deterministic", modelAssistedNeeded: [] },
    relevance: { level: "high", reasons: [], assessor: "deterministic" },
    redundancy: { subsumedBy: null, kind: "none", reason: null, semanticReviewNeeded: false },
    finding: f,
  };
  assert.equal(assignPriority(strong).priority, "contextual");
});

// ── Product-agnostic: interpretation contract fits non-survey evidence ─────────
test("the interpretation contract is product-agnostic (survey/social/document/qualitative/campaign)", () => {
  const cases: { sourceType: "survey" | "conversation" | "document"; prov: SemanticProvenance; label: string }[] = [
    { sourceType: "survey", prov: "model_proposed", label: "top-two-box relevance" },
    { sourceType: "conversation", prov: "model_proposed", label: "emergent topic cluster" },
    { sourceType: "document", prov: "model_proposed", label: "three sources claim growth" }, // meta-claim; object claim stays interested
    { sourceType: "conversation", prov: "model_synthesised", label: "recurring qualitative theme" },
    { sourceType: "conversation", prov: "model_proposed", label: "quality-deterioration reading" }, // campaign metric interpretation
  ];
  for (const c of cases) {
    const f: Finding = { id: `f-${c.label}`, statement: c.label, evidence: [{ id: "e", kind: "base", sourceType: c.sourceType, sourceId: "s", denominator: 300 }], results: [{ id: "r", operation: "grouping", quantity: proportion(0.4), interpretation: interp({ label: c.label, provenance: c.prov }) }], version: V, status: "candidate" };
    // Every evidence type gets provisional authority via the same contract — no
    // fake quantitative semantics forced onto non-survey evidence.
    assert.equal(constructAuthorityOf(f), "provisional");
    assert.equal(AUTHORITY_CEILING[constructAuthorityOf(f)!], "contextual");
  }
});
