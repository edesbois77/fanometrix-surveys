import { test, before, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// Ad-ops review grants must fail closed on every abuse path, and every failure
// must be indistinguishable from outside so a probe cannot map the space.

type Row = Record<string, unknown> | null;
let grantRow: Row = null;
let campaignRow: Row = null;
const updates: Record<string, unknown>[] = [];

function builder(table: string) {
  const api: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "limit"]) api[m] = () => api;
  api.update = (patch: Record<string, unknown>) => { updates.push({ table, ...patch }); return api; };
  api.maybeSingle = () => Promise.resolve({
    data: table === "campaign_preview_grants" ? grantRow : campaignRow, error: null,
  });
  api.single = api.maybeSingle;
  (api as { then?: unknown }).then = (r: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(r);
  return api;
}
mock.module("@/lib/supabase-admin", { namedExports: { supabaseAdmin: { from: (t: string) => builder(t) } } });

let M: typeof import("./preview-grant");
before(async () => { M = await import("./preview-grant"); });

const VALID = "A".repeat(43);
const future = () => new Date(Date.now() + 86_400_000).toISOString();
const past   = () => new Date(Date.now() - 86_400_000).toISOString();

beforeEach(() => {
  updates.length = 0;
  campaignRow = { id: "camp-uuid", campaign_id: "zzz_slug", survey_id: "surv-uuid", deleted_at: null };
  grantRow = { id: "g1", campaign_id: "camp-uuid", survey_id: "surv-uuid", organisation_id: "org-1",
               expires_at: future(), created_at: new Date().toISOString(), revoked_at: null,
               last_used_at: null, use_count: 0 };
});

test("tokens are high-entropy, opaque and unique", () => {
  const a = M.generatePreviewToken(), b = M.generatePreviewToken();
  assert.equal(a.length, 43, "32 random bytes as base64url");
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(M.isWellFormedToken(a), true);
});

test("only the hash is ever stored, and it is not reversible to the token", () => {
  const t = M.generatePreviewToken();
  const h = M.hashPreviewToken(t);
  assert.equal(h.length, 64, "sha256 hex");
  assert.notEqual(h, t);
  assert.ok(!h.includes(t.slice(0, 12)), "the hash must not embed the token");
  assert.equal(M.hashPreviewToken(t), h, "stable");
});

test("a VALID grant resolves, logged out, to its own campaign", async () => {
  const r = await M.resolvePreviewGrant(VALID);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.campaignSlug, "zzz_slug");
    assert.equal(r.grant.campaignId, "camp-uuid");
  }
});

test("EXPIRED grants fail closed", async () => {
  grantRow = { ...(grantRow as object), expires_at: past() };
  const r = await M.resolvePreviewGrant(VALID);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "expired");
});

test("REVOKED grants fail closed", async () => {
  grantRow = { ...(grantRow as object), revoked_at: new Date().toISOString() };
  const r = await M.resolvePreviewGrant(VALID);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "revoked");
});

test("MALFORMED tokens are rejected without touching the database", async () => {
  for (const bad of ["", "short", "!".repeat(43), "A".repeat(42), "A".repeat(44), null, undefined, 42, {}]) {
    const r = await M.resolvePreviewGrant(bad);
    assert.equal(r.ok, false, `${JSON.stringify(bad)} must fail`);
    if (!r.ok) assert.equal(r.reason, "malformed");
  }
});

test("UNKNOWN tokens fail closed", async () => {
  grantRow = null;
  const r = await M.resolvePreviewGrant(VALID);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "unknown");
});

test("MISMATCHED campaign slug beside a valid token fails closed", async () => {
  // The URL carries both. The grant is the authority; a slug that disagrees is
  // rejected rather than silently ignored.
  const r = await M.resolvePreviewGrant(VALID, "some_other_campaign");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "mismatch");
});

test("a grant does NOT follow a campaign re-pointed at a different survey", async () => {
  campaignRow = { ...(campaignRow as object), survey_id: "different-survey" };
  const r = await M.resolvePreviewGrant(VALID);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "mismatch");
});

test("a DELETED campaign fails closed even with a valid unexpired grant", async () => {
  campaignRow = { ...(campaignRow as object), deleted_at: new Date().toISOString() };
  const r = await M.resolvePreviewGrant(VALID);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.reason, "campaign_deleted");
});

test("campaign identity is taken from the GRANT, never from the request", async () => {
  campaignRow = { id: "camp-uuid", campaign_id: "the_real_slug", survey_id: "surv-uuid", deleted_at: null };
  const r = await M.resolvePreviewGrant(VALID, "the_real_slug");
  assert.equal(r.ok, true);
  // Resolved slug comes from the campaign row the grant points at.
  if (r.ok) assert.equal(r.campaignSlug, "the_real_slug");
});

test("preview tokens are redacted from anything we log", () => {
  const t = M.generatePreviewToken();
  const url = `https://surveys.example/embed?campaign=x&preview_token=${t}`;
  const red = M.redactPreviewToken(url);
  assert.ok(!red.includes(t), "token must not survive redaction");
  assert.match(red, /preview_token=\[REDACTED\]/);
  assert.ok(!M.redactPreviewToken(`x-fx-preview-token: ${t}`).includes(t), "header form too");
});

test("hash comparison is length-safe", () => {
  const h = M.hashPreviewToken("a");
  assert.equal(M.hashesMatch(h, h), true);
  assert.equal(M.hashesMatch(h, h.slice(0, 10)), false);
  assert.equal(M.hashesMatch(h, M.hashPreviewToken("b")), false);
});
