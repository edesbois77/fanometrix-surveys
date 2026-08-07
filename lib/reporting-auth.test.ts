import { test } from "node:test";
import assert from "node:assert/strict";
import { isReportingAuthorized, isReportingKeyConfigured } from "./reporting-auth";

const KEY = "s3cr3t-reporting-key";
const bearer = (k: string) => `Bearer ${k}`;

// ── Fail closed on missing / unusable configuration ──────────────────────────
// The security requirement: a missing/empty/whitespace-only key must NEVER
// produce ALLOW, regardless of what credential the caller presents.

test("missing key (undefined) → refused, even with a plausible credential", () => {
  assert.equal(isReportingAuthorized(bearer("anything"), "anything", undefined), false);
  assert.equal(isReportingAuthorized(null, null, undefined), false);
});

test("missing key (null) → refused", () => {
  assert.equal(isReportingAuthorized(bearer("anything"), "anything", null), false);
});

test("empty key ('') → refused", () => {
  assert.equal(isReportingAuthorized(bearer(""), "", ""), false);
  assert.equal(isReportingAuthorized(bearer("anything"), "anything", ""), false);
});

test("whitespace-only key → refused (treated as unconfigured)", () => {
  assert.equal(isReportingAuthorized(bearer("   "), "   ", "   "), false);
  assert.equal(isReportingAuthorized(bearer("anything"), "anything", "\t\n "), false);
});

// ── Reject when configured but credential is wrong or absent ──────────────────

test("configured key, no credential presented → refused", () => {
  assert.equal(isReportingAuthorized(null, null, KEY), false);
  assert.equal(isReportingAuthorized(undefined, undefined, KEY), false);
});

test("configured key, incorrect Bearer credential → refused", () => {
  assert.equal(isReportingAuthorized(bearer("wrong-key"), null, KEY), false);
});

test("configured key, incorrect api_key query credential → refused", () => {
  assert.equal(isReportingAuthorized(null, "wrong-key", KEY), false);
});

test("raw key in Authorization header without 'Bearer ' prefix → refused", () => {
  assert.equal(isReportingAuthorized(KEY, null, KEY), false);
});

test("correct key as api_key but placed in the Authorization slot as bearer of wrong value → refused", () => {
  assert.equal(isReportingAuthorized(bearer("nope"), null, KEY), false);
});

// ── Permit only the correct configured credential ─────────────────────────────

test("correct Bearer credential → permitted", () => {
  assert.equal(isReportingAuthorized(bearer(KEY), null, KEY), true);
});

test("correct api_key query credential → permitted", () => {
  assert.equal(isReportingAuthorized(null, KEY, KEY), true);
});

test("correct credential in one channel, junk in the other → permitted", () => {
  assert.equal(isReportingAuthorized(bearer("junk"), KEY, KEY), true);
  assert.equal(isReportingAuthorized(bearer(KEY), "junk", KEY), true);
});

test("key configured with stray surrounding whitespace still matches the trimmed secret", () => {
  // A key set with an accidental trailing newline should authenticate against
  // the intended (trimmed) secret, and must not accept the untrimmed form.
  assert.equal(isReportingAuthorized(bearer(KEY), null, `${KEY}\n`), true);
  assert.equal(isReportingAuthorized(bearer(`${KEY}\n`), null, `${KEY}\n`), false);
});

// ── Config-status helper (drives the non-sensitive api_key_configured flag) ────

test("isReportingKeyConfigured reflects a usable (trimmed non-empty) key", () => {
  assert.equal(isReportingKeyConfigured(KEY), true);
  assert.equal(isReportingKeyConfigured(undefined), false);
  assert.equal(isReportingKeyConfigured(null), false);
  assert.equal(isReportingKeyConfigured(""), false);
  assert.equal(isReportingKeyConfigured("   "), false);
});
