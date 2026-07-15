import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds, canAccess } from "@/lib/access";
import { validateMembersBelongToProject } from "@/lib/campaign-group-membership";

export async function GET(req: NextRequest) {
  let session;
  try {
    // Brand/agency included (unlike POST/PUT/DELETE below, still
    // admin+publisher only) — the Research Project Workspace's read-only
    // Campaign Groups summary (migration 096) is visible to whoever can
    // already see that project, not just admins/publishers. Visibility
    // is still filtered per-user by visibleResourceIds below, same as
    // every other role.
    session = await requireUser(req, ["admin", "publisher", "brand", "agency"]);
  } catch (err) {
    return err as Response;
  }

  const researchProjectId = req.nextUrl.searchParams.get("research_project_id");

  let groupsQuery = supabaseAdmin.from("campaign_groups").select("*").order("created_at", { ascending: false });
  if (researchProjectId) groupsQuery = groupsQuery.eq("research_project_id", researchProjectId);

  const [
    { data: groups,    error },
    { data: members },
    { data: campaigns },
    { data: stats },
    { data: projects },
  ] = await Promise.all([
    groupsQuery,
    // Ordered by priority so campaign_ids reflects each group's serve
    // order (position i == priority rank), not arbitrary insertion order —
    // needed for the Workspace summary's Priority-rotation display.
    supabaseAdmin.from("campaign_group_members").select("group_id, campaign_id").order("priority", { ascending: true }),
    supabaseAdmin.from("campaigns").select("id, campaign_id, survey_id"),
    supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count"),
    // survey_id included as the fallback for campaigns whose own survey_id
    // is null and which still inherit the project's legacy single survey
    // pointer (the same effective_survey_id rule /api/campaigns applies) —
    // otherwise older campaigns count as "no survey" and understate
    // survey_count below.
    supabaseAdmin.from("research_projects").select("id, project_name, topic, survey_id"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build lookup maps
  const campaignByUuid: Record<string, { campaign_id: string; survey_id: string | null }> = {};
  for (const c of campaigns ?? []) campaignByUuid[c.id] = c;

  const projectNameById: Record<string, string> = {};
  const projectFallbackSurveyId: Record<string, string | null> = {};
  for (const p of projects ?? []) {
    projectNameById[p.id] = p.topic || p.project_name;
    projectFallbackSurveyId[p.id] = p.survey_id;
  }

  const responsesBySlug: Record<string, number> = {};
  for (const s of stats ?? []) responsesBySlug[s.campaign_id] = Number(s.response_count ?? 0);

  const membersByGroup: Record<string, string[]> = {};
  for (const m of members ?? []) {
    if (!membersByGroup[m.group_id]) membersByGroup[m.group_id] = [];
    membersByGroup[m.group_id].push(m.campaign_id);
  }

  const data = (groups ?? []).map(g => {
    const campaignUuids = membersByGroup[g.id] ?? [];
    const totalResponses = campaignUuids.reduce((sum, uuid) => {
      const slug = campaignByUuid[uuid]?.campaign_id;
      return sum + (slug ? (responsesBySlug[slug] ?? 0) : 0);
    }, 0);
    const fallbackSurveyId = g.research_project_id ? projectFallbackSurveyId[g.research_project_id] : null;
    const surveyCount = new Set(
      campaignUuids
        .map(uuid => campaignByUuid[uuid]?.survey_id ?? fallbackSurveyId)
        .filter((s): s is string => !!s)
    ).size;

    return {
      ...g,
      member_count: campaignUuids.length,
      total_responses: totalResponses,
      campaign_ids: campaignUuids,
      survey_count: surveyCount,
      research_project_name: g.research_project_id ? (projectNameById[g.research_project_id] ?? null) : null,
    };
  });

  if (session.role === "admin") return NextResponse.json({ data });

  const visibleIds = await visibleResourceIds(session, "campaign_group");
  const visible = visibleIds === null ? data : data.filter(g => visibleIds.includes(g.id));
  return NextResponse.json({ data: visible });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();
  const { campaign_ids, created_by_admin: _cba, ...groupFields } = body as { campaign_ids?: string[]; created_by_admin?: boolean; [k: string]: unknown };

  // Every newly created group must be project-scoped (migration 096) —
  // there is no more "unscoped" path from this route. Existing legacy
  // groups with research_project_id = NULL are grandfathered in, but
  // nothing new can be created that way.
  const researchProjectId = groupFields.research_project_id as string | undefined;
  if (!researchProjectId) {
    return NextResponse.json({ error: "Research Project is required. Every new Campaign Group must belong to one." }, { status: 400 });
  }

  if (session.role !== "admin" && !(await canAccess(session, "research_project", researchProjectId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (campaign_ids?.length) {
    const validation = await validateMembersBelongToProject(campaign_ids, researchProjectId);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Publisher accounts can only ever create groups for their own
  // organisation — enforced here regardless of what the UI sent.
  if (session.role === "publisher") {
    groupFields.publisher_org_id = session.organisationId;
  }
  groupFields.created_by_admin = session.role === "admin";

  const { data: group, error } = await supabaseAdmin
    .from("campaign_groups")
    .insert([{ ...groupFields, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Group ID already exists." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Insert members
  if (campaign_ids?.length) {
    const rows = campaign_ids.map((cid, i) => ({
      group_id:    group.id,
      campaign_id: cid,
      priority:    i,
    }));
    await supabaseAdmin.from("campaign_group_members").insert(rows);
  }

  return NextResponse.json({ data: group }, { status: 201 });
}
