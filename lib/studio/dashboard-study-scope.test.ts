import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveStudyDashboardScope, resolveOrgAuthorisedSurveyIds, resolveAuthorisedSurveyIds, studyGroupsFrom, type DashboardDb } from "./dashboard-scope";
import type { AuthedUser } from "@/lib/auth-server";

type Row = Record<string, unknown>;
function makeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = { campaigns: [], surveys: [], studies: [], organisations: [], dashboard_studies: [], dashboard_study_surveys: [], ...seed };
  function builder(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const rowsNow = () => tables[table].filter((r) => filters.every((f) => f(r)));
    const api: Record<string, unknown> = {
      select() { return api; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return api; },
      in(c: string, vals: unknown[]) { const s = new Set(vals); filters.push((r) => s.has(r[c])); return api; },
      is(c: string, v: unknown) { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return api; },
      single() { const d = rowsNow(); return Promise.resolve({ data: d[0] ?? null, error: null }); },
      maybeSingle() { const d = rowsNow(); return Promise.resolve({ data: d[0] ?? null, error: null }); },
      then(res: (v: { data: Row[]; error: null }) => void) { res({ data: rowsNow(), error: null }); },
    };
    return api;
  }
  return { from: (t: string) => { tables[t] ??= []; return builder(t); } } as unknown as DashboardDb;
}
const client = (db: DashboardDb) => db;
const user = { id: "u1", organisationId: "org", role: "publisher" } as unknown as AuthedUser;
const otherOrgUser = { id: "u2", organisationId: "org-2", role: "publisher" } as unknown as AuthedUser;
const gate = (ids: string[] | null) => async () => ids;

const STUDY = "study-1";
function seed() {
  return {
    campaigns: [
      { id: "cA", campaign_id: "s_a", survey_id: "A", publisher_org_id: "pub1", market: "GB", country_code: "GB", survey_language: "en", deleted_at: null },
      { id: "cB", campaign_id: "s_b", survey_id: "B", publisher_org_id: "pub2", market: "DE", country_code: "DE", survey_language: "de", deleted_at: null },
      { id: "cC", campaign_id: "s_c", survey_id: "C", publisher_org_id: "pub3", market: "FR", country_code: "FR", survey_language: "fr", deleted_at: null },
    ],
    surveys: [
      { id: "A", name: "Survey A", status: "live", questions: [{}, {}, {}], is_simulated: false, study_id: STUDY, deleted_at: null },
      { id: "B", name: "Survey B", status: "live", questions: [{}, {}, {}, {}, {}], is_simulated: false, study_id: STUDY, deleted_at: null },
      { id: "C", name: "Survey C", status: "live", questions: [{}], is_simulated: false, study_id: STUDY, deleted_at: null },
    ],
    studies: [{ id: STUDY, name: "FedEx UCL Study" }],
  };
}

test("studyGroupsFrom groups authorised surveys by study_id; ignores null", () => {
  const g = studyGroupsFrom([{ id: "A", studyId: "s1" }, { id: "B", studyId: "s1" }, { id: "C", studyId: null }]);
  assert.deepEqual(g.get("s1"), ["A", "B"]);
  assert.equal(g.has("null"), false);
});

test("study scope = study membership ∩ authorised universe (unauthorised sibling excluded)", async () => {
  const db = makeDb(seed());
  // Only A and B are entitled (C's campaign is outside the gate → C never authorised).
  const scope = await resolveStudyDashboardScope(user, STUDY, { client: client(db), resolveGate: gate(["cA", "cB"]) });
  assert.equal(scope.isEmpty, false);
  assert.equal(scope.studyName, "FedEx UCL Study");
  assert.deepEqual(scope.surveys.map((s) => s.id).sort(), ["A", "B"]);
  assert.ok(!scope.surveys.some((s) => s.id === "C"), "study membership never grants access to an unauthorised survey");
  assert.deepEqual(scope.effectiveCampaignSlugs.sort(), ["s_a", "s_b"]);
});

test("study scope with a single authorised survey still resolves (degrades to one)", async () => {
  const db = makeDb(seed());
  const scope = await resolveStudyDashboardScope(user, STUDY, { client: client(db), resolveGate: gate(["cA"]) });
  assert.deepEqual(scope.surveys.map((s) => s.id), ["A"]);
  assert.equal(scope.effectiveCampaigns.length, 1);
});

test("study with no authorised survey → empty (fail closed), never broadens", async () => {
  const db = makeDb(seed());
  // Entitled to a campaign whose survey isn't in this study.
  const otherDb = makeDb({ ...seed(), campaigns: [{ id: "cX", campaign_id: "s_x", survey_id: "X", publisher_org_id: "p", market: "GB", country_code: "GB", survey_language: "en", deleted_at: null }] });
  const scope = await resolveStudyDashboardScope(user, STUDY, { client: client(otherDb), resolveGate: gate(["cX"]) });
  assert.equal(scope.isEmpty, true);
  assert.deepEqual(scope.surveys, []);
  void db;
});

test("canonical study resolves with kind='canonical' and is never manageable", async () => {
  const db = makeDb(seed());
  const scope = await resolveStudyDashboardScope(user, STUDY, { client: client(db), resolveGate: gate(["cA", "cB"]) });
  assert.equal(scope.kind, "canonical");
  assert.equal(scope.canManage, false);
});

// ── User-created (dashboard_studies) analysis groupings ──────────────────────
// A 10-survey research universe; a publisher (org "org") is authorised for only 3.
const US = "us-1";
function wwcSeed(extra: Partial<Record<string, Row[]>> = {}) {
  const pub = (id: string) => id;
  const surveys: Row[] = [];
  const campaigns: Row[] = [];
  const members = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
  members.forEach((id, i) => {
    surveys.push({ id, name: `WWC ${id}`, status: "live", questions: [{}, {}, {}], is_simulated: false, study_id: null, deleted_at: null });
    campaigns.push({ id: `c${id}`, campaign_id: `s_${id.toLowerCase()}`, survey_id: id, publisher_org_id: pub(["f365", "f365", "f365", "ls", "ls", "ls", "fm", "fm", "ot", "ot"][i]), market: "GB", country_code: "GB", survey_language: "en", deleted_at: null });
  });
  return {
    surveys, campaigns, studies: [],
    dashboard_studies: [{ id: US, organisation_id: "org", name: "My WWC Group" }],
    dashboard_study_surveys: [{ study_id: US, survey_id: "A" }, { study_id: US, survey_id: "B" }, { study_id: US, survey_id: "C" }],
    ...extra,
  };
}

test("SCENARIO Football365 3-of-10: user study resolves ONLY the 3 authorised surveys", async () => {
  const db = makeDb(wwcSeed());
  const scope = await resolveStudyDashboardScope(user, US, { client: client(db), resolveGate: gate(["cA", "cB", "cC"]) });
  assert.equal(scope.kind, "user");
  assert.equal(scope.canManage, true); // same organisation owns it
  assert.equal(scope.studyName, "My WWC Group");
  assert.deepEqual(scope.surveys.map((s) => s.id).sort(), ["A", "B", "C"]);
  assert.deepEqual(scope.effectiveCampaignSlugs.sort(), ["s_a", "s_b", "s_c"]);
});

test("SECURITY: user-study membership NEVER grants access — an unauthorised member is excluded", async () => {
  // Membership tampered to include G (a FotMob survey the caller can't see).
  const db = makeDb(wwcSeed({ dashboard_study_surveys: [{ study_id: US, survey_id: "A" }, { study_id: US, survey_id: "B" }, { study_id: US, survey_id: "C" }, { study_id: US, survey_id: "G" }] }));
  const scope = await resolveStudyDashboardScope(user, US, { client: client(db), resolveGate: gate(["cA", "cB", "cC"]) });
  assert.ok(!scope.surveys.some((s) => s.id === "G"), "membership can never resurrect access to G");
  assert.deepEqual(scope.surveys.map((s) => s.id).sort(), ["A", "B", "C"]);
});

test("read-time intersection: losing access to a member removes it from the study", async () => {
  const db = makeDb(wwcSeed());
  const scope = await resolveStudyDashboardScope(user, US, { client: client(db), resolveGate: gate(["cA", "cB"]) }); // access to C revoked
  assert.deepEqual(scope.surveys.map((s) => s.id).sort(), ["A", "B"]);
  assert.equal(scope.belowMinimum, false);
});

test("belowMinimum: a user study with a single authorised member resolves but flags degraded", async () => {
  const db = makeDb(wwcSeed());
  const scope = await resolveStudyDashboardScope(user, US, { client: client(db), resolveGate: gate(["cA"]) });
  assert.deepEqual(scope.surveys.map((s) => s.id), ["A"]);
  assert.equal(scope.isEmpty, false);
  assert.equal(scope.belowMinimum, true);
});

test("SECURITY organisation isolation: another org cannot see the study (not disclosed)", async () => {
  const db = makeDb(wwcSeed());
  // otherOrgUser is authorised for the same campaigns but does NOT own the study.
  const scope = await resolveStudyDashboardScope(otherOrgUser, US, { client: client(db), resolveGate: gate(["cA", "cB", "cC"]) });
  assert.equal(scope.isEmpty, true);
  assert.equal(scope.studyName, null); // existence/name never leaks
  assert.deepEqual(scope.surveys, []);
});

test("PERMISSION C: an admin WITHOUT the study operator entitlement gets no cross-org management", async () => {
  const db = makeDb(wwcSeed());
  const operator = { id: "op", organisationId: null, role: "admin" } as unknown as AuthedUser;
  // unrestricted (Data) operator may VIEW, but study-management is denied.
  const scope = await resolveStudyDashboardScope(operator, US, { client: client(db), resolveGate: gate(null), operatorStudyManage: async () => false });
  assert.equal(scope.kind, "user");
  assert.equal(scope.canManage, false); // no study-domain entitlement → not manageable
  assert.ok(scope.surveys.length >= 3);
});

test("PERMISSION D: an admin WITH the study operator entitlement may manage a cross-org study", async () => {
  const db = makeDb({ ...wwcSeed(), organisations: [{ id: "org", name: "Football365" }] });
  const operator = { id: "op", organisationId: "fnmx", role: "admin" } as unknown as AuthedUser;
  const scope = await resolveStudyDashboardScope(operator, US, { client: client(db), resolveGate: gate(null), operatorStudyManage: async () => true });
  assert.equal(scope.kind, "user");
  assert.equal(scope.canManage, true);
  assert.equal(scope.ownerOrganisationName, "Football365"); // owner context surfaced to a managing operator
});

test("PERMISSION B: a foreign normal org cannot see the study by id (no leak), even the owner name", async () => {
  const db = makeDb({ ...wwcSeed(), organisations: [{ id: "org", name: "Football365" }] });
  const scope = await resolveStudyDashboardScope(otherOrgUser, US, { client: client(db), resolveGate: gate(["cA", "cB", "cC"]), operatorStudyManage: async () => false });
  assert.equal(scope.isEmpty, true);
  assert.equal(scope.studyName, null);
  assert.equal(scope.ownerOrganisationName, null);
});

test("own-org viewer never sees an owner-context banner (null)", async () => {
  const db = makeDb({ ...wwcSeed(), organisations: [{ id: "org", name: "Football365" }] });
  const scope = await resolveStudyDashboardScope(user, US, { client: client(db), resolveGate: gate(["cA", "cB", "cC"]) });
  assert.equal(scope.canManage, true);
  assert.equal(scope.ownerOrganisationName, null); // own org → not surfaced
});

test("SCENARIO agency 8-of-10: a broader entitlement resolves all 8 of its authorised members", async () => {
  const AGENCY = "us-agency";
  const eight = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const db = makeDb(wwcSeed({
    dashboard_studies: [{ id: AGENCY, organisation_id: "org", name: "Agency WWC" }],
    dashboard_study_surveys: eight.map((sid) => ({ study_id: AGENCY, survey_id: sid })),
  }));
  const scope = await resolveStudyDashboardScope(user, AGENCY, { client: client(db), resolveGate: gate(eight.map((s) => `c${s}`)) });
  assert.deepEqual(scope.surveys.map((s) => s.id).sort(), eight.slice().sort());
});

test("the same survey can back two different user studies (many-to-many)", async () => {
  const db = makeDb(wwcSeed({
    dashboard_studies: [{ id: "us-x", organisation_id: "org", name: "X" }, { id: "us-y", organisation_id: "org", name: "Y" }],
    dashboard_study_surveys: [
      { study_id: "us-x", survey_id: "A" }, { study_id: "us-x", survey_id: "B" },
      { study_id: "us-y", survey_id: "A" }, { study_id: "us-y", survey_id: "C" },
    ],
  }));
  const g = gate(["cA", "cB", "cC"]);
  const x = await resolveStudyDashboardScope(user, "us-x", { client: client(db), resolveGate: g });
  const y = await resolveStudyDashboardScope(user, "us-y", { client: client(db), resolveGate: g });
  assert.deepEqual(x.surveys.map((s) => s.id).sort(), ["A", "B"]);
  assert.deepEqual(y.surveys.map((s) => s.id).sort(), ["A", "C"]);
});

test("DECISION 1: a study-operator WITHOUT data authority reaches a MANAGE-ONLY shell (no analytics leaked)", async () => {
  const db = makeDb({ ...wwcSeed(), organisations: [{ id: "org", name: "Football365" }] });
  const operator = { id: "op", organisationId: "fnmx", role: "admin" } as unknown as AuthedUser;
  // No Data authority (gate []) but the study-management entitlement is present.
  const scope = await resolveStudyDashboardScope(operator, US, { client: client(db), resolveGate: gate([]), operatorStudyManage: async () => true });
  assert.equal(scope.manageOnly, true);
  assert.equal(scope.canManage, true);
  assert.equal(scope.kind, "user");
  assert.equal(scope.ownerOrganisationName, "Football365");
  assert.deepEqual(scope.surveys, []);          // no analytics without data authority
  assert.deepEqual(scope.effectiveCampaigns, []);
});

test("DECISION 1: the SAME operator gains NO analytics without Data authority", async () => {
  const db = makeDb(wwcSeed());
  const operator = { id: "op", organisationId: "fnmx", role: "admin" } as unknown as AuthedUser;
  const scope = await resolveStudyDashboardScope(operator, US, { client: client(db), resolveGate: gate([]), operatorStudyManage: async () => true });
  assert.equal(scope.effectiveCampaignSlugs.length, 0);
  assert.equal(scope.surveys.length, 0);
  assert.equal(scope.isEmpty, true);            // isEmpty (no data) but manageOnly, not "unavailable"
});

test("an own-org owner WITHOUT data authority also reaches manage-only (can still delete their own study)", async () => {
  const db = makeDb(wwcSeed());
  const scope = await resolveStudyDashboardScope(user, US, { client: client(db), resolveGate: gate([]) }); // owns US, no data
  assert.equal(scope.manageOnly, true);
  assert.equal(scope.canManage, true);
  assert.equal(scope.ownerOrganisationName, null); // own org → no owner banner
});

test("a foreign user WITHOUT data authority still gets 'unavailable' — never a manage shell", async () => {
  const db = makeDb(wwcSeed());
  const scope = await resolveStudyDashboardScope(otherOrgUser, US, { client: client(db), resolveGate: gate([]), operatorStudyManage: async () => false });
  assert.equal(scope.manageOnly, false);
  assert.equal(scope.canManage, false);
  assert.equal(scope.isEmpty, true);
  assert.equal(scope.studyName, null); // no leak
});

test("DECISION 3: own-org edit = caller's governed universe; cross-org = owner org's universe", async () => {
  const db = makeDb(wwcSeed());
  const callerUniverse = await resolveAuthorisedSurveyIds(user, { client: client(db), resolveGate: gate(["cA", "cB", "cC"]) });
  const ownerUniverse = await resolveOrgAuthorisedSurveyIds("org", { client: client(db), resolveOrgGate: async () => ["cA", "cB", "cC"] });
  assert.deepEqual(callerUniverse.sort(), ["A", "B", "C"]); // resolved from the CALLER's gate
  assert.deepEqual(ownerUniverse.sort(), ["A", "B", "C"]); // resolved from the OWNER org's gate (independent authority)
});

test("PERMISSION E/F: an owning org's universe is resolved independently of the operator's own access", async () => {
  const db = makeDb(wwcSeed());
  // Football365 ("org") is entitled to only cA/cB/cC → surveys A/B/C — regardless of
  // how broad the operator's own access is. This is the picker/validation universe.
  const ownerUniverse = await resolveOrgAuthorisedSurveyIds("org", { client: client(db), resolveOrgGate: async () => ["cA", "cB", "cC"] });
  assert.deepEqual(ownerUniverse.sort(), ["A", "B", "C"]);
  // The other 7 WWC surveys (D..J) are NOT in the owner universe → an operator can
  // never validate them into Football365's study.
  assert.ok(!ownerUniverse.includes("G"));
});

test("FEDEX PARITY: a user study and the canonical study of the same members resolve the SAME effective campaigns", async () => {
  // Same DB: canonical STUDY (surveys A/B via study_id) + a user study with members [A,B].
  const s = seed();
  const db = makeDb({ ...s, dashboard_studies: [{ id: "us-fedex", organisation_id: "org", name: "FedEx UCL Study" }], dashboard_study_surveys: [{ study_id: "us-fedex", survey_id: "A" }, { study_id: "us-fedex", survey_id: "B" }] });
  const g = gate(["cA", "cB"]);
  const canonical = await resolveStudyDashboardScope(user, STUDY, { client: client(db), resolveGate: g });
  const userStudy = await resolveStudyDashboardScope(user, "us-fedex", { client: client(db), resolveGate: g });
  // Identical effective campaign universe → identical downstream analytics (no separate pipeline).
  assert.deepEqual(userStudy.effectiveCampaignSlugs.sort(), canonical.effectiveCampaignSlugs.sort());
  assert.deepEqual(userStudy.surveys.map((x) => x.id).sort(), canonical.surveys.map((x) => x.id).sort());
  assert.equal(userStudy.kind, "user");
  assert.equal(canonical.kind, "canonical");
});

test("canonical FedEx study is unchanged by the presence of user studies", async () => {
  // Same DB carries both a canonical study (via studies + surveys.study_id) and user studies.
  const s = seed();
  const db = makeDb({ ...s, dashboard_studies: [{ id: "us-z", organisation_id: "org", name: "Z" }], dashboard_study_surveys: [{ study_id: "us-z", survey_id: "A" }] });
  const scope = await resolveStudyDashboardScope(user, STUDY, { client: client(db), resolveGate: gate(["cA", "cB"]) });
  assert.equal(scope.kind, "canonical");
  assert.equal(scope.studyName, "FedEx UCL Study");
  assert.deepEqual(scope.surveys.map((s2) => s2.id).sort(), ["A", "B"]);
});
