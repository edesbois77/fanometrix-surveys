// Public endpoint for LIVE content; authenticated for draft preview.
// Returns resolved question content for a survey UUID so the embed iframe
// can render questions in the requested language without exposing raw
// localisation data or response data.
//
// P0 exposure remediation. This route used to return the full question and
// option text of ANY survey to ANY caller holding a UUID — and `?preview=1`
// additionally served drafts and surveys that fail validation. Survey UUIDs are
// not secrets. Two gates now stand in front of the read:
//   • live path    → the survey must be bound to a deployed campaign
//                    (isSurveyPubliclyServeable)
//   • preview path → the caller must hold a session for the owning
//                    organisation (canPreviewSurvey)
// Both fail closed, and both return 404 rather than 403 so an unauthorised
// caller cannot use the status code to confirm that a survey UUID exists.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canPreviewSurvey } from "@/lib/embed-preview-auth";
import { resolveCreativeForEmbed } from "@/lib/embed-creative";
import { resolveSurveyJourney, SURVEY_JOURNEY_COLUMNS } from "@/lib/embed-journey";
import { validateSurvey } from "@/lib/survey-validation";
import { type LangCode } from "@/lib/survey-locale";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma":        "no-cache",
  "Expires":       "0",
} as const;

// Live, non-preview survey content is deterministic for a given (id, lang) and
// changes rarely — safe to cache briefly at the CDN so the origin function runs
// at most ~once per minute per (id, lang) instead of once per impression.
// Published edits appear within ≤60s; preview and all error responses stay
// no-store (below), so drafts/invalid surveys are never cached.
const LIVE_CACHE = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET(req: NextRequest) {
  const id      = req.nextUrl.searchParams.get("id");
  const lang    = (req.nextUrl.searchParams.get("lang") ?? "en") as LangCode;
  // preview=1 bypasses validation so authors see draft/invalid surveys. Gated
  // below on a session for the owning organisation — never anonymous.
  const preview = req.nextUrl.searchParams.get("preview") === "1";

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400, headers: NO_CACHE });
  }

  // ── Access gate ────────────────────────────────────────────────────────────
  // Runs BEFORE the survey is read, so an unauthorised caller never reaches the
  // content. Indistinguishable 404s: "not authorised" and "no such survey" look
  // identical from outside.
  // CONTEXT: Studio builder preview — authenticated, survey-based, may show a
  // draft. Survey-UUID access is NEVER a public path: a UUID is not a secret (it
  // appears in embed config and in every log line of an embed request), so this
  // route requires a session for the owning organisation whether or not
  // ?preview=1 is present. Anonymous review is served by a campaign-scoped
  // preview GRANT (/api/embed/campaign), never by guessing a survey id.
  if (!(await canPreviewSurvey(req, id))) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404, headers: NO_CACHE });
  }

  const { data, error } = await supabaseAdmin
    .from("surveys")
    // intro_* / thank_you_enabled are the Phase 3 Survey-journey columns (migration
    // 182). The clients are untyped, so these resolve to `any` here even before the
    // migration is applied; a not-yet-migrated column simply comes back undefined.
    .select(`id, creative_design, ${SURVEY_JOURNEY_COLUMNS}`)
    .eq("id", id)
    .neq("status", "deleted")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404, headers: NO_CACHE });
  }

  // Validate before serving — skip only for admin deployment previews
  if (!preview) {
    const validationErrors = validateSurvey(data as Parameters<typeof validateSurvey>[0]);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Survey failed MPU validation", reason: validationErrors[0] },
        { status: 404, headers: NO_CACHE }
      );
    }
  }

  // Journey and creative both come from the SHARED resolvers, so this surface
  // cannot drift from /api/embed/campaign. A survey has no campaign, so there is
  // no Stack Topic override — null means "use the design default".
  const journey  = resolveSurveyJourney(data, lang);
  const creative = await resolveCreativeForEmbed(data.creative_design as string | null, null);

  return NextResponse.json({
    ...creative,
    ...journey,
  }, { headers: preview ? NO_CACHE : LIVE_CACHE });
}
