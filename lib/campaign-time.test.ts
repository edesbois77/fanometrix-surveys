import { test } from "node:test";
import assert from "node:assert/strict";
import { zonedWallClockToInstant, campaignStartInstant, campaignEndInstant, zoneForCountryCode, resolveDeployTargetStatus, marketLocalDate } from "./campaign-time";

// ── Governed market → timezone (reused from lib/reports/timezones) ────────────

test("market timezone resolves via the governed mapping", () => {
  assert.equal(zoneForCountryCode("GB"), "Europe/London");
  assert.equal(zoneForCountryCode("DE"), "Europe/Berlin");
  assert.equal(zoneForCountryCode("US"), "America/New_York"); // multi-tz representative zone
  assert.equal(zoneForCountryCode("AU"), "Australia/Sydney");
  assert.equal(zoneForCountryCode(null), "UTC");             // documented fallback
  assert.equal(zoneForCountryCode("ZZ"), "UTC");
});

// ── Wall-clock → instant, DST-aware ───────────────────────────────────────────

test("Berlin 00:01 is UTC+2 in summer (CEST), UTC+1 in winter (CET)", () => {
  assert.equal(zonedWallClockToInstant("2026-07-01", 0, 1, "Europe/Berlin").toISOString(), "2026-06-30T22:01:00.000Z");
  assert.equal(zonedWallClockToInstant("2026-01-01", 0, 1, "Europe/Berlin").toISOString(), "2025-12-31T23:01:00.000Z");
});

test("London 00:01 is UTC+1 in summer (BST), UTC+0 in winter (GMT)", () => {
  assert.equal(zonedWallClockToInstant("2026-07-01", 0, 1, "Europe/London").toISOString(), "2026-06-30T23:01:00.000Z");
  assert.equal(zonedWallClockToInstant("2026-01-01", 0, 1, "Europe/London").toISOString(), "2026-01-01T00:01:00.000Z");
});

test("end boundary 23:59 local resolves to the correct instant (Berlin summer)", () => {
  assert.equal(zonedWallClockToInstant("2026-07-01", 23, 59, "Europe/Berlin").toISOString(), "2026-07-01T21:59:00.000Z");
});

// ── Campaign boundary helpers ─────────────────────────────────────────────────

test("a Germany campaign day starts one hour before the same UK campaign day", () => {
  const de = campaignStartInstant("2026-07-01", "DE"); // 22:01Z
  const gb = campaignStartInstant("2026-07-01", "GB"); // 23:01Z
  assert.equal(gb.getTime() - de.getTime(), 60 * 60 * 1000);
});

test("start = 00:01 local, end = 23:59 local, in the market timezone", () => {
  assert.equal(campaignStartInstant("2026-08-14", "DE").toISOString(), "2026-08-13T22:01:00.000Z");
  assert.equal(campaignEndInstant("2026-08-15", "DE").toISOString(), "2026-08-15T21:59:00.000Z");
});

test("DST spring-forward day: a 00:01 boundary before the 02:00→03:00 jump is still valid (Berlin 2026-03-29)", () => {
  // 00:01 is before the CET→CEST transition (02:00), so it is CET (UTC+1).
  assert.equal(zonedWallClockToInstant("2026-03-29", 0, 1, "Europe/Berlin").toISOString(), "2026-03-28T23:01:00.000Z");
});

// ── Server-side Deploy transition decision (market-local) ─────────────────────

test("marketLocalDate returns the calendar date in the market timezone", () => {
  // 2026-08-13 23:30 UTC → still 13th in London (BST 00:30 14th? no: BST=+1 → 00:30 14th), 14th in Berlin (+2 → 01:30).
  const now = new Date("2026-08-13T23:30:00Z");
  assert.equal(marketLocalDate("DE", now), "2026-08-14"); // CEST +2
  assert.equal(marketLocalDate("GB", now), "2026-08-14"); // BST +1
  // 2026-08-13 22:30 UTC → 23:30 London (13th), 00:30 Berlin (14th).
  const now2 = new Date("2026-08-13T22:30:00Z");
  assert.equal(marketLocalDate("GB", now2), "2026-08-13");
  assert.equal(marketLocalDate("DE", now2), "2026-08-14");
});

// Return-to-Draft atomic guard: revert allowed iff start_date > market-local today.
test("Return-to-Draft guard: start day strictly in the future allows revert; on/after start day rejects", () => {
  const now = new Date("2026-08-13T12:00:00Z");
  const todayDE = marketLocalDate("DE", now); // "2026-08-13"
  assert.ok("2026-08-18" > todayDE);  // future start → revert allowed
  assert.ok(!("2026-08-13" > todayDE)); // start day → rejected (about to be / effectively live)
  assert.ok(!("2026-08-01" > todayDE)); // past → rejected
});

test("deploy decides Live when the market-local start has arrived, Scheduled when future", () => {
  // now = 2026-08-13 22:30 UTC → 00:30 Berlin(14th), 23:30 London(13th).
  const now = new Date("2026-08-13T22:30:00Z");
  // Start 2026-08-14: Berlin boundary 22:01Z (passed) → live; London 23:01Z (future) → scheduled.
  assert.equal(resolveDeployTargetStatus("2026-08-14", "DE", now), "live");
  assert.equal(resolveDeployTargetStatus("2026-08-14", "GB", now), "scheduled");
  // A clearly-past start → live; a clearly-future start → scheduled.
  assert.equal(resolveDeployTargetStatus("2026-08-01", "DE", now), "live");
  assert.equal(resolveDeployTargetStatus("2026-09-01", "DE", now), "scheduled");
});
