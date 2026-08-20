// P0 Supabase exposure remediation — authorisation for draft preview.
//
// `?preview=1` on /api/embed/survey and /api/embed/campaign bypasses the
// validation and effective-status gates so authors can see DRAFT surveys. That
// bypass was reachable by anyone who knew a survey UUID or campaign slug, which
// made every unpublished research instrument publicly readable.
//
// The Studio preview iframe is same-origin (`<iframe src="/embed?...">` inside
// the authenticated app), so the session cookie is sent with the nested fetch.
// The preview path can therefore require a real session without changing how
// authors use it. Live, non-preview serving is untouched and stays anonymous.
//
// Ownership is never taken from the request. The survey and campaign rows are
// re-read server-side and compared against the session's ACTIVE organisation.
import type { NextRequest } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

/** Organisation columns that make a survey "this organisation's survey". */
type SurveyOwnership = {
  organisation_id: string | null;
  brand_org_id:    string | null;
  agency_org_id:   string | null;
};

/**
 * Resolve the caller's session, or null when there isn't a valid one.
 * requireUser throws for every failure mode (no cookie, disabled user, no
 * active organisation context); preview treats them all identically as "not
 * authorised", so the caller cannot distinguish them by response.
 */
export async function resolvePreviewSession(req: NextRequest): Promise<AuthedUser | null> {
  try {
    return await requireUser(req);
  } catch {
    return null;      // fail closed
  }
}

/** Pure ownership test, extracted so it is directly unit-testable. */
export function ownsSurvey(session: AuthedUser, survey: SurveyOwnership | null): boolean {
  if (!survey) return false;
  if (session.role === "admin") return true;      // platform operator
  const org = session.organisationId;
  if (!org) return false;
  return survey.organisation_id === org
      || survey.brand_org_id    === org
      || survey.agency_org_id   === org;
}

/**
 * May this caller preview this survey's draft content?
 * Fails CLOSED on a missing session, a missing survey, or any lookup error.
 */
export async function canPreviewSurvey(req: NextRequest, surveyId: string): Promise<boolean> {
  const session = await resolvePreviewSession(req);
  if (!session) return false;

  const { data, error } = await supabaseAdmin
    .from("surveys")
    .select("organisation_id, brand_org_id, agency_org_id")
    .eq("id", surveyId)
    .single();
  if (error || !data) return false;

  return ownsSurvey(session, data as SurveyOwnership);
}

/**
 * May this caller preview this campaign's draft content? Resolved through
 * canAccess() on the campaign, which is the same authorisation the authenticated
 * campaign routes already apply — so preview can never exceed what the user can
 * already see in the app.
 * Fails CLOSED on a missing session, an unknown slug, or any lookup error.
 */
export async function canPreviewCampaign(req: NextRequest, campaignSlug: string): Promise<boolean> {
  const session = await resolvePreviewSession(req);
  if (!session) return false;

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("id")
    .eq("campaign_id", campaignSlug)
    .is("deleted_at", null)
    .single();
  if (error || !data) return false;

  // Imported lazily: lib/access pulls in the entitlement graph, which the
  // anonymous live path must never load.
  const { canAccess } = await import("@/lib/access");
  return canAccess(session, "campaign", data.id as string);
}
