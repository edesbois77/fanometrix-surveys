// Backs the universal "Assign Access" picker in User Management — a
// single flattened, searchable list spanning Research Projects, Campaign
// Groups, Campaigns, and Insights, each option encoding its resource type
// in its value ("research_project:<uuid>" etc.) so the picker can stay a
// plain flat list (reusing MultiSelect) while still writing typed rows
// into user_access_grants on save.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import type { MultiSelectOption } from "@/app/components/MultiSelect";

export async function GET(req: NextRequest) {
  try {
    await requireUser(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const [{ data: orgs }, { data: projects }, { data: groups }, { data: campaigns }, { data: insights }] = await Promise.all([
    supabaseAdmin.from("organisations").select("id, name"),
    supabaseAdmin
      .from("research_projects")
      .select("id, project_name, topic, tags, country_codes, publisher_org_ids, brand_org_id, agency_org_id")
      .is("deleted_at", null),
    supabaseAdmin
      .from("campaign_groups")
      .select("id, name, publisher_org_id, brand_org_id, agency_org_id"),
    supabaseAdmin
      .from("campaigns")
      .select("id, campaign_name, market, country_code, publisher_org_id, brand_org_id, agency_org_id")
      .is("deleted_at", null),
    supabaseAdmin
      .from("insights")
      .select("id, title, content_type, tags"),
  ]);

  const orgName = new Map((orgs ?? []).map(o => [o.id as string, o.name as string]));
  const orgNames = (ids: (string | null)[]) => ids.filter(Boolean).map(id => orgName.get(id as string)).filter(Boolean).join(", ");

  const options: MultiSelectOption[] = [];

  for (const p of projects ?? []) {
    const publishers = orgNames(p.publisher_org_ids ?? []);
    const brand = p.brand_org_id ? orgName.get(p.brand_org_id) : null;
    options.push({
      value: `research_project:${p.id}`,
      label: `Research Project · ${p.project_name}`,
      keywords: [p.project_name, p.topic, brand, publishers, ...(p.tags ?? []), ...(p.country_codes ?? [])].filter(Boolean).join(" "),
    });
  }

  for (const g of groups ?? []) {
    const publisher = g.publisher_org_id ? orgName.get(g.publisher_org_id) : null;
    const brand = g.brand_org_id ? orgName.get(g.brand_org_id) : null;
    options.push({
      value: `campaign_group:${g.id}`,
      label: `Campaign Group · ${g.name}`,
      keywords: [g.name, publisher, brand].filter(Boolean).join(" "),
    });
  }

  for (const c of campaigns ?? []) {
    const publisher = c.publisher_org_id ? orgName.get(c.publisher_org_id) : null;
    const brand = c.brand_org_id ? orgName.get(c.brand_org_id) : null;
    options.push({
      value: `campaign:${c.id}`,
      label: `Campaign · ${c.campaign_name}`,
      keywords: [c.campaign_name, publisher, brand, c.market, c.country_code].filter(Boolean).join(" "),
    });
  }

  for (const i of insights ?? []) {
    options.push({
      value: `insight:${i.id}`,
      label: `${i.content_type === "report" ? "Report" : "Insight"} · ${i.title}`,
      keywords: [i.title, ...(i.tags ?? [])].filter(Boolean).join(" "),
    });
  }

  return NextResponse.json({ data: options });
}
