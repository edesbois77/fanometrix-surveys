import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  resolveProductAccess,
  resolveCapabilityAccess,
  productAccessParity,
  capabilityAccessParity,
  legacyProductAreaAllows,
  legacyCapabilityAllows,
  type ProductAreaAccessTier,
  type ProductCapability,
} from "./product-access";
import type { UserRole } from "@/lib/auth";

// ORG-005 · IW-3 — Product Access & Product Capability Access (Q-09/Q-10; EVOLVE F013/F014).

const ROLES: UserRole[] = ["admin", "brand", "agency", "publisher"];
const TIERS: ProductAreaAccessTier[] = ["admin-only", "admin-and-publisher", "shared"];
const CAPS: ProductCapability[] = ["present-simulations", "create-commissioned-research"];

// ── Exhaustive parity: the model equals the legacy gate for EVERY input ───────
// The input space is finite (4 roles × 3 tiers, and 4 roles × 2 flag states ×
// 1 capability), so this is a TOTAL parity proof — stronger than traffic sampling.

test("Product Access: exhaustive parity with the legacy route-prefix gate (4×3)", () => {
  for (const role of ROLES) {
    for (const tier of TIERS) {
      const model = resolveProductAccess({ role, tier });
      const legacy = legacyProductAreaAllows(role, tier);
      assert.equal(model, legacy, `product-access divergence for ${role}/${tier}`);
      assert.equal(productAccessParity({ role, tier }).parity, true);
    }
  }
});

test("Product Capability Access: exhaustive parity with the declared gate (4 roles × 2 flags × all caps)", () => {
  for (const role of ROLES) {
    for (const canPresentSimulations of [true, false]) {
      for (const capability of CAPS) {
        const model = resolveCapabilityAccess({ role, canPresentSimulations, capability });
        const legacy = legacyCapabilityAllows(role, canPresentSimulations, capability);
        assert.equal(model, legacy, `capability divergence for ${role}/${canPresentSimulations}/${capability}`);
        assert.equal(capabilityAccessParity({ role, canPresentSimulations, capability }).parity, true);
      }
    }
  }
});

// ── Legacy gate values pinned (guards against silent drift from middleware) ───

test("Product Access mirrors middleware exactly", () => {
  // admin-only: only admin.
  assert.deepEqual(ROLES.map(r => resolveProductAccess({ role: r, tier: "admin-only" })), [true, false, false, false]);
  // admin-and-publisher: admin + publisher (brand/agency blocked → /insights).
  assert.deepEqual(ROLES.map(r => resolveProductAccess({ role: r, tier: "admin-and-publisher" })), [true, false, false, true]);
  // shared: everyone.
  assert.deepEqual(ROLES.map(r => resolveProductAccess({ role: r, tier: "shared" })), [true, true, true, true]);
});

// ── Product ≠ Capability: the two layers are INDEPENDENT (Q-10 / Q-35-D09) ────

test("Capability access is independent of Product Access", () => {
  // A publisher has NO admin-only Product Access, yet WITH the direct grant CAN
  // present simulations — capability is not gated by that product-area access.
  assert.equal(resolveProductAccess({ role: "publisher", tier: "admin-only" }), false);
  assert.equal(resolveCapabilityAccess({ role: "publisher", canPresentSimulations: true, capability: "present-simulations" }), true);
  // Conversely, a brand user WITH shared Product Access but WITHOUT the grant
  // CANNOT present simulations — product access does not imply capability.
  assert.equal(resolveProductAccess({ role: "brand", tier: "shared" }), true);
  assert.equal(resolveCapabilityAccess({ role: "brand", canPresentSimulations: false, capability: "present-simulations" }), false);
});

test("present-simulations preserves the admin super-ALLOW unchanged (IW-5 concern, not touched)", () => {
  // Admin is allowed even without the direct grant — current behaviour retained.
  assert.equal(resolveCapabilityAccess({ role: "admin", canPresentSimulations: false, capability: "present-simulations" }), true);
});

// ── create-commissioned-research: governed V1 policy (admin ALLOW / else REFUSE) ─

test("create-commissioned-research: contextual admin ALLOW; Publisher and other non-admin REFUSE", () => {
  const cap = "create-commissioned-research" as const;
  // Both grant-flag states, to prove independence from the present-simulations grant.
  for (const canPresentSimulations of [true, false]) {
    assert.equal(resolveCapabilityAccess({ role: "admin",     canPresentSimulations, capability: cap }), true,  "admin → ALLOW");
    assert.equal(resolveCapabilityAccess({ role: "publisher", canPresentSimulations, capability: cap }), false, "publisher → REFUSE");
    assert.equal(resolveCapabilityAccess({ role: "brand",     canPresentSimulations, capability: cap }), false, "brand → REFUSE");
    assert.equal(resolveCapabilityAccess({ role: "agency",    canPresentSimulations, capability: cap }), false, "agency → REFUSE");
  }
});

test("create-commissioned-research is independent of Product Access and does not confer it (Q-35-D09)", () => {
  // A publisher has admin-and-publisher Create Product Access, yet is REFUSED the
  // commissioned capability — Q-09 access does NOT imply the Q-10 capability.
  assert.equal(resolveProductAccess({ role: "publisher", tier: "admin-and-publisher" }), true);
  assert.equal(resolveCapabilityAccess({ role: "publisher", canPresentSimulations: false, capability: "create-commissioned-research" }), false);
  // The capability grants no Product Access of its own — the two layers are separate.
});

test("create-commissioned-research V1 policy uses NO stored direct grant (canPresentSimulations irrelevant)", () => {
  assert.equal(
    resolveCapabilityAccess({ role: "publisher", canPresentSimulations: true, capability: "create-commissioned-research" }),
    resolveCapabilityAccess({ role: "publisher", canPresentSimulations: false, capability: "create-commissioned-research" }),
  );
});

// ── SG-3: server-side model is the locus; UI/nav is NEVER an authorisation input ─

test("SG-3 — the Product/Capability model does not consult UI/nav configuration", () => {
  const src = readFileSync(resolve(__dirname, "product-access.ts"), "utf8");
  assert.doesNotMatch(src, /nav-config/);         // nav is projection only, never imported
  assert.doesNotMatch(src, /nav-config|navConfig|NAV_/);
  // Resolution signatures take only role/tier/grant/capability — no nav, no URL.
  assert.equal(resolveProductAccess.length, 1);
  assert.equal(resolveCapabilityAccess.length, 1);
});

// ── Purity ───────────────────────────────────────────────────────────────────

test("resolution is a pure function of its inputs", () => {
  assert.equal(resolveProductAccess({ role: "publisher", tier: "admin-and-publisher" }), resolveProductAccess({ role: "publisher", tier: "admin-and-publisher" }));
  assert.equal(
    resolveCapabilityAccess({ role: "brand", canPresentSimulations: true, capability: "present-simulations" }),
    resolveCapabilityAccess({ role: "brand", canPresentSimulations: true, capability: "present-simulations" }),
  );
});
