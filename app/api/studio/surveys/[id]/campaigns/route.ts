// ── Survey Studio → Create → Campaigns: org-safe, survey-scoped Campaign API ───
// Deliberately NOT the legacy GET /api/surveys/[id]/campaigns (which has no org
// filter). Every method here resolves the Active/Current Organisation via
// requireUser and authorises against surveys.organisation_id, exactly like the
// survey autosave route. It only ever touches Studio-generated campaigns
// (campaigns.origin = 'survey_studio', migration 208) for the given survey, so
// legacy/live campaigns are never affected. Provenance moved off the slug prefix
// because `_` is a LIKE wildcard, so the old 'studio_%' pattern also matched any
// slug beginning 'studio' plus one character.
//
// Depends on migration 186 (campaigns.target_mode). Hand-apply 186 before this
// route is exercised.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CAMPAIGN_ORIGIN } from "@/lib/campaign-groups/model";
import { canCreateCommissionedResearch } from "@/lib/survey-create-capability";
import {
  buildDesiredCampaigns,
  reconcile,
  STUDIO_SLUG_PREFIX,
} from "@/lib/studio/campaign-generation";
import { enrolSurveyCampaigns } from "@/lib/studio/data-entitlement";

// Fields the client may edit on a Draft Campaign. Attribution/identity fields
// (slug, survey, publisher, market, language, creative) are generated and NEVER
// accepted here.
const EDITABLE = ["target_responses", "target_mode", "start_date", "end_date"] as const;

type SurveyRow = {
  id: string;
  name: string;
  status: string;
  organisation_id: string | null;
  about: Record<string, unknown> | null;
  creative_design: string | null;
  brand_org_id: string | null;
  agency_org_id: string | null;
};

/** Load the survey and authorise the caller against it (admin, or same Active
 *  Organisation). Returns the survey or a NextResponse to return early. */
async function loadAuthorisedSurvey(
  session: AuthedUser,
  surveyId: string
): Promise<SurveyRow | NextResponse> {
  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select("id, name, status, organisation_id, about, creative_design, brand_org_id, agency_org_id")
    .eq("id", surveyId)
    .is("deleted_at", null)
    .single();
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  if (session.role !== "admin" && survey.organisation_id !== session.organisationId) {
    // Existence-preserving: same shape as not-found for a survey outside the org.
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }
  return survey as SurveyRow;
}

function marketsOf(survey: SurveyRow): string[] {
  const m = (survey.about ?? {}).markets;
  return Array.isArray(m) ? (m as string[]) : [];
}

/** Resolve id→name for a set of organisation ids. */
async function orgNames(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabaseAdmin.from("organisations").select("id, name").in("id", unique);
  return Object.fromEntries((data ?? []).map((o) => [o.id as string, o.name as string]));
}

/** The current Studio campaigns for a survey, org-safe and presentation-ready. */
async function listStudioCampaigns(surveyId: string) {
  const { data } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, campaign_name, survey_id, publisher_org_id, market, country_code, survey_language, creative_design, status, target_responses, target_mode, start_date, end_date, updated_at")
    .eq("survey_id", surveyId)
    .eq("origin", CAMPAIGN_ORIGIN.studio)
    .is("deleted_at", null)
    .order("publisher_org_id", { ascending: true })
    .order("market", { ascending: true })
    .order("survey_language", { ascending: true });
  const rows = data ?? [];
  const names = await orgNames(rows.map((r) => r.publisher_org_id as string));
  return rows.map((r) => ({ ...r, publisher_name: names[r.publisher_org_id as string] ?? "Publisher" }));
}

// ── GET: list + context ───────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const survey = await loadAuthorisedSurvey(session, id);
  if (survey instanceof NextResponse) return survey;

  const canCommission = canCreateCommissionedResearch(session);
  const campaigns = await listStudioCampaigns(id);

  // Current Organisation (self-service publisher, pinned).
  const currentOrgId = session.organisationId;
  const currentOrgName = currentOrgId ? (await orgNames([currentOrgId]))[currentOrgId] ?? "Your organisation" : null;

  // Distribution publishers available to a commissioned user (publisher-type orgs).
  let publishers: { id: string; name: string }[] = [];
  if (canCommission) {
    const { data } = await supabaseAdmin
      .from("organisations")
      .select("id, name, type, status")
      .eq("type", "publisher")
      .neq("status", "archived");
    publishers = (data ?? []).map((o) => ({ id: o.id as string, name: o.name as string }));
  }

  return NextResponse.json({
    campaigns,
    context: {
      surveyName: survey.name,
      markets: marketsOf(survey),
      creativeDesign: survey.creative_design,
      currentOrg: currentOrgId ? { id: currentOrgId, name: currentOrgName } : null,
      canCommission,
      publishers,
    },
  });
}

// ── POST: generate / reconcile ─────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req, ["admin", "publisher"]); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const survey = await loadAuthorisedSurvey(session, id);
  if (survey instanceof NextResponse) return survey;

  const body = await req.json().catch(() => ({}));
  const canCommission = canCreateCommissionedResearch(session);
  const surveyMarkets = marketsOf(survey);

  // Existing Studio campaigns for this survey (the reconciliation target). Queried
  // up front so the self-service default only fires on FIRST generation, never when
  // a user has deliberately cleared their plan down to nothing.
  const { data: existingRows } = await supabaseAdmin
    .from("campaigns").select("campaign_id")
    .eq("survey_id", survey.id).eq("origin", CAMPAIGN_ORIGIN.studio).is("deleted_at", null);
  const existing = (existingRows ?? []).map((r) => ({ slug: r.campaign_id as string }));

  // The explicit distribution plan: an array of { publisherOrgId, countryCode }
  // pairs. A Publisher may be selected for only a subset of markets (no cartesian).
  type RawSel = { publisherOrgId?: unknown; countryCode?: unknown };
  let rawSelections: RawSel[] = Array.isArray(body?.selections) ? body.selections : [];

  // First-generation self-service default: Current Organisation in every Survey
  // market. Only when nothing exists yet — an explicit empty plan (all markets
  // removed) is respected and reconciled down to zero campaigns.
  if (!rawSelections.length && !canCommission && session.organisationId && existing.length === 0) {
    rawSelections = surveyMarkets.map((c) => ({ publisherOrgId: session.organisationId, countryCode: c }));
  }

  // Which Publisher orgs is the caller allowed to distribute with?
  //  • self-service (no capability): only the Current Organisation;
  //  • commissioned (capability): any publisher-type org.
  const requestedPubIds = [...new Set(rawSelections.map((s) => String(s.publisherOrgId ?? "")).filter(Boolean))];
  let allowedPubNames: Record<string, string> = {};
  if (canCommission) {
    const { data } = await supabaseAdmin.from("organisations").select("id, name, type").in("id", requestedPubIds).eq("type", "publisher");
    allowedPubNames = Object.fromEntries((data ?? []).map((o) => [o.id as string, o.name as string]));
  } else {
    if (!session.organisationId) return NextResponse.json({ error: "No Current Organisation to deploy as." }, { status: 400 });
    const name = (await orgNames([session.organisationId]))[session.organisationId] ?? "Your organisation";
    allowedPubNames = { [session.organisationId]: name };
  }

  // Keep only valid (allowed publisher × Survey market) selections. Silently drop
  // anything outside the Survey's markets or a disallowed publisher rather than
  // fabricating campaigns.
  const selections = rawSelections
    .map((s) => ({ publisherOrgId: String(s.publisherOrgId ?? ""), countryCode: String(s.countryCode ?? "") }))
    .filter((s) => allowedPubNames[s.publisherOrgId] && surveyMarkets.includes(s.countryCode))
    .map((s) => ({ ...s, publisherName: allowedPubNames[s.publisherOrgId] }));

  const desired = buildDesiredCampaigns({
    surveyId: survey.id,
    surveyName: survey.name,
    selections,
    creativeDesign: survey.creative_design,
    brandOrgId: survey.brand_org_id,
    agencyOrgId: survey.agency_org_id,
  });

  // Tombstoned Studio slugs for this survey. A removed Publisher×Market leaves a
  // soft-deleted row that still OWNS its deterministic campaign_id (UNIQUE), so
  // re-selecting that market must REVIVE that row rather than insert a duplicate
  // (which would 500 on the unique constraint — the reported bug).
  const { data: deletedRows } = await supabaseAdmin
    .from("campaigns").select("campaign_id")
    .eq("survey_id", survey.id).eq("origin", CAMPAIGN_ORIGIN.studio).not("deleted_at", "is", null);
  const deleted = (deletedRows ?? []).map((r) => ({ slug: r.campaign_id as string }));

  const plan = reconcile(desired, existing, deleted);

  // Shared Draft field set for both insert and restore. Start defaults to today
  // (server date) so every Campaign carries an explicit configured start; it does
  // NOT activate the Draft — Deploy is the activation gate.
  const todayISO = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const draftFields = (d: (typeof plan.toCreate)[number]) => ({
    campaign_name: d.campaignName,
    survey_id: d.surveyId,
    // Provenance is set at creation and never inferred from the slug afterwards.
    // Migration 208 rejects a survey_studio campaign with no survey_id, so this
    // and survey_id above must always be written together.
    origin: CAMPAIGN_ORIGIN.studio,
    research_project_id: null,
    publisher_org_id: d.publisherOrgId,
    brand_org_id: d.brandOrgId,
    agency_org_id: d.agencyOrgId,
    market: d.market,
    country_code: d.countryCode,
    survey_language: d.surveyLanguage,
    creative_design: d.creativeDesign,
    status: "draft",
    target_responses: null,
    target_mode: "continue",
    start_date: todayISO,
    end_date: null,
    created_by_admin: session.role === "admin",
  });

  // INSERT truly-new lines. created_by_admin governs later publisher-editability.
  if (plan.toCreate.length) {
    const rows = plan.toCreate.map((d) => ({ campaign_id: d.slug, ...draftFields(d) }));
    const { error } = await supabaseAdmin.from("campaigns").insert(rows);
    if (error) {
      console.error("[studio-campaigns] insert error:", error);
      return NextResponse.json({ error: "Could not generate campaigns." }, { status: 500 });
    }
  }

  // RESTORE tombstoned lines: revive the existing row (keeps its deterministic
  // slug and identity), clear the tombstone, and reset to a fresh Draft.
  for (const d of plan.toRestore) {
    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({ ...draftFields(d), deleted_at: null, deleted_by: null, delete_reason: null, updated_at: now })
      .eq("campaign_id", d.slug).eq("survey_id", survey.id);
    if (error) {
      console.error("[studio-campaigns] restore error:", error);
      return NextResponse.json({ error: "Could not restore campaigns." }, { status: 500 });
    }
  }

  // Soft-remove active Draft lines no longer desired (safe: Draft, pre-collection).
  if (plan.toRemove.length) {
    const { error } = await supabaseAdmin
      .from("campaigns")
      .update({ deleted_at: now, deleted_by: session.workEmail, delete_reason: "Reconciled by Survey Studio (market/publisher removed)", updated_at: now })
      .in("campaign_id", plan.toRemove)
      .eq("survey_id", survey.id)
      .eq("status", "draft")
      .is("deleted_at", null);
    if (error) {
      console.error("[studio-campaigns] soft-remove error:", error);
      return NextResponse.json({ error: "Could not reconcile campaigns." }, { status: 500 });
    }
  }

  const campaigns = await listStudioCampaigns(survey.id);

  // Enrol the survey's CURRENT Studio campaigns (by UUID) into its governed `data`
  // scope, so every campaign — initial, restored, or added later — is covered by
  // any organisation entitled to this survey's data. Coverage-not-inheritance
  // (Q-18) means a new campaign is invisible to the entitled client until enrolled,
  // so this runs on every generation/reconciliation; it is idempotent. Distribution
  // publishers gain NOTHING from this — membership is campaign coverage, not a grant.
  // Best-effort: enrolment failure never blocks generation (the next run re-enrols).
  try {
    await enrolSurveyCampaigns(survey.id, campaigns.map((c) => c.id as string), { actor: session.workEmail });
  } catch (e) {
    console.error("[studio-campaigns] data-scope enrolment failed (campaigns generated):", e);
  }

  return NextResponse.json({ campaigns, created: plan.toCreate.length, removed: plan.toRemove.length });
}

/** Whitelist + validate an incoming config patch. Returns the safe patch or an
 *  error string. "stop with no target" is allowed as a transient Draft state (the
 *  Deploy readiness gate blocks it); non-positive/non-integer targets are rejected. */
function sanitisePatch(patchIn: Record<string, unknown>): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in patchIn) patch[k] = patchIn[k];
  if ("target_responses" in patch) {
    const t = patch.target_responses;
    if (t !== null && (!Number.isInteger(t) || (t as number) <= 0)) {
      return { error: "Response target must be a positive whole number." };
    }
  }
  if ("target_mode" in patch && patch.target_mode !== "continue" && patch.target_mode !== "stop") {
    return { error: "Invalid target mode." };
  }
  if (!Object.keys(patch).length) return { error: "Nothing to update." };
  return { patch };
}

// ── PATCH: edit Draft config — uniform (ids+patch) OR per-row (updates[]) ───────
// updates[] carries a distinct patch per Campaign; used for exact-sum target
// ALLOCATION (each Campaign gets its own share of an entered total). Every write is
// scoped to this survey's Studio DRAFT campaigns, so edits can never touch a
// Campaign that has been deployed / begun collecting.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req, ["admin", "publisher"]); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const survey = await loadAuthorisedSurvey(session, id);
  if (survey instanceof NextResponse) return survey;

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  // Per-row form: [{ id, patch }, …]
  if (Array.isArray(body?.updates)) {
    const updates = body.updates as { id?: unknown; patch?: unknown }[];
    for (const u of updates) {
      if (!u?.id) continue;
      const s = sanitisePatch((u.patch ?? {}) as Record<string, unknown>);
      if ("error" in s) return NextResponse.json({ error: s.error }, { status: 400 });
      const { error } = await supabaseAdmin.from("campaigns")
        .update({ ...s.patch, updated_at: now })
        .eq("id", String(u.id)).eq("survey_id", survey.id).eq("origin", CAMPAIGN_ORIGIN.studio).eq("status", "draft").is("deleted_at", null);
      if (error) { console.error("[studio-campaigns] per-row update error:", error); return NextResponse.json({ error: "Could not save campaign changes." }, { status: 500 }); }
    }
    return NextResponse.json({ campaigns: await listStudioCampaigns(survey.id), updated: updates.length });
  }

  // Uniform form: one patch applied to ids (or a single id, with CAS).
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : (body?.id ? [body.id] : []);
  const expectedUpdatedAt = typeof body?.expected_updated_at === "string" ? body.expected_updated_at : null;
  if (!ids.length) return NextResponse.json({ error: "No campaigns specified." }, { status: 400 });

  const s = sanitisePatch((body?.patch ?? {}) as Record<string, unknown>);
  if ("error" in s) return NextResponse.json({ error: s.error }, { status: 400 });

  let q = supabaseAdmin.from("campaigns")
    .update({ ...s.patch, updated_at: now })
    .in("id", ids).eq("survey_id", survey.id).eq("origin", CAMPAIGN_ORIGIN.studio).eq("status", "draft").is("deleted_at", null);
  if (ids.length === 1 && expectedUpdatedAt) q = q.eq("updated_at", expectedUpdatedAt);

  const { data: updated, error } = await q.select("id");
  if (error) {
    console.error("[studio-campaigns] update error:", error);
    return NextResponse.json({ error: "Could not save campaign changes." }, { status: 500 });
  }
  if (ids.length === 1 && expectedUpdatedAt && (!updated || updated.length === 0)) {
    return NextResponse.json({ error: "This campaign changed elsewhere. Reload to continue.", conflict: true }, { status: 409 });
  }

  return NextResponse.json({ campaigns: await listStudioCampaigns(survey.id), updated: updated?.length ?? 0 });
}

// ── DELETE: bulk soft-delete Draft campaigns ───────────────────────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req, ["admin", "publisher"]); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const survey = await loadAuthorisedSurvey(session, id);
  if (survey instanceof NextResponse) return survey;

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : (body?.id ? [body.id] : []);
  if (!ids.length) return NextResponse.json({ error: "No campaigns specified." }, { status: 400 });

  const now = new Date().toISOString();
  const { data: removed, error } = await supabaseAdmin.from("campaigns")
    .update({ deleted_at: now, deleted_by: session.workEmail, delete_reason: "Removed in Survey Studio Campaigns", updated_at: now })
    .in("id", ids).eq("survey_id", survey.id).eq("origin", CAMPAIGN_ORIGIN.studio).eq("status", "draft").is("deleted_at", null)
    .select("id");
  if (error) {
    console.error("[studio-campaigns] delete error:", error);
    return NextResponse.json({ error: "Could not delete campaigns." }, { status: 500 });
  }
  return NextResponse.json({ campaigns: await listStudioCampaigns(survey.id), removed: removed?.length ?? 0 });
}
