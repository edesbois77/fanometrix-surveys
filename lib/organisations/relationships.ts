// ORG-004 BP-03 / IC-07 — Relationship service (R05). A relationship is a distinct fact
// of a governed type (intrinsic meaning) among ≥2 participants referenced through the
// IC-01 registry, with capacities/roles and half-open applicability. Membership and
// predecessor/successor lineage are relationship types on this substrate. Relationships
// grant NO platform permission; not containment/classification/office-holding/authority.
// DB (migrations 155/156) is authoritative. Creation goes through the atomic RPC so the
// ≥2 constraint validates with all participants present.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapOrgDbError } from "./db-errors";
import { isValidEffectiveInterval, validateParticipants, isRelationshipDirectionality, type ParticipantInput } from "./bp03";

const KEY_RE = /^[a-z0-9_]+$/;
const today = () => new Date().toISOString().slice(0, 10);

export type RelationshipTypeRow = { id: string; key: string; label: string; description: string | null; directionality: string; is_system: boolean };

// ── Types (the intrinsic relational meaning) ────────────────────────────────────
export async function listTypes(): Promise<RelationshipTypeRow[]> {
  const { data, error } = await supabaseAdmin.from("relationship_types")
    .select("id, key, label, description, directionality, is_system").order("label", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RelationshipTypeRow[];
}

export async function createType(a: { key: string; label: string; description?: string | null; directionality?: string }) {
  if (!KEY_RE.test(a.key ?? "")) return { error: "Type key must be lower_snake_case (a–z, 0–9, _).", status: 400 as const };
  if (!a.label?.trim()) return { error: "A type label is required.", status: 400 as const };
  if (a.directionality !== undefined && !isRelationshipDirectionality(a.directionality))
    return { error: "Directionality must be 'directed' or 'symmetric'.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("relationship_types")
    .insert({ key: a.key, label: a.label.trim(), description: a.description ?? null, directionality: a.directionality ?? "directed", is_system: false })
    .select("id, key, label, description, directionality, is_system").single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as RelationshipTypeRow };
}

export async function updateType(id: string, patch: { label?: string; description?: string | null; directionality?: string }) {
  const upd: Record<string, unknown> = {};
  if (patch.label !== undefined) { if (!patch.label.trim()) return { error: "Label cannot be blank.", status: 400 as const }; upd.label = patch.label.trim(); }
  if (patch.description !== undefined) upd.description = patch.description;
  if (patch.directionality !== undefined) {
    if (!isRelationshipDirectionality(patch.directionality)) return { error: "Directionality must be 'directed' or 'symmetric'.", status: 400 as const };
    upd.directionality = patch.directionality;
  }
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("relationship_types").update(upd).eq("id", id)
    .select("id, key, label, description, directionality, is_system").single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as RelationshipTypeRow };
}

export async function deleteType(id: string) {
  const { error } = await supabaseAdmin.from("relationship_types").delete().eq("id", id);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; } // system types → P0001
  return { data: { success: true } };
}

// ── Relationships ───────────────────────────────────────────────────────────────
const REL_SELECT = "id, type_id, descriptor, effective_from, effective_to, created_at, deleted_at, " +
  "type:relationship_types!inner(id, key, label, directionality, is_system)";

/** All relationships in which a subject participates, each with its type and participants. */
export async function listRelationshipsForSubject(subjectId: string) {
  const { data: mine, error: e1 } = await supabaseAdmin.from("organisation_relationship_participants")
    .select("relationship_id").eq("subject_id", subjectId);
  if (e1) throw new Error(e1.message);
  const relIds = Array.from(new Set((mine ?? []).map((r) => r.relationship_id as string)));
  if (relIds.length === 0) return [];
  const [{ data: rels, error: e2 }, { data: parts, error: e3 }] = await Promise.all([
    supabaseAdmin.from("organisation_relationships").select(REL_SELECT).in("id", relIds).is("deleted_at", null),
    supabaseAdmin.from("organisation_relationship_participants")
      .select("id, relationship_id, subject_id, subject_kind, participant_role").in("relationship_id", relIds),
  ]);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);
  const byRel = new Map<string, unknown[]>();
  for (const p of (parts ?? []) as Array<{ relationship_id: string }>) {
    const list = byRel.get(p.relationship_id) ?? [];
    list.push(p); byRel.set(p.relationship_id, list);
  }
  return ((rels ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({ ...r, participants: byRel.get(r.id as string) ?? [] }));
}

type CreateRelationshipInput = {
  typeId: string; descriptor?: string | null; effectiveFrom?: string | null; effectiveTo?: string | null;
  participants: ParticipantInput[];
};

/** Create a relationship with its participants atomically (RPC), so the ≥2 constraint
 *  validates once with all participants present. */
export async function createRelationship(input: CreateRelationshipInput) {
  if (!input.typeId) return { error: "A relationship type is required.", status: 400 as const };
  const structure = validateParticipants(input.participants ?? []);
  if (!structure.ok) return { error: structure.reason, status: 400 as const };
  if (!isValidEffectiveInterval({ effectiveFrom: input.effectiveFrom ?? null, effectiveTo: input.effectiveTo ?? null }))
    return { error: "The end date must be after the start date.", status: 400 as const };

  const { data: relId, error } = await supabaseAdmin.rpc("create_organisation_relationship", {
    p_type_id: input.typeId,
    p_descriptor: input.descriptor?.trim() || null,
    p_effective_from: input.effectiveFrom ?? null,
    p_effective_to: input.effectiveTo ?? null,
    p_participants: input.participants.map((p) => ({ subjectId: p.subjectId, subjectKind: p.subjectKind, role: p.role ?? null })),
  });
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { id: relId as string } };
}

/** CORRECTION: edit the relationship fact in place (type/descriptor/applicability) — FR-004/020. */
export async function correctRelationship(id: string, patch: { typeId?: string; descriptor?: string | null; effectiveFrom?: string | null; effectiveTo?: string | null }) {
  const upd: Record<string, unknown> = {};
  if (patch.typeId !== undefined) upd.type_id = patch.typeId;
  if (patch.descriptor !== undefined) upd.descriptor = patch.descriptor?.trim() || null;
  if (patch.effectiveFrom !== undefined) upd.effective_from = patch.effectiveFrom;
  if (patch.effectiveTo !== undefined) upd.effective_to = patch.effectiveTo;
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  if (patch.effectiveFrom !== undefined || patch.effectiveTo !== undefined) {
    if (!isValidEffectiveInterval({ effectiveFrom: (patch.effectiveFrom ?? null), effectiveTo: (patch.effectiveTo ?? null) }))
      return { error: "The end date must be after the start date.", status: 400 as const };
  }
  const { data, error } = await supabaseAdmin.from("organisation_relationships").update(upd)
    .eq("id", id).is("deleted_at", null).select(REL_SELECT).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data };
}

/** CESSATION: close the relationship's Effective Applicability (FR-023). */
export async function ceaseRelationship(id: string, effectiveTo?: string) {
  const { data, error } = await supabaseAdmin.from("organisation_relationships")
    .update({ effective_to: effectiveTo ?? today() }).eq("id", id).is("deleted_at", null).select(REL_SELECT).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data };
}

/** Retire an erroneously-recorded relationship (soft-delete). */
export async function retireRelationship(id: string, deletedBy: string) {
  const { error } = await supabaseAdmin.from("organisation_relationships")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy }).eq("id", id);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}
