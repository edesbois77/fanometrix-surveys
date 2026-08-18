import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GO_LIVE_UNDO_GRACE_MS,
  isWithinGoLiveUndoGrace,
  goLiveUndoCutoffISO,
} from "./campaign-lifecycle";

const t0 = Date.parse("2026-08-13T10:00:00.000Z");

test("grace window is 2 minutes", () => {
  assert.equal(GO_LIVE_UNDO_GRACE_MS, 120_000);
});

test("a just-live campaign is within grace; an old one is not", () => {
  const wentLive = "2026-08-13T10:00:00.000Z";
  assert.equal(isWithinGoLiveUndoGrace("live", wentLive, t0 + 30_000), true);   // +30s
  assert.equal(isWithinGoLiveUndoGrace("live", wentLive, t0 + 119_000), true);  // +1m59s
  assert.equal(isWithinGoLiveUndoGrace("live", wentLive, t0 + 120_001), false); // just past 2m
  assert.equal(isWithinGoLiveUndoGrace("live", wentLive, t0 + 600_000), false); // +10m
});

test("only stored-Live campaigns are undoable — never scheduled/draft/closed", () => {
  const wentLive = "2026-08-13T10:00:00.000Z";
  for (const s of ["draft", "scheduled", "closed", "paused", "archived"]) {
    assert.equal(isWithinGoLiveUndoGrace(s, wentLive, t0 + 1_000), false);
  }
});

test("missing/invalid go-live timestamp is never in grace", () => {
  assert.equal(isWithinGoLiveUndoGrace("live", null, t0), false);
  assert.equal(isWithinGoLiveUndoGrace("live", undefined, t0), false);
  assert.equal(isWithinGoLiveUndoGrace("live", "not-a-date", t0), false);
});

test("server cutoff matches the client window (one shared definition)", () => {
  const now = new Date(t0);
  const cutoff = Date.parse(goLiveUndoCutoffISO(now));
  assert.equal(cutoff, t0 - GO_LIVE_UNDO_GRACE_MS);
  // A go-live strictly after the cutoff is inside the window (server .gt guard);
  // one at/older than the cutoff is outside — mirroring isWithinGoLiveUndoGrace.
  assert.ok(t0 - 60_000 > cutoff);           // 1m ago → undoable
  assert.ok(!(t0 - 121_000 > cutoff));       // 2m1s ago → locked
});
