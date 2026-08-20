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
import { isSurveyPubliclyServeable } from "@/lib/embed-survey-access";
import { canPreviewSurvey } from "@/lib/embed-preview-auth";
import { validateSurvey } from "@/lib/survey-validation";
import { resolveQuestion, resolveText, type LangCode, type LocalisedQuestion, type LocalisedText } from "@/lib/survey-locale";
import { resolveSystemThankYou, isSystemThankYouSurvey } from "@/lib/system-thankyou";

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
  const allowed = preview
    ? await canPreviewSurvey(req, id)
    : await isSurveyPubliclyServeable(id);
  if (!allowed) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404, headers: NO_CACHE });
  }

  const { data, error } = await supabaseAdmin
    .from("surveys")
    // intro_* / thank_you_enabled are the Phase 3 Survey-journey columns (migration
    // 182). The clients are untyped, so these resolve to `any` here even before the
    // migration is applied; a not-yet-migrated column simply comes back undefined.
    .select("id, questions, thank_you_title, thank_you_body, intro_enabled, intro_title, intro_body, thank_you_enabled")
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

  // Resolve localised questions to the requested language (falls back to en)
  const questions = ((data.questions ?? []) as LocalisedQuestion[]).map(q =>
    resolveQuestion(q, lang)
  );

  // Survey-level Intro copy resolves to the requested language exactly like the
  // Thank-You copy. Emitted only as resolved strings; whether the intro is shown
  // is driven by intro_enabled (NULL/false ⇒ no survey-level intro).
  const introTitle = resolveText((data.intro_title as LocalisedText | null) ?? {}, lang);
  const introBody  = resolveText((data.intro_body  as LocalisedText | null) ?? {}, lang);

  // Mandatory system-owned Thank-You for Studio-journey surveys (intro_enabled set).
  // Historical surveys (intro_enabled NULL) keep their own authored thank-you.
  const systemTy = isSystemThankYouSurvey(data.intro_enabled as boolean | null) ? resolveSystemThankYou(lang) : null;

  return NextResponse.json({
    questions,
    thank_you_title: systemTy ? systemTy.title : (resolveText((data.thank_you_title as LocalisedText | null) ?? {}, lang) || "Thank you!"),
    thank_you_body:  systemTy ? systemTy.body  : (resolveText((data.thank_you_body as LocalisedText | null) ?? {}, lang) || "Your anonymous feedback helps improve the football experience for fans everywhere."),
    thank_you_system: !!systemTy,
    // Phase 3 Survey-journey fields. intro_enabled NULL/false ⇒ no survey-level
    // intro; thank_you_enabled NULL ⇒ enabled (historical default), false ⇒ off.
    // Pass the raw tri-state through (null for legacy surveys). Coercing NULL→false
    // here would make Stack — whose intro is historically ALWAYS ON — drop its intro
    // on live campaigns. The renderer decides the default per mechanic (Stack: on;
    // Timer/Studio Classic: off) from null/undefined.
    intro_enabled:     (data.intro_enabled as boolean | null) ?? null,
    intro_title:       introTitle || null,
    intro_body:        introBody  || null,
    thank_you_enabled: (data.thank_you_enabled as boolean | null) ?? null,
  }, { headers: preview ? NO_CACHE : LIVE_CACHE });
}
