import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveChange, type MemberShape } from "./change-kind";

const m = (id: string, weight = 1, paused = false): MemberShape =>
  ({ campaign_id: id, weight, membership_state: paused ? "paused" : "active" });

describe("deriveChange", () => {
  test("no previous configuration is 'created', and needs no reason", () => {
    const d = deriveChange({ previous: null, next: [m("a"), m("b")], previousRotation: null, nextRotation: "equal" });
    assert.equal(d.kind, "created");
    assert.deepEqual(d.added, ["a", "b"]);
    assert.equal(d.reasonRequired, false, "the first configuration admits nothing");
    assert.equal(d.membershipChanged, false, "there is nothing to be incomparable with");
  });

  test("adding a campaign is members_added, and REQUIRES a reason", () => {
    const d = deriveChange({ previous: [m("a")], next: [m("a"), m("b")], previousRotation: "equal", nextRotation: "equal" });
    assert.equal(d.kind, "members_added");
    assert.deepEqual(d.added, ["b"]);
    assert.equal(d.reasonRequired, true);
    assert.equal(d.membershipChanged, true);
  });

  test("removing a campaign is members_removed, and REQUIRES a reason", () => {
    const d = deriveChange({ previous: [m("a"), m("b")], next: [m("a")], previousRotation: "equal", nextRotation: "equal" });
    assert.equal(d.kind, "members_removed");
    assert.deepEqual(d.removed, ["b"]);
    assert.equal(d.reasonRequired, true);
  });

  test("pausing and resuming are distinguished, and need no reason", () => {
    const paused = deriveChange({ previous: [m("a")], next: [m("a", 1, true)], previousRotation: "equal", nextRotation: "equal" });
    assert.equal(paused.kind, "member_paused");
    assert.deepEqual(paused.paused, ["a"]);
    assert.equal(paused.reasonRequired, false);

    const resumed = deriveChange({ previous: [m("a", 1, true)], next: [m("a")], previousRotation: "equal", nextRotation: "equal" });
    assert.equal(resumed.kind, "member_resumed");
    assert.deepEqual(resumed.resumed, ["a"]);
  });

  test("a weight change alone is weights_changed", () => {
    const d = deriveChange({ previous: [m("a", 50)], next: [m("a", 70)], previousRotation: "weighted", nextRotation: "weighted" });
    assert.equal(d.kind, "weights_changed");
    assert.deepEqual(d.reweighted, ["a"]);
    assert.equal(d.reasonRequired, false);
  });

  test("a rotation change alone is rotation_changed", () => {
    const d = deriveChange({ previous: [m("a")], next: [m("a")], previousRotation: "equal", nextRotation: "weighted" });
    assert.equal(d.kind, "rotation_changed");
    assert.equal(d.rotationChanged, true);
  });

  test("THE ATTACK THIS PREVENTS — a removal disguised as a reweight", () => {
    // A client sending change_kind:"weights_changed" while removing a campaign
    // would escape BOTH the mandatory reason and the comparability
    // acknowledgement. The server derives from the diff, so it cannot.
    const d = deriveChange({
      previous: [m("a", 50), m("b", 50)],
      next: [m("a", 100)],                    // b removed, a reweighted
      previousRotation: "weighted", nextRotation: "weighted",
    });
    assert.equal(d.kind, "members_removed", "removal must outrank the reweight");
    assert.equal(d.reasonRequired, true);
    assert.equal(d.membershipChanged, true);
    assert.deepEqual(d.reweighted, ["a"], "and the reweight is still reported");
  });

  test("precedence: admissions outrank everything else happening at once", () => {
    const d = deriveChange({
      previous: [m("a", 50), m("b", 50)],
      next: [m("a", 10), m("c"), m("b", 50, true)],   // add c, reweight a, pause b
      previousRotation: "equal", nextRotation: "weighted",
    });
    assert.equal(d.kind, "members_added");
    assert.deepEqual(d.added, ["c"]);
    assert.deepEqual(d.paused, ["b"]);
    assert.deepEqual(d.reweighted, ["a"]);
    assert.equal(d.rotationChanged, true);
  });

  test("an identical republish changes nothing and requires nothing", () => {
    const d = deriveChange({ previous: [m("a", 70)], next: [m("a", 70)], previousRotation: "equal", nextRotation: "equal" });
    assert.equal(d.reasonRequired, false);
    assert.equal(d.membershipChanged, false);
    assert.deepEqual([d.added, d.removed, d.paused, d.resumed, d.reweighted], [[], [], [], [], []]);
  });

  test("member order does not affect the diff", () => {
    const a = deriveChange({ previous: [m("a"), m("b")], next: [m("b"), m("a")], previousRotation: "equal", nextRotation: "equal" });
    assert.deepEqual([a.added, a.removed], [[], []]);
  });
});

// -- The routes must actually use the derivation ------------------------------

const ROOT = join(import.meta.dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const REVISIONS = "app/api/studio/campaign-groups/[id]/revisions/route.ts";
const DETAIL    = "app/api/studio/campaign-groups/[id]/route.ts";

describe("route wiring", () => {
  test("change_kind is DERIVED, never taken from the request body", () => {
    const s = src(REVISIONS);
    assert.match(s, /deriveChange\(/);
    assert.match(s, /changeKind: diff\.kind/);
    assert.ok(!/body\.change_kind/.test(s),
      "the request's change_kind must not be read — it decides which rules fire");
  });

  test("the reason requirement follows the DERIVED diff", () => {
    assert.match(src(REVISIONS), /diff\.reasonRequired && !reason/);
  });

  test("Set Live is gated on the server's verdict, not on 'has a revision'", () => {
    const s = src(DETAIL);
    assert.match(s, /assessGoLive\(/);
    assert.match(s, /if \(!verdict\.allowed\)/);
  });

  test("the detail response carries the structured verdict and the expiry", () => {
    const s = src(DETAIL);
    for (const field of ["go_live:", "can_delete:", "pending_count:", "next_state_change_at:"]) {
      assert.ok(s.includes(field), `detail must return ${field}`);
    }
  });

  test("DELETE re-checks at submit time rather than trusting the client", () => {
    const s = src(DETAIL);
    const del = s.slice(s.indexOf("export async function DELETE"));
    assert.match(del, /effectiveAt <= now/, "must re-evaluate effectiveness itself");
    assert.match(del, /status: 409/);
  });

  test("DELETE does not seq-scan survey_events", () => {
    // Filtering survey_events by revision without event_type cannot use the
    // partial index and scans 1.14M rows — measured at 6.6 s.
    const del = src(DETAIL).slice(src(DETAIL).indexOf("export async function DELETE"));
    assert.ok(!/from\("survey_events"\)/.test(del),
      "survey_events must not be queried here; see the comment for why");
  });

  test("the candidate endpoint returns BOTH verdicts, from the shared modules", () => {
    const s = src("app/api/studio/surveys/[id]/group-candidates/route.ts");
    for (const field of ["can_add_to_group:", "cannot_add_reason:", "can_serve_now:", "serve_readiness_reasons:"]) {
      assert.ok(s.includes(field), `candidates must return ${field}`);
    }
    assert.match(s, /assessGroupable\(/);
    assert.match(s, /assessServeReadiness\(/);
    assert.match(s, /can_create_group: groupable >= 2/,
      "creation needs two GROUPABLE campaigns, not two live ones");
  });

  test("the candidate endpoint is scoped to Studio campaigns of ONE survey", () => {
    const s = src("app/api/studio/surveys/[id]/group-candidates/route.ts");
    assert.match(s, /\.eq\("survey_id", surveyId\)/);
    assert.match(s, /\.eq\("origin", CAMPAIGN_ORIGIN\.studio\)/);
  });
});
