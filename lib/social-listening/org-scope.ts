// ORG-006 WP-02 (IS-02) — Social Listening Organisation scoping.
//
// These helpers scope ordinary Social Listening operations to the platform-owned
// Current Organisation. They CONSUME the WP-01 Current Organisation (an authenticated
// caller's AuthedUser.organisationId, resolved by requireUser); they introduce NO
// independent Social-Listening Organisation-context mechanism — they only filter the
// existing SL data by the already-resolved Current Organisation.
//
// social_searches is the ownership root (migration 176 adds social_searches.organisation_id).
// Dependent records (mentions, reports, runs, keywords, observations, summaries) inherit
// scope through search_id, so scoping resolves to "which searches does this Organisation own".
//
// Governed rules:
//   • Legacy rows with organisation_id = NULL are NOT a shared/global scope — they are
//     EXCLUDED from every Organisation-scoped result (NULL never equals an Organisation).
//   • Simulated (Product Walkthrough) searches (is_simulated = true) are out of the
//     ordinary Organisation-scoped surface and are never returned by these helpers.
//   • Operating Organisation (this scope) ≠ any Organisation represented within the
//     listening content (mention authors/subjects), which is product content, untouched.
import { supabaseAdmin } from "@/lib/supabase-admin";

// organisationId is the caller's resolved Current Organisation (AuthedUser.organisationId,
// typed string | null). requireUser guarantees a non-null value on success, but the
// helpers accept null and fail CLOSED (no scope / no access) as a defensive invariant —
// a missing Current Organisation never yields access to any search.

/** The real (non-simulated) social_searches ids owned by the Current Organisation.
 *  Used to scope platform-wide / dependent-by-search_id reads (mentions/stats/reports).
 *  Returns [] when the Organisation owns no searches (or the context is missing). */
export async function currentOrgSearchIds(organisationId: string | null): Promise<string[]> {
  if (!organisationId) return [];
  const { data } = await supabaseAdmin
    .from("social_searches")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("is_simulated", false);
  return (data ?? []).map((r) => r.id as string);
}

/** Whether `searchId` is a real search owned by the Current Organisation. Legacy
 *  NULL-scope searches and other Organisations' searches return false — so a caller
 *  cannot reach another Organisation's Social Listening search by supplying its id. */
export async function searchInOrg(searchId: string, organisationId: string | null): Promise<boolean> {
  if (!organisationId) return false;
  const { data } = await supabaseAdmin
    .from("social_searches")
    .select("id")
    .eq("id", searchId)
    .eq("organisation_id", organisationId)
    .eq("is_simulated", false)
    .maybeSingle();
  return !!data;
}

/** Whether the mention `mentionId` belongs to a search owned by the Current
 *  Organisation (scope inherited through social_mentions.search_id). */
export async function mentionInOrg(mentionId: string, organisationId: string | null): Promise<boolean> {
  if (!organisationId) return false;
  const { data } = await supabaseAdmin
    .from("social_mentions")
    .select("search_id")
    .eq("id", mentionId)
    .maybeSingle();
  const searchId = (data as { search_id?: string } | null)?.search_id;
  if (!searchId) return false;
  return searchInOrg(searchId, organisationId);
}
