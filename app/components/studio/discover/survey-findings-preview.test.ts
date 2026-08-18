import { test } from "node:test";
import assert from "node:assert/strict";
import { findingsPreview, PREVIEW_STATES } from "./performance-fixtures";
import { CORRELATION_BANNED } from "@/lib/studio/survey-findings-engine";

// The findings preview runs the REAL deterministic engine over the same fixture
// distributions the Results preview uses, so these double as integration checks.

test("every preview state produces a valid, correlation-free findings payload", () => {
  for (const s of PREVIEW_STATES) {
    const p = findingsPreview(s);
    assert.equal(p.authorised, true);
    assert.ok(["emerging", "final", "none"].includes(p.context));
    for (const f of p.findings) {
      for (const re of CORRELATION_BANNED) {
        assert.doesNotMatch(f.title, re, `state ${s}: ${f.title}`);
        assert.doesNotMatch(f.detail ?? "", re, `state ${s}: ${f.detail}`);
      }
    }
  }
});

test("historical exposure-heavy → Final, surfaces a market difference", () => {
  const p = findingsPreview("exposure-heavy");
  assert.equal(p.context, "final");
  assert.equal(p.mode, "historical_completed_only");
  assert.ok(p.findings.some((f) => f.type === "market"), "expected a market difference from the two-market fixture");
});

test("healthy studio-native → Emerging, substantial findings, still bounded", () => {
  const p = findingsPreview("healthy");
  assert.equal(p.context, "emerging");
  // Per-question coverage makes the baseline substantial, but it stays bounded.
  assert.ok(p.findings.length > 2 && p.findings.length <= 8);
});

test("a closed survey with data → Final context with evidence-backed findings", () => {
  // (resultsPreview only zeroes delivery metrics for "empty"; its answer
  // distributions still exist, so this exercises the Final path, not none.)
  const p = findingsPreview("empty");
  assert.equal(p.context, "final");
  assert.ok(p.findings.length > 0);
  assert.ok(p.findings.every((f) => f.base >= 30), "no finding below the base gate");
});
