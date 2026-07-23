import { test } from "node:test";
import assert from "node:assert/strict";
import { needIdFor, withNeedIds, flattenNeeds, asMethodFit, type InformationNeeds } from "./information-needs";

// An Information Need is a core domain object: it sits between a Research
// Requirement and the Findings that answer it, and a Finding anchors to it
// (docs/intelligence-model.md §4 Layer 1). These tests guard the two properties
// that makes possible: stable identity, and a method verdict that is not thrown
// away between the design and the evidence.

const needs = (over: Partial<InformationNeeds["themes"][number]> = {}): InformationNeeds => ({
  themes: [{
    aspect: "Brand Perception",
    description: "How the sponsorship is seen",
    needs: [
      { id: "", need: "How do fans describe the sponsorship?", method_fit: "primary", rationale: "" },
      { id: "", need: "What do they associate with it?", method_fit: "supporting", rationale: "" },
    ],
    ...over,
  }],
});

// ── Identity ─────────────────────────────────────────────────────────────────

test("a need seen for the first time is given an id derived from its text", () => {
  const identified = withNeedIds(needs());
  const [a, b] = identified.themes[0].needs;
  assert.ok(a.id.startsWith("need_"));
  assert.notEqual(a.id, b.id, "two needs in one theme must not collide");
});

test("the seed is deterministic, so stored data and fresh code agree without a backfill", () => {
  assert.equal(
    needIdFor("Brand Perception", "How do fans describe the sponsorship?"),
    needIdFor("brand perception", "  How do fans describe the sponsorship?  "),
    "casing and surrounding space must not change identity",
  );
});

test("the same question under a different aspect is a different need", () => {
  assert.notEqual(needIdFor("Brand Perception", "Is it working?"), needIdFor("Brand Fit", "Is it working?"));
});

test("an existing id is never recomputed, so a need survives being reworded", () => {
  // The whole point of identity. A finding anchored to this need must not lose
  // its question because the question was rephrased.
  const original = withNeedIds(needs());
  const assignedId = original.themes[0].needs[0].id;

  const reworded: InformationNeeds = {
    themes: [{
      ...original.themes[0],
      needs: [
        { ...original.themes[0].needs[0], need: "In their own words, how do fans talk about the sponsorship?" },
        original.themes[0].needs[1],
      ],
    }],
  };

  assert.equal(withNeedIds(reworded).themes[0].needs[0].id, assignedId);
});

test("assigning ids is idempotent, so it is safe on every read", () => {
  const once = withNeedIds(needs());
  const twice = withNeedIds(once);
  assert.deepEqual(twice, once);
});

// ── Method fit is carried, not discarded ─────────────────────────────────────

test("flattening a need carries its identity and the design's verdict on the method", () => {
  // This used to return { aspect, need } only, and both task generators then
  // hardcoded "primary", so a design that reasoned carefully about what each
  // method could do handed every source the same undifferentiated list
  // (docs/evidence-contribution.md §1).
  const flat = flattenNeeds(withNeedIds(needs()));
  assert.equal(flat.length, 2);
  assert.ok(flat[0].id.startsWith("need_"));
  assert.equal(flat[0].method_fit, "primary");
  assert.equal(flat[1].method_fit, "supporting");
});

test("a need stored before ids existed is flattened with its seeded id", () => {
  const legacy = { themes: [{ aspect: "Fan Value", description: "", needs: [{ need: "What do fans get out of it?", method_fit: "primary" }] }] };
  const flat = flattenNeeds(legacy);
  assert.equal(flat[0].id, needIdFor("Fan Value", "What do fans get out of it?"));
});

test("an unknown method verdict reads as conditional, never as primary", () => {
  // Where we do not know whether a method can answer a need, assuming it can is
  // the assumption that produced the failure this field exists to prevent.
  assert.equal(asMethodFit(undefined), "conditional");
  assert.equal(asMethodFit("nonsense"), "conditional");
  assert.equal(asMethodFit("not_suitable"), "not_suitable");
  assert.equal(asMethodFit("Primary"), "primary");
});

test("a theme with no aspect or a need with no text is dropped rather than half-identified", () => {
  const broken = { themes: [{ aspect: "", needs: [{ need: "orphaned" }] }, { aspect: "Fine", needs: [{ need: "" }] }] };
  assert.deepEqual(flattenNeeds(broken), []);
});
