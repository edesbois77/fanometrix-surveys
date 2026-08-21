import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { campaignGroupsStudioEnabled, DISABLED_RESPONSE } from "./flag";

// -- The rollout gate, and the four conditions it must satisfy ----------------
//
// Conditions 1-3 are what the gate DOES when off. Condition 4 is what it must
// NOT touch, which is the one a behavioural test cannot express: you cannot
// assert the absence of a flag check by exercising a route, only by reading it.

const ROOT = join(import.meta.dirname, "..", "..");
const rel = (f: string) => f.slice(ROOT.length + 1);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FLAG_CALL = /campaignGroupsStudioEnabled\s*\(/;
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

// -- The resolver itself ------------------------------------------------------

describe("campaignGroupsStudioEnabled", () => {
  test("ABSENT means off - the default a fresh environment gets", () => {
    assert.equal(campaignGroupsStudioEnabled({}), false);
    assert.equal(campaignGroupsStudioEnabled({ CAMPAIGN_GROUPS_STUDIO_ENABLED: undefined }), false);
  });

  test('only "true" and "1" enable it', () => {
    assert.equal(campaignGroupsStudioEnabled({ CAMPAIGN_GROUPS_STUDIO_ENABLED: "true" }), true);
    assert.equal(campaignGroupsStudioEnabled({ CAMPAIGN_GROUPS_STUDIO_ENABLED: "1" }), true);
  });

  test("anything else is off, including values that look affirmative", () => {
    for (const v of ["", " ", "TRUE", "True", "yes", "on", "enabled", "0", "false", "null", "true "]) {
      assert.equal(campaignGroupsStudioEnabled({ CAMPAIGN_GROUPS_STUDIO_ENABLED: v }), false,
        `"${v}" must not enable the feature`);
    }
  });

  test("the variable is SERVER-only - no NEXT_PUBLIC_ prefix anywhere", () => {
    // A NEXT_PUBLIC_ variable is inlined into the client bundle, where it can be
    // read and (with a patched bundle) spoofed. This gate must not be.
    const offenders = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))]
      // Excluding tests, which necessarily name the thing they forbid.
      .filter(f => !/\.test\.tsx?$/.test(f))
      .filter(f => /NEXT_PUBLIC_CAMPAIGN_GROUPS/.test(readFileSync(f, "utf8")))
      .map(rel);
    assert.deepEqual(offenders, []);

    // Discrimination: the scan must actually be capable of finding one. This
    // file contains the forbidden token, so excluding tests is what makes the
    // assertion above meaningful rather than vacuous.
    const selfCheck = [...walk(join(ROOT, "lib", "campaign-groups"))]
      .filter(f => /NEXT_PUBLIC_CAMPAIGN_GROUPS/.test(readFileSync(f, "utf8")))
      .map(rel);
    assert.deepEqual(selfCheck, ["lib/campaign-groups/flag.test.ts"],
      "the NEXT_PUBLIC_ scan has stopped matching and is no longer proving anything");
  });
});

// -- Condition 1: the interface is hidden ------------------------------------

describe("condition 1 - the Studio Campaign Groups interface is hidden", () => {
  test("the Manage page resolves the flag on the SERVER and passes a boolean down", () => {
    const page = src("app/survey-studio/manage/page.tsx");
    assert.match(page, FLAG_CALL, "the server component must resolve the flag");
    assert.match(page, /campaignGroupsEnabled=\{campaignGroupsStudioEnabled\(\)\}/);
  });

  test("the Manage shell never reads the environment itself", () => {
    // A client component reading process.env would either be inlined or be
    // undefined at runtime; either way the gate would not be server-controlled.
    const shell = src("app/components/studio/manage/ManageWorkspace.tsx");
    assert.ok(!/process\.env/.test(shell), "the client shell must not read process.env");
    assert.ok(!FLAG_CALL.test(shell), "the client shell must not call the resolver");
  });

  test("the Campaigns tab is omitted from the tab list when disabled", () => {
    const shell = src("app/components/studio/manage/ManageWorkspace.tsx");
    assert.match(shell, /\.\.\.\(campaignGroupsEnabled \? \[\{ key: "campaigns"/,
      "the tab must be spread in conditionally, not rendered disabled");
    // Rendering it as "soon" would advertise an unreleased capability.
    assert.ok(!/key: "campaigns", label: "Campaigns", live: false/.test(shell));
  });

  test("the prop defaults to false, so a caller that forgets it hides the tab", () => {
    const shell = src("app/components/studio/manage/ManageWorkspace.tsx");
    assert.match(shell, /campaignGroupsEnabled = false/);
  });

  test("?view=campaigns cannot open the hidden tab", () => {
    const shell = src("app/components/studio/manage/ManageWorkspace.tsx");
    assert.match(shell, /initialView === "campaigns" && campaignGroupsEnabled/);
  });

  test("the body will not render the group views when disabled", () => {
    const shell = src("app/components/studio/manage/ManageWorkspace.tsx");
    assert.match(shell, /tab === "campaigns" && campaignGroupsEnabled/);
  });
});

// -- Condition 2: management APIs return 404 ---------------------------------

const STUDIO_ROUTES = [
  "app/api/studio/campaign-groups/route.ts",
  "app/api/studio/campaign-groups/[id]/route.ts",
  "app/api/studio/campaign-groups/[id]/revisions/route.ts",
  "app/api/studio/campaign-groups/[id]/revisions/[revisionId]/route.ts",
];

/** The body of each exported handler in a route file. */
function handlers(source: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /export async function (GET|POST|PATCH|PUT|DELETE)\s*\([^)]*\)[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const next = source.slice(m.index + m[0].length);
    const end = next.search(/\nexport async function /);
    out.push({ name: m[1], body: end === -1 ? next : next.slice(0, end) });
  }
  return out;
}

describe("condition 2 - Studio create/edit APIs return 404 when disabled", () => {
  test("every handler in every Studio group route is gated", () => {
    const ungated: string[] = [];
    let total = 0;
    for (const r of STUDIO_ROUTES) {
      for (const h of handlers(src(r))) {
        total++;
        if (!FLAG_CALL.test(h.body)) ungated.push(`${r}:${h.name}`);
      }
    }
    assert.ok(total >= 6, `expected at least 6 handlers, parsed ${total}`);
    assert.deepEqual(ungated, []);
  });

  test("the gate is the FIRST statement, ahead of authentication", () => {
    // If auth ran first a disabled route would answer 401 to a signed-out
    // caller, which reveals that the route exists.
    for (const r of STUDIO_ROUTES) {
      for (const h of handlers(src(r))) {
        const gateAt = h.body.search(FLAG_CALL);
        const authAt = h.body.indexOf("requireUser");
        assert.ok(gateAt !== -1, `${r}:${h.name} has no gate`);
        if (authAt !== -1) {
          assert.ok(gateAt < authAt, `${r}:${h.name} authenticates before gating`);
        }
      }
    }
  });

  test("the gate answers 404, never 403 - a disabled route looks absent, not withheld", () => {
    for (const r of STUDIO_ROUTES) {
      const s = src(r);
      assert.match(s, /DISABLED_RESPONSE, \{ status: 404 \}/, `${r} must 404`);
      const gateBlock = s.slice(s.search(FLAG_CALL), s.search(FLAG_CALL) + 220);
      assert.ok(!/status: 403/.test(gateBlock), `${r} must not 403 from the gate`);
    }
  });

  test("the disabled body carries no detail about the feature", () => {
    assert.deepEqual(DISABLED_RESPONSE, { error: "Not found" });
    assert.ok(!JSON.stringify(DISABLED_RESPONSE).toLowerCase().includes("campaign"));
    assert.ok(!JSON.stringify(DISABLED_RESPONSE).toLowerCase().includes("flag"));
    assert.ok(!JSON.stringify(DISABLED_RESPONSE).toLowerCase().includes("disabled"));
  });
});

// -- Condition 3: Studio groups cannot serve ---------------------------------

describe("condition 3 - Studio groups do not serve when disabled", () => {
  const serve = () => src("app/api/embed/studio-group/route.ts");

  test("the serve endpoint is gated", () => {
    assert.match(serve(), FLAG_CALL);
  });

  test("the gate runs before ANY database work", () => {
    const s = serve();
    const gateAt = s.search(FLAG_CALL);
    for (const io of ["loadStudioGroupBySlug", "loadRevisions", "loadCampaignFacts", "supabaseAdmin"]) {
      const at = s.indexOf(io, s.indexOf("async function serve"));
      if (at !== -1) assert.ok(gateAt < at, `the gate must precede ${io}`);
    }
  });

  test("a disabled serve returns 404 - not a fail_mode refusal", () => {
    const s = serve();
    const gateBlock = s.slice(s.search(FLAG_CALL), s.search(FLAG_CALL) + 260);
    assert.match(gateBlock, /status: 404/);
    // 409 is the deliberate fail-closed refusal. When the capability is off it
    // does not exist, so the publisher's own fallback must fill the slot exactly
    // as it would for a slug that was never created.
    assert.ok(!/status: 409/.test(gateBlock), "a disabled feature must not fail-closed");
    assert.ok(!/refuse\(/.test(gateBlock), "the gate must not route through fail_mode");
  });

  test("the disabled response is not cacheable", () => {
    // A cached 404 would outlive the flag being switched on.
    const s = serve();
    const gateBlock = s.slice(s.search(FLAG_CALL), s.search(FLAG_CALL) + 260);
    assert.match(gateBlock, /headers: NO_CACHE/);
  });
});

// -- Condition 4: legacy is completely untouched -----------------------------

const LEGACY_SURFACE = [
  "app/api/embed/group/route.ts",
  "app/api/campaign-groups/route.ts",
  "app/api/campaign-groups/[id]/route.ts",
  "app/api/dashboard/groups/route.ts",
  "app/api/access-search/route.ts",
  "lib/access.ts",
  "lib/campaign-group-membership.ts",
  "lib/simulation/delete-simulated-project.ts",
];

describe("condition 4 - legacy Campaign Groups are completely unchanged", () => {
  test("no legacy route or module references the flag", () => {
    // The point of the gate is to make a NEW capability switchable. If it ever
    // appeared on the legacy path it would become a new way for live delivery
    // to fail - including for the WWC surveys already collecting.
    const offenders = LEGACY_SURFACE.filter(f =>
      FLAG_CALL.test(src(f)) || /CAMPAIGN_GROUPS_STUDIO_ENABLED/.test(src(f)));
    assert.deepEqual(offenders, []);
  });

  test("the legacy serve path contains no environment branch of any kind", () => {
    const s = src("app/api/embed/group/route.ts");
    assert.ok(!/process\.env/.test(s),
      "legacy delivery must not depend on any environment variable");
  });

  test("the flag is confined to Studio surfaces", () => {
    const users = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "lib"))]
      .filter(f => !/\.test\.tsx?$/.test(f))
      .filter(f => FLAG_CALL.test(readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    assert.deepEqual(users, [
      "app/api/embed/studio-group/route.ts",
      "app/api/studio/campaign-groups/[id]/revisions/[revisionId]/route.ts",
      "app/api/studio/campaign-groups/[id]/revisions/route.ts",
      "app/api/studio/campaign-groups/[id]/route.ts",
      "app/api/studio/campaign-groups/route.ts",
      "app/api/studio/surveys/[id]/group-candidates/route.ts",
      "app/survey-studio/manage/page.tsx",
      "lib/campaign-groups/flag.ts",
    ], "the gate has reached a surface it was not meant to cover");
  });

  test("the guard is discriminating - it would notice a flag on a legacy route", () => {
    // Without this, a regex that stopped matching would leave the tests above
    // passing for the wrong reason.
    assert.equal(FLAG_CALL.test("if (!campaignGroupsStudioEnabled()) return;"), true);
    assert.equal(FLAG_CALL.test("const x = 1;"), false);
  });
});
