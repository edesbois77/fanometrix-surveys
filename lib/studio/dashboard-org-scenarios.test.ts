import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDashboardScope, type DashboardDb } from "./dashboard-scope";
import { resolveDashboardManifest } from "./dashboard-manifest";
import type { AuthedUser } from "@/lib/auth-server";

// ── Parent / child / client organisation scenarios ───────────────────────────
// These prove the DASHBOARD side: given the governed data universe (the output of
// dataVisibleCampaignIds, injected here as `gate`), the scope resolver + manifest
// produce the correct top-line universe and Publisher breakdown — and NEVER admit
// an unrelated publisher. The injected gate stands for the org's resolved `data`
// entitlement; the investigation confirmed that resolver reads ONLY the Current
// Organisation's own `data` OREs (no hierarchy expansion), so:
//   • a group/parent org sees children's campaigns IFF it HOLDS those data OREs
//     (represented here by the gate including those campaign ids);
//   • a child-only org's gate contains only its own campaigns — sibling isolation
//     is automatic;
//   • unrelated publishers' campaigns are simply never in the gate.
// The enrolment that grants a parent org those OREs is a separate PLATFORM gap
// (see the Phase 2 report) — NOT modelled or worked around here.

type Row = Record<string, unknown>;
function makeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = { campaigns: [], organisations: [], surveys: [], ...seed };
  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const api: Record<string, unknown> = {
      select() { return api; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return api; },
      in(c: string, vals: unknown[]) { const s = new Set(vals); filters.push((r) => s.has(r[c])); return api; },
      is(c: string, v: unknown) { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return api; },
      then(res: (v: { data: Row[]; error: null }) => void) { res({ data: tables[table].filter((r) => filters.every((f) => f(r))), error: null }); },
    };
    return api;
  }
  return { from: (t: string) => { tables[t] ??= []; return builder(t); } } as unknown as DashboardDb;
}

// Publisher orgs (illustrative names for repository-native `organisations`/publisher_org_id semantics)
const PF = "org-planet-football", F365 = "org-football365", TT = "org-teamtalk", LIVE = "org-livescore", FOT = "org-fotmob";
const ORG_NAMES: Row[] = [
  { id: PF, name: "Planet Football" }, { id: F365, name: "Football365" }, { id: TT, name: "TEAMtalk" },
  { id: LIVE, name: "LiveScore" }, { id: FOT, name: "FotMob" },
];
function camp(id: string, pub: string, market = "GB", lang = "en"): Row {
  return { id, campaign_id: `slug_${id}`, survey_id: `survey_${pub}`, publisher_org_id: pub, market, country_code: market, survey_language: lang, deleted_at: null };
}
// The whole platform's campaigns — every scenario intersects its gate against this.
const ALL_CAMPAIGNS: Row[] = [
  camp("pf1", PF), camp("f365a", F365), camp("f365b", F365), camp("f365c", F365),
  camp("tt1", TT), camp("live1", LIVE), camp("fot1", FOT),
];
const db = () => makeDb({ campaigns: ALL_CAMPAIGNS, organisations: ORG_NAMES });
const user = { id: "u1", organisationId: "org-current", role: "publisher" } as unknown as AuthedUser;
const gate = (ids: string[]) => async () => ids;

async function scopeAndPublishers(gateIds: string[]) {
  const client = db();
  const scope = await resolveDashboardScope(user, { client, resolveGate: gate(gateIds) });
  const manifest = await resolveDashboardManifest(scope.effectiveCampaigns, { client });
  const publisherDim = manifest.dimensions.find((d) => d.key === "publisher") ?? null;
  return { scope, publisherLabels: publisherDim ? publisherDim.values.map((v) => v.label).sort() : null };
}

test("PARENT/GROUP (Planet Sport): universe spans all authorised properties; Publisher = exactly those three", async () => {
  // Planet Sport holds data OREs across its three properties → gate contains all three.
  const { scope, publisherLabels } = await scopeAndPublishers(["pf1", "f365a", "tt1"]);
  assert.equal(scope.isEmpty, false);
  assert.equal(scope.campaigns.length, 3, "top-line universe = all three properties' campaigns");
  assert.deepEqual(publisherLabels, ["Football365", "Planet Football", "TEAMtalk"]);
  // No unrelated publisher may ever enter.
  assert.ok(!publisherLabels!.includes("LiveScore") && !publisherLabels!.includes("FotMob"));
});

test("TOP-LINE preserved: no Publisher narrowing ⇒ effective universe = the full authorised set", async () => {
  const { scope } = await scopeAndPublishers(["pf1", "f365a", "tt1"]);
  // With no survey/publisher filter, effective == authorised (Phase 3 aggregates over this).
  assert.deepEqual(scope.effectiveCampaignSlugs.sort(), ["slug_pf1", "slug_f365a", "slug_tt1"].sort());
});

test("CHILD-ONLY (Football365): universe is Football365 only; Publisher omitted (single value); no siblings", async () => {
  const { scope, publisherLabels } = await scopeAndPublishers(["f365a", "f365b"]);
  assert.equal(scope.campaigns.every((c) => c.publisher_org_id === F365), true);
  assert.equal(publisherLabels, null, "single-publisher scope → Publisher dimension omitted");
  const ids = scope.campaigns.map((c) => c.id).sort();
  assert.deepEqual(ids, ["f365a", "f365b"]);
  assert.ok(!ids.includes("pf1") && !ids.includes("tt1"), "no sibling inheritance from any hierarchy");
});

test("CLIENT multi-publisher (Dentsu): several Publisher values WITHOUT being their parent — entitlement-driven", async () => {
  // A commissioning client entitled to research distributed across three publishers.
  const { publisherLabels } = await scopeAndPublishers(["live1", "fot1", "f365c"]);
  assert.deepEqual(publisherLabels, ["Football365", "FotMob", "LiveScore"]);
  // Same mechanism as the parent case (the authorised campaign universe), proving
  // Publisher comparison is entitlement-driven, not hierarchy-driven.
});

test("UNRELATED publishers never enter the authorised universe (intersection, not the table)", async () => {
  // LiveScore/FotMob campaigns exist in the platform table but are outside the gate.
  const { scope, publisherLabels } = await scopeAndPublishers(["pf1", "f365a", "tt1"]);
  const ids = scope.campaigns.map((c) => c.id);
  assert.ok(!ids.includes("live1") && !ids.includes("fot1"));
  assert.ok(!publisherLabels!.some((l) => l === "LiveScore" || l === "FotMob"));
});
