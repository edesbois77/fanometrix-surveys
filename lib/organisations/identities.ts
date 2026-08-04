// ORG-004 BP-03 / IC-05 — Organisational Identity service (R03). Identity is a distinct,
// durable, optional and multiple record ASSOCIATED with an Organisation (not an IC-01
// subject). Correction edits in place (no fabricated history); a represented-world change
// commences/ceases/replaces via half-open Effective Applicability. DB (migration 154) is
// authoritative. No status/legal/evidence/duplicate/uncertain-temporal/proposal semantics.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapOrgDbError } from "./db-errors";
import { isValidEffectiveInterval } from "./bp03";

export type IdentityRow = {
  id: string; organisation_id: string; label: string; descriptor: string | null;
  effective_from: string | null; effective_to: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
};

const COLS = "id, organisation_id, label, descriptor, effective_from, effective_to, created_at, updated_at, deleted_at";
const today = () => new Date().toISOString().slice(0, 10);

export async function listIdentities(organisationId: string): Promise<IdentityRow[]> {
  const { data, error } = await supabaseAdmin.from("organisation_identities").select(COLS)
    .eq("organisation_id", organisationId).is("deleted_at", null)
    .order("effective_from", { ascending: true, nullsFirst: true }).order("label", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as IdentityRow[];
}

type IdentityAttrs = {
  label: string; descriptor?: string | null; effectiveFrom?: string | null; effectiveTo?: string | null;
};

function validate(a: Partial<IdentityAttrs>): string | null {
  if (a.label !== undefined && !String(a.label).trim()) return "Identity label cannot be blank.";
  if (!isValidEffectiveInterval({ effectiveFrom: a.effectiveFrom ?? null, effectiveTo: a.effectiveTo ?? null }))
    return "The end date must be after the start date (half-open [from, to); no same-day interval).";
  return null;
}

/** Commence a new Identity for an Organisation (FR-001/004; optional + multiple). */
export async function createIdentity(organisationId: string, a: IdentityAttrs) {
  const v = validate(a);
  if (v) return { error: v, status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_identities").insert({
    organisation_id: organisationId, label: a.label.trim(), descriptor: a.descriptor?.trim() || null,
    effective_from: a.effectiveFrom ?? null, effective_to: a.effectiveTo ?? null,
  }).select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as IdentityRow };
}

/** CORRECTION: edit an Identity's own information in place — no fabricated history,
 *  no effect on the Organisation (FR-015/016/017). */
export async function correctIdentity(id: string, patch: Partial<IdentityAttrs>) {
  const v = validate(patch);
  if (v) return { error: v, status: 400 as const };
  const upd: Record<string, unknown> = {};
  if (patch.label !== undefined) upd.label = String(patch.label).trim();
  if (patch.descriptor !== undefined) upd.descriptor = patch.descriptor?.trim() || null;
  if (patch.effectiveFrom !== undefined) upd.effective_from = patch.effectiveFrom;
  if (patch.effectiveTo !== undefined) upd.effective_to = patch.effectiveTo;
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_identities").update(upd)
    .eq("id", id).is("deleted_at", null).select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as IdentityRow };
}

/** CESSATION: close the Identity's Effective Applicability at a date (default today).
 *  A represented-world change, distinct from correction (FR-012). */
export async function ceaseIdentity(id: string, effectiveTo?: string) {
  const { data, error } = await supabaseAdmin.from("organisation_identities")
    .update({ effective_to: effectiveTo ?? today() }).eq("id", id).is("deleted_at", null).select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as IdentityRow };
}

/** REPLACEMENT: cease the current Identity at the transition date and commence a new one
 *  from that date, preserving the earlier Identity as history (FR-012). */
export async function replaceIdentity(oldId: string, organisationId: string, a: IdentityAttrs, transitionDate: string) {
  if (!transitionDate) return { error: "A transition date is required.", status: 400 as const };
  const v = validate({ ...a, effectiveFrom: transitionDate });
  if (v) return { error: v, status: 400 as const };
  const ceased = await ceaseIdentity(oldId, transitionDate);
  if ("error" in ceased) return ceased;
  return createIdentity(organisationId, { ...a, effectiveFrom: transitionDate });
}

/** Retire an erroneously-recorded Identity (soft-delete) — distinct from cessation. */
export async function retireIdentity(id: string, deletedBy: string) {
  const { error } = await supabaseAdmin.from("organisation_identities")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy }).eq("id", id);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}
