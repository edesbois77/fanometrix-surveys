import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── ORG-006 WP-02 (IS-02) — VO-02 Social Listening Organisation Context ────────
// Verifies Social Listening consumes the platform-owned Current Organisation (WP-01)
// to scope ordinary operations, isolates by Organisation, excludes legacy NULL and
// simulated searches, and preserves the operating-Organisation/product-content and
// project-surface distinctions. The scoping primitive is asserted behaviourally
// against a recording fake for @/lib/supabase-admin; route/migration wiring by
// source-guard.

type Op = { table: string; op: string | null; filters: [string, string, unknown][] };
const state: { row: unknown; list: { id: string }[]; ops: Op[] } = { row: null, list: [], ops: [] };

function makeChain(table: string) {
  const ctx: Op = { table, op: null, filters: [] };
  const rec = () => state.ops.push({ ...ctx, filters: [...ctx.filters] });
  const chain: Record<string, unknown> = {
    select() { if (!ctx.op) ctx.op = "select"; return chain; },
    eq(c: string, v: unknown) { ctx.filters.push(["eq", c, v]); return chain; },
    is(c: string, v: unknown) { ctx.filters.push(["is", c, v]); return chain; },
    in(c: string, v: unknown) { ctx.filters.push(["in", c, v]); return chain; },
    maybeSingle() { rec(); return Promise.resolve({ data: state.row, error: null }); },
    then(res: (x: { data: unknown; error: null }) => unknown, rej?: (e: unknown) => unknown) {
      rec();
      return Promise.resolve({ data: state.list, error: null }).then(res, rej);
    },
  };
  return chain;
}
const supabaseAdmin = { from: (t: string) => makeChain(t) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });

let S: typeof import("@/lib/social-listening/org-scope");
before(async () => { S = await import("@/lib/social-listening/org-scope"); });
beforeEach(() => { state.row = null; state.list = []; state.ops = []; });

const root = resolve(__dirname, "..", "..");
const src = (p: string) => readFileSync(resolve(root, p), "utf8");
const hasFilter = (op: Op, kind: string, col: string, val?: unknown) =>
  op.filters.some((f) => f[0] === kind && f[1] === col && (val === undefined || f[2] === val));

// VO-02 (isolation) — searchInOrg constrains by organisation_id AND is_simulated=false.
test("searchInOrg scopes by organisation_id and excludes simulated; true only when a row matches", async () => {
  state.row = { id: "s1" };
  assert.equal(await S.searchInOrg("s1", "orgA"), true);
  const op = state.ops.find((o) => o.table === "social_searches")!;
  assert.ok(hasFilter(op, "eq", "id", "s1"));
  assert.ok(hasFilter(op, "eq", "organisation_id", "orgA"), "scoped to Current Organisation");
  assert.ok(hasFilter(op, "eq", "is_simulated", false), "excludes simulated searches");
});

test("searchInOrg returns false when no matching row (other org / legacy NULL)", async () => {
  state.row = null; // no row for this (id, org) → not owned
  assert.equal(await S.searchInOrg("s1", "orgB"), false);
});

// VO-02 (fail-closed) — a missing Current Organisation grants no access and issues no query.
test("scope helpers fail closed when Current Organisation is null", async () => {
  assert.equal(await S.searchInOrg("s1", null), false);
  assert.deepEqual(await S.currentOrgSearchIds(null), []);
  assert.equal(await S.mentionInOrg("m1", null), false);
  assert.equal(state.ops.length, 0, "no query issued without a Current Organisation");
});

// VO-02 (platform-wide scope) — currentOrgSearchIds is org + real only.
test("currentOrgSearchIds returns the Organisation's real search ids", async () => {
  state.list = [{ id: "s1" }, { id: "s2" }];
  const ids = await S.currentOrgSearchIds("orgA");
  assert.deepEqual(ids, ["s1", "s2"]);
  const op = state.ops.find((o) => o.table === "social_searches")!;
  assert.ok(hasFilter(op, "eq", "organisation_id", "orgA"));
  assert.ok(hasFilter(op, "eq", "is_simulated", false));
});

// VO-02 (dependent inheritance) — a mention inherits scope through its search_id.
test("mentionInOrg resolves the mention's search then checks Organisation ownership", async () => {
  state.row = { search_id: "s1", id: "s1" }; // both reads return this shape
  assert.equal(await S.mentionInOrg("m1", "orgA"), true);
  assert.ok(state.ops.some((o) => o.table === "social_mentions"), "reads the mention's search_id");
  assert.ok(state.ops.some((o) => o.table === "social_searches"), "then checks search ownership");
});

// ── Source-guards: migration, creation, scoping, isolation, boundaries ────────

// VO-02 (migration) — nullable organisation_id, ON DELETE RESTRICT, index, NO backfill,
// and NO Organisation column on any dependent table.
test("VO-02 migration 176: nullable org FK on social_searches only, RESTRICT, index, no backfill", () => {
  const m = src("supabase-migration-176.sql");
  assert.match(m, /ALTER TABLE social_searches\s+ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations\(id\) ON DELETE RESTRICT/);
  assert.doesNotMatch(m, /organisation_id uuid[^\n]*NOT NULL/i); // the column is nullable — NOT NULL deferred
  assert.match(m, /CREATE INDEX IF NOT EXISTS idx_social_searches_organisation_id/);
  assert.doesNotMatch(m, /^\s*(UPDATE|INSERT)\s/im); // no backfill DML
  // Only social_searches gets the column — dependent tables inherit via search_id.
  assert.doesNotMatch(m, /ALTER TABLE social_(keywords|mentions|reports)/);
  assert.doesNotMatch(m, /ALTER TABLE (collection_runs|evidence_observations|research_summaries)/);
});

// VO-02 (creation stamping) — new real searches persist the Current Organisation.
test("VO-02 creation stamps session.organisationId (from WP-01), never trusts the body", () => {
  const route = src("app/api/social/searches/route.ts");
  assert.match(route, /organisation_id: session\.organisationId/);
  assert.match(route, /const \{ is_simulated: _ignoredSimulated, organisation_id: _ignoredOrg, \.\.\.cleanFields \}/);
  // List scoped to the Current Organisation.
  assert.match(route, /\.eq\("organisation_id", session\.organisationId\)/);
});

// VO-02 (direct-ID isolation) — every ordinary search-reaching route guards ownership.
test("VO-02 direct-ID isolation: search-reaching routes guard with searchInOrg/mentionInOrg", () => {
  for (const p of [
    "app/api/social/searches/[id]/route.ts",
    "app/api/social/searches/[id]/collect/route.ts",
    "app/api/social/searches/[id]/runs/route.ts",
    "app/api/social/searches/[id]/review/route.ts",
    "app/api/social/searches/[id]/evidence-summary/route.ts",
    "app/api/social/mentions/import/route.ts",
    "app/api/social/export/route.ts",
    "app/api/social/insights/route.ts",
    "app/api/social/insights/edit/route.ts",
    "app/api/social/insights/approve/route.ts",
    "app/api/social/insights/publish/route.ts",
  ]) {
    assert.match(src(p), /searchInOrg\(/, `${p} guards search ownership`);
  }
  for (const p of ["app/api/social/mentions/[id]/route.ts"]) {
    assert.match(src(p), /mentionInOrg\(/, `${p} guards mention ownership`);
  }
});

// VO-02 (aggregate scope) — mentions/stats/reports/validation scope platform-wide reads.
test("VO-02 aggregate reads are scoped to the Current Organisation", () => {
  for (const p of [
    "app/api/social/mentions/route.ts",
    "app/api/social/stats/route.ts",
    "app/api/social/reports/route.ts",
    "app/api/social/validation/route.ts",
  ]) {
    assert.match(src(p), /currentOrgSearchIds\(session\.organisationId\)/, `${p} scopes platform-wide to the org`);
    assert.match(src(p), /searchInOrg\(/, `${p} guards a single-search read`);
  }
});

// VO-02 (WP-01 integration, no independent context) — scope derives from requireUser's
// resolved org; the scope module never resolves/selects an Organisation itself.
test("VO-02 consumes WP-01 Current Organisation; introduces no independent SL org context", () => {
  const scope = src("lib/social-listening/org-scope.ts");
  // It never RESOLVES/selects an Organisation itself (no calls to the WP-01/authz
  // resolution surface) — it only consumes the organisationId passed to it.
  assert.doesNotMatch(scope, /requireUser\(|getSession\(|resolveActiveContext\(|fetchActiveOrganisationAccess\(|remembered_organisation_id/);
  assert.match(scope, /organisationId/); // consumes the resolved Current Organisation as a param
  // Routes obtain the org solely from the authenticated session (requireUser).
  assert.match(src("app/api/social/searches/route.ts"), /requireUser\(req, \["admin"\]\)/);
});

// VO-02 (project surface preserved; product content untouched) — the research_project
// path still resolves via getProjectSocialSearchIds; content columns are not org-derived.
test("VO-02 preserves the Research-Project path and the operating≠represented distinction", () => {
  const mentions = src("app/api/social/mentions/route.ts");
  assert.match(mentions, /getProjectSocialSearchIds\(projectId\)/); // project surface intact
  // The Organisation scope is the operating context (social_searches.organisation_id
  // / dependent search_id), never derived from mention content — the scope module
  // queries only social_searches and social_mentions.search_id.
  const scope = src("lib/social-listening/org-scope.ts");
  assert.match(scope, /from\("social_searches"\)[\s\S]*eq\("organisation_id"/);
  assert.match(scope, /from\("social_mentions"\)[\s\S]*select\("search_id"\)/);
});
