// ── Stage 5D — governed scale templates + server-side governance (pure) ──────
import { test } from "node:test";
import assert from "node:assert/strict";
import { getScaleTemplate, listScaleTemplates, governQuestionSemantics, governSurveyQuestions, resolveInstrumentSemantics, SCALE_TEMPLATES } from "./scale-templates";
import { normaliseQuestions } from "./survey-results-resolve";

const q4 = () => ({ id: "q1", text: { en: "Rate X?" }, options: [
  { id: 1, text: { en: "Love it" } }, { id: 2, text: { en: "Fine" } }, { id: 3, text: { en: "Meh" } }, { id: 4, text: { en: "Hate it" } },
] });

test("catalog is closed + option counts fit the 2–4 product limit", () => {
  assert.ok(SCALE_TEMPLATES.length > 0);
  for (const t of SCALE_TEMPLATES) {
    assert.ok(t.positions.length >= 2 && t.positions.length <= 4, `${t.key} within 2–4`);
    assert.equal(t.scaleType, "ordinal");
    const ranks = t.positions.map((p) => p.ordinalPosition);
    assert.equal(new Set(ranks).size, ranks.length, `${t.key} distinct ranks`);
  }
  assert.deepEqual(listScaleTemplates().find((t) => t.key === "satisfaction_4"), { key: "satisfaction_4", label: "Satisfaction (4-point)", optionCount: 4 });
});

test("§3/§5 applying a valid template establishes scaleType + per-option ordinalPosition + polarity (from the SLOT, not wording)", () => {
  const g = governQuestionSemantics({ ...q4(), scale_template: "satisfaction_4" });
  assert.equal(g.scale_type, "ordinal");
  assert.equal(g.construct_key, "satisfaction");
  assert.equal(g.scale_template, "satisfaction_4");
  // "Love it"/"Fine" are author wording in the two POSITIVE slots — polarity comes from the slot.
  assert.deepEqual(g.options!.map((o) => [o.ordinal_position, o.polarity]), [[4, "positive"], [3, "positive"], [2, "negative"], [1, "negative"]]);
});

test("§6 custom question (no template) gains NO semantics — missing stays missing", () => {
  const g = governQuestionSemantics(q4());
  assert.equal(g.scale_type, undefined);
  assert.equal(g.construct_key, undefined);
  for (const o of g.options ?? []) { assert.equal(o.ordinal_position, undefined); assert.equal(o.polarity, undefined); }
});

test("§15 client-supplied polarity/ordinal WITHOUT a template is stripped (no fabrication)", () => {
  const hostile = { ...q4(), scale_type: "ordinal" as const, construct_key: "smuggled", options: q4().options.map((o, i) => ({ ...o, ordinal_position: i, polarity: "positive" as const })) };
  const g = governQuestionSemantics(hostile);
  assert.equal(g.scale_type, undefined, "no template ⇒ scale_type dropped");
  assert.equal(g.construct_key, undefined);
  for (const o of g.options ?? []) { assert.equal(o.ordinal_position, undefined); assert.equal(o.polarity, undefined); }
});

test("§7 template whose option count does not match the question ⇒ semantics stripped (never partial)", () => {
  const threeOpt = { id: "q1", text: { en: "?" }, options: [{ id: 1, text: {} }, { id: 2, text: {} }, { id: 3, text: {} }] };
  const g = governQuestionSemantics({ ...threeOpt, scale_template: "satisfaction_4" });
  assert.equal(g.scale_type, undefined);
});

test("governance is idempotent", () => {
  const once = governQuestionSemantics({ ...q4(), scale_template: "agreement_4" });
  const twice = governQuestionSemantics(once);
  assert.deepEqual(twice, once);
});

test("§1 normaliseQuestions PRESERVES governed semantics (read path) but still strips unknown keys", () => {
  const stored = [{ ...governQuestionSemantics({ ...q4(), scale_template: "satisfaction_4" }), junk: "x", options: governQuestionSemantics({ ...q4(), scale_template: "satisfaction_4" }).options!.map((o) => ({ ...o, junk: "y" })) }];
  const [n] = normaliseQuestions(stored);
  assert.equal(n.scale_type, "ordinal");
  assert.equal(n.construct_key, "satisfaction");
  assert.equal((n as unknown as Record<string, unknown>).junk, undefined, "unknown question key stripped");
  assert.deepEqual(n.options.map((o) => [o.ordinal_position, o.polarity]), [[4, "positive"], [3, "positive"], [2, "negative"], [1, "negative"]]);
  assert.equal((n.options[0] as unknown as Record<string, unknown>).junk, undefined, "unknown option key stripped");
});

test("§7 resolveInstrumentSemantics returns governed facts only for governed questions", () => {
  const governed = governQuestionSemantics({ ...q4(), scale_template: "satisfaction_4" });
  const custom = governQuestionSemantics({ id: "q2", text: { en: "?" }, options: [{ id: 1, text: {} }, { id: 2, text: {} }] });
  const map = resolveInstrumentSemantics([governed, custom]);
  assert.ok(map["q1"], "governed question present");
  assert.equal(map["q1"]!.scaleType, "ordinal");
  assert.equal(map["q1"]!.constructKey, "satisfaction");
  assert.deepEqual(map["q1"]!.options["1"], { ordinalPosition: 4, polarity: "positive" });
  assert.equal(map["q2"], undefined, "custom question absent");
});

test("governSurveyQuestions governs each question + leaves non-objects alone", () => {
  const out = governSurveyQuestions([{ ...q4(), scale_template: "quality_4" }, null]) as Array<Record<string, unknown>>;
  assert.equal(out[0].scale_type, "ordinal");
  assert.equal(out[1], null);
});

test("getScaleTemplate returns undefined for unknown keys", () => {
  assert.equal(getScaleTemplate("nope"), undefined);
  assert.equal(getScaleTemplate(undefined), undefined);
});
