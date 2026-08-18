// ── Survey Studio → Discover → Dashboards — trusted scope resolver (server-only) ─
// Phase 1 foundation. The ONE place that turns an authenticated caller into a
// trusted Dashboard data scope, so every later Dashboard route (Performance /
// Results / Campaigns / export) reuses the same entitlement + intersection
// sequence instead of re-deriving it (and getting it subtly wrong).
//
// AUTHORITY (fixed for V1): the authoritative Dashboard scope is the caller's
// entitled CAMPAIGN universe, resolved through the governed `data` entitlement
// path — dataVisibleCampaignIds (lib/access.ts). This module introduces NO new
// access model, NO role-based dashboard permissions, NO ownership-based data
// access, and NO second entitlement resolver. A Survey is an OPTIONAL projection
// over that authorised Campaign universe (decision 1), never a scope of its own.
//
// INVARIANTS (identical to app/api/dashboard/events/route.ts):
//   • dataVisibleCampaignIds → null = operator/admin UNRESTRICTED (do not filter);
//     [] = Default Refuse (genuinely no authorised data — NEVER "everything").
//   • Client-supplied Survey ids are UNTRUSTED. A requested Survey is honoured
//     only if it lies inside the authorised universe; an unknown/unauthorised id
//     NEVER broadens scope — it fails closed to an empty scope (it also never
//     silently falls back to "all surveys").
//   • The resolver reads only campaign dimension columns (never response rows).

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthedUser } from "@/lib/auth-server";
import { dataVisibleCampaignIds, orgDataCampaignIds } from "@/lib/access";
import { loadOperatorDomains, adminResourceVisibility } from "@/lib/authz/operator-access";

/** The subset of the Supabase client this module needs. Injectable for tests. */
export type DashboardDb = Pick<SupabaseClient, "from">;

/** A campaign inside the authorised data universe. Only the dimension-bearing
 *  columns the Survey list + filter manifest need — never response-level data.
 *  Shape is a superset of survey-results' FilterableCampaign, so the existing
 *  filterCampaignSlugs/buildFilterOptions consume it directly. */
export type ScopeCampaign = {
  id: string;                    // campaign UUID — the entitlement key
  campaign_id: string;           // analytics slug — the fact key
  survey_id: string | null;
  publisher_org_id: string | null;
  market: string | null;
  country_code: string | null;
  survey_language: string | null;
};

const CAMPAIGN_COLS = "id, campaign_id, survey_id, publisher_org_id, market, country_code, survey_language";

export type DashboardScope = {
  /** true when the caller is an unrestricted operator/admin (gate === null). */
  unrestricted: boolean;
  /** true when there is genuinely no authorised data to show — either Default
   *  Refuse ([]), no authorised campaigns, or a requested Survey that resolves
   *  to nothing. A genuine empty; NEVER reinterpreted as "unrestricted". */
  isEmpty: boolean;
  /** The full authorised campaign universe (before any Survey projection). */
  campaigns: ScopeCampaign[];
  /** Authorised campaign UUIDs (the entitlement keys). */
  authorisedCampaignIds: string[];
  /** Authorised campaign slugs (the analytics fact keys). */
  authorisedCampaignSlugs: string[];
  /** Distinct Survey ids present in the authorised universe. */
  authorisedSurveyIds: string[];
  /** The requested Survey id IFF it is inside the authorised universe; else null. */
  requestedSurveyId: string | null;
  /** Campaigns after applying the validated Survey projection. */
  effectiveCampaigns: ScopeCampaign[];
  /** Effective campaign slugs — what later routes constrain facts to. */
  effectiveCampaignSlugs: string[];
};

export type ResolveScopeOptions = {
  /** Untrusted client-supplied Survey id. Honoured only if inside the universe. */
  requestedSurveyId?: string | null;
  client?: DashboardDb;
  /** The governed data-entitlement gate. Defaults to dataVisibleCampaignIds;
   *  overridable for tests ONLY — never pass a different authority in production. */
  resolveGate?: (user: AuthedUser) => Promise<string[] | null>;
  /** Cross-org study-management authority (Platform-Operator `study` domain).
   *  Defaults to operatorMayManageStudies; overridable for tests ONLY. */
  operatorStudyManage?: (user: AuthedUser) => Promise<boolean>;
};

function emptyScope(unrestricted: boolean, requestedSurveyId: string | null = null): DashboardScope {
  return {
    unrestricted,
    isEmpty: true,
    campaigns: [],
    authorisedCampaignIds: [],
    authorisedCampaignSlugs: [],
    authorisedSurveyIds: [],
    requestedSurveyId,
    effectiveCampaigns: [],
    effectiveCampaignSlugs: [],
  };
}

/**
 * Resolve the caller's trusted Dashboard scope from the governed `data`
 * entitlement authority. Pure sequence, no analytics computed here.
 */
export async function resolveDashboardScope(user: AuthedUser, opts: ResolveScopeOptions = {}): Promise<DashboardScope> {
  const db = opts.client ?? supabaseAdmin;
  const resolveGate = opts.resolveGate ?? dataVisibleCampaignIds;

  const gate = await resolveGate(user);          // null = unrestricted; [] = Default Refuse

  // Default Refuse: entitled to no data. NEVER reinterpret [] as unrestricted.
  if (gate !== null && gate.length === 0) return emptyScope(false);

  const unrestricted = gate === null;

  // Load the authorised campaign universe: unrestricted (operator) = all live
  // campaigns; otherwise EXACTLY the entitled campaign UUIDs. A hand-crafted id
  // outside `gate` can never be selected here — the intersection is the .in(id).
  let q = db.from("campaigns").select(CAMPAIGN_COLS).is("deleted_at", null);
  if (gate !== null) q = q.in("id", gate);
  const { data: rows } = await q;
  const campaigns = (rows ?? []) as ScopeCampaign[];
  if (campaigns.length === 0) return emptyScope(unrestricted);

  const authorisedCampaignIds = campaigns.map((c) => c.id);
  const authorisedCampaignSlugs = campaigns.map((c) => c.campaign_id).filter(Boolean);
  const authorisedSurveyIds = [...new Set(campaigns.map((c) => c.survey_id).filter((x): x is string => !!x))];

  // Survey projection over the authorised universe (untrusted → validated).
  const requested = opts.requestedSurveyId?.trim() || null;
  if (requested && !authorisedSurveyIds.includes(requested)) {
    // Unknown / unauthorised Survey id: fail closed. It never broadens scope and
    // never falls back to all surveys. The authorised universe is still reported
    // so a caller can present the legitimate options.
    return {
      unrestricted, isEmpty: true, campaigns, authorisedCampaignIds, authorisedCampaignSlugs,
      authorisedSurveyIds, requestedSurveyId: null, effectiveCampaigns: [], effectiveCampaignSlugs: [],
    };
  }

  const requestedSurveyId = requested;
  const effectiveCampaigns = requestedSurveyId ? campaigns.filter((c) => c.survey_id === requestedSurveyId) : campaigns;
  const effectiveCampaignSlugs = effectiveCampaigns.map((c) => c.campaign_id).filter(Boolean);

  return {
    unrestricted,
    isEmpty: effectiveCampaigns.length === 0,
    campaigns,
    authorisedCampaignIds,
    authorisedCampaignSlugs,
    authorisedSurveyIds,
    requestedSurveyId,
    effectiveCampaigns,
    effectiveCampaignSlugs,
  };
}

// ── Deliverable 2 — entitled Survey list ─────────────────────────────────────
// Derived ONLY from the authorised Campaign universe (never surveys.organisation_id,
// never role, never a global survey list). A Survey the caller can operationally
// manage but has NO authorised Campaign data for does not appear — this is a DATA
// dashboard, not an ownership view.

export type DashboardSurveyOption = {
  id: string;
  name: string;
  /** Actual ordered question count (1–5 for Studio surveys; historical as stored). */
  questionCount: number;
  status: string | null;
  /** Authorised campaigns for this Survey within the caller's universe. */
  campaignCount: number;
  /** The Study this Survey belongs to (0-or-1), used ONLY as an intersect-only
   *  grouping LABEL — never to grant access. A Study Dashboard composes the
   *  authorised surveys sharing this id; it never adds surveys the caller can't
   *  already see via their authorised campaigns. */
  studyId: string | null;
};

/** Count the survey's actual ordered questions without pulling the heavy resolver. */
function questionCountOf(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}

/**
 * The Surveys visible in the caller's Dashboard, projected from the authorised
 * Campaign universe. Minimal metadata only — this is a bootstrap list, NOT an
 * analytics aggregation. Simulated and deleted surveys are excluded.
 */
export async function resolveEntitledSurveys(
  scope: DashboardScope,
  opts: { client?: DashboardDb } = {},
): Promise<DashboardSurveyOption[]> {
  const db = opts.client ?? supabaseAdmin;
  const surveyIds = scope.authorisedSurveyIds;
  if (surveyIds.length === 0) return [];

  const { data: rows } = await db
    .from("surveys")
    .select("id, name, status, questions, is_simulated, study_id")
    .in("id", surveyIds)
    .is("deleted_at", null);

  // Authorised campaign count per Survey, from the universe already in hand.
  const campaignCount = new Map<string, number>();
  for (const c of scope.campaigns) {
    if (!c.survey_id) continue;
    campaignCount.set(c.survey_id, (campaignCount.get(c.survey_id) ?? 0) + 1);
  }

  return (rows ?? [])
    .filter((s) => !(s as { is_simulated?: boolean }).is_simulated)
    .map((s) => ({
      id: s.id as string,
      name: (s.name as string) || "Untitled survey",
      questionCount: questionCountOf((s as { questions?: unknown }).questions),
      status: ((s as { status?: string | null }).status ?? null),
      campaignCount: campaignCount.get(s.id as string) ?? 0,
      studyId: ((s as { study_id?: string | null }).study_id ?? null),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The caller's authorised survey id set — the SAME governed set the Dashboards
 * survey list shows (resolveEntitledSurveys). This is the single source of truth a
 * Study create/edit route validates submitted survey ids against; it is NOT a
 * "surveys owned by the organisation" query.
 */
export async function resolveAuthorisedSurveyIds(user: AuthedUser, opts: ResolveScopeOptions = {}): Promise<string[]> {
  const scope = await resolveDashboardScope(user, { client: opts.client, resolveGate: opts.resolveGate });
  if (scope.isEmpty) return [];
  const surveys = await resolveEntitledSurveys(scope, { client: opts.client });
  return surveys.map((s) => s.id);
}

/**
 * Cross-org study MANAGEMENT authority. An admin may manage another organisation's
 * user Study ONLY with the explicit, revocable Platform-Operator `study`-domain
 * standing entitlement — NEVER the bare `admin` role (which would over-grant to
 * read-only/support staff sharing that role). Fails closed. Short-circuits before any
 * DB read for non-admins.
 */
export async function operatorMayManageStudies(user: AuthedUser): Promise<boolean> {
  if (user.role !== "admin") return false;
  const domains = await loadOperatorDomains(user.id);
  return adminResourceVisibility(domains, "study") === "all";
}

export type OrgScopeOptions = { client?: DashboardDb; resolveOrgGate?: (organisationId: string) => Promise<string[]> };

/**
 * Resolve a Dashboard scope for a specific ORGANISATION's governed Data universe,
 * independent of any single user. Reuses the SAME governed resolver — only the gate
 * is org-derived (orgDataCampaignIds) — so this is NOT a second entitlement system.
 * Used to populate/validate an owning org's eligible surveys when a platform operator
 * edits that org's Study (management authority ≠ data authority).
 */
export async function resolveOrgDashboardScope(organisationId: string, opts: OrgScopeOptions = {}): Promise<DashboardScope> {
  const gate = opts.resolveOrgGate ? await opts.resolveOrgGate(organisationId) : await orgDataCampaignIds(organisationId);
  // Synthetic principal carrying only the org context; the gate is org-derived, so
  // the resolver never consults any user-level authority for this path.
  const principal = { id: `org:${organisationId}`, organisationId, role: "publisher" } as unknown as AuthedUser;
  return resolveDashboardScope(principal, { client: opts.client, resolveGate: async () => gate });
}

/** The owning organisation's governed authorised survey ids (org-level universe). */
export async function resolveOrgAuthorisedSurveyIds(organisationId: string, opts: OrgScopeOptions = {}): Promise<string[]> {
  const scope = await resolveOrgDashboardScope(organisationId, opts);
  if (scope.isEmpty) return [];
  const surveys = await resolveEntitledSurveys(scope, { client: opts.client });
  return surveys.map((s) => s.id);
}

// ── Study grouping (intersect-only over authorised surveys) ──────────────────
// APPROVED: `surveys.study_id` is used ONLY as a grouping LABEL over surveys that
// are ALREADY in the authorised campaign universe. It NEVER grants access and
// NEVER broadens the authorised survey set — a study containing an unentitled
// survey simply excludes it. No name parsing, no second authority.

/** Map studyId → authorised survey ids, from an already-authorised survey list. */
export function studyGroupsFrom(surveys: { id: string; studyId: string | null }[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const s of surveys) {
    if (!s.studyId) continue;
    const arr = m.get(s.studyId) ?? [];
    arr.push(s.id);
    m.set(s.studyId, arr);
  }
  return m;
}

/** Whether a Study id is a platform-defined canonical research Study (surveys.
 *  study_id) or an organisation-created analysis grouping (dashboard_studies). */
export type StudyKind = "canonical" | "user";

export type StudyDashboardScope = {
  studyId: string;
  studyName: string | null;
  unrestricted: boolean;
  /** true when the caller has NO authorised survey in this study — fail closed. */
  isEmpty: boolean;
  /** The authorised surveys in this study (study membership ∩ authorised universe). */
  surveys: DashboardSurveyOption[];
  /** Union of authorised campaigns across those surveys (a set — no double count). */
  effectiveCampaigns: ScopeCampaign[];
  effectiveCampaignSlugs: string[];
  /** canonical (surveys.study_id) vs user (dashboard_studies) provenance. */
  kind: StudyKind;
  /** For a user study: the caller may rename/edit/delete it (same organisation). */
  canManage: boolean;
  /** For a user study: authorised member count < 2 — the combined view is degraded
   *  but nothing leaks. false for canonical. */
  belowMinimum: boolean;
  /** For a user study viewed by a managing operator of ANOTHER organisation: the
   *  owning organisation's name (so an operator knows whose study they're in).
   *  null for own-org viewers and canonical studies — never leaked. */
  ownerOrganisationName: string | null;
  /** true when the caller MAY MANAGE this user study but has NO data authority to
   *  its surveys — a management-only shell (name/owner/Edit/Delete), never analytics.
   *  Management authority ≠ data authority. */
  manageOnly: boolean;
};

function emptyStudyScope(studyId: string, unrestricted: boolean, over: Partial<StudyDashboardScope> = {}): StudyDashboardScope {
  return { studyId, studyName: null, unrestricted, isEmpty: true, surveys: [], effectiveCampaigns: [], effectiveCampaignSlugs: [], kind: "canonical", canManage: false, belowMinimum: false, ownerOrganisationName: null, manageOnly: false, ...over };
}

/** The owning-organisation name for a cross-org managing view (null for own-org). */
async function ownerNameFor(db: DashboardDb, organisationId: string | null, callerOrgId: string | null): Promise<string | null> {
  if (!organisationId || organisationId === callerOrgId) return null;
  const { data: org } = await db.from("organisations").select("name").eq("id", organisationId).maybeSingle();
  return (org as { name?: string | null } | null)?.name ?? null;
}

type StudyMembership =
  | { kind: "user"; name: string | null; memberIds: Set<string>; canManage: boolean; organisationId: string | null }
  | { kind: "canonical"; name: string | null }
  | { kind: "none" };

/**
 * Resolve who this Study id is and which surveys it CLAIMS as members — WITHOUT
 * any authorisation short-cut. A user study (dashboard_studies) is preferred over a
 * canonical study of the same id-space; it is disclosed only to its owning
 * organisation, an unrestricted operator (Data), or an operator holding the
 * study-management entitlement. The returned member ids are still INTERSECTED with
 * the authorised universe by the caller — membership is never entitlement.
 */
async function resolveStudyMembership(db: DashboardDb, user: AuthedUser, studyId: string, unrestricted: boolean, adminManage: boolean): Promise<StudyMembership> {
  const { data: us } = await db.from("dashboard_studies").select("id, organisation_id, name").eq("id", studyId).maybeSingle();
  if (us) {
    const owner = (us as { organisation_id?: string | null }).organisation_id ?? null;
    const sameOrg = !!user.organisationId && owner === user.organisationId;
    // Confidentiality: name/membership is visible only to the owning org, an
    // unrestricted operator, or a study-management operator. Otherwise it does not exist.
    if (!sameOrg && !unrestricted && !adminManage) return { kind: "none" };
    const { data: mems } = await db.from("dashboard_study_surveys").select("survey_id").eq("study_id", studyId);
    return {
      kind: "user",
      name: (us as { name?: string | null }).name ?? null,
      memberIds: new Set(((mems ?? []) as { survey_id: string }[]).map((m) => m.survey_id)),
      // Manage = the owning organisation OR a study-management operator (never bare admin role).
      canManage: sameOrg || adminManage,
      organisationId: owner,
    };
  }
  const { data: c } = await db.from("studies").select("name").eq("id", studyId).maybeSingle();
  if (c) return { kind: "canonical", name: (c as { name?: string | null }).name ?? null };
  return { kind: "none" };
}

/**
 * Resolve a Study Dashboard scope for EITHER a canonical research Study (surveys.
 * study_id) or an organisation-created analysis grouping (dashboard_studies). In
 * both cases the effective universe is: study membership ∩ the caller's authorised
 * survey universe. Composition over already-authorised resources — an unauthorised
 * survey (whatever the membership says) is never included, so a grouping can never
 * grant or resurrect access.
 */
export async function resolveStudyDashboardScope(
  user: AuthedUser,
  studyId: string,
  opts: ResolveScopeOptions = {},
): Promise<StudyDashboardScope> {
  const db = opts.client ?? supabaseAdmin;
  const scope = await resolveDashboardScope(user, { client: opts.client, resolveGate: opts.resolveGate });
  // Cross-org study MANAGEMENT authority (never bare admin role) — injectable for tests.
  const adminManage = opts.operatorStudyManage ? await opts.operatorStudyManage(user) : await operatorMayManageStudies(user);

  if (scope.isEmpty) {
    // No data authority. A caller who nonetheless MAY MANAGE this user study (its
    // owning org, or a study-operator) still reaches a MANAGEMENT-ONLY shell — never
    // analytics. Everyone else fails closed to "unavailable".
    const membership = await resolveStudyMembership(db, user, studyId, false, adminManage);
    if (membership.kind === "user" && membership.canManage) {
      const ownerOrganisationName = await ownerNameFor(db, membership.organisationId, user.organisationId);
      return emptyStudyScope(studyId, scope.unrestricted, { studyName: membership.name, kind: "user", canManage: true, ownerOrganisationName, manageOnly: true });
    }
    return emptyStudyScope(studyId, scope.unrestricted);
  }

  const membership = await resolveStudyMembership(db, user, studyId, scope.unrestricted, adminManage);
  if (membership.kind === "none") return emptyStudyScope(studyId, scope.unrestricted);

  const surveys = await resolveEntitledSurveys(scope, { client: opts.client });
  const inStudy = membership.kind === "user"
    ? surveys.filter((s) => membership.memberIds.has(s.id))   // user membership ∩ authorised
    : surveys.filter((s) => s.studyId === studyId);            // canonical study_id ∩ authorised
  const kind = membership.kind;
  const canManage = membership.kind === "user" ? membership.canManage : false;

  // Owner context: shown ONLY to a managing operator of ANOTHER org (never own-org / canonical).
  const ownerOrganisationName = membership.kind === "user" ? await ownerNameFor(db, membership.organisationId, user.organisationId) : null;

  if (inStudy.length === 0) return emptyStudyScope(studyId, scope.unrestricted, { studyName: membership.name, kind, canManage, ownerOrganisationName });

  const surveyIds = new Set(inStudy.map((s) => s.id));
  const effectiveCampaigns = scope.campaigns.filter((c) => c.survey_id && surveyIds.has(c.survey_id));
  const effectiveCampaignSlugs = effectiveCampaigns.map((c) => c.campaign_id).filter(Boolean);

  return {
    studyId,
    studyName: membership.name,
    unrestricted: scope.unrestricted,
    isEmpty: effectiveCampaigns.length === 0,
    surveys: inStudy,
    effectiveCampaigns,
    effectiveCampaignSlugs,
    kind,
    canManage,
    belowMinimum: kind === "user" && inStudy.length < 2,
    ownerOrganisationName,
    manageOnly: false,
  };
}
