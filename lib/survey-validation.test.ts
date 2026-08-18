import { test } from "node:test";
import assert from "node:assert/strict";
import { nullifyBlankUuids, brandAgencyRefError, type OrgRefRow } from "./survey-validation";

// Fetched organisations for reference validation.
const ROWS: OrgRefRow[] = [
  { id: "brand-1", type: "brand", deleted_at: null },
  { id: "brand-2", type: "brand", deleted_at: "2026-01-01T00:00:00Z" }, // soft-deleted
  { id: "agency-1", type: "agency", deleted_at: null },
  { id: "pub-1", type: "publisher", deleted_at: null },
];

test("blank Brand/Agency coerce to null (existing uuid guard)", () => {
  assert.deepEqual(nullifyBlankUuids({ brand_org_id: "", agency_org_id: "" }), { brand_org_id: null, agency_org_id: null });
  assert.deepEqual(nullifyBlankUuids({ brand_org_id: "brand-1" }), { brand_org_id: "brand-1" });
});

test("valid brand + agency references pass", () => {
  assert.equal(brandAgencyRefError("brand-1", "agency-1", ROWS), null);
});

test("no references (null/blank) is allowed — attribution is optional", () => {
  assert.equal(brandAgencyRefError(null, null, ROWS), null);
  assert.equal(brandAgencyRefError("", "", ROWS), null);
  assert.equal(brandAgencyRefError(undefined, undefined, ROWS), null);
});

test("only one reference set is validated in isolation", () => {
  assert.equal(brandAgencyRefError("brand-1", "", ROWS), null);
  assert.equal(brandAgencyRefError("", "agency-1", ROWS), null);
});

test("arbitrary UUID (not in the org table) is rejected", () => {
  assert.equal(brandAgencyRefError("00000000-0000-0000-0000-000000000000", null, ROWS), "Invalid Brand selection.");
  assert.equal(brandAgencyRefError(null, "does-not-exist", ROWS), "Invalid Agency selection.");
});

test("wrong-type org is rejected (a publisher org can't be a Brand; a brand can't be an Agency)", () => {
  assert.equal(brandAgencyRefError("pub-1", null, ROWS), "Invalid Brand selection.");
  assert.equal(brandAgencyRefError("agency-1", null, ROWS), "Invalid Brand selection."); // agency as brand
  assert.equal(brandAgencyRefError(null, "brand-1", ROWS), "Invalid Agency selection."); // brand as agency
});

test("soft-deleted org is rejected", () => {
  assert.equal(brandAgencyRefError("brand-2", null, ROWS), "Invalid Brand selection.");
});

test("brand checked before agency when both invalid", () => {
  assert.equal(brandAgencyRefError("bad-brand", "bad-agency", ROWS), "Invalid Brand selection.");
});
