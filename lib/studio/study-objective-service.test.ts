import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Hermetic: mock supabase-admin (studies read) + resolveStudyResults (question context)
// and inject the completion. Verifies drafting NEVER writes and fails safely.

const state: { studyExists: boolean; writes: string[] } = { studyExists: true, writes: [] };
function makeChain(table: string) {
  const chain: Record<string, unknown> = {
    select() { return chain; },
    update() { state.writes.push(`update:${table}`); return chain; },
    insert() { state.writes.push(`insert:${table}`); return chain; },
    eq() { return chain; },
    single() { return Promise.resolve({ data: state.studyExists ? { id: "STU", name: "FedEx UCL" } : null, error: null }); },
  };
  return chain;
}
const supabaseAdmin = { from: (t: string) => makeChain(t) };
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin } });
mock.module("@/lib/studio/study-results-resolve", { namedExports: { resolveStudyResults: async () => ({ access: "ok", results: { study: { id: "STU", objective: null, surveyCount: 2 }, resultGroups: [{ label: "FedEx as a sponsor?" }], surveys: [] } }) } });

let SVC: typeof import("./study-objective-service");
before(async () => { SVC = await import("./study-objective-service"); });
beforeEach(() => { state.studyExists = true; state.writes = []; });

const admin = { workEmail: "admin@fanometrix", role: "admin" } as unknown as import("@/lib/auth-server").AuthedUser;
const brand = { workEmail: "b@x", role: "brand" } as unknown as import("@/lib/auth-server").AuthedUser;
const good = async () => ({ objective: "Assess fans' perceptions of FedEx as a Champions League sponsor and where it can add value." });

test("suggests an objective and NEVER saves it", async () => {
  const r = await SVC.suggestObjective(admin, "STU", "is FedEx a natural sponsor?", null, { complete: good as never });
  assert.equal(r.ok, true);
  assert.match(r.objective ?? "", /perceptions of FedEx/);
  assert.deepEqual(state.writes, []); // drafting persists nothing
});

test("non-admin is denied (403) and nothing is drafted", async () => {
  const r = await SVC.suggestObjective(brand, "STU", "anything", null, { complete: good as never });
  assert.equal(r.status, 403);
});

test("empty intent is rejected (400)", async () => {
  assert.equal((await SVC.suggestObjective(admin, "STU", "   ", null, { complete: good as never })).status, 400);
});

test("unknown study fails closed (404)", async () => {
  state.studyExists = false;
  assert.equal((await SVC.suggestObjective(admin, "STU", "x", null, { complete: good as never })).status, 404);
});

test("a provider failure is safe (502), never throws, never writes", async () => {
  const boom = async () => { throw new Error("provider down"); };
  const r = await SVC.suggestObjective(admin, "STU", "x", null, { complete: boom as never });
  assert.equal(r.status, 502);
  assert.deepEqual(state.writes, []);
});
