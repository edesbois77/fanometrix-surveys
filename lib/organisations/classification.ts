// ORG-004 BP-02 / IC-04 — Classification service. Schemes → Categories → Assignments.
// Adding a category is a row insert (no migration). Memberships require a defined
// category (FK). The system scheme 'organisation_category' is legacy-mirrored from
// organisations.type, so it is managed by the DB mirror, NOT by manual assignment —
// this keeps a single source of truth. DB (migration 153) is authoritative.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapOrgDbError } from "./db-errors";
import { isEligibleFactSubjectKind, isValidEffectiveInterval } from "./bp02";

const KEY_RE = /^[a-z0-9_]+$/;
const today = () => new Date().toISOString().slice(0, 10);

export type SchemeRow = { id: string; key: string; label: string; description: string | null; is_system: boolean };
export type CategoryRow = { id: string; scheme_id: string; key: string; label: string; description: string | null; sort_order: number; is_system: boolean };

// ── Schemes ─────────────────────────────────────────────────────────────────────
export async function listSchemes(): Promise<SchemeRow[]> {
  const { data, error } = await supabaseAdmin.from("classification_schemes")
    .select("id, key, label, description, is_system").order("label", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SchemeRow[];
}

export async function createScheme(a: { key: string; label: string; description?: string | null }) {
  if (!KEY_RE.test(a.key ?? "")) return { error: "Scheme key must be lower_snake_case (a–z, 0–9, _).", status: 400 as const };
  if (!a.label?.trim()) return { error: "A scheme label is required.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("classification_schemes")
    .insert({ key: a.key, label: a.label.trim(), description: a.description ?? null, is_system: false })
    .select("id, key, label, description, is_system").single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as SchemeRow };
}

export async function updateScheme(id: string, patch: { label?: string; description?: string | null }) {
  const upd: Record<string, unknown> = {};
  if (patch.label !== undefined) { if (!patch.label.trim()) return { error: "Label cannot be blank.", status: 400 as const }; upd.label = patch.label.trim(); }
  if (patch.description !== undefined) upd.description = patch.description;
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("classification_schemes").update(upd).eq("id", id)
    .select("id, key, label, description, is_system").single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as SchemeRow };
}

export async function deleteScheme(id: string) {
  const { error } = await supabaseAdmin.from("classification_schemes").delete().eq("id", id);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; } // system schemes → P0001
  return { data: { success: true } };
}

// ── Categories ────────────────────────────────────────────────────────────────
export async function listCategories(schemeId: string): Promise<CategoryRow[]> {
  const { data, error } = await supabaseAdmin.from("classification_categories")
    .select("id, scheme_id, key, label, description, sort_order, is_system").eq("scheme_id", schemeId)
    .order("sort_order", { ascending: true }).order("label", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CategoryRow[];
}

/** Add a category to a scheme — no schema migration required (§12). */
export async function createCategory(schemeId: string, a: { key: string; label: string; description?: string | null; sortOrder?: number }) {
  if (!KEY_RE.test(a.key ?? "")) return { error: "Category key must be lower_snake_case (a–z, 0–9, _).", status: 400 as const };
  if (!a.label?.trim()) return { error: "A category label is required.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("classification_categories")
    .insert({ scheme_id: schemeId, key: a.key, label: a.label.trim(), description: a.description ?? null, sort_order: a.sortOrder ?? 0, is_system: false })
    .select("id, scheme_id, key, label, description, sort_order, is_system").single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as CategoryRow };
}

export async function updateCategory(id: string, patch: { label?: string; description?: string | null; sortOrder?: number }) {
  const upd: Record<string, unknown> = {};
  if (patch.label !== undefined) { if (!patch.label.trim()) return { error: "Label cannot be blank.", status: 400 as const }; upd.label = patch.label.trim(); }
  if (patch.description !== undefined) upd.description = patch.description;
  if (patch.sortOrder !== undefined) upd.sort_order = patch.sortOrder;
  if (Object.keys(upd).length === 0) return { error: "Nothing to update.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("classification_categories").update(upd).eq("id", id)
    .select("id, scheme_id, key, label, description, sort_order, is_system").single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data: data as CategoryRow };
}

export async function deleteCategory(id: string) {
  const { error } = await supabaseAdmin.from("classification_categories").delete().eq("id", id);
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; } // system categories → P0001
  return { data: { success: true } };
}

// ── Assignments ───────────────────────────────────────────────────────────────
const ASSIGN_SELECT =
  "id, subject_id, subject_kind, effective_from, effective_to, created_at, deleted_at, " +
  "category:classification_categories!inner(id, key, label, is_system, scheme:classification_schemes!inner(id, key, label, is_system))";

export async function listAssignments(subjectId: string) {
  const { data, error } = await supabaseAdmin.from("classification_assignments")
    .select(ASSIGN_SELECT).eq("subject_id", subjectId).is("deleted_at", null)
    .order("effective_from", { ascending: true, nullsFirst: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function categoryScheme(categoryId: string) {
  const { data } = await supabaseAdmin.from("classification_categories")
    .select("id, scheme:classification_schemes!inner(is_system)").eq("id", categoryId).maybeSingle();
  return data as { id: string; scheme: { is_system: boolean } } | null;
}

/** Assign a category. System schemes (organisation_category) are mirror-managed, so
 *  manual assignment there is refused — change the organisation's type instead. */
export async function assignCategory(
  subjectId: string, subjectKind: string, categoryId: string,
  applicability?: { effectiveFrom?: string | null; effectiveTo?: string | null }
) {
  if (!isEligibleFactSubjectKind(subjectKind)) return { error: "Subject must be an organisation or unit.", status: 400 as const };
  const cat = await categoryScheme(categoryId);
  if (!cat) return { error: "That category does not exist.", status: 400 as const };
  if (cat.scheme.is_system) return { error: "This is a system scheme managed automatically from the organisation's type; change the type instead.", status: 409 as const };
  const from = applicability?.effectiveFrom ?? null, to = applicability?.effectiveTo ?? null;
  if (!isValidEffectiveInterval({ effectiveFrom: from, effectiveTo: to }))
    return { error: "The end date must be after the start date.", status: 400 as const };
  const { data, error } = await supabaseAdmin.from("classification_assignments")
    .insert({ subject_id: subjectId, subject_kind: subjectKind, category_id: categoryId, effective_from: from, effective_to: to })
    .select("id, subject_id, category_id, effective_from, effective_to").single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data };
}

/** Retire a non-system assignment by closing applicability at today (half-open). */
export async function retireAssignment(id: string) {
  const { data: row } = await supabaseAdmin.from("classification_assignments")
    .select("id, category:classification_categories!inner(scheme:classification_schemes!inner(is_system))").eq("id", id).maybeSingle();
  const rec = row as { category: { scheme: { is_system: boolean } } } | null;
  if (rec?.category?.scheme?.is_system) return { error: "System-scheme assignments are managed automatically; change the organisation's type instead.", status: 409 as const };
  const { data, error } = await supabaseAdmin.from("classification_assignments")
    .update({ effective_to: today() }).eq("id", id).is("deleted_at", null)
    .select("id, effective_from, effective_to").single();
  if (error) { const m = mapOrgDbError(error); return { error: m.message, status: m.status }; }
  return { data };
}
