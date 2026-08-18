import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDashboardScope,
  resolveEntitledSurveys,
  type DashboardDb,
} from "./dashboard-scope";
import type { AuthedUser } from "@/lib/auth-server";

// ── Minimal in-memory Supabase fake (select/eq/in/is/then) ───────────────────
// Same spirit as data-entitlement.test.ts; adds `.is()` for deleted_at filters.
type Row = Record<string, unknown>;
function makeDb(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { campaigns: [], surveys: [], organisations: [], ...seed };
  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const api: Record<string, unknown> = {
      select() { return api; },
      eq(col: string, val: unknown) { filters.push((r) => r[col] === val); return api; },
      in(col: string, vals: unknown[]) { const s = new Set(vals); filters.push((r) => s.has(r[col])); return api; },
      is(col: string, val: unknown) { filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return api; },
      then(resolve: (v: { data: Row[] | null; error: null }) => void) {
        resolve({ data: tables[table].filter((r) => filters.every((f) => f(r))), error: null });
      },
    };
    return api;
  }
  return { from: (t: string) => { tables[t] ??= []; return builder(t); }, tables } as unknown as DashboardDb & { tables: Record<string, Row[]> };
}
const client = (db: ReturnType<typeof makeDb>) => db as unknown as DashboardDb;

const user = { id: "u1", organisationId: "org-fotmob", role: "publisher" } as unknown as AuthedUser;
const gate = (ids: string[] | null) => async () => ids;

// Ids
const C_FOT_A = "camp-fot-a", C_FOT_B = "camp-fot-b", C_LIVE = "camp-live";
const SURVEY_1 = "survey-1", SURVEY_2 = "survey-2", SURVEY_OTHER = "survey-other";

function seedCampaigns() {
  return [
    { id: C_FOT_A, campaign_id: "studio_fot_a_gb_en", survey_id: SURVEY_1, publisher_org_id: "org-fotmob", market: "GB", country_code: "GB", survey_language: "en", deleted_at: null },
    { id: C_FOT_B, campaign_id: "studio_fot_b_de_de", survey_id: SURVEY_2, publisher_org_id: "org-fotmob", market: "DE", country_code: "DE", survey_language: "de", deleted_at: null },
    { id: C_LIVE, campaign_id: "studio_live_gb_en", survey_id: SURVEY_OTHER, publisher_org_id: "org-livescore", market: "GB", country_code: "GB", survey_language: "en", deleted_at: null },
  ];
}

test("[] gate = Default Refuse → genuine empty, never unrestricted", async () => {
  const db = makeDb({ campaigns: seedCampaigns() });
  const scope = await resolveDashboardScope(user, { client: client(db), resolveGate: gate([]) });
  assert.equal(scope.isEmpty, true);
  assert.equal(scope.unrestricted, false);
  assert.deepEqual(scope.campaigns, []);
  assert.deepEqual(scope.authorisedCampaignSlugs, []);
  assert.deepEqual(scope.authorisedSurveyIds, []);
});

test("null gate = operator unrestricted → whole (non-deleted) universe", async () => {
  const db = makeDb({ campaigns: seedCampaigns() });
  const scope = await resolveDashboardScope(user, { client: client(db), resolveGate: gate(null) });
  assert.equal(scope.unrestricted, true);
  assert.equal(scope.isEmpty, false);
  assert.equal(scope.campaigns.length, 3);
});

test("non-empty gate intersects: only entitled campaign UUIDs load; unauthorised campaign never appears", async () => {
  const db = makeDb({ campaigns: seedCampaigns() });
  // FotMob is entitled to its own two campaigns; LiveScore's is not in the gate.
  const scope = await resolveDashboardScope(user, { client: client(db), resolveGate: gate([C_FOT_A, C_FOT_B]) });
  assert.deepEqual(scope.authorisedCampaignIds.sort(), [C_FOT_A, C_FOT_B].sort());
  assert.deepEqual(scope.authorisedCampaignSlugs.sort(), ["studio_fot_a_gb_en", "studio_fot_b_de_de"].sort());
  assert.ok(!scope.campaigns.some((c) => c.id === C_LIVE), "LiveScore campaign is outside the authorised universe");
  assert.deepEqual(scope.authorisedSurveyIds.sort(), [SURVEY_1, SURVEY_2].sort());
});

test("a hand-crafted campaign id outside the gate cannot broaden scope", async () => {
  const db = makeDb({ campaigns: seedCampaigns() });
  // Even though C_LIVE exists in the table, the gate excludes it, so the .in(id)
  // intersection means it is never selected — no query param can reach it.
  const scope = await resolveDashboardScope(user, { client: client(db), resolveGate: gate([C_FOT_A]) });
  assert.deepEqual(scope.authorisedCampaignIds, [C_FOT_A]);
});

test("unauthorised Survey id fails closed (never broadens, never falls back to all)", async () => {
  const db = makeDb({ campaigns: seedCampaigns() });
  const scope = await resolveDashboardScope(user, {
    client: client(db), resolveGate: gate([C_FOT_A, C_FOT_B]), requestedSurveyId: SURVEY_OTHER,
  });
  assert.equal(scope.isEmpty, true);
  assert.equal(scope.requestedSurveyId, null);
  assert.deepEqual(scope.effectiveCampaigns, []);
  // The authorised universe is still reported so legitimate options remain visible.
  assert.deepEqual(scope.authorisedSurveyIds.sort(), [SURVEY_1, SURVEY_2].sort());
});

test("valid Survey id projects the universe down to that survey's campaigns", async () => {
  const db = makeDb({ campaigns: seedCampaigns() });
  const scope = await resolveDashboardScope(user, {
    client: client(db), resolveGate: gate([C_FOT_A, C_FOT_B]), requestedSurveyId: SURVEY_1,
  });
  assert.equal(scope.isEmpty, false);
  assert.equal(scope.requestedSurveyId, SURVEY_1);
  assert.deepEqual(scope.effectiveCampaignSlugs, ["studio_fot_a_gb_en"]);
});

test("entitled Survey list derives from authorised campaigns only (not ownership)", async () => {
  const db = makeDb({
    campaigns: seedCampaigns(),
    surveys: [
      { id: SURVEY_1, name: "Brand Recall GB", status: "ready", questions: [{}, {}, {}], is_simulated: false, deleted_at: null },
      { id: SURVEY_2, name: "Brand Recall DE", status: "ready", questions: [{}, {}, {}, {}, {}], is_simulated: false, deleted_at: null },
      // A survey the caller may operationally manage but has NO authorised campaign data for:
      { id: "survey-owned-no-data", name: "Owned, no data", status: "ready", questions: [{}], is_simulated: false, deleted_at: null },
      // A simulated survey must never appear.
      { id: SURVEY_1 + "-sim", name: "Sim", status: "ready", questions: [{}], is_simulated: true, deleted_at: null },
    ],
  });
  const scope = await resolveDashboardScope(user, { client: client(db), resolveGate: gate([C_FOT_A, C_FOT_B]) });
  const surveys = await resolveEntitledSurveys(scope, { client: client(db) });
  const ids = surveys.map((s) => s.id).sort();
  assert.deepEqual(ids, [SURVEY_1, SURVEY_2].sort());
  const s1 = surveys.find((s) => s.id === SURVEY_1)!;
  assert.equal(s1.questionCount, 3);
  assert.equal(s1.campaignCount, 1);
  const s2 = surveys.find((s) => s.id === SURVEY_2)!;
  assert.equal(s2.questionCount, 5, "1–5 question count is the actual ordered count");
});
