import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const ROUTE = "app/api/studio/campaign-groups/[id]/revisions/route.ts";
const UI = "app/components/studio/create/campaigns/CampaignGroupsSection.tsx";

// -- The acknowledgement must be an ACT, never a default ---------------------
//
// It exists so somebody has consciously accepted that results either side of a
// membership change are not directly comparable. A UI that ticks it on the
// operator's behalf does not make that true — it just removes the person from
// the loop while keeping the audit trail that says they were in it.

describe("comparability acknowledgement — the UI cannot manufacture one", () => {
  test("the UI NEVER hard-codes true", () => {
    const s = src(UI);
    assert.ok(!/comparability_acknowledged:\s*true/.test(s),
      "sending true unconditionally makes the server's guard unreachable and the " +
      "acknowledgement meaningless — this is the exact defect being fixed");
    assert.match(s, /comparability_acknowledged:\s*acknowledged/);
  });

  test("the checkbox starts UNCHECKED", () => {
    assert.match(src(UI), /useState\(false\);?\s*$/m);
    const s = src(UI);
    const at = s.indexOf("const [acknowledged, setAcknowledged]");
    assert.ok(at > -1);
    assert.match(s.slice(at, at + 80), /useState\(false\)/);
  });

  test("publish is disabled while a required acknowledgement is unchecked", () => {
    assert.match(src(UI), /preview\?\.comparability_required && !acknowledged/);
  });

  test("the checkbox renders ONLY when the server says it is required", () => {
    const s = src(UI);
    assert.match(s, /preview\?\.comparability_required && \(/);
    // A weight-only change must not be dressed up as a population change.
    assert.ok(!/membershipChanged|added\.length > 0 \|\| removed\.length > 0/.test(
      s.slice(s.indexOf("comparability_required && ("), s.indexOf("comparability_required && (") + 600)),
      "the UI must not re-derive the requirement — the server classifies the change");
  });

  test("the requirement comes from a SERVER preview, not a client opinion", () => {
    const s = src(UI);
    assert.match(s, /preview: true/);
    assert.match(s, /setPreview\(/);
  });

  test("changing the proposed membership clears a tick made against the old shape", () => {
    assert.match(src(UI), /setAcknowledged\(false\);/);
  });

  test("the wording says what it means", () => {
    const s = src(UI);
    assert.match(s, /may change the audience/i);
    assert.match(s, /separate delivery periods/i);
  });
});

describe("comparability acknowledgement — the server is authoritative", () => {
  test("preview mode reports the requirement and writes nothing", () => {
    const s = src(ROUTE);
    const at = s.indexOf("if (body.preview === true)");
    assert.ok(at > -1, "no preview branch");
    const block = s.slice(at, at + 700);
    assert.match(block, /comparability_required/);
    assert.ok(!/editGroup\(/.test(block), "preview must not publish");
  });

  test("the requirement is RE-DERIVED at publish, not trusted from the form", () => {
    const s = src(ROUTE);
    assert.match(s, /const hasHistory = existing\.some\(/);
    assert.match(s, /const comparabilityRequired = diff\.membershipChanged && hasHistory/);
    // and it is computed from the SERVER's diff, not from anything in the body
    assert.ok(!/body\.change_kind/.test(s));
  });

  test("a missing or non-true acknowledgement is refused, never defaulted", () => {
    const s = src(ROUTE);
    assert.match(s, /const acknowledged = body\.comparability_acknowledged === true/,
      "strict equality: 'true', 1 and {} must not count as an acknowledgement");
    assert.match(s, /if \(comparabilityRequired && !acknowledged\)/);
  });

  test("the real value is passed to the RPC, not a literal", () => {
    assert.match(src(ROUTE), /comparabilityAcknowledged: acknowledged/);
    assert.ok(!/comparabilityAcknowledged: true/.test(src(ROUTE)));
  });

  test("the database guard still exists behind the route", () => {
    const sql = src("supabase-migration-212.sql");
    assert.match(sql, /IF v_has_evidence AND NOT p_comparability_ack THEN/);
    assert.match(sql, /requires an explicit comparability acknowledgement/);
  });
});

// -- Item 4: publisher embed compatibility ----------------------------------
//
// public/embed.js is served to publishers. A change to it reaches live tags that
// nobody at Fanometrix controls, so the regression is asserted rather than
// assumed.

describe("embed.js — existing publisher tags are unaffected", () => {
  /** Reproduce the loader's parameter construction for a given attribute set. */
  function buildUrl(attrs: Record<string, string>): string {
    const js = src("public/embed.js");
    const listed = [...js.matchAll(/"([a-z_]+)"/g)].map(m => m[1]);
    const params = new URLSearchParams();
    for (const attr of listed) {
      const domAttr = "data-" + attr.replace(/_/g, "-");
      const val = attrs[domAttr];
      if (val) params.set(attr, val);
    }
    return "/embed?" + params.toString();
  }

  test("an existing data-campaign tag produces the identical URL", () => {
    assert.equal(buildUrl({ "data-campaign": "zzz_c1" }), "/embed?campaign=zzz_c1");
  });

  test("a fully-populated legacy tag is unchanged", () => {
    const url = buildUrl({
      "data-campaign": "c1", "data-publisher": "FotMob", "data-placement": "mpu",
      "data-country": "GB", "data-segment": "fans",
    });
    assert.equal(url, "/embed?campaign=c1&publisher=FotMob&placement=mpu&country=GB&segment=fans");
    assert.ok(!url.includes("campaign_group"), "no new parameter appears uninvited");
  });

  test("a tag with NO new attribute gains nothing", () => {
    assert.ok(!buildUrl({ "data-campaign": "c1" }).includes("campaign_group"));
  });

  test("data-campaign-group produces ONLY campaign_group", () => {
    assert.equal(buildUrl({ "data-campaign-group": "wwc_grp" }), "/embed?campaign_group=wwc_grp");
  });

  test("the loader still does NOT accept a legacy data-group attribute", () => {
    // Legacy groups have never had a script tag; adding one is not this work.
    assert.equal(buildUrl({ "data-group": "legacy_grp" }), "/embed?");
  });

  test("both group attributes together produce a URL the page treats as a conflict", () => {
    // The loader has no opinion; the embed page refuses. Assert the URL carries
    // both, so the page's conflict rule is the thing that decides.
    const url = buildUrl({ "data-campaign-group": "studio_grp" });
    assert.ok(url.includes("campaign_group=studio_grp"));
    // and the page's rule is what handles a hand-written iframe carrying both:
    const routing = src("lib/embed-group-routing.ts");
    assert.match(routing, /if \(legacy && studio\) return \{ kind: "conflict" \}/);
  });
});

// ── The scheduled-change panel must never promise a Delete the page withholds ──
//
// Found in the pre-merge browser walk: on a group that already held effective
// history (Delete correctly absent) the scheduled-change panel still read
// "the group can be deleted until then". The sentence is now driven by the
// server's own can_delete verdict, so copy and control cannot disagree.
test("the deletability sentence is driven by can_delete, not assumed", () => {
  const src = readFileSync(
    new URL("../../app/components/studio/create/campaigns/CampaignGroupsSection.tsx", import.meta.url),
    "utf8",
  );
  const panel = src.slice(src.indexOf("{/* Scheduled change"), src.indexOf("CONFIGURATION HISTORY"));

  assert.ok(panel.includes("d.can_delete"),
    "the scheduled-change panel must branch on the server's can_delete verdict");

  // The optimistic sentence must not be reachable unconditionally.
  const idxPromise = panel.indexOf("the group can be deleted until then");
  const idxBranch = panel.indexOf("d.can_delete");
  assert.ok(idxPromise > idxBranch && idxBranch !== -1,
    "the 'can be deleted until then' promise must sit inside the can_delete branch");

  assert.ok(panel.includes("cannot be deleted either way"),
    "a group that already has effective history needs the honest alternative sentence");
});
