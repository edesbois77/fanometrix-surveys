import { test } from "node:test";
import assert from "node:assert/strict";
import { isSessionRevoked } from "./session-currency";

// ORG-005 · IW-9 — session/token currency (Q-31/Q-33; F058/F059).

// ── F058/F059 — a bumped live version revokes earlier-issued sessions ─────────

test("session is revoked when its issued version is behind the live version", () => {
  assert.equal(isSessionRevoked(3, 4), true);   // a bump (revoke/password change) invalidated it
  assert.equal(isSessionRevoked(0, 1), true);
});

test("a session issued at the current version is not revoked", () => {
  assert.equal(isSessionRevoked(4, 4), false);
});

// ── F060 anti-resurrection — a stale token never out-votes the current version ─

test("a token can never be 'more current' than the live version (no resurrection)", () => {
  // Even a higher stale value is a mismatch → revoked; the live version governs.
  assert.equal(isSessionRevoked(5, 4), true);
});

// ── Fail-safe pre-activation — never a FALSE revocation ──────────────────────

test("undefined version (legacy token or unprovisioned column) is treated as current", () => {
  assert.equal(isSessionRevoked(undefined, 4), false); // legacy token pre-activation
  assert.equal(isSessionRevoked(3, undefined), false); // column not provisioned
  assert.equal(isSessionRevoked(undefined, undefined), false);
});

// ── Purity ───────────────────────────────────────────────────────────────────

test("isSessionRevoked is pure/deterministic", () => {
  assert.equal(isSessionRevoked(1, 2), isSessionRevoked(1, 2));
});
