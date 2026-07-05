import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import { generateCampaignName, generateCampaignSlug, studyTypeLabel } from "@/lib/naming";
import { countryByCode } from "@/lib/countries";

type Combo = { publisher: string; countryCode: string };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const body = await req.json();
  const publishers = (body.publishers ?? []) as string[];
  const countryCodes = (body.country_codes ?? []) as string[];

  if (!Array.isArray(publishers) || publishers.length === 0) {
    return NextResponse.json({ error: "At least one publisher is required." }, { status: 400 });
  }
  if (!Array.isArray(countryCodes) || countryCodes.length === 0) {
    return NextResponse.json({ error: "At least one country is required." }, { status: 400 });
  }

  const unknownCodes = countryCodes.filter(c => !countryByCode(c));
  if (unknownCodes.length > 0) {
    return NextResponse.json({ error: `Unrecognised country code(s): ${unknownCodes.join(", ")}` }, { status: 400 });
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
        brand_name: project.brand_name ?? null,
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
