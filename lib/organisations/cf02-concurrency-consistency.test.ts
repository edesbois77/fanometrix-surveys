import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapOrgDbError } from "./db-errors";

// ── ORG-007 CF-002 (NFR-004) — concurrency-correct consistency ─────────────────
// The two identified read-then-write (TOCTOU) invariants are moved to authoritative
// database enforcement that stays correct under concurrent writers:
//   • Office attachment exclusivity (FR-010) → partial GiST EXCLUDE constraint;
//   • Unit removal ↔ live-children → guard triggers whose shared parent-row lock
//     (FOR NO KEY UPDATE) serialises a soft-delete against a concurrent child insert.
// The enforcement is proven live by supabase-migration-177-verify.sql; here we
// source-guard the authoritative mechanism and verify the app surfaces its errors.

const root = resolve(__dirname, "..", "..");
const mig = readFileSync(resolve(root, "supabase-migration-177.sql"), "utf8");

// ── Office exclusivity is a DB exclusion constraint, not only an app pre-check ──
test("CF-02 — Office FR-010 exclusivity is enforced by a partial GiST exclusion constraint", () => {
  assert.match(mig, /CREATE EXTENSION IF NOT EXISTS btree_gist/, "btree_gist for the = operator class");
  assert.match(mig, /ADD CONSTRAINT org_office_attachment_no_overlap[\s\S]*EXCLUDE USING gist/);
  assert.match(mig, /office_id WITH =/);
  assert.match(mig, /daterange\(effective_from, effective_to, '\[\)'\) WITH &&/, "half-open applicability overlap");
  assert.match(mig, /WHERE \(deleted_at IS NULL\)/, "only live attachments are constrained");
});

// ── Unit removal ↔ live-children is enforced concurrency-safely by triggers ─────
test("CF-02 — Unit removal ↔ live-children is enforced by guard triggers with a shared parent-row lock", () => {
  assert.match(mig, /FUNCTION public\.org_unit_block_delete_with_children/);
  assert.match(mig, /unit_has_live_children/);
  assert.match(mig, /FUNCTION public\.org_unit_block_live_under_removed_parent/);
  assert.match(mig, /parent_unit_removed/);
  // The placement side takes the parent row lock so it serialises with a concurrent soft-delete.
  assert.match(mig, /WHERE id = NEW\.parent_unit_id[\s\S]*FOR NO KEY UPDATE/);
  // The delete-side trigger fires on the soft-delete; the placement-side on insert/re-parent only.
  assert.match(mig, /BEFORE UPDATE OF deleted_at ON public\.organisation_units/);
  assert.match(mig, /BEFORE INSERT OR UPDATE OF parent_unit_id ON public\.organisation_units/);
});

// ── The app surfaces the authoritative DB rejections as friendly conflicts ──────
test("CF-02 — an exclusion violation (23P01) maps to a friendly 409, not a raw 500", () => {
  const r = mapOrgDbError({ code: "23P01", message: 'conflicting key value violates exclusion constraint "org_office_attachment_no_overlap"' });
  assert.equal(r.status, 409);
  assert.match(r.message, /already has a governing organisation for an overlapping period/i);
});

test("CF-02 — the Unit guard raises (P0001) map to friendly 409 conflicts", () => {
  const del = mapOrgDbError({ code: "P0001", message: "unit_has_live_children: cannot remove a unit that still contains sub-units" });
  assert.equal(del.status, 409);
  assert.match(del.message, /still contains sub-unit/i);

  const parent = mapOrgDbError({ code: "P0001", message: "parent_unit_removed: cannot place a live unit under a removed parent" });
  assert.equal(parent.status, 409);
  assert.match(parent.message, /removed.*live parent|live parent/i);
});

test("CF-02 — an unrelated P0001 guard message still passes through as a 409", () => {
  const r = mapOrgDbError({ code: "P0001", message: "some_other_guard: not allowed" });
  assert.equal(r.status, 409);
  assert.match(r.message, /some_other_guard/);
});

// ── The app pre-checks remain (friendly messages) but the DB is authoritative ───
test("CF-02 — the app retains its friendly pre-checks while the DB enforces authoritatively", () => {
  const offices = readFileSync(resolve(root, "lib/organisations/offices.ts"), "utf8");
  assert.match(offices, /validateAttachmentExclusivity/, "office pre-check retained for friendly errors");
  const units = readFileSync(resolve(root, "lib/organisations/units.ts"), "utf8");
  assert.match(units, /still contains \$\{count\} sub-unit/, "unit pre-check retained for friendly errors");
});
