// ── Stage 5R.3 — governed semantic metadata (FACTS ONLY, deterministic) ────────
// Records semantic facts (constructId, scale, order, provenance) WITHOUT reasoning:
// metadata never approves a grouping, grants authority, or bypasses the ceiling.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type QuestionSemantics,
  constructIdOf, sameGovernedConstruct, scaleTypeOf, isGovernedMetadata,
  validateQuestionSemantics, optionSemanticsOf,
} from "./metadata";
import { generateCandidates } from "../candidates/generate";
import { proportion } from "../evidence/scale";

const OBJ = "Understand fan value and access preferences.";

// ── Identity (constructId, never labels) ───────────────────────────────────────
test("A/B: same constructId shares identity; different ids do not", () => {
  const qs: QuestionSemantics = { questionKey: "q", constructId: "relevance", scaleType: "ordinal", provenance: "source_declared", options: [{ optionId: "a", constructId: "relevance", ordinalPosition: 2 }, { optionId: "b", constructId: "relevance", ordinalPosition: 1 }, { optionId: "c", constructId: "awareness", ordinalPosition: 0 }] };
  assert.equal(sameGovernedConstruct(constructIdOf(qs, "a"), constructIdOf(qs, "b")), true);   // A
  assert.equal(sameGovernedConstruct(constructIdOf(qs, "a"), constructIdOf(qs, "c")), false);  // B (relevance vs awareness)
});

test("C: identity comes from constructId, not human wording (different labels, same id → same)", () => {
  // Labels live on the distribution/evidence, NOT in semantics — proving identity
  // ignores wording. Both options carry the same governed constructId.
  const qs: QuestionSemantics = { questionKey: "q", scaleType: "nominal", provenance: "governed_imported", options: [{ optionId: "x", constructId: "preference" }, { optionId: "y", constructId: "preference" }] };
  assert.equal(sameGovernedConstruct(constructIdOf(qs, "x"), constructIdOf(qs, "y")), true);
});

test("D: similar wording does NOT establish identity when constructId differs or is absent (no fuzzy match)", () => {
  const qs: QuestionSemantics = { questionKey: "q", scaleType: "nominal", provenance: "source_declared", options: [{ optionId: "x", constructId: "sentiment_positive" }, { optionId: "y", constructId: "sentiment_negative" }, { optionId: "z" /* no constructId */ }] };
  assert.equal(sameGovernedConstruct(constructIdOf(qs, "x"), constructIdOf(qs, "y")), false); // different ids
  assert.equal(sameGovernedConstruct(constructIdOf(qs, "x"), constructIdOf(qs, "z")), false); // absent id → never equal
});

// ── Ordinality: order recorded, never inferred ─────────────────────────────────
test("ordinal order is preserved as declared; hygiene flags malformed metadata; nothing is inferred", () => {
  const ordinal: QuestionSemantics = { questionKey: "sat", constructId: "satisfaction", scaleType: "ordinal", provenance: "source_declared", options: [{ optionId: "vsat", ordinalPosition: 4 }, { optionId: "sat", ordinalPosition: 3 }, { optionId: "neu", ordinalPosition: 2 }] };
  assert.equal(optionSemanticsOf(ordinal, "vsat")?.ordinalPosition, 4);
  assert.equal(validateQuestionSemantics(ordinal).ok, true);
  // Duplicate positions are flagged (structural hygiene, not reasoning).
  const dup: QuestionSemantics = { ...ordinal, options: [{ optionId: "a", ordinalPosition: 1 }, { optionId: "b", ordinalPosition: 1 }] };
  assert.equal(validateQuestionSemantics(dup).ok, false);
  // ordinalPosition on a nominal scale is flagged; no order is invented for nominal.
  const nominal: QuestionSemantics = { questionKey: "pref", scaleType: "nominal", provenance: "source_declared", options: [{ optionId: "a", ordinalPosition: 0 }] };
  assert.equal(validateQuestionSemantics(nominal).ok, false);
});

// ── Missing metadata is a normal, backward-compatible state ─────────────────────
test("inputs WITHOUT semantics still generate candidates and grant no authority", () => {
  const q = { questionKey: "value", questionText: "value", base: 274, sourceType: "survey" as const, contribution: "elicited_perception" as const, options: [{ id: "rewards", label: "Rewards", count: 130 }, { id: "experiences", label: "Experiences", count: 74 }, { id: "other", label: "Other", count: 70 }] };
  const withoutMeta = generateCandidates({ questions: [q], objective: OBJ });
  assert.ok(withoutMeta.length > 0);
  // No generated candidate is granted authority or an interpretation by generation.
  for (const c of withoutMeta) {
    assert.equal(c.constructAuthority, undefined);
    assert.equal((c.results ?? []).some((r) => r.interpretation), false);
  }
  // Adding semantics does not change what generation produces (facts are inert here).
  const withMeta = generateCandidates({ questions: [{ ...q, semantics: { questionKey: "value", constructId: "preference", scaleType: "nominal", provenance: "source_declared", options: q.options.map((o) => ({ optionId: o.id, constructId: "preference" })) } }], objective: OBJ });
  assert.equal(withMeta.length, withoutMeta.length);
});

// ── Metadata ≠ authority (the metadata module is pure facts) ───────────────────
test("the metadata module reports facts and grants NO authority by itself (5R.3 boundary)", () => {
  // Two grouped options genuinely share a governed construct — this is a FACT the
  // resolvers report. The metadata module contains no authority concept at all;
  // deciding what a shared construct PERMITS is Stage 5R.4's entailment engine.
  const qs: QuestionSemantics = { questionKey: "q_g", constructId: "relevance", scaleType: "ordinal", provenance: "source_declared", options: [{ optionId: "a", constructId: "relevance", ordinalPosition: 2 }, { optionId: "b", constructId: "relevance", ordinalPosition: 1 }] };
  assert.equal(sameGovernedConstruct(constructIdOf(qs, "a"), constructIdOf(qs, "b")), true);
  assert.equal(constructIdOf(qs, "a"), "relevance");
  // The resolvers return strings/booleans/scale facts — never an authority value.
  assert.equal(typeof sameGovernedConstruct(constructIdOf(qs, "a"), constructIdOf(qs, "b")), "boolean");
});

// ── Semantic scale vs numeric unit are orthogonal ──────────────────────────────
test("responseScale (ordinal) and Quantity.unit (proportion) are independent", () => {
  const ordinal: QuestionSemantics = { questionKey: "sat", scaleType: "ordinal", provenance: "source_declared", options: [{ optionId: "a", ordinalPosition: 1 }] };
  const r = { id: "r", operation: "share" as const, quantity: proportion(0.4) };
  assert.equal(scaleTypeOf(ordinal), "ordinal");      // measurement kind
  assert.equal(r.quantity.unit, "proportion");         // number representation
  // Neither field derives the other.
});

// ── Metadata provenance distinguishes governed from proposed ───────────────────
test("metadata provenance distinguishes governed metadata from analytically-proposed", () => {
  assert.equal(isGovernedMetadata("source_declared"), true);
  assert.equal(isGovernedMetadata("governed_imported"), true);
  assert.equal(isGovernedMetadata("analytically_proposed"), false); // must not be treated as governed
});

// ── Product-agnostic contract ──────────────────────────────────────────────────
test("the metadata contract fits survey (ordinal+nominal), social, document, qualitative, campaign", () => {
  const cases: QuestionSemantics[] = [
    { questionKey: "sat", constructId: "satisfaction", scaleType: "ordinal", provenance: "source_declared", options: [{ optionId: "vs", constructId: "satisfaction", ordinalPosition: 2 }, { optionId: "s", constructId: "satisfaction", ordinalPosition: 1 }] },
    { questionKey: "reason", constructId: "purchase_reason", scaleType: "nominal", provenance: "source_declared", options: [{ optionId: "price", constructId: "purchase_reason" }, { optionId: "convenience", constructId: "purchase_reason" }] },
    { questionKey: "tone", constructId: "sentiment", scaleType: "nominal", provenance: "governed_imported", options: [{ optionId: "pos", constructId: "sentiment" }, { optionId: "neg", constructId: "sentiment" }] },
    { questionKey: "claim", constructId: "claim_category", scaleType: "nominal", provenance: "governed_imported", options: [{ optionId: "growth", constructId: "claim_category" }] },
    { questionKey: "code", constructId: "theme", scaleType: "nominal", provenance: "governed_imported", options: [{ optionId: "belonging", constructId: "theme" }] },
    { questionKey: "engagement", constructId: "engagement", scaleType: "interval", provenance: "source_declared", options: [{ optionId: "ctr", constructId: "engagement" }] },
  ];
  for (const qs of cases) {
    assert.ok(scaleTypeOf(qs)); // every type resolves
    assert.equal(validateQuestionSemantics(qs).ok, true);
    // First option's construct resolves; no percentages, no authority anywhere.
    assert.ok(constructIdOf(qs, qs.options[0].optionId));
  }
});
