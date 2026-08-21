import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PREDICATES, EXCLUSION_COPY } from "./predicates";
import { evaluateMember, assessServeReadiness, type CampaignFacts, type RoutingContext } from "./eligibility";
import { assessGoLive, deterministicServeAt, nextStateChangeAt } from "./go-live";
import { assessGroupable } from "./groupable";
import type { RevisionMember, Revision } from "./model";

const NOW = new Date("2026-08-21T12:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const HOUR = 3_600_000;
const NO_CTX: RoutingContext = { country: null, market: null, publisher: null };

const member = (o: Partial<RevisionMember> = {}): RevisionMember => ({
  campaignId: "c1", campaignSlug: "studio_a", weight: 1, membershipState: "active", ...o,
});
const facts = (o: Partial<CampaignFacts> = {}): CampaignFacts => ({
  id: "c1", slug: "studio_a", status: "live", deletedAt: null,
  startsAt: at(-HOUR), endsAt: at(HOUR), countryCode: "GB", market: "United Kingdom",
  publisherName: "FotMob", publisherOrgId: "org", targetResponses: 1000, responseCount: 0,
  surveyId: "s1", surveyValid: true, ...o,
});

// -- C1: one predicate list, two evaluators, provably ------------------------

describe("predicates — one definition", () => {
  test("both evaluators consume the SAME exported list", () => {
    // If either stopped using PREDICATES, emptying it would not change its
    // answer. This proves both are driven by it.
    const saved = PREDICATES.splice(0, PREDICATES.length);
    try {
      const m = member({ membershipState: "paused" });
      assert.equal(evaluateMember(m, undefined, NO_CTX, NOW).eligible, true,
        "evaluateMember still blocked with an empty list — it is not consuming it");
      assert.equal(assessServeReadiness(m, undefined, NO_CTX, NOW).canServeNow, true,
        "assessServeReadiness still blocked with an empty list — it is not consuming it");
    } finally {
      PREDICATES.push(...saved);
    }
    // and restored
    assert.equal(evaluateMember(member({ membershipState: "paused" }), undefined, NO_CTX, NOW).reason, "paused");
  });

  test("every predicate carries operator-facing copy", () => {
    for (const p of PREDICATES) {
      assert.ok(p.copy && p.copy.length > 3, `${p.reason} has no usable copy`);
      assert.equal(EXCLUSION_COPY[p.reason], p.copy, `${p.reason} copy drifted`);
    }
    assert.equal(Object.keys(EXCLUSION_COPY).length, PREDICATES.length);
  });

  test("evaluateMember returns the FIRST blocker; assessServeReadiness returns ALL", () => {
    // Draft AND ended AND at target, simultaneously.
    const f = facts({ status: "draft", endsAt: at(-HOUR), targetResponses: 10, responseCount: 10 });
    const one = evaluateMember(member(), f, NO_CTX, NOW);
    assert.equal(one.reason, "campaign_not_live", "serve path must short-circuit on the first");

    const all = assessServeReadiness(member(), f, NO_CTX, NOW);
    assert.equal(all.canServeNow, false);
    assert.deepEqual(all.reasons, ["campaign_not_live", "ended", "target_reached"]);
    assert.equal(all.copy.length, 3);
  });

  test("readiness collection stops at a TERMINAL predicate", () => {
    // A missing campaign must not also be reported as having no survey.
    const all = assessServeReadiness(member(), undefined, NO_CTX, NOW);
    assert.deepEqual(all.reasons, ["campaign_missing"]);
  });

  test("an eligible member yields no reasons from either evaluator", () => {
    assert.equal(evaluateMember(member(), facts(), NO_CTX, NOW).eligible, true);
    assert.deepEqual(assessServeReadiness(member(), facts(), NO_CTX, NOW).reasons, []);
  });
});

// -- C2: the Set Live verdict -----------------------------------------------

const rev = (members: RevisionMember[]): Revision => ({
  id: "r1", groupId: "g1", effectiveAt: at(-HOUR), createdAt: at(-HOUR), cancelledAt: null,
  rotation: "weighted", changeKind: "created", reason: null, members,
});

describe("assessGoLive", () => {
  test("SERVING when any member can serve now", () => {
    const v = assessGoLive(rev([member()]), new Map([["c1", facts()]]), NOW);
    assert.equal(v.mode, "serving");
    assert.equal(v.allowed, true);
    assert.equal(v.blockers, undefined);
  });

  test("BLOCKED when every member is an undeployed draft", () => {
    const v = assessGoLive(rev([member()]), new Map([["c1", facts({ status: "draft" })]]), NOW);
    assert.equal(v.mode, "blocked");
    assert.equal(v.allowed, false);
    assert.equal(v.blockers?.length, 1);
    assert.ok(v.blockers![0].reasons.includes("Campaign is not live"));
  });

  test("SCHEDULED when a LIVE member starts in the future", () => {
    // endsAt must be pushed out too: the default fixture ends in 1h, so a start
    // at +2h would never be eligible — which is the (3) clause doing its job.
    const v = assessGoLive(rev([member()]), new Map([["c1", facts({ startsAt: at(2*HOUR), endsAt: at(9*HOUR) })]]), NOW);
    assert.equal(v.mode, "scheduled");
    assert.equal(v.allowed, true);
    assert.equal(v.scheduled_at, at(2*HOUR).toISOString());
    assert.equal(v.scheduled_campaign, "studio_a");
  });

  test("N2 — a DRAFT with a future start date is BLOCKED, never scheduled", () => {
    const f = facts({ status: "draft", startsAt: at(2*HOUR), endsAt: at(9*HOUR) });
    const v = assessGoLive(rev([member()]), new Map([["c1", f]]), NOW);
    assert.equal(v.mode, "blocked", "a configured date does not deploy a campaign");
    assert.equal(v.scheduled_at, undefined);
    assert.match(v.blockers![0].note ?? "", /future start date but is still a draft/i);
    assert.match(v.blockers![0].note ?? "", /Deploy it/i);
  });

  test("a future start that could never be eligible does not count as scheduled", () => {
    // Starts in 2h but ended an hour ago — it will never serve.
    const f = facts({ startsAt: at(2*HOUR), endsAt: at(-HOUR) });
    assert.equal(deterministicServeAt(member(), f, NOW), null);
    assert.equal(assessGoLive(rev([member()]), new Map([["c1", f]]), NOW).mode, "blocked");
  });

  test("a future start already at target does not count as scheduled", () => {
    const f = facts({ startsAt: at(2*HOUR), targetResponses: 5, responseCount: 5 });
    assert.equal(deterministicServeAt(member(), f, NOW), null);
  });

  test("the EARLIEST future start wins", () => {
    const members = [member({ campaignId: "a", campaignSlug: "late" }),
                     member({ campaignId: "b", campaignSlug: "early" })];
    const map = new Map([
      ["a", facts({ id: "a", slug: "late",  startsAt: at(5*HOUR), endsAt: at(9*HOUR) })],
      ["b", facts({ id: "b", slug: "early", startsAt: at(2*HOUR), endsAt: at(9*HOUR) })],
    ]);
    const v = assessGoLive(rev(members), map, NOW);
    assert.equal(v.scheduled_campaign, "early");
    assert.equal(v.scheduled_at, at(2*HOUR).toISOString());
  });

  test("serving beats scheduled when both are present", () => {
    const members = [member({ campaignId: "a" }), member({ campaignId: "b" })];
    const map = new Map([
      ["a", facts({ id: "a", startsAt: at(2*HOUR), endsAt: at(9*HOUR) })],  // future
      ["b", facts({ id: "b" })],                        // serving now
    ]);
    assert.equal(assessGoLive(rev(members), map, NOW).mode, "serving");
  });

  test("no revision, or no active members, is blocked", () => {
    assert.equal(assessGoLive(null, new Map(), NOW).mode, "blocked");
    assert.equal(assessGoLive(rev([]), new Map(), NOW).mode, "blocked");
    assert.equal(assessGoLive(rev([member({ membershipState: "paused" })]), new Map([["c1", facts()]]), NOW).mode, "blocked");
  });

  test("blockers name EVERY member and all of its reasons", () => {
    const members = [member({ campaignId: "a", campaignSlug: "one" }),
                     member({ campaignId: "b", campaignSlug: "two" })];
    const map = new Map([
      ["a", facts({ id: "a", status: "draft" })],
      ["b", facts({ id: "b", status: "closed", endsAt: at(-HOUR) })],
    ]);
    const v = assessGoLive(rev(members), map, NOW);
    assert.deepEqual(v.blockers!.map(b => b.campaign).sort(), ["one", "two"]);
    assert.ok(v.blockers!.find(b => b.campaign === "two")!.reasons.length >= 2);
  });
});

// -- N3: verdict expiry ------------------------------------------------------

describe("nextStateChangeAt", () => {
  const base = rev([member()]);
  test("null when nothing is scheduled to change", () => {
    assert.equal(nextStateChangeAt([base], base, new Map([["c1", facts({ startsAt: at(-HOUR), endsAt: null })]]), NOW), null);
  });
  test("the next pending revision", () => {
    const pending: Revision = { ...base, id: "r2", effectiveAt: at(3*HOUR) };
    assert.equal(nextStateChangeAt([base, pending], base, new Map(), NOW), at(3*HOUR).toISOString());
  });
  test("a member start instant, when sooner than the revision", () => {
    const pending: Revision = { ...base, id: "r2", effectiveAt: at(5*HOUR) };
    const map = new Map([["c1", facts({ startsAt: at(HOUR) })]]);
    assert.equal(nextStateChangeAt([base, pending], base, map, NOW), at(HOUR).toISOString());
  });
  test("a member END instant also changes the verdict", () => {
    const map = new Map([["c1", facts({ startsAt: at(-HOUR), endsAt: at(2*HOUR) })]]);
    assert.equal(nextStateChangeAt([base], base, map, NOW), at(2*HOUR).toISOString());
  });
  test("past instants are ignored", () => {
    const map = new Map([["c1", facts({ startsAt: at(-5*HOUR), endsAt: at(-HOUR) })]]);
    assert.equal(nextStateChangeAt([base], base, map, NOW), null);
  });
});

// -- C4: groupable is not serve-eligible -------------------------------------

describe("assessGroupable", () => {
  const admin = { role: "admin", organisationId: "org-a" };
  const pub   = { role: "publisher", organisationId: "org-a" };
  const gf = (o = {}) => ({ id: "c1", slug: "studio_a", origin: "survey_studio",
                            deletedAt: null, surveyOrganisationId: "org-a", ...o });

  test("A DRAFT IS GROUPABLE — grouping happens before Deploy", () => {
    // The whole journey depends on this. status is not consulted at all.
    assert.equal(assessGroupable(gf(), pub).canAdd, true);
  });
  test("a legacy campaign is not groupable", () => {
    const d = assessGroupable(gf({ origin: "legacy" }), admin);
    assert.equal(d.canAdd, false);
    assert.equal(d.refusal, "not_studio_campaign");
  });
  test("a deleted or missing campaign is not groupable", () => {
    assert.equal(assessGroupable(gf({ deletedAt: "2026-01-01" }), admin).refusal, "not_found");
    assert.equal(assessGroupable(undefined, admin).refusal, "not_found");
  });
  test("another organisation's campaign is refused, and reported as not found", () => {
    const d = assessGroupable(gf({ surveyOrganisationId: "org-b" }), pub);
    assert.equal(d.canAdd, false);
    assert.equal(d.refusal, "not_authorised");
    assert.match(d.reason!, /no longer exists/i,
      "must not reveal that a campaign exists in another organisation");
  });
  test("an unowned survey is admin-only", () => {
    assert.equal(assessGroupable(gf({ surveyOrganisationId: null }), pub).canAdd, false);
    assert.equal(assessGroupable(gf({ surveyOrganisationId: null }), admin).canAdd, true);
  });
});

// -- Structural: the rules exist in exactly one place ------------------------

const ROOT = join(import.meta.dirname, "..", "..");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out); else if (/\.tsx?$/.test(e)) out.push(f);
  }
  return out;
}
const sources = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))]
  .filter(f => !/\.test\.tsx?$/.test(f));
const rel = (f: string) => f.slice(ROOT.length + 1);

describe("structural — no eligibility logic outside the shared modules", () => {
  test("no file re-implements the serve predicates", () => {
    const allowed = new Set(["lib/campaign-groups/predicates.ts", "lib/campaign-groups/eligibility.ts"]);
    const offenders = sources.filter(f => {
      if (allowed.has(rel(f))) return false;
      const s = readFileSync(f, "utf8");
      // Only reasons UNIQUE to this domain. "not_started" and "target_reached"
      // belong to research-project run statuses and campaign filters as well —
      // matching those flagged 10+ unrelated files and would have made this
      // guard noise that someone eventually disables.
      return /"campaign_not_live"|"survey_invalid"|"publisher_mismatch"|"market_mismatch"/.test(s);
    }).map(rel);
    assert.deepEqual(offenders, []);
  });

  test("no route re-implements the groupable rule", () => {
    const allowed = new Set(["lib/campaign-groups/groupable.ts"]);
    const offenders = sources.filter(f => {
      if (allowed.has(rel(f))) return false;
      const s = readFileSync(f, "utf8");
      return /not a Survey Studio campaign|CAMPAIGN_ORIGIN\.studio\s*\)?\s*\{[\s\S]{0,80}problems/.test(s);
    }).map(rel);
    assert.deepEqual(offenders, [],
      "the groupable rule must live only in groupable.ts");
  });

  test("the guards are discriminating", () => {
    const RE = /"campaign_not_live"|"survey_invalid"|"publisher_mismatch"|"market_mismatch"/;
    assert.equal(RE.test(`if (x) return no("campaign_not_live");`), true);
    assert.equal(RE.test(`const r = someReason;`), false);
    // and must NOT fire on the unrelated run-status vocabulary
    assert.equal(RE.test(`type RunStatus = "not_started" | "generating";`), false);
  });
});
