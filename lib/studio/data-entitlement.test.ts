import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureSurveyDataScope,
  grantSurveyDataEntitlement,
  enrolCampaignInSurveyDataScope,
  enrolSurveyCampaigns,
  surveyDataScopeName,
  campaignSlugsForIds,
  type EntitlementDb,
} from "./data-entitlement";
import {
  organisationEntitled,
  userAuthorisedForResource,
  ownershipIsEntitlement,
  type OrgEntitlement,
  type UserAuthorisation,
  type ResourceRef,
} from "@/lib/authz/resource-entitlement";
import { resolveProductAccess } from "@/lib/authz/product-access";

// ── Minimal in-memory Supabase fake ──────────────────────────────────────────
// Backs the exact query surface the helpers use (select/eq/in/order/limit/insert/
// upsert). Lets us drive the REAL helpers, then feed the rows they wrote into the
// governed PURE resolver (resource-entitlement.ts) that dataVisibleCampaignIds
// mirrors — proving the end-to-end entitlement math without a live database.
type Row = Record<string, unknown>;
function makeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { resource_scopes: [], organisation_resource_entitlements: [], resource_scope_members: [], campaigns: [], platform_operator_entitlements: [], ...seed };
  let seq = 0;
  const genId = (t: string) => `${t}-${++seq}`;
  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let limitN: number | null = null;
    let insertResult: Row[] | null = null;
    const api: Record<string, unknown> = {
      select() { return api; },
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return api; },
      in(col: string, vals: unknown[]) { const s = new Set(vals); filters.push((r) => s.has(r[col])); return api; },
      order() { return api; },
      limit(n: number) { limitN = n; return api; },
      insert(rowOrRows: Row | Row[]) {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        const inserted = rows.map((r) => ({ created_at: new Date(0).toISOString(), ...r, id: (r.id as string) ?? genId(table) }));
        tables[table].push(...inserted);
        insertResult = inserted;
        return api;
      },
      upsert(rowOrRows: Row | Row[], opts?: { onConflict?: string }) {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        const cols = (opts?.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        for (const r of rows) {
          const dup = cols.length > 0 && tables[table].some((e) => cols.every((c) => e[c] === r[c]));
          if (dup) continue;
          tables[table].push({ created_at: new Date(0).toISOString(), ...r, id: (r.id as string) ?? genId(table) });
        }
        insertResult = [];
        return api;
      },
      then(resolve: (v: { data: Row[] | null; error: { message: string } | null }) => void) {
        if (insertResult !== null) { resolve({ data: insertResult, error: null }); return; }
        let data = tables[table].filter((r) => filters.every((f) => f(r)));
        if (limitN != null) data = data.slice(0, limitN);
        resolve({ data, error: null });
      },
    };
    return api;
  }
  return { from: (t: string) => { tables[t] ??= []; return builder(t); }, tables } as unknown as EntitlementDb & { tables: Record<string, Row[]> };
}

const client = (db: ReturnType<typeof makeDb>) => db as unknown as EntitlementDb;
const ref = (campaignId: string): ResourceRef => ({ resourceClass: "data", resourceId: campaignId });

// Extract the governed pure inputs from what the helpers wrote (mirrors the
// dataVisibleCampaignIds resolution: data ORE → scope members → campaign ids).
function oreFor(db: ReturnType<typeof makeDb>, orgId: string): OrgEntitlement[] {
  return db.tables.organisation_resource_entitlements
    .filter((r) => r.organisation_id === orgId && r.resource_class === "data")
    .map((r) => ({ organisationId: r.organisation_id as string, resourceClass: "data", resourceId: (r.resource_id as string) ?? null, scopeId: (r.scope_id as string) ?? null, active: r.status === "active" }));
}
function scopeCoversFrom(db: ReturnType<typeof makeDb>) {
  const members = db.tables.resource_scope_members;
  return (scopeId: string, r: ResourceRef) => members.some((m) => m.scope_id === scopeId && m.resource_class === r.resourceClass && m.resource_id === r.resourceId);
}
const entitled = (db: ReturnType<typeof makeDb>, orgId: string, campaignId: string) =>
  organisationEntitled(oreFor(db, orgId), ref(campaignId), scopeCoversFrom(db));

// Ids
const SURVEY = "survey-uuid-1";
const PUB_OWNER = "org-livescore";      // self-service publisher / distributor
const PUB_OTHER = "org-otherpub";
const AGENCY = "org-dentsu";
const BRAND = "org-nike";
const CAMP_A = "campaign-uuid-A";
const CAMP_B = "campaign-uuid-B";

// ── Helper row shape + idempotency (Task B) ──────────────────────────────────

test("grant creates a data ORE to the scope (not resource_id), reusing one scope", async () => {
  const db = makeDb();
  await grantSurveyDataEntitlement(SURVEY, PUB_OWNER, { client: client(db) });
  const ore = db.tables.organisation_resource_entitlements;
  assert.equal(ore.length, 1);
  assert.equal(ore[0].organisation_id, PUB_OWNER);
  assert.equal(ore[0].resource_class, "data");
  assert.equal(ore[0].status, "active");
  assert.ok(ore[0].scope_id, "grant targets a scope");
  assert.equal(ore[0].resource_id ?? null, null, "grant is scope-based, not per-resource");
  // Scope is the deterministic per-survey data scope.
  assert.equal(db.tables.resource_scopes.length, 1);
  assert.equal(db.tables.resource_scopes[0].name, surveyDataScopeName(SURVEY));
  assert.equal(db.tables.resource_scopes[0].resource_class, "data");
});

test("enrol adds a data member by CAMPAIGN UUID (never a slug)", async () => {
  const db = makeDb();
  await enrolCampaignInSurveyDataScope(SURVEY, CAMP_A, { client: client(db) });
  const m = db.tables.resource_scope_members;
  assert.equal(m.length, 1);
  assert.equal(m[0].resource_class, "data");
  assert.equal(m[0].resource_id, CAMP_A);   // the UUID passed in
  assert.match(String(m[0].resource_id), /^campaign-uuid/); // not a studio_ slug
});

test("14. retry creates no duplicate scope / grant / membership", async () => {
  const db = makeDb();
  await grantSurveyDataEntitlement(SURVEY, PUB_OWNER, { client: client(db) });
  await grantSurveyDataEntitlement(SURVEY, PUB_OWNER, { client: client(db) }); // retry
  await enrolSurveyCampaigns(SURVEY, [CAMP_A, CAMP_A], { client: client(db) });
  await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });          // retry
  assert.equal(db.tables.resource_scopes.length, 1);
  assert.equal(db.tables.organisation_resource_entitlements.length, 1);
  assert.equal(db.tables.resource_scope_members.length, 1);
});

test("15. null / ambiguous commissioning organisation never produces a grant", async () => {
  const db = makeDb();
  await assert.rejects(() => grantSurveyDataEntitlement(SURVEY, "", { client: client(db) }));
  assert.equal(db.tables.organisation_resource_entitlements.length, 0, "no accidental grant");
});

test("ensureSurveyDataScope is idempotent (find-or-create)", async () => {
  const db = makeDb();
  const a = await ensureSurveyDataScope(SURVEY, { client: client(db) });
  const b = await ensureSurveyDataScope(SURVEY, { client: client(db) });
  assert.equal(a, b);
  assert.equal(db.tables.resource_scopes.length, 1);
});

// ── Security matrix (via the governed pure resolver over helper-written rows) ─

test("1 & 2. self-service owner is data-entitled; another publisher is not", async () => {
  const db = makeDb();
  await grantSurveyDataEntitlement(SURVEY, PUB_OWNER, { client: client(db) });
  await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });
  assert.equal(entitled(db, PUB_OWNER, CAMP_A), true);
  assert.equal(entitled(db, PUB_OTHER, CAMP_A), false);
});

test("3. distribution publisher on commissioned research gets NO entitlement", async () => {
  const db = makeDb();
  // Commissioned: the agency is entitled; PUB_OWNER merely distributes (publisher_org_id).
  await grantSurveyDataEntitlement(SURVEY, AGENCY, { client: client(db) });
  await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });
  assert.equal(entitled(db, AGENCY, CAMP_A), true);
  assert.equal(entitled(db, PUB_OWNER, CAMP_A), false, "distribution ≠ data entitlement");
});

test("4 & 5. commissioning Agency / Brand receive entitlement when granted", async () => {
  for (const clientOrg of [AGENCY, BRAND]) {
    const db = makeDb();
    await grantSurveyDataEntitlement(SURVEY, clientOrg, { client: client(db) });
    await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });
    assert.equal(entitled(db, clientOrg, CAMP_A), true);
  }
});

test("6,7,8. attribution/distribution alone grant nothing (no grant → not entitled)", async () => {
  const db = makeDb();
  // Only the agency is granted. brand (attribution) / publisher (distribution) get nothing.
  await grantSurveyDataEntitlement(SURVEY, AGENCY, { client: client(db) });
  await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });
  assert.equal(entitled(db, BRAND, CAMP_A), false);       // brand_org_id attribution
  assert.equal(entitled(db, PUB_OWNER, CAMP_A), false);   // publisher_org_id distribution
  // And the governed invariant itself: ownership/participation/distribution is never entitlement.
  assert.equal(ownershipIsEntitlement(), false);
});

test("9 & 10. a campaign added later is visible to the entitled client, never the distributor", async () => {
  const db = makeDb();
  await grantSurveyDataEntitlement(SURVEY, AGENCY, { client: client(db) });
  await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });
  // Later generation adds CAMP_B (full-set re-enrol).
  await enrolSurveyCampaigns(SURVEY, [CAMP_A, CAMP_B], { client: client(db) });
  assert.equal(entitled(db, AGENCY, CAMP_B), true, "later campaign covered for the client");
  assert.equal(entitled(db, PUB_OWNER, CAMP_B), false, "later campaign still hidden from distributor");
});

test("11. revoked entitlement removes data visibility", async () => {
  const db = makeDb();
  await grantSurveyDataEntitlement(SURVEY, AGENCY, { client: client(db) });
  await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });
  assert.equal(entitled(db, AGENCY, CAMP_A), true);
  db.tables.organisation_resource_entitlements.forEach((r) => { r.status = "revoked"; });
  assert.equal(entitled(db, AGENCY, CAMP_A), false);
});

test("12. a URA restrict narrows the entitled org's user visibility", async () => {
  const db = makeDb();
  await grantSurveyDataEntitlement(SURVEY, AGENCY, { client: client(db) });
  await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });
  const orgEntitled = entitled(db, AGENCY, CAMP_A);
  assert.equal(orgEntitled, true);
  const noRestrict = userAuthorisedForResource(orgEntitled, ref(CAMP_A), { accessScope: "organisation_wide", userAuthorisations: [] });
  const restricted: UserAuthorisation[] = [{ userId: "u1", resourceClass: "data", resourceId: CAMP_A, effect: "restrict", active: true }];
  const withRestrict = userAuthorisedForResource(orgEntitled, ref(CAMP_A), { accessScope: "organisation_wide", userAuthorisations: restricted });
  assert.equal(noRestrict, true);
  assert.equal(withRestrict, false);
});

test("13. cross-organisation guessing does not bypass entitlement", async () => {
  const db = makeDb();
  await grantSurveyDataEntitlement(SURVEY, AGENCY, { client: client(db) });
  await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });
  // An unrelated org with no entitlement can never reach the campaign, even naming it.
  assert.equal(entitled(db, "org-random", CAMP_A), false);
});

test("16. helpers never write operator/admin entitlement; operator path is separate", async () => {
  const db = makeDb();
  await grantSurveyDataEntitlement(SURVEY, PUB_OWNER, { client: client(db) });
  await enrolSurveyCampaigns(SURVEY, [CAMP_A], { client: client(db) });
  // The operator (admin) authority is platform_operator_entitlements, resolved by
  // operatorVisibleDataCampaignIds — these helpers touch it NOWHERE.
  assert.equal(db.tables.platform_operator_entitlements.length, 0);
});

// ── Read-side slug mapping (Task F half) ─────────────────────────────────────

test("campaignSlugsForIds maps campaign UUIDs to slugs; empty stays empty", async () => {
  const db = makeDb({ campaigns: [
    { id: CAMP_A, campaign_id: "studio_aaaa_bbbb_gb_en" },
    { id: CAMP_B, campaign_id: "studio_aaaa_bbbb_de_de" },
  ] });
  assert.deepEqual(await campaignSlugsForIds([CAMP_A, CAMP_B], client(db)), ["studio_aaaa_bbbb_gb_en", "studio_aaaa_bbbb_de_de"]);
  assert.deepEqual(await campaignSlugsForIds([], client(db)), []);
});

// ── Task A — Request Product Access decision (shared tier, not a capability) ──

test("Request access is a SHARED Product Access tier: agency/brand/publisher/admin allowed", () => {
  for (const role of ["agency", "brand", "publisher", "admin"] as const) {
    assert.equal(resolveProductAccess({ role, tier: "shared" }), true, `${role} may Request`);
  }
  // Documents the fix: the prior admin-and-publisher gate denied agency/brand.
  assert.equal(resolveProductAccess({ role: "agency", tier: "admin-and-publisher" }), false);
  assert.equal(resolveProductAccess({ role: "brand", tier: "admin-and-publisher" }), false);
});
