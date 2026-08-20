import { test, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// /api/embed/survey?id=<uuid> used to return the full question and option text
// of ANY survey. A survey UUID is not a secret — it sits in embed configuration
// and in every log line of an embed request — so this asserts the binding that
// replaced that behaviour, including that it fails CLOSED.

type Q = { table: string; filters: Record<string, unknown>; rows: unknown[] | null; error: unknown };
const queries: Q[] = [];
let campaignRows: unknown[] = [];
let projectRows:  unknown[] = [];
let campaignError: unknown = null;
let projectError:  unknown = null;

function builder(table: string) {
  const filters: Record<string, unknown> = {};
  const api: Record<string, unknown> = {};
  const chain = (k: string) => (a?: unknown, b?: unknown) => { filters[`${k}:${String(a)}`] = b ?? true; return api; };
  for (const m of ["select", "eq", "is", "in"]) api[m] = chain(m);
  api.limit = () => {
    const isProject = table === "research_projects";
    const rows  = isProject ? projectRows  : campaignRows;
    const error = isProject ? projectError : campaignError;
    queries.push({ table, filters, rows, error });
    return Promise.resolve({ data: error ? null : rows, error });
  };
  // research_projects resolves without .limit()
  (api as { then?: unknown }).then = (res: (v: unknown) => void) => {
    queries.push({ table, filters, rows: projectRows, error: projectError });
    return Promise.resolve({ data: projectError ? null : projectRows, error: projectError }).then(res);
  };
  return api;
}

mock.module("@/lib/supabase-admin", {
  namedExports: { supabaseAdmin: { from: (t: string) => builder(t) } },
});

let isSurveyPubliclyServeable: typeof import("./embed-survey-access").isSurveyPubliclyServeable;
before(async () => { ({ isSurveyPubliclyServeable } = await import("./embed-survey-access")); });

beforeEach(() => {
  queries.length = 0;
  campaignRows = []; projectRows = [];
  campaignError = null; projectError = null;
});

const SURVEY = "d729de2f-00ae-487d-afc7-61aa2db0e9d8";

test("a survey bound to a deployed campaign is serveable", async () => {
  campaignRows = [{ id: "c1" }];
  assert.equal(await isSurveyPubliclyServeable(SURVEY), true);
});

test("a survey no campaign has ever deployed is NOT serveable", async () => {
  campaignRows = []; projectRows = [];
  assert.equal(await isSurveyPubliclyServeable(SURVEY), false);
});

test("a blank or missing id is refused without touching the database", async () => {
  assert.equal(await isSurveyPubliclyServeable(null),      false);
  assert.equal(await isSurveyPubliclyServeable(undefined), false);
  assert.equal(await isSurveyPubliclyServeable(""),        false);
  assert.equal(queries.length, 0);
});

test("the direct lookup excludes soft-deleted and draft campaigns", async () => {
  campaignRows = [{ id: "c1" }];
  await isSurveyPubliclyServeable(SURVEY);
  const q = queries.find(x => x.table === "campaigns");
  assert.ok(q, "campaigns was queried");
  assert.ok("is:deleted_at" in q!.filters,  "soft-deleted campaigns excluded");
  assert.ok("in:status"     in q!.filters,  "status restricted to deployed statuses");
});

test("a database error fails CLOSED rather than serving the survey", async () => {
  campaignError = { message: "connection reset" };
  assert.equal(await isSurveyPubliclyServeable(SURVEY), false);
});

test("draft is the only excluded status — a closed campaign still resolves labels", async () => {
  const { DEPLOYED_CAMPAIGN_STATUSES } = await import("./embed-survey-access");
  assert.deepEqual([...DEPLOYED_CAMPAIGN_STATUSES].sort(),
    ["archived", "closed", "live", "paused", "scheduled"]);
  assert.ok(!DEPLOYED_CAMPAIGN_STATUSES.includes("draft" as never));
});
