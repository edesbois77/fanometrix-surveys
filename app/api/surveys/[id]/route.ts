import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { validateSurvey, nullifyBlankUuids, brandAgencyRefError, type OrgRefRow } from "@/lib/survey-validation";
import { governSurveyQuestions } from "@/lib/studio/scale-templates";
import { logActivity } from "@/lib/research-project-activity";
import { purposeAllowedForCreate, isThirdPartyPurpose } from "@/lib/survey-purpose";
import { canCreateCommissionedResearch } from "@/lib/survey-create-capability";
import { decideSurveyDeletion, type CampaignRow, type CampaignEvidence, type SurveyDeletionDecision } from "@/lib/studio/survey-deletion";
import { resolveSurveyManageData } from "@/lib/studio/survey-manage-data";
import {
  researchDefinitionLocked, researchDefinitionEditBlocked, restoreTargetStatus, restoreAllowed,
  RESEARCH_LOCK_ERROR, ARCHIVE_LIVE_BLOCK,
} from "@/lib/studio/survey-lifecycle";

// The research-definition lock (question/option/type/order/wording/language)
// now lives in lib/studio/survey-lifecycle.ts (researchDefinitionSignature),
// enforced in PUT below — it supersedes the old text-excluding structural
// signature so wording and label edits are protected once collection begins.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { data, error } = await supabaseAdmin.from("surveys").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  if (session.role !== "admin" && data.organisation_id !== session.organisationId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Research-definition lock signal for the Survey Studio editor — the SAME rule
  // the PUT guard enforces: the definition is locked once the survey holds
  // collected evidence OR has a live campaign (even with zero responses yet). The
  // editor mirrors this to disable the structural controls; the server stays
  // authoritative. `has_responses` is kept for backward compatibility.
  const manage = await resolveSurveyManageData(id);
  const research_locked = researchDefinitionLocked(manage);
  return NextResponse.json({ data, has_responses: manage.responseCount > 0, research_locked });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  if (session.role !== "admin") {
    const { data: existing } = await supabaseAdmin.from("surveys").select("organisation_id").eq("id", id).single();
    if (!existing || existing.organisation_id !== session.organisationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json();
  const now = new Date().toISOString();

  // ── Publisher commercial-purpose guardrail (Survey Studio Create) ───────────
  // Authoritative enforcement of the About → Purpose rule at the trusted server
  // boundary. The "may this principal use commissioned/third-party purposes"
  // decision is the governed Q-10 capability create-commissioned-research,
  // consumed (never authored) here from the governed session via
  // canCreateCommissionedResearch(session) → hasCapability(...). A user without
  // it (Publisher self-service Create) may not persist a third-party purpose —
  // that routes to Request. Inert for the legacy editor (never sends `about`).
  const canUseCommissionedPurposes = canCreateCommissionedResearch(session);
  if (body?.about && !purposeAllowedForCreate(canUseCommissionedPurposes, body.about.purpose)) {
    return NextResponse.json(
      {
        error: "Research run for an advertiser, sponsor, client or agency is handled through Request.",
        code: "purpose_requires_request",
      },
      { status: 422 },
    );
  }

  // Optional compare-and-swap token (Survey Studio autosave). When present it is
  // matched against the row's current updated_at so a concurrent save in another
  // tab can't be silently clobbered. It is NOT a persisted column — stripped here.
  const expectedUpdatedAt = typeof body?.expected_updated_at === "string" ? body.expected_updated_at : null;

  // Pull out the action and strip all computed/lifecycle/identity fields
  const {
    _action,
    id: _id, created_at: _ca, updated_at: _ua,
    expected_updated_at: _eua,
    archived_at: _aa, deleted_at: _da, deleted_by: _db,
    delete_reason: _dr, created_by: _cb, organisation_id: _oid,
    campaign_count: _cc, live_campaign_count: _lcc, response_count: _rc,
    ...rest
  } = body;

  let patch: Record<string, unknown>;

  switch (_action) {
    case "archive": {
      // Archive is an operational lifecycle action only. It must NOT stop a live
      // campaign silently — block it while collection is running so the user stops
      // it first. (Archive never touches campaigns/data/Studies/ORE.)
      const manage = await resolveSurveyManageData(id);
      if (manage.hasLiveCampaign) {
        return NextResponse.json({ error: ARCHIVE_LIVE_BLOCK, code: "archive_blocked_live" }, { status: 409 });
      }
      patch = { status: "archived", archived_at: now, updated_at: now };
      break;
    }
    case "restore": {
      // Restoring a SOFT-DELETED survey is admin recovery only; normal owners may
      // only restore an ARCHIVED survey.
      const { data: cur } = await supabaseAdmin.from("surveys").select("status, deleted_at").eq("id", id).single();
      const wasDeleted = cur?.status === "deleted" || !!cur?.deleted_at;
      if (!restoreAllowed({ wasDeleted, isAdmin: session.role === "admin" })) {
        return NextResponse.json(
          { error: "Deleted surveys can only be restored by an administrator.", code: "restore_admin_only" },
          { status: 403 },
        );
      }
      // Smart derived target — a survey that holds research returns to `ready`; a
      // genuinely unfinished, no-data survey returns to `draft`. No schema added.
      const manage = await resolveSurveyManageData(id);
      const target = restoreTargetStatus({ hasEvidence: manage.hasEvidence });
      patch = { status: target, archived_at: null, deleted_at: null, deleted_by: null, delete_reason: null, updated_at: now };
      break;
    }
    default: {
      // Regular content edit — status may only be set to draft or ready this way.
      // Lifecycle transitions (archive, restore, delete) require an explicit _action.
      const { status, ...contentRest } = rest as Record<string, unknown>;
      let safeStatus = status === "draft" || status === "ready" ? status : undefined;

      // ── Research-definition lock (trusted-boundary enforcement) ─────────────
      // Once a survey is collecting live OR holds evidence, its research definition
      // is frozen: questions, answer options, TYPE, ORDER, WORDING in every
      // language, and the enabled-language set. This protects the SEMANTIC
      // integrity of the research even where stored answers stay technically valid
      // (e.g. rewording a question keeps the positional binding but changes what the
      // answers mean). Rejects ONLY a genuine research-definition change; every safe
      // metadata edit (name, objective/description, topic, intro/thank-you, toggles,
      // status) still passes. The UI mirrors this; this is the authoritative half —
      // and it is keyed on live collection too, not response count alone.
      const touchesDefinition = ("questions" in contentRest && Array.isArray(contentRest.questions)) || "enabled_languages" in contentRest;
      if (touchesDefinition) {
        const manage = await resolveSurveyManageData(id);
        const locked = researchDefinitionLocked(manage);
        if (locked) {
          const { data: current } = await supabaseAdmin
            .from("surveys").select("questions, enabled_languages").eq("id", id).single();
          const incomingQuestions = "questions" in contentRest ? contentRest.questions : current?.questions;
          const incomingLanguages = "enabled_languages" in contentRest ? contentRest.enabled_languages : current?.enabled_languages;
          if (researchDefinitionEditBlocked({
            locked,
            storedQuestions: current?.questions,
            storedLanguages: current?.enabled_languages,
            incomingQuestions,
            incomingLanguages,
          })) {
            return NextResponse.json({ error: RESEARCH_LOCK_ERROR, code: "survey_structure_locked" }, { status: 409 });
          }
        }
      }

      // Server-side MPU validation guard: if the payload requests "ready" status,
      // validate the full survey. If it fails, silently downgrade to draft so
      // invalid surveys can never be marked Ready, even via direct API calls.
      if (safeStatus === "ready") {
        const { data: existing } = await supabaseAdmin
          .from("surveys")
          .select("name, questions, thank_you_title, thank_you_body, intro_title, intro_body")
          .eq("id", id)
          .single();
        const merged = { ...(existing ?? {}), ...contentRest };
        const errors = validateSurvey(merged as Parameters<typeof validateSurvey>[0]);
        if (errors.length > 0) {
          safeStatus = "draft"; // auto-downgrade — client should have caught this first
        }
      }

      // Coerce blank Brand/Agency ("") to null — same uuid guard as the
      // create route, so an edit that clears those pickers also saves.
      // Stage 5D: re-establish governed semantics SERVER-SIDE from scale_template
      // alone (client-sent polarity/ordinal is never trusted). Lock-safe: the
      // research-definition signature ignores these metadata fields.
      if ("questions" in contentRest) contentRest.questions = governSurveyQuestions(contentRest.questions);
      patch = { ...nullifyBlankUuids(contentRest), ...(safeStatus ? { status: safeStatus } : {}), updated_at: now };
    }
  }

  // ── Brand/Agency attribution — trusted-boundary integrity (attribution ≠ access) ──
  // A Studio survey (its payload carries `about`) whose Purpose is NOT the
  // commissioned/third-party one keeps NO Brand/Agency — so switching purpose away
  // can never leave stale attribution attached, enforced here regardless of what the
  // client sent. (Legacy editor sends no `about` and is unaffected.) Any reference
  // that IS kept must resolve to a real, non-deleted org of the CORRECT type (a
  // global brand/agency) — never an arbitrary UUID or a publisher/internal org. None
  // of this touches organisation_id / ownership: attribution is not access.
  if (body?.about && !isThirdPartyPurpose(body.about.purpose)) {
    patch.brand_org_id = null;
    patch.agency_org_id = null;
  }
  if (typeof patch.brand_org_id === "string" || typeof patch.agency_org_id === "string") {
    const ids = [patch.brand_org_id, patch.agency_org_id].filter((v): v is string => typeof v === "string" && v !== "");
    const { data: refRows } = ids.length
      ? await supabaseAdmin.from("organisations").select("id, type, deleted_at").in("id", ids)
      : { data: [] as OrgRefRow[] };
    const refErr = brandAgencyRefError(patch.brand_org_id, patch.agency_org_id, (refRows ?? []) as OrgRefRow[]);
    if (refErr) return NextResponse.json({ error: refErr, code: "invalid_org_reference" }, { status: 400 });
  }

  // Compare-and-swap: when the caller supplies expected_updated_at, only update
  // the row if its updated_at still matches. maybeSingle() returns null (0 rows)
  // when a concurrent save already advanced updated_at → respond 409 so the
  // client stops and reloads rather than clobbering the newer write. Without the
  // token, behaviour is exactly as before (unconditional update).
  let updateQuery = supabaseAdmin.from("surveys").update(patch).eq("id", id);
  if (expectedUpdatedAt) updateQuery = updateQuery.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await updateQuery.select().maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    if (expectedUpdatedAt) {
      return NextResponse.json(
        { error: "This survey was changed in another tab. Reload to continue.", code: "stale_write" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Survey not found." }, { status: 404 });
  }

  // A survey isn't tied to a single project, but any Research Project
  // currently pointing at it as its primary survey cares whether its
  // status just changed — log against each one that does.
  if ("status" in patch) {
    const { data: projects } = await supabaseAdmin.from("research_projects").select("id").eq("survey_id", id);
    for (const project of projects ?? []) {
      await logActivity(project.id, "survey_status_changed", `Survey "${data.name}" status changed to ${data.status}.`, session.workEmail);
    }
  }

  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const permanent = searchParams.get("permanent") === "true";
  const now = new Date().toISOString();

  // Permanent (hard) delete stays admin-only, matching the same restriction
  // on other resources' destructive-permanent actions.
  if (permanent && session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.role !== "admin") {
    const { data: existing } = await supabaseAdmin.from("surveys").select("organisation_id").eq("id", id).single();
    if (!existing || existing.organisation_id !== session.organisationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (permanent) {
    // Hard delete — only allowed if the survey is already soft-deleted
    const { data: survey, error: fetchErr } = await supabaseAdmin
      .from("surveys")
      .select("status")
      .eq("id", id)
      .single();

    if (fetchErr || !survey) return NextResponse.json({ error: "Survey not found." }, { status: 404 });

    if (survey.status !== "deleted") {
      return NextResponse.json(
        { error: "Survey must be soft-deleted before it can be permanently removed." },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from("surveys").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Soft delete — blocked ONLY by a genuinely live campaign or collected evidence,
  // never by the mere existence of (draft / closed / legacy) campaign rows. A
  // deletable survey's empty, non-live campaign rows are soft-deleted with it.
  //
  // Evidence is measured directly from the persisted records: survey_events,
  // responses and response_answers by each campaign's slug, plus responses
  // attributed to the survey id. We read the campaign rows once to decide, then
  // re-read them immediately before mutating (fail-closed recheck) so a campaign
  // that raced into a live/data-bearing state is never soft-deleted.
  const decision = await evaluateSurveyDeletion(id);
  if (!decision.deletable) {
    return NextResponse.json({ error: decision.message }, { status: 409 });
  }

  // Fail-closed recheck: re-resolve each candidate campaign's live-status and
  // evidence from scratch and re-run the same rules. If anything changed such that
  // a candidate is no longer safe, abort the whole deletion — mutate nothing.
  const recheck = await evaluateSurveyDeletion(id);
  if (!recheck.deletable) {
    return NextResponse.json({ error: recheck.message }, { status: 409 });
  }
  const sameSet =
    recheck.campaignIdsToSoftDelete.length === decision.campaignIdsToSoftDelete.length &&
    recheck.campaignIdsToSoftDelete.every((cid) => decision.campaignIdsToSoftDelete.includes(cid));
  if (!sameSet) {
    return NextResponse.json(
      { error: "This survey's campaigns changed while deleting. Please try again." },
      { status: 409 }
    );
  }

  // Soft-delete the safe campaign rows first, guarded at the write so the update
  // can only ever touch rows that are still non-live and not already deleted.
  // We never hard-delete, and the guarded predicate makes a live campaign
  // impossible to clear even under a race.
  const idsToClear = recheck.campaignIdsToSoftDelete;
  let clearedCampaignIds: string[] = [];
  if (idsToClear.length > 0) {
    const { data: cleared, error: campErr } = await supabaseAdmin
      .from("campaigns")
      .update({ deleted_at: now, updated_at: now })
      .in("id", idsToClear)
      .neq("status", "live")
      .is("deleted_at", null)
      .select("id");
    if (campErr) return NextResponse.json({ error: campErr.message }, { status: 500 });
    clearedCampaignIds = (cleared ?? []).map((r) => r.id as string);
    if (clearedCampaignIds.length !== idsToClear.length) {
      // A candidate slipped out of the safe set between recheck and write. The
      // guarded predicate means nothing unsafe was touched; abort the survey
      // deletion so we never leave a survey deleted beside a surviving campaign.
      return NextResponse.json(
        { error: "This survey's campaigns changed while deleting. Please try again." },
        { status: 409 }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("surveys")
    .update({ status: "deleted", deleted_at: now, deleted_by: session.workEmail, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, softDeletedCampaignIds: clearedCampaignIds });
}

// ── Survey-deletion evaluation ───────────────────────────────────────────────
// Resolves the persisted campaign rows + collected-evidence counts for a survey
// and applies the pure `decideSurveyDeletion` rules. Called twice by DELETE: once
// to gate, once as the fail-closed recheck immediately before mutation.
async function evaluateSurveyDeletion(surveyId: string): Promise<SurveyDeletionDecision> {
  const { data: campRows } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, status")
    .eq("survey_id", surveyId)
    .is("deleted_at", null);
  const campaigns: CampaignRow[] = (campRows ?? []).map((c) => ({
    id: c.id as string,
    campaign_id: (c.campaign_id as string | null) ?? null,
    status: (c.status as string | null) ?? null,
  }));

  const slugs = campaigns.map((c) => c.campaign_id).filter((s): s is string => !!s);

  // Per-campaign evidence, keyed by campaign row id. Slug is the join key for the
  // event/response/answer tables; multiple rows can (in principle) share a slug, so
  // we count once per distinct slug and attribute to each row carrying it.
  const evidenceBySlug = new Map<string, CampaignEvidence>();
  for (const slug of new Set(slugs)) {
    const [ev, resp, ans] = await Promise.all([
      supabaseAdmin.from("survey_events").select("id", { count: "exact", head: true }).eq("campaign_id", slug),
      supabaseAdmin.from("responses").select("id", { count: "exact", head: true }).eq("campaign_id", slug).eq("is_demo", false),
      supabaseAdmin.from("response_answers").select("id", { count: "exact", head: true }).eq("campaign_id", slug).eq("is_demo", false),
    ]);
    evidenceBySlug.set(slug, {
      events: ev.count ?? 0,
      responses: resp.count ?? 0,
      answers: ans.count ?? 0,
    });
  }
  const evidenceByCampaignId: Record<string, CampaignEvidence | undefined> = {};
  for (const c of campaigns) {
    if (c.campaign_id) evidenceByCampaignId[c.id] = evidenceBySlug.get(c.campaign_id);
  }

  // Responses attributed directly to the survey id (belt-and-braces beyond slugs).
  const { count: surveyRespCount } = await supabaseAdmin
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("survey_id", surveyId)
    .eq("is_demo", false);

  return decideSurveyDeletion({
    campaigns,
    evidenceByCampaignId,
    surveyResponseCount: surveyRespCount ?? 0,
  });
}
