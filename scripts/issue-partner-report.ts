// Issue (or re-issue) a partner Audience Intelligence Report.
//
// This is how a report is created — there is no code change involved. It writes
// one partner_reports row and prints the URL and password to hand over.
//
//   npx tsx scripts/issue-partner-report.ts \
//     --org-slug <publisher-slug> \
//     --report-slug <report-slug> \
//     --organisation "<Publisher Name>" \
//     --brand "<Brand Name>" \
//     --campaign-title "<Study Name>" \
//     --campaign-numbers 124,125,126 \
//     --data-from <iso-timestamp> \
//     --password "…" \
//     --subtitle "One sentence for the cover."
//
// Campaigns are named by their campaign number (the #000124 shown in the app),
// which is what a human has in front of them, and resolved here to the text
// campaign_id the event tables are keyed by.
//
// Re-running with the same slugs updates the existing report in place. Omit
// --password to leave the current one unchanged.

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      if (!line.includes("=") || line.trim().startsWith("#")) continue;
      const i = line.indexOf("=");
      const key = line.slice(0, i).trim();
      if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
    }
  } catch {
    // Running with the environment already populated is fine.
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const orgSlug = arg("org-slug");
  const reportSlug = arg("report-slug");
  const organisation = arg("organisation");
  const brand = arg("brand");
  const campaignTitle = arg("campaign-title");
  const numbers = arg("campaign-numbers");
  const password = arg("password");

  if (!orgSlug || !reportSlug || !organisation || !brand || !campaignTitle || !numbers) {
    throw new Error(
      "Required: --org-slug --report-slug --organisation --brand --campaign-title --campaign-numbers",
    );
  }

  const campaignNumbers = numbers.split(",").map((n) => Number(n.trim())).filter(Number.isFinite);
  const { data: campaigns, error: campaignError } = await db
    .from("campaigns")
    .select("campaign_id, campaign_number, campaign_name, publisher_org_id, brand_org_id, research_project_id")
    .in("campaign_number", campaignNumbers);
  if (campaignError) throw new Error(campaignError.message);

  const found = (campaigns ?? []) as {
    campaign_id: string;
    campaign_number: number;
    campaign_name: string;
    publisher_org_id: string | null;
    research_project_id: string | null;
  }[];

  const missing = campaignNumbers.filter((n) => !found.some((c) => c.campaign_number === n));
  if (missing.length > 0) throw new Error(`No campaign found for number(s): ${missing.join(", ")}`);

  // Every campaign in one report must belong to the same publisher. Mixing two
  // publishers into a partner report is the one mistake this whole feature
  // exists to make impossible, so it fails loudly rather than being filtered.
  const publisherOrgs = [...new Set(found.map((c) => c.publisher_org_id))];
  if (publisherOrgs.length > 1) {
    throw new Error(
      `Campaigns span ${publisherOrgs.length} publisher organisations. A partner report must cover exactly one.`,
    );
  }

  const organisationId = publisherOrgs[0] ?? null;

  let researchQuestion: string | null = arg("research-question") ?? null;
  const projectIds = [...new Set(found.map((c) => c.research_project_id).filter(Boolean))];
  if (!researchQuestion && projectIds.length === 1) {
    const { data: project } = await db
      .from("research_projects")
      .select("research_question")
      .eq("id", projectIds[0])
      .maybeSingle();
    researchQuestion = (project as { research_question: string | null } | null)?.research_question ?? null;
  }

  const row: Record<string, unknown> = {
    org_slug: orgSlug,
    report_slug: reportSlug,
    organisation_id: organisationId,
    organisation_name: organisation,
    brand_name: brand,
    report_title: arg("report-title") ?? "Fanometrix Audience Intelligence Report",
    campaign_title: campaignTitle,
    research_question: researchQuestion,
    campaign_ids: found.map((c) => c.campaign_id),
    data_from: arg("data-from") ?? null,
    status: arg("status") ?? "published",
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (password) row.password_hash = await bcrypt.hash(password, 10);
  const logo = arg("logo-url");
  if (logo) row.logo_url = logo;
  const subtitle = arg("subtitle");
  if (subtitle) row.subtitle = subtitle;

  const { data: existing } = await db
    .from("partner_reports")
    .select("id, version")
    .eq("org_slug", orgSlug)
    .eq("report_slug", reportSlug)
    .maybeSingle();

  if (existing) {
    // Re-issuing is a new revision. A partner holding two copies of the same
    // report needs the cover to tell them which is which.
    row.version = ((existing as { version: number }).version ?? 1) + 1;
    const { error } = await db.from("partner_reports").update(row).eq("id", (existing as { id: string }).id);
    if (error) throw new Error(error.message);
    console.log(`Updated report ${orgSlug}/${reportSlug}`);
  } else {
    if (!password) throw new Error("--password is required when creating a new report");
    const { error } = await db.from("partner_reports").insert(row);
    if (error) throw new Error(error.message);
    console.log(`Created report ${orgSlug}/${reportSlug}`);
  }

  console.log(`\n  URL:       /reports/${orgSlug}/${reportSlug}`);
  console.log(`  Campaigns: ${found.map((c) => `#${String(c.campaign_number).padStart(6, "0")}`).join(", ")}`);
  console.log(`  Version:   v${row.version ?? 1}.0`);
  if (password) console.log(`  Password:  ${password}`);
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
