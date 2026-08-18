import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFindingEditorial, selectEvidenceByRefs, assertPublishable, publicationStateValid, sourceSurveys, evidenceView, findingCard } from "./study-finding";
import type { EvidenceItem } from "./study-analysis";

const ev = (ref: string, over: Partial<EvidenceItem> = {}): EvidenceItem => ({
  ref, canonicalQuestionKey: "qk1", question: "Q?", comparability: "combined", scope: "combined",
  surveyId: null, surveyName: null, questionId: null, questionIndex: null,
  optionId: "1", optionLabel: "Opt 1", count: 92, base: 274, percentage: 92 / 274, resultMode: null, ...over,
});

// ── DOMAIN 2, 10: editorial validation ───────────────────────────────────────
test("2. headline is required; commentary optional; bounds enforced", () => {
  assert.equal(validateFindingEditorial({ headline: "" }).ok, false);
  assert.equal(validateFindingEditorial({ headline: "  " }).ok, false);
  const ok = validateFindingEditorial({ headline: " Real ", commentary: " note " });
  assert.equal(ok.ok, true); assert.equal(ok.headline, "Real"); assert.equal(ok.commentary, "note");
  assert.equal(validateFindingEditorial({ headline: "x".repeat(201) }).ok, false);
  assert.equal(validateFindingEditorial({ headline: "ok", commentary: "y".repeat(4001) }).ok, false);
});

// ── DOMAIN 4,5,6,7: evidence selection / dedupe / order / fail-closed ─────────
test("4,5. selects one or many evidence items by ref, preserving order", () => {
  const snap = [ev("a"), ev("b"), ev("c")];
  const one = selectEvidenceByRefs(["b"], snap);
  assert.equal(one.ok, true); assert.equal(one.evidence.length, 1); assert.equal(one.evidence[0].ref, "b");
  const many = selectEvidenceByRefs(["c", "a"], snap);
  assert.deepEqual(many.evidence.map((e) => e.ref), ["c", "a"]); // request order preserved
});

test("6. duplicate refs within a finding are deduped (first wins)", () => {
  const snap = [ev("a"), ev("b")];
  const r = selectEvidenceByRefs(["a", "a", "b"], snap);
  assert.deepEqual(r.evidence.map((e) => e.ref), ["a", "b"]);
  assert.deepEqual(r.duplicates, ["a"]);
});

test("16(unit). an unknown/missing ref fails closed (no fabrication/substitution)", () => {
  const snap = [ev("a")];
  const r = selectEvidenceByRefs(["a", "zzz"], snap);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["zzz"]);
});

test("empty selection is not ok", () => {
  assert.equal(selectEvidenceByRefs([], [ev("a")]).ok, false);
});

// ── DOMAIN 3, PUBLICATION 25,26: publish preconditions ───────────────────────
test("25,26. publishable only when draft + headline + ≥1 evidence", () => {
  assert.equal(assertPublishable({ status: "draft", headline: "H" }, 1).ok, true);
  assert.equal(assertPublishable({ status: "draft", headline: "H" }, 0).ok, false);   // zero evidence
  assert.equal(assertPublishable({ status: "draft", headline: "" }, 1).ok, false);    // no headline
  assert.equal(assertPublishable({ status: "published", headline: "H" }, 3).ok, false); // already published
});

test("publication state invariant: draft ⇒ no stamps; published ⇒ both", () => {
  assert.equal(publicationStateValid({ status: "draft", published_at: null, published_by: null }), true);
  assert.equal(publicationStateValid({ status: "draft", published_at: "2026-01-01", published_by: "x" }), false);
  assert.equal(publicationStateValid({ status: "published", published_at: "2026-01-01", published_by: "x" }), true);
  assert.equal(publicationStateValid({ status: "published", published_at: null, published_by: null }), false);
});

// ── Projections ──────────────────────────────────────────────────────────────
test("evidenceView renders faithfully from the frozen snapshot (no recompute)", () => {
  const v = evidenceView(0, ev("a", { optionLabel: "Strong fit", count: 92, base: 274, percentage: 92 / 274 }));
  assert.equal(v.optionLabel, "Strong fit"); assert.equal(v.count, 92); assert.equal(v.base, 274);
  assert.equal(Math.round((v.percentage ?? 0) * 1000), 336);
});

test("sourceSurveys lists distinct survey sources; combined items contribute none", () => {
  const items = [ev("a", { scope: "combined", surveyId: null }), ev("b", { scope: "survey", surveyId: "A", surveyName: "S1" }), ev("c", { scope: "survey", surveyId: "A", surveyName: "S1" }), ev("d", { scope: "survey", surveyId: "B", surveyName: "S2" })];
  assert.deepEqual(sourceSurveys(items), [{ id: "A", name: "S1" }, { id: "B", name: "S2" }]);
});

test("findingCard projects status/origin/evidenceCount/accountability", () => {
  const c = findingCard({ id: "f1", headline: "H", status: "published", origin_type: "analysis_proposal", created_by: "a@x", created_at: "t0", published_by: "b@x", published_at: "t1" }, 3);
  assert.equal(c.evidenceCount, 3); assert.equal(c.originType, "analysis_proposal"); assert.equal(c.publishedBy, "b@x");
});

// ── Unified frozen-evidence contract (base | derived | segment) ───────────────
import { selectFindingEvidence, evidenceClassOf } from "./study-finding";
const DERIVED = { ref: "derived:leader:study#S|q#q1", kind: "leader" as const, canonicalQuestionKey: "q1", question: "Q?", label: "Leading option X (33.6%) ahead by 2.6pp", value: 2.6, unit: "pp" as const, inputRefs: [], detail: {} };
const SEGMENT = { ref: "derived:seg-spread:study#S|q#q1|dim#country|opt#1", kind: "seg_spread" as const, canonicalQuestionKey: "q1", question: "Q?", dimension: "country" as const, label: "X ranges 20%-40% across countries", value: 20, unit: "pp" as const, inputRefs: [], detail: {} };

test("evidenceClassOf: tags authoritative; untagged base inferred; segment via dimension", () => {
  assert.equal(evidenceClassOf({ evidenceClass: "derived", label: "x", kind: "leader" }), "derived");
  assert.equal(evidenceClassOf(ev("a") as unknown as Record<string, unknown>), "base"); // untagged historical → base
  assert.equal(evidenceClassOf(DERIVED), "derived");
  assert.equal(evidenceClassOf(SEGMENT), "segment");
});

test("selectFindingEvidence resolves base + derived + segment from one snapshot, tagged + in order", () => {
  const snapshot = { evidence: [ev("b"), ev("a")], derived: [DERIVED], segmentDerived: [SEGMENT] };
  const r = selectFindingEvidence(["a", DERIVED.ref, SEGMENT.ref], snapshot);
  assert.equal(r.ok, true);
  assert.deepEqual(r.evidence.map((e) => e.evidenceClass), ["base", "derived", "segment"]);
  assert.equal(r.evidence[0].ref, "a");
});

test("selectFindingEvidence fails closed on any unresolved ref (never partial)", () => {
  const snapshot = { evidence: [ev("a")], derived: [DERIVED] };
  const r = selectFindingEvidence(["a", "derived:leader:study#S|q#GONE"], snapshot);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ["derived:leader:study#S|q#GONE"]);
});

test("evidenceView renders base as a stat and derived/segment as a governed label (no refs)", () => {
  const base = evidenceView(0, { evidenceClass: "base", ...ev("a") });
  assert.equal(base.evidenceClass, "base"); assert.equal(base.count, 92);
  const der = evidenceView(1, { evidenceClass: "derived", ...DERIVED });
  assert.equal(der.evidenceClass, "derived"); assert.equal(der.count, null); assert.match(der.label, /2\.6pp/);
  const seg = evidenceView(2, { evidenceClass: "segment", ...SEGMENT });
  assert.equal(seg.evidenceClass, "segment"); assert.equal(seg.dimension, "country");
  for (const v of [base, der, seg]) assert.doesNotMatch(v.label, /derived:|study#|dim#/);
});
