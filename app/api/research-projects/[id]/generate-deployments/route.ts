import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import { generateCampaignName, generateCampaignSlug, studyTypeLabel } from "@/lib/naming";
import { countryByCode } from "@/lib/countries";
import { getCompletedLanguages, type LangCode } from "@/lib/survey-locale";
import { expectedSurveyLanguage, LANGUAGE_DISPLAY_NAMES } from "@/lib/locales";

type Combo = { publisher: string; countryCode: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

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
  const publishers = (project.publishers ?? []) as string[];
  const countryCodes = (project.country_codes ?? []) as string[];

  if (publishers.length === 0) {
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

  const { data: existing } = await supabaseAdmin
    .from("campaigns")
    .select("publisher, country_code")
    .eq("research_project_id", id)
    .is("deleted_at", null);

  const existingPairs = new Set((existing ?? []).map(c => `${c.publisher}::${c.country_code}`));

  const allCombos: Combo[] = [];
  for (const publisher of publishers) {
    for (const countryCode of countryCodes) {
      allCombos.push({ publisher, countryCode });
    }
  }

  const skippedExisting: Combo[] = [];
  const toCreate: Combo[] = [];
  for (const combo of allCombos) {
    if (existingPairs.has(`${combo.publisher}::${combo.countryCode}`)) {
      skippedExisting.push(combo);
    } else {
      toCreate.push(combo);
    }
  }

  const brandOrTopic = project.brand_name || project.topic || "";
  const theme = studyTypeLabel(project.study_type);
  const year = project.year || "";
  const nowIso = new Date().toISOString();

  const created: Array<{ publisher: string; country: string; campaign_id: string }> = [];
  const failed: Array<{ publisher: string; country: string; reason: string }> = [];

  // Insert one at a time so a single slug collision doesn't roll back the whole batch.
  for (const combo of toCreate) {
    const country = countryByCode(combo.countryCode)!;
    const campaignName = generateCampaignName(brandOrTopic, theme, country.name, combo.publisher, year);
    const campaignSlug = generateCampaignSlug(brandOrTopic, theme, country.name, combo.publisher, year);

    const { error } = await supabaseAdmin
      .from("campaigns")
      .insert([{
        campaign_id: campaignSlug,
        campaign_name: campaignName,
        // campaigns.brand_name is NOT NULL — Research Projects allow a blank
        // Brand for non-brand studies, so fall back to Topic, then empty
        // string, matching the naming convention's own brandOrTopic logic.
        brand_name: brandOrTopic,
        campaign_description: null,
        publisher: combo.publisher,
        country_code: combo.countryCode,
        market: country.name,
        research_theme: theme,
        year,
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
      }])
      .select()
      .single();

    if (error) {
      failed.push({
        publisher: combo.publisher,
        country: country.name,
        reason: error.code === "23505" ? "Campaign ID already exists" : error.message,
      });
    } else {
      created.push({ publisher: combo.publisher, country: country.name, campaign_id: campaignSlug });
    }
  }

  return NextResponse.json({
    data: {
      created,
      skipped_existing: skippedExisting.map(c => ({
        publisher: c.publisher,
        country: countryByCode(c.countryCode)?.name ?? c.countryCode,
      })),
      failed,
    },
  });
}
