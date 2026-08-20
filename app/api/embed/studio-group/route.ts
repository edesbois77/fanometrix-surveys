// Public endpoint — no auth required.
//
// Serves a Studio Campaign Group: resolves the group's currently EFFECTIVE
// configuration revision, picks one eligible member from it, and returns that
// campaign's survey exactly as /api/embed/campaign would.
//
// This is the Studio counterpart to /api/embed/group. The two never overlap:
// each pins its own owner_model, so a group is served by exactly one of them.
// They are separate endpoints rather than one branching endpoint because the
// legacy path is in live WWC fieldwork and must not change shape — see the
// production freeze in the P0 handover.
//
// What is different from the legacy path, and why:
//
//   • Membership comes from a configuration REVISION, not campaign_group_members.
//     The revision froze the moment it took effect (migration 211), so what we
//     serve now is exactly what was configured then.
//   • The response carries configuration_revision_id. The client echoes it back
//     on every event, answer and submission, so evidence is attributable to the
//     configuration that produced it even if the group is edited mid-session.
//   • The cache lifetime is clamped to the next scheduled revision, so a
//     scheduled change takes effect on time without a scheduler.
//   • fail_mode decides what "nothing eligible" means: 'open' 404s and lets the
//     publisher's own fallback fill the slot (legacy behaviour), 'closed'
//     refuses rather than risk an unattributed impression.

import { NextRequest, NextResponse } from "next/server";
import { resolveCreativeForEmbed } from "@/lib/embed-creative";
import { resolveSurveyJourney, SURVEY_JOURNEY_COLUMNS, type SurveyJourneyRow } from "@/lib/embed-journey";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { LangCode } from "@/lib/survey-locale";
import { loadStudioGroupBySlug, loadRevisions, loadCampaignFacts } from "@/lib/campaign-groups/store";
import { effectiveRevision, cacheTtlMs } from "@/lib/campaign-groups/revision";
import { evaluateMembers, type RoutingContext } from "@/lib/campaign-groups/eligibility";
import { selectMember } from "@/lib/campaign-groups/selection";
import { resolveAttribution, routingClaims, attributionMismatches } from "@/lib/campaign-groups/attribution";
import { activeMembers } from "@/lib/campaign-groups/model";
import { campaignGroupsStudioEnabled, DISABLED_RESPONSE } from "@/lib/campaign-groups/flag";

const NO_CACHE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma":        "no-cache",
  "Expires":       "0",
} as const;

/**
 * Cache headers bounded by the next scheduled revision.
 *
 * s-maxage may never outlive a pending revision's effective_at, or the CDN
 * would keep serving the superseded configuration after the operator has been
 * told the new one is live. stale-while-revalidate is capped at the same
 * boundary for the same reason.
 */
function liveCacheHeaders(ttlMs: number): Record<string, string> {
  const seconds = Math.floor(ttlMs / 1000);
  if (seconds <= 0) return { ...NO_CACHE };
  return { "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}` };
}

export async function GET(req: NextRequest) {
  try {
    return await serve(req);
  } catch (err) {
    // The store throws on a failed read rather than returning empty, because an
    // empty result is indistinguishable from a correctly unconfigured group and
    // would serve nothing while looking healthy. Turn that into a 503 the caller
    // can see and an operator can find in the logs — never a silent 404.
    console.error("[embed/studio-group] resolution failed:", err);
    return NextResponse.json({ error: "Group temporarily unavailable" }, { status: 503, headers: NO_CACHE });
  }
}

async function serve(req: NextRequest) {
  // Rollout gate. A 404 rather than a fail_mode refusal: when the capability is
  // off it does not exist, so a publisher's tag behaves exactly as it would
  // against a slug that was never created, and their own fallback fills the
  // slot. Checked FIRST, before any database work.
  if (!campaignGroupsStudioEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE, { status: 404, headers: NO_CACHE });
  }

  const p = req.nextUrl.searchParams;
  const slug = p.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  // Unverified routing context. Written by whoever assembled the ad tag, used
  // to CHOOSE a campaign and never recorded as a fact about the impression.
  const ctx: RoutingContext = {
    country:   p.get("country")?.trim().toUpperCase() || null,
    market:    p.get("market")?.trim() || null,
    publisher: p.get("publisher")?.trim() || null,
  };
  const urlLang = p.get("lang")?.trim() || null;

  const now = new Date();
  const group = await loadStudioGroupBySlug(slug);
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404, headers: NO_CACHE });

  // Group-level gates, before any member work.
  if (group.status !== "live") {
    return NextResponse.json({ error: "Group not live" }, { status: 404, headers: NO_CACHE });
  }
  if (group.startDate && new Date(`${group.startDate}T00:00:00`) > now) {
    return NextResponse.json({ error: "Group not yet started" }, { status: 404, headers: NO_CACHE });
  }
  if (group.endDate && new Date(`${group.endDate}T23:59:59`) < now) {
    return NextResponse.json({ error: "Group has ended" }, { status: 404, headers: NO_CACHE });
  }

  const revisions = await loadRevisions(group.id);
  const ttlMs = cacheTtlMs(revisions, now);
  const revision = effectiveRevision(revisions, now);

  // A group with no effective revision has never been configured, or every
  // revision was cancelled. Either way there is nothing to serve, and this is
  // a configuration state rather than an error.
  if (!revision) {
    return refuse(group.failMode, "Group has no effective configuration", slug);
  }

  const candidates = activeMembers(revision);
  const facts = await loadCampaignFacts(candidates.map(m => m.campaignId));
  const decisions = evaluateMembers(candidates, facts, ctx, now);
  const eligible = decisions.filter(d => d.eligible).map(d => d.member);

  if (eligible.length === 0) {
    // Log the actual reasons so an operator can see WHY a live group served
    // nothing, rather than inferring it from an empty response.
    const reasons = decisions.map(d => `${d.member.campaignSlug}=${d.reason}`).join(" ");
    console.info(`[embed/studio-group] ${slug}: no eligible member (rev ${revision.id}) ${reasons}`);
    return refuse(group.failMode, "No eligible campaign", slug);
  }

  const chosen = selectMember(eligible, revision.rotation);
  if (!chosen) return refuse(group.failMode, "No eligible campaign", slug);

  const campaign = facts.get(chosen.campaignId)!;

  // Everything persisted about this serve is resolved from the campaign row.
  const attribution = resolveAttribution(campaign, revision.id);
  const mismatches = attributionMismatches(routingClaims(ctx), attribution, campaign.publisherName);
  if (mismatches.length) {
    // An ad tag contradicting its campaign's configuration is an ad-ops defect
    // worth seeing. It does not change what we record: the campaign wins.
    console.info(`[embed/studio-group] ${slug}: tag/campaign disagreement on ${mismatches.join(",")} for ${campaign.slug}`);
  }

  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select(`id, name, ${SURVEY_JOURNEY_COLUMNS}`)
    .eq("id", attribution.surveyId!)
    .single();

  if (!survey) {
    // Eligibility already established the survey exists and validates, so this
    // is a race (deleted between the two reads), not an expected state.
    return refuse(group.failMode, "Survey unavailable", slug);
  }

  // Language priority matches every other embed surface: explicit ?lang=, then
  // the campaign's configured language, then English.
  const { data: campaignRow } = await supabaseAdmin
    .from("campaigns").select("survey_language, creative_design, topic").eq("id", campaign.id).single();
  const lang = (urlLang ?? campaignRow?.survey_language ?? "en") as LangCode;

  // The SHARED resolver, so this surface cannot drift from /api/embed/survey.
  const creative = await resolveCreativeForEmbed(
    campaignRow?.creative_design as string | null,
    (campaignRow?.topic as string | null) ?? null,
  );

  return NextResponse.json(
    {
      campaign_id:     attribution.campaignSlug,
      survey_language: lang,
      ...creative,
      ...resolveSurveyJourney(survey as unknown as SurveyJourneyRow, lang),

      // ── Configuration provenance ──────────────────────────────────────────
      // The client echoes this back on every event, answer and submission. It
      // means "this session was served under this configuration"; it does NOT
      // prove delivery, because WP1 keeps no assignment ledger. Server-side
      // validation (lib/campaign-groups/revision.ts) checks only that the
      // revision was ELIGIBLE to govern a serve.
      configuration_revision_id: attribution.configurationRevisionId,
      group_slug: slug,
    },
    { headers: liveCacheHeaders(ttlMs) },
  );
}

/**
 * What a group does when it cannot serve.
 *
 * 'open'   404 — indistinguishable from the legacy path, so a publisher's
 *          existing fallback fills the slot exactly as it does today.
 * 'closed' 409 — the group is a governed instrument and would rather show
 *          nothing than produce an impression it cannot attribute. A distinct
 *          status so ad-ops can tell a deliberate refusal from a missing group.
 */
function refuse(failMode: string, reason: string, slug: string) {
  if (failMode === "closed") {
    console.info(`[embed/studio-group] ${slug}: fail-closed — ${reason}`);
    return NextResponse.json(
      { error: reason, fail_mode: "closed" },
      { status: 409, headers: NO_CACHE },
    );
  }
  return NextResponse.json({ error: reason }, { status: 404, headers: NO_CACHE });
}
