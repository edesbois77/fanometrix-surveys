import { test, before } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-preview-session";

let M: typeof import("./preview-session");
before(async () => { M = await import("./preview-session"); });

const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

test("a session is minted for a live grant and is scoped to one campaign", () => {
  const s = M.mintPreviewSession("grant-1", "camp_a", inHours(24));
  assert.ok(s);
  assert.equal(M.verifyPreviewSession(s!.value, "camp_a")?.grantId, "grant-1");
  assert.equal(M.verifyPreviewSession(s!.value, "camp_b"), null, "useless for another campaign");
});

test("a session can NEVER outlive its grant", () => {
  // Grant with 5 minutes left → 5-minute session, not the 30-minute default.
  const short = M.mintPreviewSession("g", "c", new Date(Date.now() + 5 * 60_000).toISOString());
  assert.ok(short);
  assert.ok(short!.maxAgeSeconds <= 5 * 60, `expected <= 300s, got ${short!.maxAgeSeconds}`);
  // Grant with a year left → still capped at the session maximum.
  const long = M.mintPreviewSession("g", "c", inHours(24 * 365));
  assert.equal(long!.maxAgeSeconds, M.PREVIEW_SESSION_MAX_SECONDS);
});

test("an already-expired grant mints nothing", () => {
  assert.equal(M.mintPreviewSession("g", "c", new Date(Date.now() - 1000).toISOString()), null);
});

test("a tampered session is rejected", () => {
  const s = M.mintPreviewSession("grant-1", "camp_a", inHours(24))!;
  const mac = s.value.split(".")[1];
  // Re-point at another grant, keeping the original signature.
  const forged = Buffer.from(JSON.stringify({ g: "grant-999", c: "camp_a", e: Math.floor(Date.now()/1000)+600 }), "utf8").toString("base64url");
  assert.equal(M.verifyPreviewSession(`${forged}.${mac}`, "camp_a"), null, "signature must not verify");
  assert.equal(M.verifyPreviewSession(`${forged}.${"x".repeat(mac.length)}`, "camp_a"), null, "bad mac rejected");
  assert.equal(M.verifyPreviewSession(forged, "camp_a"), null, "unsigned rejected");
});

test("a lapsed session is rejected even with a valid signature", () => {
  const s = M.mintPreviewSession("g", "c", new Date(Date.now() + 2000).toISOString())!;
  const mac = s.value.split(".")[1];
  const past = Buffer.from(JSON.stringify({ g: "g", c: "c", e: Math.floor(Date.now()/1000) - 10 }), "utf8").toString("base64url");
  assert.equal(M.verifyPreviewSession(`${past}.${mac}`, "c"), null);
  assert.ok(M.verifyPreviewSession(s.value, "c"), "the unmodified one is still valid");
});

test("malformed input never verifies", () => {
  for (const bad of [null, undefined, "", "abc", "a.b.c.d", 42, {}]) {
    assert.equal(M.verifyPreviewSession(bad as string, "c"), null, `${JSON.stringify(bad)}`);
  }
});

test("the session cookie is HttpOnly, and never carries the grant token", () => {
  const s = M.mintPreviewSession("grant-1", "camp_a", inHours(24))!;
  const c = M.previewSessionCookie(s.value, s.maxAgeSeconds);
  assert.equal(c.httpOnly, true, "script must not be able to read it");
  assert.equal(c.path, "/");
  assert.ok(c.maxAge > 0 && c.maxAge <= M.PREVIEW_SESSION_MAX_SECONDS);
  // It is an assertion ABOUT a grant, not the grant: it cannot rebuild a link.
  assert.ok(!c.value.includes("grant-1"), "the grant id is not readable in the clear");
});

test("SameSite=None is only ever paired with Secure", () => {
  // Browsers reject None without Secure, so the two must move together — this is
  // why the cookie silently failed to set over plain HTTP during verification.
  const c = M.previewSessionCookie("v", 60);
  if (c.sameSite === "none") assert.equal(c.secure, true, "None requires Secure");
  else assert.equal(c.sameSite, "lax");
});

test("the context marker carries no credential and is readable by design", () => {
  const m = M.previewContextCookie(600);
  assert.equal(m.value, "1", "the literal string 1 — nothing else");
  assert.equal(m.httpOnly, false, "the client must be able to read it");
  assert.equal(M.clearedPreviewContextCookie().maxAge, 0);
});

test("clearing produces an immediately-expired cookie", () => {
  assert.equal(M.clearedPreviewSessionCookie().maxAge, 0);
  assert.equal(M.clearedPreviewSessionCookie().value, "");
});
