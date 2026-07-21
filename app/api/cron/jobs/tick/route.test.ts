// Route-level auth proof for the cron worker. Mocks the DB-touching worker so
// the authorized path returns 200 without a database. Proves end-to-end that the
// handler answers 401 / 401 / 200 for the three credential cases. Run: npm test
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const SECRET = "test-cron-secret";
process.env.CRON_SECRET = SECRET;

// Replace the heavy/DB modules the authorized path pulls in, BEFORE importing the
// route, so a 200 can be asserted without Supabase or the PDF pipeline. (These
// mock.module calls are synchronous; the route import is deferred to before() so
// the file needs no top-level await, which tsx's CJS output can't emit.)
mock.module("@/lib/jobs/worker", {
  namedExports: {
    drainJobs: async () => ({ claimed: 0, completed: 0, failed: 0, requiresReview: 0, requeued: 0 }),
  },
});
mock.module("@/lib/jobs/handlers", { namedExports: {} });

let POST: (req: NextRequest) => Promise<Response>;
before(async () => {
  ({ POST } = await import("@/app/api/cron/jobs/tick/route"));
});

function tickRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://app.example.com/api/cron/jobs/tick", { method: "POST", headers });
}

test("no bearer token → 401", async () => {
  const res = await POST(tickRequest());
  assert.equal(res.status, 401);
});

test("wrong bearer token → 401", async () => {
  const res = await POST(tickRequest({ authorization: "Bearer not-the-secret" }));
  assert.equal(res.status, 401);
});

test("correct CRON_SECRET → 200", async () => {
  const res = await POST(tickRequest({ authorization: `Bearer ${SECRET}` }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});
