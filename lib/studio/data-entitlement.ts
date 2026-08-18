// ── Survey Studio — research-data entitlement enrolment (server-only) ─────────
// The smallest wiring around the EXISTING ORG-005 governed entitlement tables so
// Survey Studio surveys/campaigns are enrolled into the `data` authority. It
// introduces NO new access model: it only WRITES the governed rows that
// dataVisibleCampaignIds already resolves (organisation_resource_entitlements +
// resource_scopes + resource_scope_members, migrations 170/171).
//
// The contract (governed, not invented here):
//   • DATA ENTITLEMENT is the single authority for research-data consumption.
//     Ownership (surveys.organisation_id), ATTRIBUTION (brand_org_id/agency_org_id)
//     and DISTRIBUTION (publisher_org_id) are NOT entitlement (Q-14/Q-19/F027).
//   • Each Survey gets ONE `data` Resource Scope = the survey's research-data
//     Campaign set. Entitled organisations receive a `data` ORE to that scope.
//     Each generated Campaign is enrolled as a scope MEMBER by its Campaign UUID
//     (never its slug) — matching the resolver, which reads campaign UUIDs.
//   • Coverage-not-inheritance (Q-18): a new Campaign is covered ONLY once it is
//     explicitly enrolled — so campaign generation must always enrol. This module
//     makes that enrolment idempotent so re-generation/reconciliation is safe.
//
// This module NEVER derives entitlement from attribution or distribution, and the
// read side reuses dataVisibleCampaignIds unchanged.

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedUser } from "@/lib/auth-server";
import { dataVisibleCampaignIds } from "@/lib/access";

/** The subset of the Supabase client this module needs. Injectable for tests. */
export type EntitlementDb = Pick<SupabaseClient, "from">;

const DATA = "data" as const;

/** Deterministic, idempotent identity for a Survey's `data` Resource Scope. The
 *  survey UUID is embedded so find-or-create never mints a duplicate scope. */
export function surveyDataScopeName(surveyId: string): string {
  return `survey-data:${surveyId}`;
}

type Opts = { actor?: string | null; client?: EntitlementDb };

/**
 * Find-or-create the Survey's `data` Resource Scope; returns its id. Idempotent:
 * a scope with the deterministic name is reused. The scope is platform-level
 * (organisation_id NULL) — it is the survey's data set, entitled TO organisations
 * via ORE, not owned by one. Under a create race the earliest row wins.
 */
export async function ensureSurveyDataScope(surveyId: string, opts: Opts = {}): Promise<string> {
  const db = opts.client ?? supabaseAdmin;
  const name = surveyDataScopeName(surveyId);

  const read = async () => {
    const { data } = await db.from("resource_scopes")
      .select("id")
      .eq("resource_class", DATA)
      .eq("name", name)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1);
    return data && data.length ? (data[0].id as string) : null;
  };

  const found = await read();
  if (found) return found;

  const { data: created, error } = await db.from("resource_scopes")
    .insert({ resource_class: DATA, organisation_id: null, name, status: "active" })
    .select("id");
  if (!error && created && created.length) return created[0].id as string;

  // Insert lost a race (or transient) — re-read the winner.
  const reread = await read();
  if (reread) return reread;
  throw new Error(`ensureSurveyDataScope failed for ${surveyId}: ${error?.message ?? "no row"}`);
}

/**
 * Grant an ORGANISATION `data` entitlement to a Survey's data scope. Idempotent —
 * an existing active grant is reused. Requires an explicit organisation id: this
 * function NEVER guesses, and callers must pass the OWNING (self-service) or
 * COMMISSIONING organisation — never a brand/agency attribution or publisher
 * distribution id.
 */
export async function grantSurveyDataEntitlement(surveyId: string, organisationId: string, opts: Opts = {}): Promise<void> {
  if (!organisationId) throw new Error("grantSurveyDataEntitlement requires an explicit owning/commissioning organisation id");
  const db = opts.client ?? supabaseAdmin;
  const scopeId = await ensureSurveyDataScope(surveyId, opts);

  const { data: existing } = await db.from("organisation_resource_entitlements")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("resource_class", DATA)
    .eq("scope_id", scopeId)
    .eq("status", "active")
    .limit(1);
  if (existing && existing.length) return; // already granted — idempotent

  const { error } = await db.from("organisation_resource_entitlements")
    .insert({ organisation_id: organisationId, resource_class: DATA, scope_id: scopeId, status: "active", created_by: opts.actor ?? null });
  if (error) throw new Error(`grantSurveyDataEntitlement failed for ${surveyId}/${organisationId}: ${error.message}`);
}

/**
 * Enrol one Campaign (by its UUID, never its slug) into the Survey's data scope.
 * Idempotent via the (scope_id, resource_id) primary key.
 */
export async function enrolCampaignInSurveyDataScope(surveyId: string, campaignId: string, opts: Opts = {}): Promise<void> {
  if (!campaignId) return;
  return enrolSurveyCampaigns(surveyId, [campaignId], opts);
}

/**
 * Enrol the Survey's CURRENT campaign set (by UUID) into its data scope. Called by
 * campaign generation/reconciliation with the full active Studio-campaign id list,
 * so initial generation, restore and later-added campaigns all converge — no
 * campaign is ever left outside the entitled set (the coverage-not-inheritance
 * trap). Idempotent (ON CONFLICT DO NOTHING via the PK).
 */
export async function enrolSurveyCampaigns(surveyId: string, campaignIds: string[], opts: Opts = {}): Promise<void> {
  const db = opts.client ?? supabaseAdmin;
  const scopeId = await ensureSurveyDataScope(surveyId, opts);
  const ids = [...new Set(campaignIds.filter(Boolean))];
  if (!ids.length) return; // scope ensured; nothing to enrol yet
  const rows = ids.map((id) => ({ scope_id: scopeId, resource_class: DATA, resource_id: id, added_by: opts.actor ?? null }));
  const { error } = await db.from("resource_scope_members")
    .upsert(rows, { onConflict: "scope_id,resource_id", ignoreDuplicates: true });
  if (error) throw new Error(`enrolSurveyCampaigns failed for ${surveyId}: ${error.message}`);
}

// ── Read side ────────────────────────────────────────────────────────────────
// The authoritative read contract for research-data consumption: resolve the
// governed `data` authority (dataVisibleCampaignIds — UNCHANGED) to campaign
// UUIDs, then map to campaign SLUGS (the key analytics facts carry). `null` =
// unrestricted (operator/admin) — the caller must not filter.

/** Map campaign UUIDs → campaign_id slugs (the analytics fact key). */
export async function campaignSlugsForIds(ids: string[], client: EntitlementDb = supabaseAdmin): Promise<string[]> {
  if (!ids.length) return [];
  const { data } = await client.from("campaigns").select("campaign_id").in("id", ids);
  return (data ?? []).map((r) => r.campaign_id as string);
}

/**
 * The entitled campaign SLUGS for a user, for filtering analytics facts. Reuses
 * the governed dataVisibleCampaignIds authority unchanged (`null` = operator/admin
 * unrestricted; `[]` = Default Refuse). Server-only.
 */
export async function entitledCampaignSlugs(user: AuthedUser, opts: { client?: EntitlementDb } = {}): Promise<string[] | null> {
  const ids = await dataVisibleCampaignIds(user);
  if (ids === null) return null;               // operator/admin — unrestricted
  if (!ids.length) return [];                  // Default Refuse
  return campaignSlugsForIds(ids, opts.client ?? supabaseAdmin);
}
