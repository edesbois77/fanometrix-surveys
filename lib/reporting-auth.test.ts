import { test } from "node:test";
import assert from "node:assert/strict";
import { isReportingAuthorized, isReportingKeyConfigured } from "./reporting-auth";

const KEY = "s3cr3t-reporting-key";
const bearer = (k: string) => `Bearer ${k}`;

// ORG-005 · IW-10 / F052 (D-F052 Option A): reporting auth is HEADER-ONLY.
// The `?api_key=` URL query-parameter path was removed so the credential can
// never appear in request URLs / access logs (G2). `isReportingAuthorized`
// now takes (authorizationHeader, key) only.

// ── Fail closed on missing / unusable configuration ──────────────────────────
// The security requirement: a missing/empty/whitespace-only key must NEVER
// produce ALLOW, regardless of what credential the caller presents.

test("missing key (undefined) → refused, even with a plausible credential", () => {
  assert.equal(isReportingAuthorized(bearer("anything"), undefined), false);
  assert.equal(isReportingAuthorized(null, undefined), false);
});

test("missing key (null) → refused", () => {
  assert.equal(isReportingAuthorized(bearer("anything"), null), false);
});

test("empty key ('') → refused", () => {
  assert.equal(isReportingAuthorized(bearer(""), ""), false);
  assert.equal(isReportingAuthorized(bearer("anything"), ""), false);
});

test("whitespace-only key → refused (treated as unconfigured)", () => {
  assert.equal(isReportingAuthorized(bearer("   "), "   "), false);
  assert.equal(isReportingAuthorized(bearer("anything"), "\t\n "), false);
});

// ── Reject when configured but credential is wrong or absent ──────────────────

test("configured key, no credential presented → refused", () => {
  assert.equal(isReportingAuthorized(null, KEY), false);
  assert.equal(isReportingAuthorized(undefined, KEY), false);
});

test("configured key, incorrect Bearer credential → refused", () => {
  assert.equal(isReportingAuthorized(bearer("wrong-key"), KEY), false);
});

test("raw key in Authorization header without 'Bearer ' prefix → refused", () => {
  assert.equal(isReportingAuthorized(KEY, KEY), false);
});

test("correct key placed in the Authorization slot as bearer of wrong value → refused", () => {
  assert.equal(isReportingAuthorized(bearer("nope"), KEY), false);
});

// ── The removed query-parameter path must never authorise ─────────────────────
// (Guards against a regression that re-introduces `?api_key=` acceptance.)

test("the correct key presented as a bare value (as a query param would be) → refused", () => {
  // A caller sending the raw key (no `Bearer ` prefix) — which is exactly what
  // the old `?api_key=<key>` path accepted — must now be refused.
  assert.equal(isReportingAuthorized(KEY, KEY), false);
});

// ── Permit only the correct configured Bearer credential ──────────────────────

test("correct Bearer credential → permitted", () => {
  assert.equal(isReportingAuthorized(bearer(KEY), KEY), true);
});

test("key configured with stray surrounding whitespace still matches the trimmed secret", () => {
  // A key set with an accidental trailing newline should authenticate against
  // the intended (trimmed) secret, and must not accept the untrimmed form.
  assert.equal(isReportingAuthorized(bearer(KEY), `${KEY}\n`), true);
  assert.equal(isReportingAuthorized(bearer(`${KEY}\n`), `${KEY}\n`), false);
});

// ── Config-status helper (drives the non-sensitive api_key_configured flag) ────

test("isReportingKeyConfigured reflects a usable (trimmed non-empty) key", () => {
  assert.equal(isReportingKeyConfigured(KEY), true);
  assert.equal(isReportingKeyConfigured(undefined), false);
  assert.equal(isReportingKeyConfigured(null), false);
  assert.equal(isReportingKeyConfigured(""), false);
  assert.equal(isReportingKeyConfigured("   "), false);
});
