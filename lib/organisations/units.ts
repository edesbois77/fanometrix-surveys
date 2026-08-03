// ORG-004 BP-02 / IC-03 — Organisation Unit service. The database (migration 150)
// is authoritative for all structural integrity (self-parent, cycles, same-org
// nesting, organisation_id immutability); this layer provides clear pre-flight
// validation and error translation, and never diverges from those rules.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapOrgDbError } from "./db-errors";
import { validateContainment, type UnitNode } from "./bp02";

export type UnitRow = {
  id: string;
  organisation_id: string;
  parent_unit_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type UnitTreeNode = UnitRow & { children: UnitTreeNode[]; depth: number };

const COLS = "id, organisation_id, parent_unit_id, name, created_at, updated_at, deleted_at";

/** All units for an organisation (live by default). */
export async function listUnits(organisationId: string, includeDeleted = false): Promise<UnitRow[]> {
  let q = supabaseAdmin.from("organisation_units").select(COLS).eq("organisation_id", organisationId);
  if (!includeDeleted) q = q.is("deleted_at", null);
  const { data, error } = await q.order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as UnitRow[];
}

/** Pure: assemble a parent/child tree (roots first, stable by name). */
export function buildUnitTree(units: UnitRow[]): UnitTreeNode[] {
  const byId = new Map<string, UnitTreeNode>();
  units.forEach((u) => byId.set(u.id, { ...u, children: [], depth: 0 }));
  const roots: UnitTreeNode[] = [];
  byId.forEach((node) => {
    if (node.parent_unit_id && byId.has(node.parent_unit_id)) {
      byId.get(node.parent_unit_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  const setDepth = (n: UnitTreeNode, d: number) => { n.depth = d; n.children.forEach((c) => setDepth(c, d + 1)); };
  roots.forEach((r) => setDepth(r, 0));
  return roots;
}

export type CreateUnitInput = { name: string; parentUnitId?: string | null };

export async function createUnit(organisationId: string, input: CreateUnitInput) {
  const name = (input.name ?? "").trim();
  if (!name) return { error: "Unit name is required.", status: 400 as const };

  // Pre-flight parent checks for a friendly message (DB still enforces authoritatively).
  if (input.parentUnitId) {
    const units = await listUnits(organisationId);
    const byId = new Map<string, UnitNode>(
      units.map((u) => [u.id, { id: u.id, organisationId: u.organisation_id, parentUnitId: u.parent_unit_id }])
    );
    // A not-yet-created unit: model it as a fresh id for the containment check.
    byId.set("__new__", { id: "__new__", organisationId, parentUnitId: input.parentUnitId });
    const check = validateContainment(byId, "__new__", organisationId, input.parentUnitId);
    if (!check.ok) return { error: check.reason, status: 400 as const };
  }

  const { data, error } = await supabaseAdmin
    .from("organisation_units")
    .insert({ organisation_id: organisationId, parent_unit_id: input.parentUnitId ?? null, name })
    .select(COLS)
    .single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as UnitRow };
}

/** Re-parent within the SAME organisation. organisation_id is never sent, so the
 *  DB immutability guard is respected; the containment guard enforces the rest. */
export async function reparentUnit(unitId: string, newParentId: string | null) {
  const { data, error } = await supabaseAdmin
    .from("organisation_units")
    .update({ parent_unit_id: newParentId })
    .eq("id", unitId)
    .is("deleted_at", null)
    .select(COLS)
    .single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as UnitRow };
}

/** Edit the Unit's display name. Writing organisation_units.name is rerouted by the
 *  DB (migration 151) into a CORRECTION of the Unit's primary canonical Name — i.e.
 *  canonical Name semantics, no fabricated history. */
export async function renameUnit(unitId: string, newName: string) {
  const name = (newName ?? "").trim();
  if (!name) return { error: "Unit name is required.", status: 400 as const };
  const { data, error } = await supabaseAdmin
    .from("organisation_units").update({ name }).eq("id", unitId).is("deleted_at", null)
    .select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as UnitRow };
}

/** Soft-delete a Unit (existing convention). Blocked while live child units exist. */
export async function softDeleteUnit(unitId: string, deletedBy: string) {
  const { count } = await supabaseAdmin
    .from("organisation_units").select("id", { count: "exact", head: true })
    .eq("parent_unit_id", unitId).is("deleted_at", null);
  if ((count ?? 0) > 0) {
    return { error: `This unit still contains ${count} sub-unit(s). Remove or re-parent them first.`, status: 409 as const };
  }
  const { error } = await supabaseAdmin
    .from("organisation_units")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
    .eq("id", unitId);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}

export async function restoreUnit(unitId: string) {
  const { data, error } = await supabaseAdmin
    .from("organisation_units").update({ deleted_at: null, deleted_by: null }).eq("id", unitId)
    .select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as UnitRow };
}
