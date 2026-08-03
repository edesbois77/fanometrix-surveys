// ORG-004 BP-02 / IC-04 — Canonical Name service. Canonical Names are authoritative;
// organisations.name / organisation_units.name are one-way projections maintained by
// the DB (migration 151). Half-open Effective Applicability [from, to). Correction vs
// genuine change is explicit here (§6/§15).
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapOrgDbError } from "./db-errors";
import { isEligibleFactSubjectKind, isValidEffectiveInterval, type FactSubjectKind } from "./bp02";

export type NameRow = {
  id: string; subject_id: string; subject_kind: FactSubjectKind;
  value: string; name_form: string; language: string | null; script: string | null;
  is_primary: boolean; effective_from: string | null; effective_to: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
};

const COLS = "id, subject_id, subject_kind, value, name_form, language, script, is_primary, effective_from, effective_to, created_at, updated_at, deleted_at";
export const NAME_FORMS = ["display", "legal", "trading", "short", "other"] as const;

export async function listNames(subjectId: string): Promise<NameRow[]> {
  const { data, error } = await supabaseAdmin
    .from("organisation_names").select(COLS).eq("subject_id", subjectId).is("deleted_at", null)
    .order("is_primary", { ascending: false }).order("effective_from", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as NameRow[];
}

type NameAttrs = {
  value: string; nameForm?: string; language?: string | null; script?: string | null;
  effectiveFrom?: string | null; effectiveTo?: string | null;
};

function validateAttrs(a: Partial<NameAttrs>): string | null {
  if (a.value !== undefined && !String(a.value).trim()) return "Name value cannot be blank.";
  if (a.nameForm !== undefined && !(NAME_FORMS as readonly string[]).includes(a.nameForm)) return "Invalid name form.";
  const from = a.effectiveFrom ?? null, to = a.effectiveTo ?? null;
  if ((from !== undefined || to !== undefined) && !isValidEffectiveInterval({ effectiveFrom: from, effectiveTo: to }))
    return "The end date must be after the start date (half-open [from, to); no same-day interval).";
  return null;
}

/** Add an additional (non-primary) canonical Name. Changing the display/primary name
 *  goes through changePrimaryName (a correction) or recordNameChange (a genuine change). */
export async function addName(subjectId: string, subjectKind: string, attrs: NameAttrs) {
  if (!isEligibleFactSubjectKind(subjectKind)) return { error: "Subject must be an organisation or unit.", status: 400 as const };
  const v = validateAttrs(attrs);
  if (v) return { error: v, status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_names").insert({
    subject_id: subjectId, subject_kind: subjectKind, value: attrs.value.trim(),
    name_form: attrs.nameForm ?? "display", language: attrs.language ?? null, script: attrs.script ?? null,
    is_primary: false, effective_from: attrs.effectiveFrom ?? null, effective_to: attrs.effectiveTo ?? null,
  }).select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as NameRow };
}

/** CORRECTION: edit an existing Name fact in place. Does NOT fabricate history. If the
 *  fact is the primary, the DB projection updates the legacy display column. */
export async function correctName(nameId: string, patch: Partial<NameAttrs>) {
  const v = validateAttrs(patch);
  if (v) return { error: v, status: 400 as const };
  const upd: Record<string, unknown> = {};
  if (patch.value !== undefined) upd.value = String(patch.value).trim();
  if (patch.nameForm !== undefined) upd.name_form = patch.nameForm;
  if (patch.language !== undefined) upd.language = patch.language;
  if (patch.script !== undefined) upd.script = patch.script;
  if (patch.effectiveFrom !== undefined) upd.effective_from = patch.effectiveFrom;
  if (patch.effectiveTo !== undefined) upd.effective_to = patch.effectiveTo;
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_names").update(upd)
    .eq("id", nameId).is("deleted_at", null).select(COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as NameRow };
}

/** GENUINE CHANGE: close the current primary at the transition date (exclusive end) and
 *  open a new primary from that date (inclusive start). Preserves the earlier Name as
 *  history. Ordered (close→open) to respect the one-primary index; reverts on failure. */
export async function recordNameChange(
  subjectId: string, subjectKind: string, newValue: string, transitionDate: string,
  extras?: { nameForm?: string; language?: string | null; script?: string | null }
) {
  if (!isEligibleFactSubjectKind(subjectKind)) return { error: "Subject must be an organisation or unit.", status: 400 as const };
  const value = (newValue ?? "").trim();
  if (!value) return { error: "New name value is required.", status: 400 as const };
  if (!transitionDate) return { error: "A transition date is required for a name change.", status: 400 as const };

  const { data: primary } = await supabaseAdmin.from("organisation_names").select(COLS)
    .eq("subject_id", subjectId).eq("is_primary", true).is("deleted_at", null).maybeSingle();
  const prev = primary as NameRow | null;

  // Half-open guard: closing at T must not create a zero-length [from, T) interval.
  if (prev && prev.effective_from !== null && prev.effective_from >= transitionDate) {
    return { error: "The transition date must be after the current name's start date.", status: 400 as const };
  }

  if (prev) {
    const { error: closeErr } = await supabaseAdmin.from("organisation_names")
      .update({ is_primary: false, effective_to: transitionDate }).eq("id", prev.id);
    if (closeErr) { const m = mapOrgDbError(closeErr); return { error: m.message, status: m.status }; }
  }

  const { data, error } = await supabaseAdmin.from("organisation_names").insert({
    subject_id: subjectId, subject_kind: subjectKind, value, name_form: extras?.nameForm ?? "display",
    language: extras?.language ?? null, script: extras?.script ?? null,
    is_primary: true, effective_from: transitionDate, effective_to: null,
  }).select(COLS).single();

  if (error) {
    // Best-effort revert so the subject is never left without a primary.
    if (prev) await supabaseAdmin.from("organisation_names")
      .update({ is_primary: true, effective_to: null }).eq("id", prev.id);
    const m = mapOrgDbError(error); return { error: m.message, status: m.status };
  }
  return { data: data as NameRow };
}

/** Retire (soft-delete) a Name fact. */
export async function retireName(nameId: string, deletedBy: string) {
  const { error } = await supabaseAdmin.from("organisation_names")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy }).eq("id", nameId);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}
