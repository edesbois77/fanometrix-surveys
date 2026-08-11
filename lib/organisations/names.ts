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
 *  goes through correctPrimaryName (a correction) or recordNameChange (a genuine change). */
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

/** CORRECTION of a subject's CURRENT PRIMARY canonical Name value (ORG-006 WP-03).
 *  The governed canonical write path for an administrative "edit this name" action:
 *  it resolves the subject's active primary Name fact and applies correctName to it
 *  (in-place, NO fabricated history — a correction, NOT a represented-world change,
 *  which remains recordNameChange). The DB projection (migration 151) keeps the
 *  compatibility organisations.name / organisation_units.name column in step. This
 *  exists so administrative name edits never write the compatibility/core projection
 *  directly as the canonical semantic path. Never seeds a primary: a subject with no
 *  primary is a data-integrity condition surfaced as an error, not silently created. */
export async function correctPrimaryName(subjectId: string, value: string) {
  const v = (value ?? "").trim();
  if (!v) return { error: "Name value cannot be blank.", status: 400 as const };
  const { data: primary } = await supabaseAdmin.from("organisation_names")
    .select("id, value").eq("subject_id", subjectId).eq("is_primary", true).is("deleted_at", null).maybeSingle();
  const prev = primary as { id: string; value: string } | null;
  if (!prev) return { error: "No primary canonical Name to correct.", status: 409 as const };
  if (prev.value === v) return { data: { id: prev.id, value: v, unchanged: true } };
  return correctName(prev.id, { value: v });
}

/** GENUINE CHANGE: close the current primary at the transition date (exclusive end) and
 *  open a new primary from that date (inclusive start), preserving the earlier Name as
 *  history.
 *
 *  ORG-007 CF-001 (NFR-004) — the close→open is performed ATOMICALLY by the
 *  record_organisation_name_change RPC (migration 177): both writes commit together or
 *  not at all, so an interruption can never leave the subject without an active primary
 *  Name. This replaces the former non-transactional close→insert + best-effort (itself
 *  fallible) revert, which had a partial-state window. The pre-flight read below is only
 *  for the friendly half-open validation message; the RPC re-resolves and locks the
 *  current primary itself, so it remains correct under concurrent changes. */
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

  // Atomic close-current-primary → open-new-primary (migration 177). No partial state,
  // no revert path: any failure rolls the whole operation back in the database.
  const { data, error } = await supabaseAdmin.rpc("record_organisation_name_change", {
    p_subject_id: subjectId,
    p_subject_kind: subjectKind,
    p_value: value,
    p_name_form: extras?.nameForm ?? "display",
    p_language: extras?.language ?? null,
    p_script: extras?.script ?? null,
    p_transition_date: transitionDate,
  });
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as NameRow };
}

/** Retire (soft-delete) a Name fact. */
export async function retireName(nameId: string, deletedBy: string) {
  const { error } = await supabaseAdmin.from("organisation_names")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy }).eq("id", nameId);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}
