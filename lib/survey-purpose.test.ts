import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isThirdPartyPurpose,
  purposeAllowedForCreate,
  showsCommissionedAttribution,
} from "./survey-purpose";

// ── Brand/Agency attribution visibility + persistence gate ───────────────────
// showsCommissionedAttribution drives BOTH the About-stage section and whether the
// attribution fields are persisted, so they can never diverge.

test("commissioned Purpose + capability → attribution applies (controls shown, persisted)", () => {
  assert.equal(showsCommissionedAttribution("third_party", true), true);
});

test("commissioned Purpose WITHOUT capability → no attribution (routes to Request)", () => {
  // The survey never persists a commissioned purpose here, so no Brand/Agency.
  assert.equal(showsCommissionedAttribution("third_party", false), false);
});

test("every first-party Purpose → attribution hidden, regardless of capability", () => {
  for (const p of ["editorial_audience", "product_experience", "first_party_business"]) {
    assert.equal(showsCommissionedAttribution(p, true), false);
    assert.equal(showsCommissionedAttribution(p, false), false);
  }
});

test("blank / unknown Purpose → attribution hidden", () => {
  assert.equal(showsCommissionedAttribution("", true), false);
  assert.equal(showsCommissionedAttribution(null, true), false);
  assert.equal(showsCommissionedAttribution("nonsense", true), false);
});

// The clearing rule (switch away from commissioned → drop attribution) keys off
// isThirdPartyPurpose, enforced identically on client (payload) and server.
test("clearing rule: only a third-party purpose keeps attribution", () => {
  assert.equal(isThirdPartyPurpose("third_party"), true);
  assert.equal(isThirdPartyPurpose("editorial_audience"), false);
  assert.equal(isThirdPartyPurpose(""), false);
});

// Guard the existing capability rule is unchanged by this pass.
test("purposeAllowedForCreate unchanged: third-party needs the capability", () => {
  assert.equal(purposeAllowedForCreate(false, "third_party"), false);
  assert.equal(purposeAllowedForCreate(true, "third_party"), true);
  assert.equal(purposeAllowedForCreate(false, "editorial_audience"), true);
  assert.equal(purposeAllowedForCreate(false, ""), true);
});
