// ORG-004 BP-04 / IC-08 — Organisational Office service (R06). An Office is a first-class
// subject (registered in organisation_subjects) with half-open existence applicability and a
// separate, temporally-applicable structural attachment to its governing Organisation (and
// optionally one Unit of that Organisation). The database (migrations 158-160) is
// authoritative for structural integrity (registry admission, unit-belongs-to-governing-org);
// this layer adds the FR-010 attachment-exclusivity invariant (exactly one governing
// Organisation per applicable point) and clear errors.
//
// Office canonical Names/Identifiers/Classifications and ordinary Relationship participation
// reuse the existing BP-02/BP-03 services (offices are an admitted subject kind since BP-04
// F-3). Actual office-holding instances remain unavailable (external holder-subject dependency
// preserved; migration-160 guard) and are NOT created here.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapOrgDbError } from "./db-errors";
import { isValidEffectiveInterval, validateAttachmentExclusivity, type AttachmentInterval } from "./bp04";

const today = () => new Date().toISOString().slice(0, 10);

export type OfficeRow = {
  id: string; title: string; effective_from: string | null; effective_to: string | null;
  created_at: string; updated_at: string; deleted_at: string | null;
};
export type AttachmentRow = {
  id: string; office_id: string; governing_organisation_id: string; organisation_unit_id: string | null;
  effective_from: string | null; effective_to: string | null; deleted_at: string | null;
};

const OFFICE_COLS = "id, title, effective_from, effective_to, created_at, updated_at, deleted_at";
const ATT_COLS = "id, office_id, governing_organisation_id, organisation_unit_id, effective_from, effective_to, deleted_at";

// ── Offices ──────────────────────────────────────────────────────────────────
/** Offices whose (non-deleted) structural attachment governs the given Organisation. */
export async function listOfficesForOrganisation(organisationId: string) {
  const { data: atts, error: e1 } = await supabaseAdmin.from("organisation_office_attachments")
    .select("office_id").eq("governing_organisation_id", organisationId).is("deleted_at", null);
  if (e1) throw new Error(e1.message);
  const officeIds = Array.from(new Set((atts ?? []).map((a) => a.office_id as string)));
  if (officeIds.length === 0) return [];
  const [{ data: offices, error: e2 }, { data: allAtts, error: e3 }] = await Promise.all([
    supabaseAdmin.from("organisation_offices").select(OFFICE_COLS).in("id", officeIds).is("deleted_at", null).order("title"),
    supabaseAdmin.from("organisation_office_attachments").select(ATT_COLS).in("office_id", officeIds).is("deleted_at", null),
  ]);
  if (e2) throw new Error(e2.message);
  if (e3) throw new Error(e3.message);
  const byOffice = new Map<string, AttachmentRow[]>();
  for (const a of (allAtts ?? []) as AttachmentRow[]) {
    const list = byOffice.get(a.office_id) ?? []; list.push(a); byOffice.set(a.office_id, list);
  }
  return ((offices ?? []) as OfficeRow[]).map((o) => ({ ...o, attachments: byOffice.get(o.id) ?? [] }));
}

export async function getOffice(officeId: string) {
  const { data, error } = await supabaseAdmin.from("organisation_offices").select(OFFICE_COLS).eq("id", officeId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as OfficeRow | null;
}

type OfficeAttrs = { title: string; effectiveFrom?: string | null; effectiveTo?: string | null };

/** Create an Office and (optionally) attach it to a governing Organisation in one call. */
export async function createOffice(a: OfficeAttrs & {
  governingOrganisationId?: string; organisationUnitId?: string | null;
  attachmentFrom?: string | null; attachmentTo?: string | null;
}) {
  if (!a.title?.trim()) return { error: "Office title is required.", status: 400 as const };
  if (!isValidEffectiveInterval({ effectiveFrom: a.effectiveFrom ?? null, effectiveTo: a.effectiveTo ?? null }))
    return { error: "The office end date must be after the start date.", status: 400 as const };

  const { data: office, error } = await supabaseAdmin.from("organisation_offices")
    .insert({ title: a.title.trim(), effective_from: a.effectiveFrom ?? null, effective_to: a.effectiveTo ?? null })
    .select(OFFICE_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }

  if (a.governingOrganisationId) {
    const att = await attachOffice((office as OfficeRow).id, {
      governingOrganisationId: a.governingOrganisationId, organisationUnitId: a.organisationUnitId ?? null,
      effectiveFrom: a.attachmentFrom ?? null, effectiveTo: a.attachmentTo ?? null,
    });
    if ("error" in att) return att; // office exists but attachment failed; surface the error
  }
  return { data: office as OfficeRow };
}

export async function correctOffice(officeId: string, patch: Partial<OfficeAttrs>) {
  const upd: Record<string, unknown> = {};
  if (patch.title !== undefined) { if (!patch.title.trim()) return { error: "Title cannot be blank.", status: 400 as const }; upd.title = patch.title.trim(); }
  if (patch.effectiveFrom !== undefined) upd.effective_from = patch.effectiveFrom;
  if (patch.effectiveTo !== undefined) upd.effective_to = patch.effectiveTo;
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_offices").update(upd).eq("id", officeId).is("deleted_at", null).select(OFFICE_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as OfficeRow };
}

/** Cease the Office's existence applicability (represented-world end). */
export async function ceaseOffice(officeId: string, effectiveTo?: string) {
  const { data, error } = await supabaseAdmin.from("organisation_offices").update({ effective_to: effectiveTo ?? today() })
    .eq("id", officeId).is("deleted_at", null).select(OFFICE_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as OfficeRow };
}

export async function retireOffice(officeId: string, deletedBy: string) {
  const { error } = await supabaseAdmin.from("organisation_offices")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy }).eq("id", officeId);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}

// ── Structural attachment (FR-010/011/012/014/015) ──────────────────────────────
export async function listAttachments(officeId: string): Promise<AttachmentRow[]> {
  const { data, error } = await supabaseAdmin.from("organisation_office_attachments").select(ATT_COLS)
    .eq("office_id", officeId).is("deleted_at", null).order("effective_from", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AttachmentRow[];
}

type AttachAttrs = { governingOrganisationId: string; organisationUnitId?: string | null; effectiveFrom?: string | null; effectiveTo?: string | null };

/** Attach an Office to a governing Organisation (optionally via a Unit). Enforces FR-010:
 *  no two attachments of the same Office may apply at the same represented-world point. */
export async function attachOffice(officeId: string, a: AttachAttrs) {
  if (!a.governingOrganisationId) return { error: "A governing organisation is required.", status: 400 as const };
  const candidate = { effectiveFrom: a.effectiveFrom ?? null, effectiveTo: a.effectiveTo ?? null };
  const existing = (await listAttachments(officeId)).map<AttachmentInterval>((r) => ({ id: r.id, effectiveFrom: r.effective_from, effectiveTo: r.effective_to }));
  const check = validateAttachmentExclusivity(candidate, existing);
  if (!check.ok) return { error: check.reason, status: 409 as const };
  const { data, error } = await supabaseAdmin.from("organisation_office_attachments").insert({
    office_id: officeId, governing_organisation_id: a.governingOrganisationId,
    organisation_unit_id: a.organisationUnitId ?? null,
    effective_from: candidate.effectiveFrom, effective_to: candidate.effectiveTo,
  }).select(ATT_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as AttachmentRow };
}

/** Update an attachment (re-locate within the same governing Org, or adjust applicability),
 *  re-checking FR-010 exclusivity against the Office's other attachments. */
export async function updateAttachment(attachmentId: string, patch: Partial<AttachAttrs>) {
  const { data: current, error: e0 } = await supabaseAdmin.from("organisation_office_attachments").select(ATT_COLS).eq("id", attachmentId).maybeSingle();
  if (e0 || !current) return { error: "Attachment not found.", status: 404 as const };
  const cur = current as AttachmentRow;
  const candidate = {
    effectiveFrom: patch.effectiveFrom !== undefined ? patch.effectiveFrom : cur.effective_from,
    effectiveTo: patch.effectiveTo !== undefined ? patch.effectiveTo : cur.effective_to,
  };
  const existing = (await listAttachments(cur.office_id)).map<AttachmentInterval>((r) => ({ id: r.id, effectiveFrom: r.effective_from, effectiveTo: r.effective_to }));
  const check = validateAttachmentExclusivity(candidate, existing, attachmentId);
  if (!check.ok) return { error: check.reason, status: 409 as const };
  const upd: Record<string, unknown> = {};
  if (patch.governingOrganisationId !== undefined) upd.governing_organisation_id = patch.governingOrganisationId;
  if (patch.organisationUnitId !== undefined) upd.organisation_unit_id = patch.organisationUnitId;
  if (patch.effectiveFrom !== undefined) upd.effective_from = patch.effectiveFrom;
  if (patch.effectiveTo !== undefined) upd.effective_to = patch.effectiveTo;
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("organisation_office_attachments").update(upd).eq("id", attachmentId).is("deleted_at", null).select(ATT_COLS).single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as AttachmentRow };
}

export async function retireAttachment(attachmentId: string, deletedBy: string) {
  const { error } = await supabaseAdmin.from("organisation_office_attachments")
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy }).eq("id", attachmentId);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: { success: true } };
}
