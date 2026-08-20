
import { test, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Only a user authorised for the campaign may create, read or revoke its review
// link, and the token is returned exactly once.

let sessionRole: string | null = "publisher";
let accessGranted = true;
const inserted: Record<string, unknown>[] = [];
const updated: Record<string, unknown>[] = [];
let campaignRow: Record<string, unknown> | null = null;

mock.module("@/lib/auth-server", {
  namedExports: {
    requireUser: async () => {
      if (!sessionRole) throw new Response(JSON.stringify({ error: "Unauthorised" }), { status: 401 });
      return { id: "u1", workEmail: "a@b.c", role: sessionRole, organisationId: "org-1" };
    },
  },
});
mock.module("@/lib/access", { namedExports: { canAccess: async () => accessGranted } });

function builder(table: string) {
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "limit"]) api[m] = () => api;
  api.insert = (row: Record<string, unknown>) => { inserted.push(row); return api; };
  api.update = (row: Record<string, unknown>) => { updated.push(row); return api; };
  api.maybeSingle = () => Promise.resolve({ data: table === "campaigns" ? campaignRow : null, error: null });
  api.single = () => Promise.resolve({
    data: table === "campaign_preview_grants"
      ? { id: "g1", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString() }
      : campaignRow,
    error: null,
  });
  (api as { then?: unknown }).then = (r: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(r);
  return api;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: string) => builder(t) } } });

let POST: (req: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;
let DELETE: (req: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;
let GET: (req: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;
before(async () => { ({ POST, DELETE, GET } = await import("./[id]/preview-grant/route")); });

const params = { params: Promise.resolve({ id: "camp-uuid" }) };
const req = (m = "POST") => new NextRequest("https://x/api/studio/campaigns/camp-uuid/preview-grant", { method: m });

beforeEach(() => {
  sessionRole = "publisher"; accessGranted = true;
  inserted.length = 0; updated.length = 0;
  campaignRow = { id: "camp-uuid", campaign_id: "slug", survey_id: "surv", organisation_id: "org-1", deleted_at: null };
});

test("an authorised user creates a grant and receives the token ONCE", async () => {
  const res = await POST(req(), params);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.match(j.token, /^[A-Za-z0-9_-]{43}$/, "an opaque high-entropy token");
  assert.ok(j.grant.expires_at, "with an explicit expiry");
  // Only the hash is persisted.
  assert.ok(inserted[0].token_hash, "hash stored");
  assert.equal((inserted[0] as Record<string, string>).token_hash.length, 64);
  assert.ok(!Object.values(inserted[0]).includes(j.token), "the token itself is never stored");
  // Scoped to exactly one campaign and its survey.
  assert.equal(inserted[0].campaign_id, "camp-uuid");
  assert.equal(inserted[0].survey_id, "surv");
});

test("ANOTHER organisation cannot create a grant for the campaign", async () => {
  accessGranted = false;
  const res = await POST(req(), params);
  assert.equal(res.status, 404, "indistinguishable from 'no such campaign'");
  assert.equal(inserted.length, 0, "nothing created");
});

test("another organisation cannot read or revoke it either", async () => {
  accessGranted = false;
  assert.equal((await GET(req("GET"), params)).status, 404);
  assert.equal((await DELETE(req("DELETE"), params)).status, 404);
  assert.equal(updated.length, 0, "nothing revoked");
});

test("an unauthenticated caller is refused", async () => {
  sessionRole = null;
  const res = await POST(req(), params);
  assert.equal(res.status, 401);
  assert.equal(inserted.length, 0);
});

test("a deleted campaign cannot have a grant created", async () => {
  campaignRow = { ...(campaignRow as object), deleted_at: new Date().toISOString() };
  assert.equal((await POST(req(), params)).status, 404);
  assert.equal(inserted.length, 0);
});

test("regenerating revokes whatever was shared before", async () => {
  await POST(req(), params);
  assert.ok(updated.some(u => "revoked_at" in u), "previous grants revoked in the same call");
});

test("GET describes the grant but NEVER returns a token", async () => {
  const j = await (await GET(req("GET"), params)).json();
  assert.equal(j.token, null, "a reload must not resurface a shareable URL");
});

test("revoke marks grants revoked", async () => {
  const res = await DELETE(req("DELETE"), params);
  assert.equal(res.status, 200);
  assert.ok(updated.some(u => "revoked_at" in u));
});

test("responses are no-store and no-referrer", async () => {
  const res = await POST(req(), params);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("Referrer-Policy"), "no-referrer");
});
