// ── Usefulness policy — the ranking a smart researcher would apply (pure) ─────
import { test } from "node:test";
import assert from "node:assert/strict";
import { HEADLINE_MIN, leaderUsefulness, segmentUsefulness, defaultUsefulness, effectiveUsefulness } from "./usefulness";

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
