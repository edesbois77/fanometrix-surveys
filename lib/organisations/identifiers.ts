// ORG-004 BP-02 / IC-04 — Identifier service. Designation + required identifying
// context (scheme; optional authority/namespace as attributes — NOT first-class
// concepts). No designation-only global uniqueness. Technical UUIDs are never
// Identifiers. Half-open applicability. DB (migration 152) is authoritative.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapOrgDbError } from "./db-errors";
import { isEligibleFactSubjectKind, isValidEffectiveInterval, type FactSubjectKind } from "./bp02";

export type IdentifierRow = {
  id: string; subject_id: string; subject_kind: FactSubjectKind;
  scheme: string; designation: string; authority: string | null; namespace: string | null;
  effective_from: string | null; effective_to: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
};

const COLS = "id, subject_id, subject_kind, scheme, designation, authority, namespace, effective_from, effective_to, created_at, updated_at, deleted_at";
const today = () => new Date().toISOString().slice(0, 10);

export async function listIdentifiers(subjectId: string): Promise<IdentifierRow[]> {
  const { data, error } = await supabaseAdmin.from("organisation_identifiers").select(COLS)
    .eq("subject_id", subjectId).is("deleted_at", null)
    .order("scheme", { ascending: true }).order("designation", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as IdentifierRow[];
}

type IdAttrs = {
  scheme: string; designation: string; authority?: string | null; namespace?: string | null;
  effectiveFrom?: string | null; effectiveTo?: string | null;
};

export async function addIdentifier(subjectId: string, subjectKind: string, a: IdAttrs) {
  if (!isEligibleFactSubjectKind(subjectKind)) return { error: "Subject must be an organisation or unit.", status: 400 as const };
  if (!a.scheme?.trim()) return { error: "A scheme/context is required — a designation alone is not meaningful.", status: 400 as const };
  if (!a.designation?.trim()) return { error: "A designation is required.", status: 400 as const };
  if (!isValidEffectiveInterval({ effectiveFrom: a.effectiveFrom ?? null, effectiveTo: a.effectiveTo ?? null }))
    return { error: "The end date must be after the start date.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_identifiers").insert({
    subject_id: subjectId, subject_kind: subjectKind, scheme: a.scheme.trim(), designation: a.designation.trim(),
    authority: a.authority?.trim() || null, namespace: a.namespace?.trim() || null,
    effective_from: a.effectiveFrom ?? null, effective_to: a.effectiveTo ?? null,
  }).select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as IdentifierRow };
}

export async function correctIdentifier(id: string, patch: Partial<IdAttrs>) {
  const upd: Record<string, unknown> = {};
  if (patch.scheme !== undefined) { if (!patch.scheme.trim()) return { error: "Scheme cannot be blank.", status: 400 as const }; upd.scheme = patch.scheme.trim(); }
  if (patch.designation !== undefined) { if (!patch.designation.trim()) return { error: "Designation cannot be blank.", status: 400 as const }; upd.designation = patch.designation.trim(); }
  if (patch.authority !== undefined) upd.authority = patch.authority?.trim() || null;
  if (patch.namespace !== undefined) upd.namespace = patch.namespace?.trim() || null;
  if (patch.effectiveFrom !== undefined) upd.effective_from = patch.effectiveFrom;
  if (patch.effectiveTo !== undefined) upd.effective_to = patch.effectiveTo;
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_identifiers").update(upd)
    .eq("id", id).is("deleted_at", null).select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as IdentifierRow };
}

/** Retire: close applicability at today (half-open, so not applicable today). The DB
 *  CHECK rejects a zero-length interval if it started today — mapped to a clear error. */
export async function retireIdentifier(id: string) {
  const { data, error } = await supabaseAdmin.from("organisation_identifiers")
    .update({ effective_to: today() }).eq("id", id).is("deleted_at", null).select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as IdentifierRow };
}

export async function deleteIdentifier(id: string, deletedBy: string) {
  const { error } = await supabaseAdmin.from("organisation_identifiers")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy }).eq("id", id);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}
