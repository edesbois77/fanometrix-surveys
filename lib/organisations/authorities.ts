// ORG-004 BP-05 / IC-09 - Organisational Authority service (R07). Authority is a NON-FIRST-CLASS
// canonical fact: an eligible actor (holder) empowered to act for an Organisation (principal)
// within a scope, subject to material constraints, with the Authority fact's OWN half-open
// Effective Applicability, optionally referencing established bases. The database (migrations
// 161-162) is authoritative for structural integrity; this layer validates inputs, composes
// FR-013 determinations over persisted facts, and translates DB failures into clear messages.
//
// PRESERVED HOLDER DEPENDENCY (control determination J-1; R07 FR-002; BE-01): holder eligibility
// is externally governed by `authority_eligible_holder_kinds` (SEEDED EMPTY). This service NEVER
// admits a holder kind and NEVER fabricates a holder. While no kind is admitted, the database
// guard rejects every Authority insert, so actual Authority instances are unavailable - exactly as
// BP-04 preserved office-holding. This service surfaces that unavailability; it does not bypass it.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapOrgDbError } from "./db-errors";
import {
  isValidEffectiveInterval, isAuthorityConstraintType, isAuthorityBasisKind, isInternalBasisKind,
  composeAuthorityDetermination, type ConstraintEvaluation,
} from "./bp05";

const today = () => new Date().toISOString().slice(0, 10);

export type AuthorityConstraintRow = { id: string; authority_id: string; constraint_type: string; descriptor: string };
export type AuthorityBasisRow = {
  id: string; authority_id: string; basis_kind: string;
  basis_office_id: string | null; basis_relationship_id: string | null; basis_external_ref: string | null; note: string | null;
};
export type AuthorityRow = {
  id: string; holder_subject_id: string; holder_subject_kind: string;
  organisation_id: string; organisation_unit_id: string | null; scope: string;
  effective_from: string | null; effective_to: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
};
export type AuthorityWithChildren = AuthorityRow & { constraints: AuthorityConstraintRow[]; bases: AuthorityBasisRow[] };

const AUTH_COLS = "id, holder_subject_id, holder_subject_kind, organisation_id, organisation_unit_id, scope, effective_from, effective_to, created_at, updated_at, deleted_at";
const CONSTRAINT_COLS = "id, authority_id, constraint_type, descriptor";
const BASIS_COLS = "id, authority_id, basis_kind, basis_office_id, basis_relationship_id, basis_external_ref, note";

// ── Eligible holder kinds (externally governed; SEEDED EMPTY) ─────────────────────
/** The admitted eligible holder kinds. Empty in production: Authority instances are unavailable
 *  until an eligible holder kind is admitted under an architecture that establishes its eligibility.
 *  This service reads the registry; it must NEVER write to it (holder eligibility is external). */
export async function listAdmittedHolderKinds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin.from("authority_eligible_holder_kinds").select("kind").order("kind");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.kind as string);
}

// ── Authority facts ──────────────────────────────────────────────────────────────
export async function listAuthoritiesForOrganisation(organisationId: string): Promise<AuthorityWithChildren[]> {
  const { data: auths, error } = await supabaseAdmin.from("organisation_authorities")
    .select(AUTH_COLS).eq("organisation_id", organisationId).is("deleted_at", null).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (auths ?? []) as AuthorityRow[];
  if (rows.length === 0) return [];
  const ids = rows.map((a) => a.id);
  const [{ data: cons, error: e2 }, { data: bases, error: e3 }] = await Promise.all([
    supabaseAdmin.from("organisation_authority_constraints").select(CONSTRAINT_COLS).in("authority_id", ids),
    supabaseAdmin.from("organisation_authority_bases").select(BASIS_COLS).in("authority_id", ids),
  ]);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);
  const cByA = new Map<string, AuthorityConstraintRow[]>();
  for (const c of (cons ?? []) as AuthorityConstraintRow[]) { const l = cByA.get(c.authority_id) ?? []; l.push(c); cByA.set(c.authority_id, l); }
  const bByA = new Map<string, AuthorityBasisRow[]>();
  for (const b of (bases ?? []) as AuthorityBasisRow[]) { const l = bByA.get(b.authority_id) ?? []; l.push(b); bByA.set(b.authority_id, l); }
  return rows.map((a) => ({ ...a, constraints: cByA.get(a.id) ?? [], bases: bByA.get(a.id) ?? [] }));
}

export async function getAuthority(authorityId: string): Promise<AuthorityRow | null> {
  const { data, error } = await supabaseAdmin.from("organisation_authorities").select(AUTH_COLS).eq("id", authorityId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as AuthorityRow | null;
}

type CreateAuthorityAttrs = {
  holderSubjectId: string; holderSubjectKind: string;
  organisationId: string; organisationUnitId?: string | null; scope: string;
  effectiveFrom?: string | null; effectiveTo?: string | null;
};

/** Record an Authority fact. Input validation is enforced here; holder eligibility, principal FK,
 *  unit-belongs-to-principal and applicability ordering are enforced by the DATABASE (migration 161).
 *  While no holder kind is admitted, the DB eligibility guard rejects this insert (surfaced as a
 *  409 with the guard's message). This function admits NOTHING and fabricates NO holder. */
export async function createAuthority(a: CreateAuthorityAttrs) {
  if (!a.holderSubjectId?.trim() || !a.holderSubjectKind?.trim())
    return { error: "A holder (subject id + kind) is required. Holder eligibility is externally governed; no holder kind is admitted, so Authority instances are currently unavailable.", status: 409 as const };
  if (!a.organisationId?.trim()) return { error: "A principal organisation is required.", status: 400 as const };
  if (!a.scope?.trim()) return { error: "A scope is required.", status: 400 as const };
  if (!isValidEffectiveInterval({ effectiveFrom: a.effectiveFrom ?? null, effectiveTo: a.effectiveTo ?? null }))
    return { error: "The authority end date must be after the start date.", status: 400 as const };

  const { data, error } = await supabaseAdmin.from("organisation_authorities").insert({
    holder_subject_id: a.holderSubjectId.trim(), holder_subject_kind: a.holderSubjectKind.trim(),
    organisation_id: a.organisationId.trim(), organisation_unit_id: a.organisationUnitId ?? null,
    scope: a.scope.trim(), effective_from: a.effectiveFrom ?? null, effective_to: a.effectiveTo ?? null,
  }).select(AUTH_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as AuthorityRow };
}

/** Correct an Authority in place (scope/applicability). A correction restates the same fact; it is
 *  distinct from a represented-world change (which is a cessation + a new fact). */
export async function correctAuthority(authorityId: string, patch: { scope?: string; effectiveFrom?: string | null; effectiveTo?: string | null }) {
  const upd: Record<string, unknown> = {};
  if (patch.scope !== undefined) { if (!patch.scope.trim()) return { error: "Scope cannot be blank.", status: 400 as const }; upd.scope = patch.scope.trim(); }
  if (patch.effectiveFrom !== undefined) upd.effective_from = patch.effectiveFrom;
  if (patch.effectiveTo !== undefined) upd.effective_to = patch.effectiveTo;
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_authorities").update(upd).eq("id", authorityId).is("deleted_at", null).select(AUTH_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as AuthorityRow };
}

/** Cease the Authority's applicability (represented-world end). Not a deletion; kept as history. */
export async function ceaseAuthority(authorityId: string, effectiveTo?: string) {
  const { data, error } = await supabaseAdmin.from("organisation_authorities").update({ effective_to: effectiveTo ?? today() })
    .eq("id", authorityId).is("deleted_at", null).select(AUTH_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as AuthorityRow };
}

/** Retire an Authority recorded in error (soft-delete). */
export async function retireAuthority(authorityId: string, deletedBy: string) {
  const { error } = await supabaseAdmin.from("organisation_authorities")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy }).eq("id", authorityId);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}

// ── Material constraints (FR-004/011) ────────────────────────────────────────────
export async function addConstraint(authorityId: string, constraintType: string, descriptor: string) {
  if (!isAuthorityConstraintType(constraintType)) return { error: "Unknown constraint type.", status: 400 as const };
  if (!descriptor?.trim()) return { error: "A constraint descriptor is required.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_authority_constraints")
    .insert({ authority_id: authorityId, constraint_type: constraintType, descriptor: descriptor.trim() }).select(CONSTRAINT_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as AuthorityConstraintRow };
}

export async function removeConstraint(constraintId: string) {
  const { error } = await supabaseAdmin.from("organisation_authority_constraints").delete().eq("id", constraintId);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}

// ── Basis references (FR-015/016/017) - internal consumed by reference; external reference-only ──
type AddBasisAttrs = { basisKind: string; officeId?: string | null; relationshipId?: string | null; externalRef?: string | null; note?: string | null };
export async function addBasis(authorityId: string, a: AddBasisAttrs) {
  if (!isAuthorityBasisKind(a.basisKind)) return { error: "Unknown basis kind.", status: 400 as const };
  const internal = isInternalBasisKind(a.basisKind);
  // Shape mirrors the DB ref-shape CHECK (migration 162); the DB remains authoritative.
  if (internal) {
    if (a.basisKind === "office" && !a.officeId) return { error: "An office reference is required for an office basis.", status: 400 as const };
    if (a.basisKind === "relationship" && !a.relationshipId) return { error: "A relationship reference is required for a relationship basis.", status: 400 as const };
  } else if (!a.externalRef?.trim()) {
    return { error: "An external reference is required for this basis kind.", status: 400 as const };
  }
  const { data, error } = await supabaseAdmin.from("organisation_authority_bases").insert({
    authority_id: authorityId, basis_kind: a.basisKind,
    basis_office_id: a.basisKind === "office" ? a.officeId : null,
    basis_relationship_id: a.basisKind === "relationship" ? a.relationshipId : null,
    basis_external_ref: internal ? null : (a.externalRef?.trim() ?? null),
    note: a.note?.trim() || null,
  }).select(BASIS_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as AuthorityBasisRow };
}

export async function removeBasis(basisId: string) {
  const { error } = await supabaseAdmin.from("organisation_authority_bases").delete().eq("id", basisId);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}

// ── FR-013 determination over a persisted Authority fact ─────────────────────────
/** Compose a holder-empowered-for-a-target determination for a persisted Authority. Scope in/out
 *  is a deterministic caller input (R07 authors no universal scope ontology); each material
 *  constraint's evaluation is likewise supplied. Interpretation only - persists nothing. */
export async function determineAuthority(authorityId: string, input: {
  on?: string; withinScope: boolean | "unknown"; constraintEvaluations?: ConstraintEvaluation[];
}) {
  const auth = await getAuthority(authorityId);
  if (!auth || auth.deleted_at) return { error: "Authority not found.", status: 404 as const };
  const result = composeAuthorityDetermination({
    interval: { effectiveFrom: auth.effective_from, effectiveTo: auth.effective_to },
    on: input.on ?? today(),
    withinScope: input.withinScope,
    constraintEvaluations: input.constraintEvaluations ?? [],
  });
  return { data: { authorityId, ...result } };
}
