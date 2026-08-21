import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveRevision, nextPendingRevision, cacheTtlMs, validateInFlightRevision,
  type InFlightClaim,
  DEFAULT_CACHE_TTL_MS,
} from "./revision";
import { revisionState, activeMembers } from "./model";
import type { Revision } from "./model";

const T0 = new Date("2026-08-20T12:00:00.000Z");
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);
const MIN = 60_000;

let seq = 0;
const rev = (o: Partial<Revision> & { effectiveAt: Date }): Revision => ({
  id: o.id ?? `rev-${String(++seq).padStart(3, "0")}`,
  groupId: o.groupId ?? "group-1",
  createdAt: o.createdAt ?? at(-60 * MIN),
  cancelledAt: o.cancelledAt ?? null,
  rotation: o.rotation ?? "equal",
  changeKind: o.changeKind ?? "members_added",
  reason: o.reason ?? null,
  members: o.members ?? [],
  effectiveAt: o.effectiveAt,
});

describe("effectiveRevision", () => {
  test("no revisions means no configuration", () => {
    assert.equal(effectiveRevision([], T0), null);
  });

  test("a revision effective in the future does not govern yet", () => {
    assert.equal(effectiveRevision([rev({ effectiveAt: at(1) })], T0), null);
  });

  test("a revision effective exactly now DOES govern (boundary is inclusive)", () => {
    const r = rev({ effectiveAt: T0 });
    assert.equal(effectiveRevision([r], T0), r);
  });

  test("the latest effective revision wins over earlier ones", () => {
    const older = rev({ effectiveAt: at(-10 * MIN) });
    const newer = rev({ effectiveAt: at(-1 * MIN) });
    assert.equal(effectiveRevision([older, newer], T0)!.id, newer.id);
    assert.equal(effectiveRevision([newer, older], T0)!.id, newer.id, "order of input must not matter");
  });

  test("a CANCELLED revision never governs, even when it is the latest", () => {
    const live = rev({ effectiveAt: at(-10 * MIN) });
    const cancelled = rev({ effectiveAt: at(-1 * MIN), cancelledAt: at(-30 * MIN) });
    const chosen = effectiveRevision([live, cancelled], T0);
    assert.equal(chosen!.id, live.id);
    assert.notEqual(chosen!.id, cancelled.id);
  });

  test("when every candidate is cancelled the group has no configuration", () => {
    const all = [
      rev({ effectiveAt: at(-10 * MIN), cancelledAt: at(-9 * MIN) }),
      rev({ effectiveAt: at(-2 * MIN),  cancelledAt: at(-1 * MIN) }),
    ];
    assert.equal(effectiveRevision(all, T0), null);
  });
});

describe("nextPendingRevision", () => {
  test("returns the SOONEST future revision, not the latest", () => {
    const soon = rev({ effectiveAt: at(5 * MIN) });
    const later = rev({ effectiveAt: at(50 * MIN) });
    assert.equal(nextPendingRevision([later, soon], T0)!.id, soon.id);
  });

  test("ignores cancelled future revisions", () => {
    const cancelledSoon = rev({ effectiveAt: at(2 * MIN), cancelledAt: at(-1 * MIN) });
    const liveLater = rev({ effectiveAt: at(30 * MIN) });
    assert.equal(nextPendingRevision([cancelledSoon, liveLater], T0)!.id, liveLater.id);
  });

  test("returns null when nothing is scheduled", () => {
    assert.equal(nextPendingRevision([rev({ effectiveAt: at(-MIN) })], T0), null);
  });
});

describe("cacheTtlMs", () => {
  test("uses the default when no revision is scheduled", () => {
    assert.equal(cacheTtlMs([rev({ effectiveAt: at(-MIN) })], T0), DEFAULT_CACHE_TTL_MS);
  });

  test("NEVER extends past the next pending revision's effective_at", () => {
    // Scheduled 20s out; the default 60s TTL must be clamped to 20s.
    const ttl = cacheTtlMs([rev({ effectiveAt: at(20_000) })], T0);
    assert.equal(ttl, 20_000);
    assert.ok(T0.getTime() + ttl <= at(20_000).getTime(), "cache outlived the scheduled change");
  });

  test("clamps to the SOONEST pending revision when several are scheduled", () => {
    const revisions = [rev({ effectiveAt: at(45 * MIN) }), rev({ effectiveAt: at(8_000) })];
    assert.equal(cacheTtlMs(revisions, T0), 8_000);
  });

  test("a cancelled pending revision does not shorten the cache", () => {
    const revisions = [rev({ effectiveAt: at(3_000), cancelledAt: at(-MIN) })];
    assert.equal(cacheTtlMs(revisions, T0), DEFAULT_CACHE_TTL_MS);
  });

  test("a boundary already reached yields zero, forcing a fresh resolve", () => {
    // effective_at exactly now is no longer pending, so the clamp comes from the
    // NEXT one; a revision one millisecond out gives a 1ms TTL, never negative.
    assert.equal(cacheTtlMs([rev({ effectiveAt: at(1) })], T0), 1);
    assert.ok(cacheTtlMs([rev({ effectiveAt: at(-5) })], T0) >= 0);
  });

  test("the default is honoured when the boundary is further out than the default", () => {
    assert.equal(cacheTtlMs([rev({ effectiveAt: at(10 * MIN) })], T0), DEFAULT_CACHE_TTL_MS);
  });
});

describe("validateInFlightRevision", () => {
  const GROUP = "alpha";
  const CAMPAIGN = "wwc_fotmob_gb";

  /** A revision whose frozen membership includes CAMPAIGN by default. */
  const memberRev = (o: Partial<Revision> & { effectiveAt: Date }) =>
    rev({ ...o, members: o.members ?? [
      { campaignId: "uuid-a", campaignSlug: CAMPAIGN, weight: 1, membershipState: "active" },
    ] });

  /** A well-formed claim for that revision, before any single field is spoiled. */
  const claimFor = (r: Revision, over: Partial<InFlightClaim> = {}): InFlightClaim => ({
    revisionId: r.id,
    campaignSlug: CAMPAIGN,
    groupSlug: GROUP,
    ownerModel: "survey_studio",
    actualGroupSlug: GROUP,
    ...over,
  });

  test("an effective, uncancelled Studio revision naming this campaign passes", () => {
    const r = memberRev({ effectiveAt: at(-5 * MIN) });
    const v = validateInFlightRevision(claimFor(r), [r], T0);
    assert.equal(v.ok, true);
    assert.equal(v.code, "valid");
  });

  test("the pass message claims ELIGIBILITY, never delivery", () => {
    const r = memberRev({ effectiveAt: at(-5 * MIN) });
    const v = validateInFlightRevision(claimFor(r), [r], T0);
    // WP1 has no assignment ledger: nothing proves this session received this
    // revision. The wording must not overstate what the data supports.
    assert.match(v.message, /eligible to govern/i);
    assert.doesNotMatch(v.message, /genuinely governed|did govern|was served/i);
  });

  test("a CANCELLED revision never validates, even though its effective_at passed", () => {
    const r = memberRev({ effectiveAt: at(-5 * MIN), cancelledAt: at(-4 * MIN) });
    const v = validateInFlightRevision(claimFor(r), [r], T0);
    assert.equal(v.ok, false);
    assert.equal(v.code, "cancelled_revision");
  });

  test("a revision cancelled BEFORE it was due never validates", () => {
    const r = memberRev({ effectiveAt: at(-MIN), cancelledAt: at(-10 * MIN) });
    assert.equal(validateInFlightRevision(claimFor(r), [r], T0).ok, false);
  });

  test("a still-pending revision is rejected", () => {
    const r = memberRev({ effectiveAt: at(5 * MIN) });
    const v = validateInFlightRevision(claimFor(r), [r], T0);
    assert.equal(v.ok, false);
    assert.equal(v.code, "future_revision");
  });

  test("a revision belonging to a DIFFERENT group is rejected", () => {
    const r = memberRev({ effectiveAt: at(-5 * MIN) });
    const v = validateInFlightRevision(claimFor(r, { actualGroupSlug: "beta" }), [r], T0);
    assert.equal(v.ok, false);
    assert.equal(v.code, "wrong_group");
  });

  test("an unknown revision id is rejected rather than assumed", () => {
    const r = memberRev({ effectiveAt: at(-5 * MIN) });
    const v = validateInFlightRevision(
      claimFor(r, { revisionId: "00000000-0000-0000-0000-000000000000" }), [], T0);
    assert.equal(v.ok, false);
    assert.equal(v.code, "unknown_revision");
  });

  // ── The tuple checks. These are what the request path was missing. ─────────

  test("a campaign that is NOT a frozen member of the revision is rejected", () => {
    // The exact production exposure: another campaign's traffic replaying a
    // revision that exists, is effective, and belongs to the claimed group.
    const r = memberRev({ effectiveAt: at(-5 * MIN) });
    const v = validateInFlightRevision(claimFor(r, { campaignSlug: "some_other_campaign" }), [r], T0);
    assert.equal(v.ok, false);
    assert.equal(v.code, "campaign_not_in_revision");
  });

  test("membership is read from the REVISION's frozen list, not the group's current one", () => {
    // A campaign removed by a LATER revision must still validate against the
    // revision that was serving when the respondent answered.
    const serving = memberRev({ effectiveAt: at(-30 * MIN) });
    const later = rev({ effectiveAt: at(-5 * MIN), members: [] });   // campaign since removed
    const v = validateInFlightRevision(claimFor(serving), [serving, later], T0);
    assert.equal(v.ok, true, "the superseded revision still governs the evidence it produced");
  });

  test("a legacy research-project revision is rejected on owner model", () => {
    const r = memberRev({ effectiveAt: at(-5 * MIN) });
    const v = validateInFlightRevision(claimFor(r, { ownerModel: "research_project" }), [r], T0);
    assert.equal(v.ok, false);
    assert.equal(v.code, "invalid_owner_model");
  });

  test("an ABSENT group claim cannot widen what is accepted", () => {
    // Omitting the group skips the group comparison, so the campaign-membership
    // check is the only thing standing between a replayed revision and storage.
    // It must still refuse.
    const r = memberRev({ effectiveAt: at(-5 * MIN) });
    const ok = validateInFlightRevision(claimFor(r, { groupSlug: null }), [r], T0);
    assert.equal(ok.code, "valid", "a genuine claim without a group still passes");

    const forged = validateInFlightRevision(
      claimFor(r, { groupSlug: null, campaignSlug: "some_other_campaign" }), [r], T0);
    assert.equal(forged.ok, false);
    assert.equal(forged.code, "campaign_not_in_revision");
  });

  test("a campaign in TWO groups validates only against its own group's revision", () => {
    // A campaign may legitimately appear in several groups. Sharing a campaign
    // must not make one group's revision valid for the other's traffic.
    const alphaRev = rev({ id: "rev-alpha", groupId: "g-alpha", effectiveAt: at(-5 * MIN),
      members: [{ campaignId: "uuid-a", campaignSlug: CAMPAIGN, weight: 1, membershipState: "active" }] });
    const betaRev  = rev({ id: "rev-beta",  groupId: "g-beta",  effectiveAt: at(-5 * MIN),
      members: [{ campaignId: "uuid-a", campaignSlug: CAMPAIGN, weight: 1, membershipState: "active" }] });

    const own = validateInFlightRevision({
      revisionId: alphaRev.id, campaignSlug: CAMPAIGN, groupSlug: "alpha",
      ownerModel: "survey_studio", actualGroupSlug: "alpha",
    }, [alphaRev, betaRev], T0);
    assert.equal(own.code, "valid");

    // Same campaign, same membership, but the session claims group alpha while
    // the revision it named belongs to beta.
    const crossed = validateInFlightRevision({
      revisionId: betaRev.id, campaignSlug: CAMPAIGN, groupSlug: "alpha",
      ownerModel: "survey_studio", actualGroupSlug: "beta",
    }, [alphaRev, betaRev], T0);
    assert.equal(crossed.ok, false);
    assert.equal(crossed.code, "wrong_group");
  });
});

describe("revisionState / activeMembers", () => {
  test("cancellation dominates the effective_at comparison", () => {
    assert.equal(revisionState({ effectiveAt: at(-MIN), cancelledAt: at(-MIN) }, T0), "cancelled");
    assert.equal(revisionState({ effectiveAt: at(MIN),  cancelledAt: at(-MIN) }, T0), "cancelled");
  });

  test("pending and effective are decided by the effective_at boundary", () => {
    assert.equal(revisionState({ effectiveAt: at(1),  cancelledAt: null }, T0), "pending");
    assert.equal(revisionState({ effectiveAt: T0,     cancelledAt: null }, T0), "effective");
    assert.equal(revisionState({ effectiveAt: at(-1), cancelledAt: null }, T0), "effective");
  });

  test("paused members are excluded from the serve candidate set", () => {
    const r = rev({
      effectiveAt: at(-MIN),
      members: [
        { campaignId: "a", campaignSlug: "a", weight: 1, membershipState: "active" },
        { campaignId: "b", campaignSlug: "b", weight: 1, membershipState: "paused" },
      ],
    });
    assert.deepEqual(activeMembers(r).map(x => x.campaignId), ["a"]);
  });
});
