// ── The integrity diagnostic: loud enough to notice, quiet enough to read ────
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  reportDeliveryIntegrity, setDeliveryIntegritySink, __resetDeliveryIntegrity,
  type DeliveryIntegrityRecord,
} from "./delivery-integrity";

let emitted: DeliveryIntegrityRecord[] = [];
const NOW = Date.parse("2026-08-21T12:00:00.000Z");

beforeEach(() => {
  emitted = [];
  __resetDeliveryIntegrity();
  setDeliveryIntegritySink(r => emitted.push(r));
});

const signal = (over: Partial<Parameters<typeof reportDeliveryIntegrity>[0]> = {}) => ({
  reason: "wrong_group",
  claimedRevisionId: "9f21ab00-1111-4222-8333-444455556666",
  campaignId: "wwc_fotmob_gb",
  claimedGroupId: "fotmob-rotation",
  sessionId: "sess-1",
  endpoint: "answer" as const,
  ...over,
});

describe("reportDeliveryIntegrity", () => {
  test("emits the coded metadata an operator needs to localise the failure", () => {
    reportDeliveryIntegrity(signal(), NOW);
    assert.equal(emitted.length, 1);
    const r = emitted[0];
    assert.equal(r.domain, "delivery_integrity");
    assert.equal(r.reason, "wrong_group");
    assert.equal(r.campaignId, "wwc_fotmob_gb");
    assert.equal(r.claimedGroupId, "fotmob-rotation");
    assert.equal(r.sessionId, "sess-1");
    assert.equal(r.endpoint, "answer");
    assert.equal(r.ts, new Date(NOW).toISOString());
  });

  test("carries NO answer content — only ids and coded reasons", () => {
    reportDeliveryIntegrity(signal(), NOW);
    const keys = Object.keys(emitted[0]).sort();
    assert.deepEqual(keys, [
      "campaignId", "claimedGroupId", "claimedRevisionId", "domain",
      "endpoint", "occurrences", "reason", "sessionId", "ts",
    ], "a new field was added to the integrity record — confirm it cannot carry respondent content");
  });

  test("a forged session's repeats are suppressed inside the window", () => {
    // One journey is dozens of writes. Without this, a single bad actor drowns
    // the log the diagnostic exists to make readable.
    for (let i = 0; i < 40; i++) reportDeliveryIntegrity(signal(), NOW + i * 100);
    assert.equal(emitted.length, 1, "repeats within the window must not each emit");
  });

  test("the rolled-over line reports the volume it stood for", () => {
    for (let i = 0; i < 12; i++) reportDeliveryIntegrity(signal(), NOW + i * 100);
    assert.equal(emitted[0].occurrences, 1);
    // Past the window the key rolls over and reports what it suppressed.
    reportDeliveryIntegrity(signal(), NOW + 61_000);
    assert.equal(emitted.length, 2);
    assert.equal(emitted[1].occurrences, 13, "suppressed repeats must not vanish silently");
  });

  test("a session failing two DIFFERENT ways reports both", () => {
    reportDeliveryIntegrity(signal({ reason: "wrong_group" }), NOW);
    reportDeliveryIntegrity(signal({ reason: "cancelled_revision" }), NOW);
    assert.equal(emitted.length, 2);
  });

  test("the same reason on different endpoints reports separately", () => {
    reportDeliveryIntegrity(signal({ endpoint: "events" }), NOW);
    reportDeliveryIntegrity(signal({ endpoint: "answer" }), NOW);
    reportDeliveryIntegrity(signal({ endpoint: "submit" }), NOW);
    assert.equal(emitted.length, 3, "a claim refused on every endpoint must be visible on each");
  });

  test("different sessions are never collapsed into one another", () => {
    reportDeliveryIntegrity(signal({ sessionId: "sess-1" }), NOW);
    reportDeliveryIntegrity(signal({ sessionId: "sess-2" }), NOW);
    assert.equal(emitted.length, 2);
  });

  test("a sink that throws never disrupts the evidence write", () => {
    setDeliveryIntegritySink(() => { throw new Error("log backend down"); });
    assert.doesNotThrow(() => reportDeliveryIntegrity(signal(), NOW));
  });

  test("a flood of distinct forged sessions cannot grow state without bound", () => {
    setDeliveryIntegritySink(() => {});
    for (let i = 0; i < 12_000; i++) {
      reportDeliveryIntegrity(signal({ sessionId: `flood-${i}` }), NOW + i);
    }
    // Bounded internally; the assertion is that it completes without exhausting
    // memory and still works afterwards.
    setDeliveryIntegritySink(r => emitted.push(r));
    reportDeliveryIntegrity(signal({ sessionId: "after-the-flood" }), NOW + 20_000);
    assert.equal(emitted.length, 1);
  });
});

// ── All three endpoints must classify a claim the same way ──────────────────
//
// /api/events once pre-filtered with looksLikeRevisionId before resolving, so a
// malformed claim was silently filed as ordinary no-claim traffic there while
// /api/answer and /api/submit reported it. Three endpoints, one shared resolver,
// and one of them quietly disagreeing is exactly how the original gap survived.
import { readFileSync } from "node:fs";

describe("endpoint consistency", () => {
  const ROUTES: Array<[string, string]> = [
    ["events", "app/api/events/route.ts"],
    ["answer", "app/api/answer/route.ts"],
    ["submit", "app/api/submit/route.ts"],
  ];

  test("every evidence endpoint resolves through the shared reporting helper", () => {
    for (const [name, path] of ROUTES) {
      const src = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
      assert.match(src, /resolveClaimForWrite\(/,
        `${name} must resolve through the helper that also reports the rejection`);
      assert.doesNotMatch(src, /\bresolveRevisionClaim\(/,
        `${name} calls the resolver directly and would skip the integrity diagnostic`);
      assert.match(src, /endpoint:\s*"(events|answer|submit)"/,
        `${name} must label its diagnostics with its own endpoint`);
    }
  });

  test("every endpoint passes the campaign, so the tuple can actually be checked", () => {
    for (const [name, path] of ROUTES) {
      const src = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
      assert.match(src, /campaignSlug:/, `${name} must bind the claim to a campaign`);
      assert.match(src, /groupSlug:/, `${name} must pass the claimed group when it has one`);
      assert.match(src, /sessionId/, `${name} must attach the session to its diagnostics`);
    }
  });

  test("no endpoint gates the resolver on well-formedness", () => {
    // looksLikeRevisionId as an admission gate turns "malformed" into "absent".
    for (const [name, path] of ROUTES) {
      const src = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
      assert.doesNotMatch(src, /if\s*\(\s*looksLikeRevisionId\(/,
        `${name} pre-filters malformed claims and loses the integrity signal`);
    }
  });
});
