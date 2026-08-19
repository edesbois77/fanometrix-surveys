// ── Usefulness policy — the ranking a smart researcher would apply (pure) ─────
import { test } from "node:test";
import assert from "node:assert/strict";
import { HEADLINE_MIN, leaderUsefulness, segmentUsefulness, segmentUsefulnessForDimension, defaultUsefulness, effectiveUsefulness } from "./usefulness";

test("ordering: governed > material segment > topline leader > routine observed", () => {
  const governed = defaultUsefulness({ basis: "governed" });
  const reversal = segmentUsefulness("seg_reversal", 10);
  const concentration = segmentUsefulness("seg_concentration", 16);
  const spread = segmentUsefulness("seg_spread", 22);
  const bigLeader = leaderUsefulness(9.2);
  const routine = defaultUsefulness({ basis: "observed" });
  assert.ok(governed > reversal && reversal >= concentration - 20 && concentration > bigLeader && spread > bigLeader && bigLeader > routine);
});

test("a material segment clears the headline bar; a bare topline leader does NOT", () => {
  assert.ok(segmentUsefulness("seg_spread", 22) >= HEADLINE_MIN, "segment headlines");
  assert.ok(segmentUsefulness("seg_concentration", 16) >= HEADLINE_MIN, "concentration headlines");
  assert.ok(leaderUsefulness(9.2) < HEADLINE_MIN, "a 9pp topline lead does NOT headline");
});

test("a genuinely dominant topline DOES headline (large margin)", () => {
  assert.ok(leaderUsefulness(40) >= HEADLINE_MIN, "60% vs 20% (40pp) earns headline space");
});

test("governed always headlines; exploratory never", () => {
  assert.ok(defaultUsefulness({ basis: "governed" }) >= HEADLINE_MIN);
  assert.ok(defaultUsefulness({ basis: "exploratory" }) < HEADLINE_MIN);
});

test("pointed segment kinds (reversal/concentration) outrank a mere spread at equal magnitude", () => {
  assert.ok(segmentUsefulness("seg_reversal", 10) > segmentUsefulness("seg_spread", 10));
  assert.ok(segmentUsefulness("seg_concentration", 10) > segmentUsefulness("seg_spread", 10));
});

test("effectiveUsefulness uses the attached score when present, else the default", () => {
  assert.equal(effectiveUsefulness({ basis: "observed", usefulness: 77 } as never), 77);
  assert.equal(effectiveUsefulness({ basis: "observed" } as never), defaultUsefulness({ basis: "observed" }));
});

// ── Segment-dimension presentation priority (STEP 7) ─────────────────────────
test("a technical dimension (device) is de-prioritised below the same finding on a research dimension", () => {
  const market = segmentUsefulnessForDimension("seg_reversal", 2, "market");
  const device = segmentUsefulnessForDimension("seg_reversal", 2, "device");
  assert.ok(device < market, "device ranks below market for an identical finding");
  assert.equal(market, segmentUsefulness("seg_reversal", 2), "research dimension keeps full weight");
});

test("a routine device reversal does NOT clear the headline bar, but the same reversal by market DOES", () => {
  assert.ok(segmentUsefulnessForDimension("seg_reversal", 2, "market") >= HEADLINE_MIN, "market reversal headlines");
  assert.ok(segmentUsefulnessForDimension("seg_reversal", 2, "device") < HEADLINE_MIN, "device reversal stays subordinate");
});

test("an EXCEPTIONALLY strong device effect can still climb back over the bar on its own magnitude", () => {
  assert.ok(segmentUsefulnessForDimension("seg_concentration", 26, "device") >= HEADLINE_MIN, "a 26pp device concentration is exceptional enough to headline");
  assert.ok(segmentUsefulnessForDimension("seg_concentration", 5, "device") < HEADLINE_MIN, "a modest device concentration does not");
});

test("research dimensions (country/publisher/market) are all full-weight; only device is lowered", () => {
  for (const dim of ["market", "country", "publisher", "survey"]) {
    assert.equal(segmentUsefulnessForDimension("seg_spread", 12, dim), segmentUsefulness("seg_spread", 12), `${dim} full weight`);
  }
  assert.ok(segmentUsefulnessForDimension("seg_spread", 12, "device") < segmentUsefulness("seg_spread", 12));
});
