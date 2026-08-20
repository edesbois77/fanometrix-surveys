// ── Survey Studio → Deploy: server-authoritative campaign activation ──────────
// The deliberate Deploy gate. The CLIENT never decides publish-vs-go_live — this
// endpoint decides the target status from the campaign's MARKET-LOCAL start
// boundary (resolveDeployTargetStatus): start already arrived → "live"; start in
// the future → "scheduled" (deployed-but-waiting; the lazy effective-status engine
// flips it to Live at the market-local start, no cron). A Draft NEVER activates
// on its own — only this action, taken deliberately, transitions it.
//
// Authoritative checks: organisation ownership (like the survey route), a valid
// state transition (atomic UPDATE guarded on status='draft'), per-campaign config
// readiness (validateCampaignConfig) AND survey governance (creative chosen +
// localisation complete for the campaign's delivery language) — reusing the
// existing authoritative helpers, not a second readiness model. No new tables, no
// scheduler, no migration.
import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CAMPAIGN_ORIGIN } from "@/lib/campaign-groups/model";
import { computeLocalisationStatus } from "@/lib/survey-localisation";
import { resolveDeployTargetStatus } from "@/lib/campaign-time";
import { validateCampaignConfig, STUDIO_SLUG_PREFIX } from "@/lib/studio/campaign-generation";
import { listStudioCampaigns } from "@/lib/studio/campaign-list";


type SurveyRow = {
  id: string; name: string; organisation_id: string | null; creative_design: string | null;
  questions: unknown; intro_enabled: boolean | null; intro_title: unknown; intro_body: unknown;
};

/** Governance + config blockers for deploying ONE campaign. [] = deployable. */
function deployBlockers(campaign: { start_date: string | null; end_date: string | null; target_responses: number | null; target_mode: string | null; survey_language: string }, survey: SurveyRow): string[] {
  const problems = validateCampaignConfig(campaign);
  if (!survey.creative_design) problems.push("Survey has no Creative selected.");
  const content = {
    questions: (Array.isArray(survey.questions) ? survey.questions : []) as never,
    introEnabled: !!survey.intro_enabled,
    introTitle: (survey.intro_title ?? {}) as never,
    introBody: (survey.intro_body ?? {}) as never,
  };
  const loc = computeLocalisationStatus(content, [campaign.survey_language]);
  if (!loc.perLanguage[0]?.complete) problems.push(`Survey is not complete in ${campaign.survey_language}.`);
  return problems;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session: AuthedUser;
  try { session = await requireUser(req, ["admin", "publisher"]); } catch { return NextResponse.json({ error: "Unauthorised" }, { status: 401 }); }

  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select("id, name, organisation_id, creative_design, questions, intro_enabled, intro_title, intro_body")
    .eq("id", id).is("deleted_at", null).single();
  if (!survey) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  if (session.role !== "admin" && (survey as SurveyRow).organisation_id !== session.organisationId) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 }); // existence-preserving
  }
  const surveyRow = survey as SurveyRow;

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : (body?.id ? [body.id] : []);
  if (!ids.length) return NextResponse.json({ error: "No campaigns specified." }, { status: 400 });

  // Only this survey's Studio DRAFT campaigns can be deployed.
  const { data: targets } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, status, start_date, end_date, target_responses, target_mode, country_code, survey_language")
    .in("id", ids).eq("survey_id", surveyRow.id).eq("origin", CAMPAIGN_ORIGIN.studio).eq("status", "draft").is("deleted_at", null);

  const now = new Date();
  const nowISO = now.toISOString();
  const deployed: { id: string; status: string }[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const c of (targets ?? []) as Record<string, unknown>[]) {
    const cam = c as unknown as { id: string; start_date: string | null; end_date: string | null; target_responses: number | null; target_mode: string | null; country_code: string | null; survey_language: string };
    const blockers = deployBlockers(cam, surveyRow);
    if (blockers.length) { skipped.push({ id: cam.id, reason: blockers[0] }); continue; }

    const target = resolveDeployTargetStatus(cam.start_date, cam.country_code, now);
    // Atomic valid-transition guard: only flips a row still in Draft.
    const { data: updated, error } = await supabaseAdmin
      .from("campaigns")
      .update({ status: target, status_updated_at: nowISO, updated_at: nowISO })
      .eq("id", cam.id).eq("survey_id", surveyRow.id).eq("status", "draft").is("deleted_at", null)
      .select("id");
    if (error) { return NextResponse.json({ error: "Could not deploy campaign." }, { status: 500 }); }
    if (!updated || updated.length === 0) { skipped.push({ id: cam.id, reason: "Already deployed" }); continue; }

    // Best-effort audit trail (same table the legacy actions use); never fatal.
    try {
      await supabaseAdmin.from("campaign_status_history").insert({
        campaign_id: cam.id, old_status: "draft", new_status: target,
        reason: "Deployed via Survey Studio", changed_by: session.workEmail,
      });
    } catch { /* non-fatal */ }

    deployed.push({ id: cam.id, status: target });
  }

  return NextResponse.json({ campaigns: await listStudioCampaigns(surveyRow.id), deployed, skipped });
}
