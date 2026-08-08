// ORG-005 · IW-11 / DEC-2 — governed Insight organisation-ID association.
//
// Insight restricted-access is authored by GOVERNED organisation identity
// (allowed_organisation_ids: uuid[]), never by organisation-name tags (F033
// retired). This validates the authoring input against real Organisation ids so
// the governed association is established and maintained directly at write time.
// `tags` retain only a descriptive purpose and no longer confer authorisation.
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AllowedOrgValidation = { ok: true; ids: string[] } | { ok: false; error: string };

/** Validate an authoring `allowed_organisation_ids` value: absent/null → []; else
 *  it must be an array of ids that all resolve to real Organisations. */
export async function validateAllowedOrganisationIds(raw: unknown): Promise<AllowedOrgValidation> {
  if (raw == null) return { ok: true, ids: [] };
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) {
    return { ok: false, error: "allowed_organisation_ids must be an array of organisation ids" };
  }
  const ids = [...new Set(raw as string[])];
  if (ids.length === 0) return { ok: true, ids: [] };
  const { data } = await supabaseAdmin.from("organisations").select("id").in("id", ids);
  const valid = new Set((data ?? []).map((o) => o.id as string));
  const invalid = ids.filter((id) => !valid.has(id));
  if (invalid.length) return { ok: false, error: `Unknown organisation id(s): ${invalid.join(", ")}` };
  return { ok: true, ids };
}
