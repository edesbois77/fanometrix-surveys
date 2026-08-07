import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CONFORMANCE_MANIFEST, manifestSummary } from "./manifest";

// Harness integrity: every governed conformance item must point at an existing
// evidence file, and the regression floor + RETAIN set must be present.

const root = resolve(__dirname, "..", "..", "..");

test("every manifest evidence file exists", () => {
  for (const item of CONFORMANCE_MANIFEST) {
    for (const f of item.evidence) {
      assert.ok(existsSync(resolve(root, f)), `missing evidence file for ${item.ref}: ${f}`);
    }
  }
});

test("the three remediated-vulnerability regressions are in the floor", () => {
  const regs = CONFORMANCE_MANIFEST.filter(i => i.cls === "REGRESSION").map(i => i.ref);
  assert.ok(regs.includes("F005-reporting"));
  assert.ok(regs.includes("F040"));
  assert.ok(regs.includes("F041"));
});

test("every TARGET item names its closing workstream", () => {
  for (const item of CONFORMANCE_MANIFEST.filter(i => i.cls === "TARGET")) {
    assert.ok(item.closesAt, `TARGET ${item.ref} must name a closing workstream`);
  }
});

test("manifest summary is internally consistent", () => {
  const s = manifestSummary();
  assert.equal(s.total, s.HELD + s.TARGET + s.REGRESSION);
  assert.ok(s.HELD > 0 && s.TARGET > 0 && s.REGRESSION === 3);
});
