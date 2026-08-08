import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isMinimisedDetail,
  entryHash,
  verifyChain,
  mustFailClosed,
  assertMandatoryAudit,
  MandatoryAuditUnavailableError,
  type AuditResult,
} from "./audit";

// ORG-005 · IW-7 — Security Audit & Mandatory-Audit Fail-Closed (Q-29/Q-30/Q-34).

// ── Q-30 minimisation: never embed content / secrets ─────────────────────────

test("minimisation guard rejects content/secret fields", () => {
  assert.equal(isMinimisedDetail({ campaignId: "c1", changedField: "role" }), true);
  assert.equal(isMinimisedDetail({ password: "x" }), false);
  assert.equal(isMinimisedDetail({ hashed_password: "x" }), false);
  assert.equal(isMinimisedDetail({ api_key: "x" }), false);
  assert.equal(isMinimisedDetail({ answers: [] }), false);
  assert.equal(isMinimisedDetail({ document_content: "…" }), false);
  assert.equal(isMinimisedDetail(undefined), true);
});

// ── Q-30 / F046 tamper-evidence: hash chain ──────────────────────────────────

function buildChain(contentHashes: string[]) {
  const rows: { content_hash: string; prev_hash: string | null; entry_hash: string }[] = [];
  let prev: string | null = null;
  for (const ch of contentHashes) {
    const eh = entryHash(prev, ch);
    rows.push({ content_hash: ch, prev_hash: prev, entry_hash: eh });
    prev = eh;
  }
  return rows;
}

test("a well-formed chain verifies", () => {
  assert.equal(verifyChain(buildChain(["a", "b", "c"])), true);
  assert.equal(verifyChain([]), true);
});

test("altering a row's content breaks the chain (tamper-evident)", () => {
  const rows = buildChain(["a", "b", "c"]);
  rows[1] = { ...rows[1], content_hash: "TAMPERED" }; // entry_hash no longer matches
  assert.equal(verifyChain(rows), false);
});

test("deleting/reordering a row breaks the chain", () => {
  const rows = buildChain(["a", "b", "c"]);
  const withoutMiddle = [rows[0], rows[2]]; // prev_hash linkage now broken
  assert.equal(verifyChain(withoutMiddle), false);
  const reordered = [rows[1], rows[0], rows[2]];
  assert.equal(verifyChain(reordered), false);
});

test("entryHash chains on the previous entry hash (order-sensitive)", () => {
  assert.notEqual(entryHash(null, "a"), entryHash("x", "a"));
  assert.equal(entryHash("x", "a"), entryHash("x", "a")); // deterministic
});

// ── Q-34 / F045 mandatory-audit fail-closed (SG-7) ───────────────────────────

test("live subsystem write error → fail closed", () => {
  const err: AuditResult = { status: "error" };
  assert.equal(mustFailClosed(err), true);
  assert.throws(() => assertMandatoryAudit(err), MandatoryAuditUnavailableError);
});

test("recorded → proceeds; unavailable (pre-activation) → proceeds (no break)", () => {
  assert.equal(mustFailClosed({ status: "recorded" }), false);
  assert.equal(mustFailClosed({ status: "unavailable" }), false);
  assert.doesNotThrow(() => assertMandatoryAudit({ status: "recorded" }));
  assert.doesNotThrow(() => assertMandatoryAudit({ status: "unavailable" }));
});

// ── F048 RETAIN: permission is NEVER reconstructed from audit ────────────────

test("no authorisation decision path imports the audit module (F048)", () => {
  for (const f of ["decision.ts", "organisation-access.ts", "role-profile.ts", "product-access.ts"]) {
    const src = readFileSync(resolve(__dirname, f), "utf8");
    assert.doesNotMatch(src, /\.\/audit|authz\/audit/, `${f} must not read the audit store`);
  }
  const access = readFileSync(resolve(__dirname, "..", "access.ts"), "utf8");
  assert.doesNotMatch(access, /authz\/audit/);
});

// ── Audit is write-for-evidence only — the module exports no permission reader ─

test("audit module exposes no authorisation/permission reader", () => {
  const src = readFileSync(resolve(__dirname, "audit.ts"), "utf8");
  assert.doesNotMatch(src, /export .*canAccess|export .*resolve.*Access|export .*permission/i);
});
