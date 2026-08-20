// Public — no auth required.
// Primary embed fetch path when campaign= is in the URL.
// Takes priority over survey= — uses the campaign slug to find the correct survey.
// Does NOT run MPU char-count validation (that's an admin authoring concern, not a live-serve concern).
// DOES enforce: campaign must be live, survey must be status=ready (not deleted/archived/draft).
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canPreviewCampaign } from "@/lib/embed-preview-auth";
import { computeEffectiveStatus, type CampaignForStatus } from "@/lib/campaign-status";
import { resolveQuestion, resolveText, type LangCode, type LocalisedQuestion, type LocalisedText } from "@/lib/survey-locale";
import { resolveSystemThankYou, isSystemThankYouSurvey } from "@/lib/system-thankyou";
import { buildEmbedThemeFromState, resolveBrandingLogos, type BuilderState, type BrandingConfig } from "@/lib/creative-theme-builder";
import { coerceStackConfig, resolveEffectiveTopic } from "@/lib/stack-config";
import type { EmbedTheme } from "@/app/embed/ThemedSurvey";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma":        "no-cache",
  "Expires":       "0",
} as const;

// Live, non-preview config is deterministic for a given (campaign_id, lang) and
// changes rarely, so it is safe to cache briefly at the CDN. This is the single
// biggest per-impression cost after static assets: previously every impression
// ran this function (no-store). With s-maxage the origin runs at most ~once per
// minute per (campaign_id, lang); stale-while-revalidate serves a warm copy
// while one request refreshes in the background, so fans never wait on origin.
//   • published edits / status changes appear within ≤60s (reasonable);
//   • drafts / non-live / not-found stay no-store below, so nothing unpublished
//     is ever cached and a campaign going live is picked up on the next request;
//   • preview is always no-store so authors see edits immediately.
const LIVE_CACHE = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
} as const;

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get("campaign_id");
  const urlLang    = req.nextUrl.searchParams.get("lang");
  const preview    = req.nextUrl.searchParams.get("preview") === "1";

  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id is required" }, { status: 400, headers: NO_CACHE });
  }

  // P0 exposure remediation. `?preview=1` bypasses the effective-status gate
  // below and serves DRAFT surveys, so it must not be reachable anonymously —
  // a campaign slug is not a secret. Authors keep working exactly as before:
  // the Studio preview iframe is same-origin, so its session cookie is sent.
  // A 404 (not 403) keeps "denied" and "no such campaign" indistinguishable.
  if (preview && !(await canPreviewCampaign(req, campaignId))) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404, headers: NO_CACHE });
  }

  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    // Lifecycle fields (start/end/target/target_mode/override) added so serve-time
    // gating matches the trusted effective-status engine, not just stored status —
    // a future-start, ended or stop-at-target campaign must stop serving even while
    // stored status is still "live" (mirrors the group embed path).
    .select("campaign_id, status, manual_status_override, start_date, end_date, target_responses, target_mode, archive_after_days, status_updated_at, country_code, survey_language, creative_design, survey_id, research_project_id, topic")
    .eq("campaign_id", campaignId)
    .is("deleted_at", null)
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404, headers: NO_CACHE });
  }

  // Effective-status gate (skipped for preview, which authors use to see drafts).
  // Fast path: draft/paused/closed/archived can never be effectively live, so reject
  // without a count query. For stored live/scheduled, compute effective status from a
  // live response count so future-start (scheduled), past-end and stop-at-target
  // campaigns stop serving. continue-mode campaigns over target stay live (the count
  // does not close them — see lib/campaign-status.ts). This count matches the one the
  // /api/submit ceiling uses (real responses only), so serve and submit agree.
  if (!preview) {
    if (campaign.status !== "live" && campaign.status !== "scheduled") {
      return NextResponse.json({ error: "Campaign is not live" }, { status: 404, headers: NO_CACHE });
    }
    const { count } = await supabaseAdmin
      .from("responses")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("is_demo", false);
    const effective = computeEffectiveStatus(campaign as CampaignForStatus, count ?? 0);
    if (effective !== "live") {
      return NextResponse.json({ error: "Campaign is not live" }, { status: 404, headers: NO_CACHE });
    }
  }

  // Resolve inherited fields (survey, creative design) from the linked Research
  // Project whenever the campaign has left them blank to inherit.
  // research_projects is service-role-only (RLS denies anon), so this lookup
  // uses supabaseAdmin even though the rest of this public route uses the anon client.
  let effectiveSurveyId = campaign.survey_id as string | null;
  let effectiveCreativeDesign = campaign.creative_design as string | null;
  if (campaign.research_project_id) {
    if (!effectiveSurveyId) {
      const { data: project } = await supabaseAdmin
        .from("research_projects")
        .select("survey_id")
        .eq("id", campaign.research_project_id)
        .single();
      effectiveSurveyId ??= project?.survey_id ?? null;
    }
    // Inherited creative design is survey-scoped (migration 094): it lives on the
    // survey's research_project_evidence row, NOT the deprecated project-level
    // research_projects.creative_design. Mirror the campaign editor / list
    // resolution so the embed renders the same creative the editor shows —
    // otherwise a campaign inheriting a per-survey creative (e.g. a Countdown
    // theme chosen in the multi-campaign wizard) falls back to the base theme.
    if (effectiveCreativeDesign == null && effectiveSurveyId) {
      const { data: evidenceRow } = await supabaseAdmin
        .from("research_project_evidence")
        .select("creative_design")
        .eq("research_project_id", campaign.research_project_id)
        .eq("evidence_type", "survey")
        .eq("evidence_id", effectiveSurveyId)
        .maybeSingle();
      effectiveCreativeDesign ??= evidenceRow?.creative_design ?? null;
    }
  }

  if (!effectiveSurveyId) {
    return NextResponse.json({ error: "No survey attached to this campaign" }, { status: 404, headers: NO_CACHE });
  }

  const { data: survey } = await supabaseAdmin
    .from("surveys")
    // intro_* / thank_you_enabled = Phase 3 Survey-journey columns (migration 182);
    // untyped client → `any`, degrade to undefined if not yet migrated.
    .select("id, status, questions, thank_you_title, thank_you_body, intro_enabled, intro_title, intro_body, thank_you_enabled")
    .eq("id", effectiveSurveyId)
    .single();

  if (!survey) {
    return NextResponse.json({ error: "No survey attached to this campaign" }, { status: 404, headers: NO_CACHE });
  }

  // Never serve deleted, archived or draft surveys (preview bypasses draft only)
  const blockedStatuses = preview ? ["deleted", "archived"] : ["deleted", "archived", "draft"];
  if (blockedStatuses.includes(survey.status)) {
    return NextResponse.json({ error: "Survey is not available" }, { status: 404, headers: NO_CACHE });
  }

  // Language priority: explicit URL param > campaign survey_language > en
  const lang = ((urlLang ?? campaign.survey_language ?? "en") as LangCode);
  const questions = ((survey.questions ?? []) as LocalisedQuestion[]).map(q => resolveQuestion(q, lang));

  // Every creative_design slug — built-in or custom — is now a row in
  // creative_designs; resolve its layout + render palette from there.
  let customTheme: EmbedTheme | null = null;
  let branding: string[] = [];
  let creativeLayout: string | null = null;
  let stackConfig: unknown = null; // config jsonb — only meaningful for layout "stack"
  let effectiveTopic: string | null = null; // resolved default/override/cleared Topic
  let renderer: string | null = null; // explicit renderer selector (config.renderer ?? layout)
  if (effectiveCreativeDesign) {
    const { data: design } = await supabaseAdmin
      .from("creative_designs")
      .select("layout, builder_state, branding, config")
      .eq("slug", effectiveCreativeDesign)
      .is("deleted_at", null)
      .single();
    creativeLayout = design?.layout ?? null;
    // Durable, explicit renderer selector for the strangler: a design may pin a
    // specific renderer via config.renderer (e.g. "studio-classic" — the refreshed
    // Classic). Historical `classic` designs have no config.renderer, so they
    // resolve to their layout and keep rendering via ClassicSurvey. NEVER keyed on
    // layout alone, so historical traffic can never be redirected.
    renderer = ((design?.config as Record<string, unknown> | null)?.renderer as string) ?? creativeLayout;
    // "invitation" is the timer creative with an intro screen — same palette
    // build; the client decides whether to show the intro from `layout`.
    if ((design?.layout === "timer" || design?.layout === "invitation") && design.builder_state) {
      customTheme = buildEmbedThemeFromState(design.builder_state as BuilderState);
    }
    branding = resolveBrandingLogos(design?.branding as BrandingConfig | null);
    // Stack config lives in a separate jsonb column. Fetched only for stack, in
    // its own query so a not-yet-migrated `config` column degrades to defaults
    // (null) instead of breaking the main resolution for every other design.
    if (design?.layout === "stack") {
      const { data: cfg } = await supabaseAdmin
        .from("creative_designs").select("config").eq("slug", effectiveCreativeDesign).single();
      stackConfig = cfg?.config ?? null;
      // Default (design) / override (campaign text) / cleared (campaign "") → effective Topic.
      effectiveTopic = resolveEffectiveTopic(campaign.topic as string | null, coerceStackConfig(cfg?.config).defaultTopic);
    }
  }

  return NextResponse.json({
    campaign_id:     campaign.campaign_id,
    survey_language: lang,
    creative_design:  effectiveCreativeDesign,
    custom_theme:    customTheme,
    layout:          creativeLayout,
    renderer:        renderer,
    config:          stackConfig,
    // Effective Stack Topic: design default, unless the campaign overrode or cleared it.
    topic:           effectiveTopic,
    branding,
    questions,
    thank_you_title: isSystemThankYouSurvey(survey.intro_enabled as boolean | null) ? resolveSystemThankYou(lang).title : (resolveText((survey.thank_you_title as LocalisedText | null) ?? {}, lang) || "Thank you!"),
    thank_you_body:  isSystemThankYouSurvey(survey.intro_enabled as boolean | null) ? resolveSystemThankYou(lang).body  : (resolveText((survey.thank_you_body as LocalisedText | null) ?? {}, lang) || "Your anonymous feedback helps improve the football experience for fans everywhere."),
    thank_you_system: isSystemThankYouSurvey(survey.intro_enabled as boolean | null),
    // Phase 3 Survey-journey fields, resolved to `lang` like the Thank-You copy.
    // Raw tri-state (null for legacy). NULL→false would drop Stack's always-on intro.
    intro_enabled:     (survey.intro_enabled as boolean | null) ?? null,
    intro_title:       resolveText((survey.intro_title as LocalisedText | null) ?? {}, lang) || null,
    intro_body:        resolveText((survey.intro_body  as LocalisedText | null) ?? {}, lang) || null,
    thank_you_enabled: (survey.thank_you_enabled as boolean | null) ?? null,
  }, { headers: preview ? NO_CACHE : LIVE_CACHE });
}
