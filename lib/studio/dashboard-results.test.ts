import { test } from "node:test";
import assert from "node:assert/strict";
import { marginOfError } from "./dashboard-results";

test("margin of error uses the canonical 1.96·√(0.25/n) at the QUESTION base", () => {
  assert.equal(marginOfError(0), null);           // no base → no claim
  assert.equal(marginOfError(100), 9.8);          // 0.98/√100 = 0.098 → 9.8pp
  assert.equal(marginOfError(584), 4.1);          // ≈ ±4.1% at 95%
  assert.ok((marginOfError(385) ?? 99) <= 5, "n≈385 → ±5% (High)");
});
