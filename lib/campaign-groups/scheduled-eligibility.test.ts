import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateMember, assessServeReadiness, type CampaignFacts, type RoutingContext } from "./eligibility";
import { deterministicServeAt, assessGoLive } from "./go-live";
import { computeEffectiveStatus, type CampaignForStatus } from "@/lib/campaign-status";
import type { RevisionMember, Revision } from "./model";

// -- Stored `scheduled` is DEPLOYED, and activates by time --------------------
//
// resolveDeployTargetStatus stores "scheduled" for any campaign deployed with a
// future start date, and NOTHING ever flips that row to "live". Activation is by
// time, through the effective-status resolver — which is exactly why the app has
// that concept. Treating stored "live" as the only deployed state meant a
// scheduled member never served, however long after its start date.
//
// The dates below are UTC because the fixtures set no country_code, and the
// resolver falls back to UTC for an unmapped/absent one.

const NO_CTX: RoutingContext = { country: null, market: null, publisher: null };
const member = (): RevisionMember =>
  ({ campaignId: "c1", campaignSlug: "studio_a", weight: 1, membershipState: "active" });

/** A stored-`scheduled` campaign with a real calendar window. */
const scheduled = (o: Partial<CampaignFacts> = {}): CampaignFacts => ({
  id: "c1", slug: "studio_a",
  status: "scheduled",
  deletedAt: null,
  startDate: "2026-09-10", endDate: "2026-09-20",
  startsAt: new Date("2026-09-10T00:01:00.000Z"),
  endsAt: new Date("2026-09-20T23:59:00.000Z"),
  countryCode: null, market: null, publisherName: null, publisherOrgId: null,
  targetResponses: null, responseCount: 0,
  surveyId: "s1", surveyValid: true,
  manualStatusOverride: null, archiveAfterDays: null, targetMode: "continue",
  ...o,
});

const at = (iso: string) => new Date(iso);
const eligibleAt = (f: CampaignFacts, when: string) =>
  evaluateMember(member(), f, NO_CTX, at(when)).eligible;
const reasonAt = (f: CampaignFacts, when: string) =>
  evaluateMember(member(), f, NO_CTX, at(when)).reason;

describe("stored `scheduled` — the eight cases", () => {
  test("1. BEFORE start — not yet eligible, and the reason is not_started", () => {
    const f = scheduled();
    assert.equal(eligibleAt(f, "2026-09-09T12:00:00Z"), false);
    assert.equal(reasonAt(f, "2026-09-09T12:00:00Z"), "not_started",
      "the precise reason must survive — not the blunt 'campaign_not_live'");
  });

  test("2. EXACTLY at start — eligible", () => {
    const f = scheduled();
    assert.equal(eligibleAt(f, "2026-09-10T00:01:00Z"), true,
      "the boundary is inclusive, matching the pre-existing not_started predicate");
  });

  test("3. INSIDE the window — eligible. THIS IS THE FIX.", () => {
    const f = scheduled();
    assert.equal(eligibleAt(f, "2026-09-15T12:00:00Z"), true,
      "before this correction a stored-scheduled member never served, ever");
  });

  test("4. EXACTLY at end — still eligible", () => {
    const f = scheduled();
    assert.equal(eligibleAt(f, "2026-09-20T23:59:00Z"), true);
  });

  test("5. AFTER end — no longer eligible, reported as ended", () => {
    const f = scheduled();
    assert.equal(eligibleAt(f, "2026-09-21T12:00:00Z"), false);
    assert.equal(reasonAt(f, "2026-09-21T12:00:00Z"), "ended");
  });

  test("6. START LATER THAN END — never eligible, at any instant", () => {
    const f = scheduled({
      startDate: "2026-09-20", endDate: "2026-09-10",
      startsAt: at("2026-09-20T00:01:00Z"), endsAt: at("2026-09-10T23:59:00Z"),
    });
    for (const when of ["2026-09-01T00:00:00Z", "2026-09-15T00:00:00Z",
                        "2026-09-20T00:01:00Z", "2026-09-25T00:00:00Z"]) {
      assert.equal(eligibleAt(f, when), false, `unexpectedly eligible at ${when}`);
    }
    assert.equal(deterministicServeAt(member(), f, at("2026-09-01T00:00:00Z")), null,
      "and it must never be promised a serving time");
  });

  test("7. NO start time — eligible immediately", () => {
    const f = scheduled({ startDate: null, startsAt: null });
    assert.equal(eligibleAt(f, "2026-09-01T00:00:00Z"), true);
    assert.equal(deterministicServeAt(member(), f, at("2026-09-01T00:00:00Z")), null,
      "already serving is not 'scheduled to serve later'");
  });

  test("8. ANOTHER predicate failing AT the activation time", () => {
    // Deployed, window fine, but the survey does not validate. It must never be
    // promised a serving instant that will not deliver.
    const invalid = scheduled({ surveyValid: false });
    assert.equal(eligibleAt(invalid, "2026-09-15T12:00:00Z"), false);
    assert.equal(reasonAt(invalid, "2026-09-15T12:00:00Z"), "survey_invalid");
    assert.equal(deterministicServeAt(member(), invalid, at("2026-09-01T00:00:00Z")), null);

    // And a stop-mode campaign already at its target.
    const capped = scheduled({ targetResponses: 5, responseCount: 5, targetMode: "stop" });
    assert.equal(eligibleAt(capped, "2026-09-15T12:00:00Z"), false);
    assert.equal(deterministicServeAt(member(), capped, at("2026-09-01T00:00:00Z")), null);
  });
});

describe("stored statuses that must NEVER become eligible", () => {
  for (const status of ["draft", "paused", "closed", "archived"]) {
    test(`${status} is never eligible, at any instant in the window`, () => {
      const f = scheduled({ status });
      for (const when of ["2026-09-09T00:00:00Z", "2026-09-15T12:00:00Z", "2026-09-25T00:00:00Z"]) {
        assert.equal(eligibleAt(f, when), false, `${status} was eligible at ${when}`);
      }
      assert.equal(deterministicServeAt(member(), f, at("2026-09-01T00:00:00Z")), null,
        `${status} must never be promised a serving time`);
    });
  }

  test("a DRAFT with a future start is still never promised a time", () => {
    const f = scheduled({ status: "draft" });
    assert.equal(deterministicServeAt(member(), f, at("2026-09-01T00:00:00Z")), null);
  });
});

// -- Requirement 7: the promise equals the serve instant ---------------------

describe("the promised instant IS when the serve path starts accepting", () => {
  test("deterministicServeAt returns exactly the first instant evaluateMember accepts", () => {
    const f = scheduled();
    const promised = deterministicServeAt(member(), f, at("2026-09-01T00:00:00Z"));
    assert.ok(promised, "a deployed, future-dated, otherwise-valid campaign must be promised");

    // One millisecond before the promise: refused. At the promise: accepted.
    assert.equal(evaluateMember(member(), f, NO_CTX, new Date(promised!.getTime() - 1)).eligible, false,
      "the serve path must NOT accept before the promised instant");
    assert.equal(evaluateMember(member(), f, NO_CTX, promised!).eligible, true,
      "the serve path MUST accept at the promised instant");
  });

  test("the Set Live verdict promises that same instant", () => {
    const f = scheduled();
    const rev: Revision = {
      id: "r1", groupId: "g1", effectiveAt: at("2026-09-01T00:00:00Z"),
      createdAt: at("2026-09-01T00:00:00Z"), cancelledAt: null, rotation: "equal",
      changeKind: "created", reason: null, members: [member()],
    };
    const v = assessGoLive(rev, new Map([["c1", f]]), at("2026-09-01T00:00:00Z"));
    assert.equal(v.mode, "scheduled");
    assert.equal(v.scheduled_at, f.startsAt!.toISOString());
    assert.equal(evaluateMember(member(), f, NO_CTX, new Date(v.scheduled_at!)).eligible, true,
      "the instant shown to the operator must be one the serve path honours");
  });
});

// -- Requirement 1/2: one authority, consumed by both -------------------------

describe("eligibility defers to the authoritative resolver", () => {
  test("it agrees with computeEffectiveStatus across the lifecycle matrix", () => {
    const instants = ["2026-09-09T00:00:00Z", "2026-09-10T00:01:00Z",
                      "2026-09-15T12:00:00Z", "2026-09-20T23:59:00Z", "2026-09-21T12:00:00Z"];
    const statuses = ["draft", "scheduled", "live", "paused", "closed", "archived"];
    for (const status of statuses) {
      for (const when of instants) {
        const f = scheduled({ status });
        const now = at(when);
        const effective = computeEffectiveStatus(
          { status: f.status, manual_status_override: null, start_date: f.startDate!,
            end_date: f.endDate!, target_responses: null, archive_after_days: null,
            country_code: null, target_mode: "continue" } as CampaignForStatus,
          f.responseCount, now,
        );
        const eligible = evaluateMember(member(), f, NO_CTX, now).eligible;
        // Eligibility may be narrower (routing, survey validity), never wider.
        if (eligible) {
          assert.equal(effective, "live",
            `${status} at ${when}: eligible but effective status is ${effective}`);
        }
      }
    }
  });

  test("stored `live` behaviour is byte-identical to before the correction", () => {
    // The ONLY intended change is that deployed-scheduled members become eligible
    // in their window. A stored-live campaign must behave exactly as it did.
    const live = scheduled({ status: "live" });
    assert.equal(eligibleAt(live, "2026-09-09T00:00:00Z"), false);
    assert.equal(reasonAt(live, "2026-09-09T00:00:00Z"), "not_started");
    assert.equal(eligibleAt(live, "2026-09-15T12:00:00Z"), true);
    assert.equal(eligibleAt(live, "2026-09-21T12:00:00Z"), false);
    assert.equal(reasonAt(live, "2026-09-21T12:00:00Z"), "ended");
  });

  test("readiness reports the granular reason, not the blunt one", () => {
    const f = scheduled();
    const r = assessServeReadiness(member(), f, NO_CTX, at("2026-09-09T00:00:00Z"));
    assert.deepEqual(r.reasons, ["not_started"]);
    assert.ok(!r.reasons.includes("campaign_not_live"),
      "a deployed campaign awaiting its start is not 'not live'");
  });
});
