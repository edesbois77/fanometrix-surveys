import { test } from "node:test";
import assert from "node:assert/strict";
import { allowSessionEvent, __resetThrottle, __THROTTLE_LIMITS } from "./embed-throttle";

const { MAX_EVENTS, WINDOW_MS } = __THROTTLE_LIMITS;

test("allows a normal session (well under the cap)", () => {
  __resetThrottle();
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) {
    assert.equal(allowSessionEvent("session-a", t0 + i), true);
  }
});

test("blocks a session that exceeds MAX_EVENTS within the window", () => {
  __resetThrottle();
  const t0 = 1_000_000;
  for (let i = 0; i < MAX_EVENTS; i++) {
    assert.equal(allowSessionEvent("spammer", t0), true, `event ${i} should pass`);
  }
  // The next one within the same window is over the cap.
  assert.equal(allowSessionEvent("spammer", t0), false);
});

test("the window resets after WINDOW_MS", () => {
  __resetThrottle();
  const t0 = 1_000_000;
  for (let i = 0; i < MAX_EVENTS; i++) allowSessionEvent("s", t0);
  assert.equal(allowSessionEvent("s", t0), false);
  // After the window elapses the counter starts fresh.
  assert.equal(allowSessionEvent("s", t0 + WINDOW_MS + 1), true);
});

test("distinct sessions do not interfere (carrier-NAT safety property)", () => {
  __resetThrottle();
  const t0 = 1_000_000;
  // One session maxes out...
  for (let i = 0; i < MAX_EVENTS + 5; i++) allowSessionEvent("busy", t0);
  // ...a different fan's session is completely unaffected.
  assert.equal(allowSessionEvent("other-fan", t0), true);
});
