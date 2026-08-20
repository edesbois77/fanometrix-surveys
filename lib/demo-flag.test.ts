import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDemoFlag } from "./demo-flag";
import type { AuthedUser } from "./auth-server";

// POST /api/submit is public and used to do `is_demo: !!is_demo` straight from
// the body. Combined with DELETE /api/demo/delete — which removes rows on
// `is_demo = true` with no other condition — a client-controlled flag decided
// what a later admin action would destroy.

const user = (role: string): AuthedUser => ({ role } as AuthedUser);

test("anonymous submissions are always real, whatever the body claims", () => {
  assert.equal(resolveDemoFlag(true,   null), false);
  assert.equal(resolveDemoFlag("true", null), false);
  assert.equal(resolveDemoFlag(1,      null), false);
});

test("a non-admin session cannot assert the demo flag", () => {
  assert.equal(resolveDemoFlag(true, user("publisher")), false);
  assert.equal(resolveDemoFlag(true, user("brand")),     false);
});

test("an admin session may assert it — /embed-test depends on this", () => {
  assert.equal(resolveDemoFlag(true, user("admin")), true);
});

test("an admin still gets false unless the flag is explicitly requested", () => {
  assert.equal(resolveDemoFlag(undefined, user("admin")), false);
  assert.equal(resolveDemoFlag(false,     user("admin")), false);
});

test("only boolean true counts — the old !! coercion accepted these as true", () => {
  for (const truthy of ["false", "0", 1, {}, [], "yes"]) {
    assert.equal(resolveDemoFlag(truthy, user("admin")), false, `${JSON.stringify(truthy)} must not assert demo`);
  }
});
