import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveGroupRouting, groupEndpoint, namesAGroup, CONFLICTING_GROUP_PARAMETERS } from "./embed-group-routing";

describe("resolveGroupRouting", () => {
  test("neither parameter", () => {
    assert.deepEqual(resolveGroupRouting(null, null), { kind: "none" });
  });

  test("legacy only routes to the legacy endpoint", () => {
    const r = resolveGroupRouting("cocacola_group", null);
    assert.deepEqual(r, { kind: "legacy", slug: "cocacola_group" });
    assert.equal(groupEndpoint(r), "/api/embed/group");
  });

  test("campaign_group only routes to the Studio endpoint", () => {
    const r = resolveGroupRouting(null, "wwc_fotmob");
    assert.deepEqual(r, { kind: "studio", slug: "wwc_fotmob" });
    assert.equal(groupEndpoint(r), "/api/embed/studio-group");
  });

  test("BOTH is a conflict — and neither is preferred", () => {
    const r = resolveGroupRouting("legacy_slug", "studio_slug");
    assert.deepEqual(r, { kind: "conflict" });
    // The failure mode this guards against is silently picking one.
    assert.ok(!("slug" in r), "a conflict must not carry a slug to fall back on");
    assert.throws(() => groupEndpoint(r), /conflict/,
      "no endpoint may be derived from a malformed tag");
  });

  test("conflict is symmetric — order of parameters cannot change the outcome", () => {
    assert.deepEqual(resolveGroupRouting("a", "b"), resolveGroupRouting("b", "a"));
  });

  test("an unfilled ad-server macro is absent, not a conflict", () => {
    // A tag with ?campaign_group= and nothing after it must still serve legacy.
    assert.deepEqual(resolveGroupRouting("legacy_slug", ""), { kind: "legacy", slug: "legacy_slug" });
    assert.deepEqual(resolveGroupRouting("legacy_slug", "   "), { kind: "legacy", slug: "legacy_slug" });
    assert.deepEqual(resolveGroupRouting("", "studio_slug"), { kind: "studio", slug: "studio_slug" });
  });

  test("slugs are trimmed", () => {
    assert.deepEqual(resolveGroupRouting(null, "  wwc  "), { kind: "studio", slug: "wwc" });
  });

  test("namesAGroup counts a conflict — the tag DID name a group", () => {
    assert.equal(namesAGroup(resolveGroupRouting(null, null)), false);
    assert.equal(namesAGroup(resolveGroupRouting("a", null)), true);
    assert.equal(namesAGroup(resolveGroupRouting(null, "b")), true);
    assert.equal(namesAGroup(resolveGroupRouting("a", "b")), true,
      "a conflicting tag must not fall through to campaign or survey resolution");
  });

  test("the diagnostic is a stable structured token, not prose", () => {
    assert.equal(CONFLICTING_GROUP_PARAMETERS, "conflicting_group_parameters");
    assert.ok(!/\s/.test(CONFLICTING_GROUP_PARAMETERS));
  });
});

// -- Structural: the embed page must actually use this, and legacy must not move

const ROOT = join(import.meta.dirname, "..");
const page = () => readFileSync(join(ROOT, "app/embed/page.tsx"), "utf8");

describe("embed page wiring", () => {
  test("it resolves routing through the shared rule, not inline", () => {
    const s = page();
    assert.match(s, /resolveGroupRouting\(params\.get\("group"\), params\.get\("campaign_group"\)\)/);
  });

  test("the endpoint is derived, never hard-coded for the group path", () => {
    const s = page();
    assert.match(s, /groupEndpoint\(groupRouting\)/);
    // The legacy URL must no longer be a literal in the fetch — otherwise a
    // Studio group would silently hit the legacy endpoint, which is the bug
    // this whole phase exists to fix.
    assert.ok(!/fetch\(`\/api\/embed\/group\?/.test(s),
      "the group fetch must not hard-code the legacy endpoint");
  });

  test("a conflict sets unavailable and fetches nothing", () => {
    const s = page();
    const at = s.indexOf("if (!groupConflict) return;");
    assert.ok(at > -1, "no conflict effect found");
    const block = s.slice(at, at + 400);
    assert.match(block, /CONFLICTING_GROUP_PARAMETERS/);
    assert.match(block, /setPhase\("unavailable"\)/);
    assert.ok(!/fetch\(/.test(block), "a conflicting tag must call no endpoint");
  });

  test("the resolution effect refuses to run on a conflict", () => {
    assert.match(page(), /if \(!groupSlug \|\| groupConflict\) return;/);
  });

  test("groupReady starts false whenever a group was named", () => {
    assert.match(page(), /useState\(!namesAGroup\(groupRouting\)\)/);
  });
});
