import { test } from "node:test";
import assert from "node:assert/strict";
import { sendInternalNotification, sendEmail } from "./notification-email";

const MSG = { subject: "s", html: "<p>h</p>", text: "t" };

// ── 12. Not configured → clean skip, never an error, never a throw ───────────
test("missing config skips cleanly (no send, no throw)", async () => {
  const res = await sendInternalNotification(MSG, { apiKey: undefined, to: undefined });
  assert.deepEqual(res, { ok: false, skipped: true });
});

// ── 12. Transport failure is swallowed — the caller's record stays authoritative
test("a throwing transport never throws; returns ok:false", async () => {
  const res = await sendInternalNotification(MSG, {
    apiKey: "k", to: "ops@example.com",
    fetchImpl: (async () => { throw new Error("network down"); }) as unknown as typeof fetch,
  });
  assert.equal(res.ok, false);
  assert.equal(res.skipped, undefined);
  assert.match(res.error ?? "", /network down/);
});

test("a non-2xx transport response is a non-fatal failure", async () => {
  const res = await sendInternalNotification(MSG, {
    apiKey: "k", to: "ops@example.com",
    fetchImpl: (async () => ({ ok: false, status: 429 })) as unknown as typeof fetch,
  });
  assert.deepEqual(res, { ok: false, error: "resend_status_429" });
});

// ── 13. On success the transport is invoked with the configured recipient ────
test("success posts to Resend with the configured recipient and from address", async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const res = await sendInternalNotification(MSG, {
    apiKey: "secret-key",
    to: "ops@fanometrix.example",
    fetchImpl: (async (url: string, init: RequestInit) => { captured = { url, init }; return { ok: true, status: 200 }; }) as unknown as typeof fetch,
  });
  assert.deepEqual(res, { ok: true });
  assert.ok(captured, "fetch should have been invoked");
  const c = captured as unknown as { url: string; init: RequestInit };
  assert.equal(c.url, "https://api.resend.com/emails");
  const headers = c.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer secret-key");
  const payload = JSON.parse(c.init.body as string);
  assert.deepEqual(payload.to, ["ops@fanometrix.example"]);
  assert.equal(payload.from, "Fanometrix <onboarding@resend.dev>");
  assert.equal(payload.subject, "s");
});

// ── sendEmail: arbitrary recipient + Reply-To (clarification path) ────────────
test("sendEmail targets the given recipient and passes Reply-To through", async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const res = await sendEmail(
    { to: "requester@brand.example", subject: "More info", html: "<p>hi</p>", text: "hi", replyTo: "ops@fanometrix.example" },
    { apiKey: "k", fetchImpl: (async (url: string, init: RequestInit) => { captured = { url, init }; return { ok: true, status: 200 }; }) as unknown as typeof fetch },
  );
  assert.deepEqual(res, { ok: true });
  const c = captured as unknown as { init: RequestInit };
  const payload = JSON.parse(c.init.body as string);
  assert.deepEqual(payload.to, ["requester@brand.example"]);
  assert.equal(payload.reply_to, "ops@fanometrix.example");
  assert.equal(payload.from, "Fanometrix <onboarding@resend.dev>");
});

test("sendEmail with no recipient skips (never sends)", async () => {
  let called = false;
  const res = await sendEmail(
    { to: undefined, subject: "s", html: "h" },
    { apiKey: "k", fetchImpl: (async () => { called = true; return { ok: true, status: 200 }; }) as unknown as typeof fetch },
  );
  assert.deepEqual(res, { ok: false, skipped: true });
  assert.equal(called, false);
});

test("sendEmail omits reply_to when none is given", async () => {
  let captured: RequestInit | null = null;
  await sendEmail(
    { to: "a@b.c", subject: "s", html: "h" },
    { apiKey: "k", fetchImpl: (async (_u: string, init: RequestInit) => { captured = init; return { ok: true, status: 200 }; }) as unknown as typeof fetch },
  );
  const payload = JSON.parse((captured as unknown as RequestInit).body as string);
  assert.equal("reply_to" in payload, false);
});
