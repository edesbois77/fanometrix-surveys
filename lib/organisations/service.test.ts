import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUnitTree, type UnitRow } from "./units";
import { mapOrgDbError } from "./db-errors";

const u = (id: string, parent: string | null, name = id): UnitRow => ({
  id, organisation_id: "org1", parent_unit_id: parent, name,
  created_at: "", updated_at: "", deleted_at: null,
});

// ── buildUnitTree ────────────────────────────────────────────────────────────
test("buildUnitTree nests children under parents and assigns depth", () => {
  const tree = buildUnitTree([u("A", null), u("B", "A"), u("C", "B"), u("D", null)]);
  assert.equal(tree.length, 2); // A and D are roots
  const a = tree.find(n => n.id === "A")!;
  assert.equal(a.depth, 0);
  assert.equal(a.children[0].id, "B");
  assert.equal(a.children[0].depth, 1);
  assert.equal(a.children[0].children[0].id, "C");
  assert.equal(a.children[0].children[0].depth, 2);
});

test("buildUnitTree treats an orphan (missing parent in set) as a root", () => {
  const tree = buildUnitTree([u("B", "ghost")]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].id, "B");
});

// ── mapOrgDbError ────────────────────────────────────────────────────────────
test("P0001 guard exceptions pass their message through as a 409", () => {
  const r = mapOrgDbError({ code: "P0001", message: "circular unit containment detected involving unit X" });
  assert.equal(r.status, 409);
  assert.match(r.message, /circular/);
});
test("check/unique/fk violations map to friendly 400/409", () => {
  assert.equal(mapOrgDbError({ code: "23514", message: "organisation_names_effective_order" }).status, 400);
  assert.match(mapOrgDbError({ code: "23514", message: "effective_to" }).message, /after the start/);
  assert.equal(mapOrgDbError({ code: "23505", message: "dup" }).status, 409);
  assert.equal(mapOrgDbError({ code: "23503", message: "fk" }).status, 400);
});
test("unknown errors surface the raw message (nothing swallowed) at 500", () => {
  const r = mapOrgDbError({ code: "XXXXX", message: "weird db thing" });
  assert.equal(r.status, 500);
  assert.equal(r.message, "weird db thing");
});
