// Auth for the cron worker route. These prove the security-critical decision
// directly: which Authorization headers open the gate (→ route returns 200) and
// which do not (→ route returns 401). Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCronAuthorized } from "./cron-auth";

const SECRET = "s3cr3t-value";

test("no bearer token → unauthorized (route would 401)", () => {
  assert.equal(isCronAuthorized(null, SECRET), false);
  assert.equal(isCronAuthorized(undefined, SECRET), false);
  assert.equal(isCronAuthorized("", SECRET), false);
});

test("wrong bearer token → unauthorized (route would 401)", () => {
  assert.equal(isCronAuthorized("Bearer wrong-secret", SECRET), false);
  assert.equal(isCronAuthorized(`Bearer ${SECRET}x`, SECRET), false); // length differs
  assert.equal(isCronAuthorized("Bearer ", SECRET), false);
  assert.equal(isCronAuthorized(SECRET, SECRET), false);              // missing "Bearer " prefix
  assert.equal(isCronAuthorized("Basic " + SECRET, SECRET), false);
});

test("correct CRON_SECRET → authorized (route would 200)", () => {
  assert.equal(isCronAuthorized(`Bearer ${SECRET}`, SECRET), true);
});

test("fails closed when no secret is configured", () => {
  // An unset CRON_SECRET must never mean "open" — even a well-formed header.
  assert.equal(isCronAuthorized(`Bearer ${SECRET}`, undefined), false);
  assert.equal(isCronAuthorized("Bearer ", ""), false);
});
