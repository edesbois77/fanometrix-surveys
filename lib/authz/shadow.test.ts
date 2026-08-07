import { test } from "node:test";
import assert from "node:assert/strict";
import { recordShadow, shadowStats, __resetShadow } from "./shadow";
import { evaluate, type DecisionInput } from "./decision";

const base: DecisionInput = {
  session: "present", principalStatus: "active", role: "publisher", isAdmin: false,
  orgStatus: "active", allowedRoles: undefined, resourceVisibility: "not_applicable", explicitDeny: null,
};

test("matching outcome records an evaluation, no divergence", () => {
  __resetShadow();
  const allow = evaluate({ ...base, resourceVisibility: "visible" });
  recordShadow("requireUser", allow, true); // legacy also allowed
  const s = shadowStats();
  assert.equal(s.evaluated, 1);
  assert.equal(s.divergent, 0);
});

test("effect divergence is recorded", () => {
  __resetShadow();
  const refuse = evaluate({ ...base, resourceVisibility: "not_visible" });
  recordShadow("requireUser", refuse, true); // legacy allowed but seam refuses → divergent
  const s = shadowStats();
  assert.equal(s.evaluated, 1);
  assert.equal(s.divergent, 1);
  assert.equal(s.lastDivergenceSite, "requireUser");
});

test("INDETERMINATE vs a legacy deny is NOT an effect divergence (both deny)", () => {
  __resetShadow();
  const indet = evaluate({ ...base, principalStatus: "indeterminate" });
  recordShadow("requireUser", indet, false); // legacy denied; seam INDETERMINATE (also deny)
  assert.equal(shadowStats().divergent, 0);
});

test("recordShadow never throws (shadow must not break auth)", () => {
  __resetShadow();
  // @ts-expect-error — deliberately malformed input; must be swallowed.
  assert.doesNotThrow(() => recordShadow("x", null, true));
});
