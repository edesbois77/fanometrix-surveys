import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";
import { generateCampaignName, generateCampaignSlug, studyTypeLabel } from "@/lib/naming";
import { countryByCode } from "@/lib/countries";
import { getCompletedLanguages, type LangCode } from "@/lib/survey-locale";
import { expectedSurveyLanguage, LANGUAGE_DISPLAY_NAMES } from "@/lib/locales";

type Combo = { publisherName: string; publisherOrgId: string; countryCode: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  if (session.role !== "admin" && !(await canAccess(session, "research_project", id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from("research_projects")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Research project not found." }, { status: 404 });
  }

  // Publishers/countries are the project's own saved target matrix — set via
  // the project drawer, not passed in per-request — so this action is a
  // simple, repeatable "catch up the deployments" click.
  const publisherOrgIds = (project.publisher_org_ids ?? []) as string[];
  const countryCodes = (project.country_codes ?? []) as string[];

  // Resolve organisation names by id — used for generated campaign names/slugs
  // and for the created/restored/failed summaries returned to the UI.
  const orgIdsToResolve = Array.from(new Set([
    ...publisherOrgIds,
    ...(project.brand_org_id ? [project.brand_org_id] : []),
  ]));
  const { data: resolvedOrgs } = orgIdsToResolve.length > 0
    ? await supabaseAdmin.from("organisations").select("id, name").in("id", orgIdsToResolve)
    : { data: [] as { id: string; name: string }[] };
  const orgNameById = new Map((resolvedOrgs ?? []).map(o => [o.id, o.name]));

  if (publisherOrgIds.length === 0) {
    return NextResponse.json({ error: "Add at least one publisher to this project before generating deployments." }, { status: 400 });
  }
  if (countryCodes.length === 0) {
    return NextResponse.json({ error: "Add at least one country to this project before generating deployments." }, { status: 400 });
  }
  if (!project.survey_id) {
    return NextResponse.json({ error: "Select a survey for this project before generating deployments." }, { status: 400 });
  }

  const unknownCodes = countryCodes.filter(c => !countryByCode(c));
  if (unknownCodes.length > 0) {
    return NextResponse.json({ error: `Unrecognised country code(s): ${unknownCodes.join(", ")}` }, { status: 400 });
  }

  // Hard block on survey/language mismatch — mirrors the client-side check.
  // A country whose expected language isn't one Fanometrix can author
  // surveys in yet (e.g. Italian) is always reported as missing.
  const { data: projectSurvey } = await supabaseAdmin
    .from("surveys")
    .select("questions, thank_you_title, thank_you_body")
    .eq("id", project.survey_id)
    .single();
  const completedLangs = getCompletedLanguages({
    questions: projectSurvey?.questions ?? [],
    thank_you_title: projectSurvey?.thank_you_title,
    thank_you_body: projectSurvey?.thank_you_body,
  });
  const missingLanguages = countryCodes
    .map(code => ({ code, lang: expectedSurveyLanguage(code) }))
    .filter(({ lang }) => !completedLangs.includes(lang as LangCode));
  if (missingLanguages.length > 0) {
    const detail = missingLanguages.map(({ code, lang }) => `${code} → ${LANGUAGE_DISPLAY_NAMES[lang] ?? lang}`).join(", ");
    return NextResponse.json(
      { error: `Survey language mismatch — the project survey has no translation for: ${detail}. Fix the survey or remove these countries before generating.` },
      { status: 400 }
    );
  }

  const allCombos: Combo[] = [];
  for (const publisherOrgId of publisherOrgIds) {
    for (const countryCode of countryCodes) {
      allCombos.push({ publisherOrgId, publisherName: orgNameById.get(publisherOrgId) ?? "", countryCode });
    }
  }

  const topic = project.topic || "";
  const theme = studyTypeLabel(project.study_type);
  const brand = project.brand_org_id ? orgNameById.get(project.brand_org_id) ?? "" : "";
  const agency = project.agency_org_id ? orgNameById.get(project.agency_org_id) ?? "" : "";
  const nowIso = new Date().toISOString();

  // Compute each combo's slug up front, then look up ALL campaigns with a
  // matching slug regardless of deleted_at — a soft-deleted campaign still
  // occupies its campaign_id (unique constraint), so re-generating after a
  // delete must restore that row rather than try to insert a duplicate.
  const slugByCombo = allCombos.map(combo => {
    const country = countryByCode(combo.countryCode)!;
    return {
      combo,
      country,
      campaignName: generateCampaignName(topic, theme, brand, agency, country.name, combo.publisherName),
      campaignSlug: generateCampaignSlug(topic, theme, brand, agency, country.name, combo.publisherName),
    };
  });

  const { data: clashes } = await supabaseAdmin
    .from("campaigns")
    .select("id, campaign_id, deleted_at, research_project_id")
    .in("campaign_id", slugByCombo.map(s => s.campaignSlug));

  const clashBySlug = new Map((clashes ?? []).map(c => [c.campaign_id, c]));

  const created: Array<{ publisher: string; country: string; campaign_id: string }> = [];
  const restored: Array<{ publisher: string; country: string; campaign_id: string }> = [];
  const skippedExisting: Combo[] = [];
  const failed: Array<{ publisher: string; country: string; reason: string }> = [];

  for (const { combo, country, campaignName, campaignSlug } of slugByCombo) {
    const clash = clashBySlug.get(campaignSlug);

    if (clash && !clash.deleted_at) {
      // Already exists and active — this is the normal idempotent "nothing to do" case.
      skippedExisting.push(combo);
      continue;
    }

    if (clash && clash.deleted_at && clash.research_project_id === project.id) {
      // Our own deployment was deleted — restore it rather than fail on the unique constraint.
      // Also refreshes survey_language and description to the project's current values, in
      // case they were wrong/blank when this row was first generated (see the insert branch
      // below) or the project's description has since changed.
      const { error } = await supabaseAdmin
        .from("campaigns")
        .update({
          deleted_at: null, deleted_by: null, delete_reason: null,
          survey_language: expectedSurveyLanguage(combo.countryCode),
          campaign_description: project.description || null,
          status: project.status, status_updated_at: nowIso, updated_at: nowIso,
          publisher_org_id: combo.publisherOrgId,
          brand_org_id: project.brand_org_id ?? null,
          agency_org_id: project.agency_org_id ?? null,
          topic: topic || null,
          study_type: project.study_type,
        })
        .eq("id", clash.id);
      if (error) {
        failed.push({ publisher: combo.publisherName, country: country.name, reason: error.message });
      } else {
        restored.push({ publisher: combo.publisherName, country: country.name, campaign_id: campaignSlug });
      }
      continue;
    }

    if (clash && clash.deleted_at) {
      // Slug is held by a deleted campaign that isn't ours to restore (e.g. moved
      // between projects, or a coincidental manual campaign) — don't repurpose it.
      failed.push({ publisher: combo.publisherName, country: country.name, reason: "Campaign ID already exists (deleted, different context)" });
      continue;
    }

    // No clash — genuinely new deployment.
    const { error } = await supabaseAdmin
      .from("campaigns")
      .insert([{
        campaign_id: campaignSlug,
        campaign_name: campaignName,
        topic: topic || null,
        brand_org_id: project.brand_org_id ?? null,
        agency_org_id: project.agency_org_id ?? null,
        // Seeded from the project's own description — a one-time copy, not
        // live-inherited, so each deployment can be edited individually
        // afterward without affecting its siblings.
        campaign_description: project.description || null,
        publisher_org_id: combo.publisherOrgId,
        country_code: combo.countryCode,
        market: country.name,
        // Defaults to the country's expected language (e.g. DE → de) — the
        // language-mismatch check above already guarantees the project survey
        // has that translation, so this is never a silent fallback to English.
        survey_language: expectedSurveyLanguage(combo.countryCode),
        study_type: project.study_type,
        research_project_id: project.id,
        survey_id: null,
        start_date: null,
        end_date: null,
        target_responses: null,
        archive_after_days: null,
        tags: null,
        status: project.status,
        status_updated_at: nowIso,
        updated_at: nowIso,
        created_by_admin: session.role === "admin",
      }])
      .select()
      .single();

    if (error) {
      failed.push({
        publisher: combo.publisherName,
        country: country.name,
        reason: error.code === "23505" ? "Campaign ID already exists" : error.message,
      });
    } else {
      created.push({ publisher: combo.publisherName, country: country.name, campaign_id: campaignSlug });
    }
  }

  return NextResponse.json({
    data: {
      created,
      restored,
      skipped_existing: skippedExisting.map(c => ({
        publisher: c.publisherName,
        country: countryByCode(c.countryCode)?.name ?? c.countryCode,
      })),
      failed,
    },
  });
}
