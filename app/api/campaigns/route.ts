import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/auth";
import {
  computeStatusWithReason,
  type CampaignForStatus,
} from "@/lib/campaign-status";

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireSession(req);
  } catch (err) {
    return err as Response;
  }

  const { searchParams } = new URL(req.url);
  const viewDeleted = searchParams.get("view") === "deleted";
  const researchProjectId = searchParams.get("research_project_id");

  // ── Deleted view (admin only, no auto-transitions) ─────────────────────────
  if (viewDeleted) {
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let deletedQuery = supabaseAdmin
      .from("campaigns")
      .select("*, surveys(name)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (researchProjectId) deletedQuery = deletedQuery.eq("research_project_id", researchProjectId);

    const [{ data: campaigns, error }, { data: statsData }] = await Promise.all([
      deletedQuery,
      supabaseAdmin.from("vw_campaign_stats").select("campaign_id, response_count"),
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const statsMap: Record<string, number> = {};
    for (const s of statsData ?? []) statsMap[s.campaign_id] = Number(s.response_count ?? 0);

    const data = (campaigns ?? []).map(c => ({
      ...c,
      effective_status:   c.status,
      status_reason:      null,
      is_auto_transition: false,
      response_count:     statsMap[c.campaign_id] ?? 0,
    }));

    return NextResponse.json({ data });
  }

  // ── Normal view — exclude soft-deleted, enforce role-based access ───────────
  // Note: deleted_at filter is applied in JS below so this route works even
  // before migration 015 is run (the column may not exist yet in the DB).
  let query = supabase
    .from("campaigns")
    .select("*, surveys(name)")
    .order("created_at", { ascending: false });

  if (researchProjectId) query = query.eq("research_project_id", researchProjectId);

  if (session.role === "brand" || session.role === "agency") {
    const ids = session.allowedCampaignIds;
    if (ids.length === 0) return NextResponse.json({ data: [] });
    query = query.in("campaign_id", ids);
  } else if (session.role === "publisher") {
    const ids = session.allowedPublisherIds;
    if (ids.length === 0) return NextResponse.json({ data: [] });
    query = query.in("publisher", ids);
  }

  const [{ data: campaigns, error }, { data: statsData }] = await Promise.all([
    query,
    supabase.from("vw_campaign_stats").select("campaign_id, response_count"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const statsMap: Record<string, number> = {};
  for (const s of statsData ?? []) statsMap[s.campaign_id] = Number(s.response_count ?? 0);

  // Batch-fetch linked research projects to resolve inherited-vs-overridden fields.
  const projectIds = Array.from(
    new Set((campaigns ?? []).map(c => c.research_project_id).filter(Boolean))
  ) as string[];

  const projectsById: Record<string, {
    survey_id: string | null;
    start_date: string | null;
    end_date: string | null;
    target_responses: number | null;
    archive_after_days: number | null;
    tags: string[] | null;
    creative_design: string | null;
  }> = {};

  if (projectIds.length > 0) {
    const { data: projects } = await supabaseAdmin
      .from("research_projects")
      .select("id, survey_id, start_date, end_date, target_responses, archive_after_days, tags, creative_design")
      .in("id", projectIds);
    for (const p of projects ?? []) projectsById[p.id] = p;
  }

  const now = new Date();

  const enriched = await Promise.all(
    (campaigns ?? []).map(async (c) => {
      const responseCount = statsMap[c.campaign_id] ?? 0;
      const project = c.research_project_id ? projectsById[c.research_project_id] : undefined;

      const effectiveArchiveAfterDays = c.archive_after_days ?? project?.archive_after_days ?? null;
      const forStatus: CampaignForStatus = { ...(c as CampaignForStatus), archive_after_days: effectiveArchiveAfterDays };
      const detail = computeStatusWithReason(forStatus, responseCount, now);
      const { effective, reason, isAutoTransition } = detail;

      const effective_survey_id = c.survey_id ?? project?.survey_id ?? null;
      const effective_start_date = c.start_date ?? project?.start_date ?? null;
      const effective_end_date = c.end_date ?? project?.end_date ?? null;
      const effective_target_responses = c.target_responses ?? project?.target_responses ?? null;
      const effective_tags = (c.tags && c.tags.length > 0) ? c.tags : (project?.tags ?? []);
      const effective_creative_design = c.creative_design ?? project?.creative_design ?? null;

      const inherited = project ? {
        survey_id:          c.survey_id == null,
        start_date:         c.start_date == null,
        end_date:           c.end_date == null,
        target_responses:   c.target_responses == null,
        archive_after_days: c.archive_after_days == null,
        tags:               !c.tags || c.tags.length === 0,
        creative_design:     c.creative_design == null,
      } : null;

      if (
        isAutoTransition &&
        c.status !== "draft" &&
        c.status !== "archived" &&
        c.manual_status_override !== "paused"
      ) {
        await supabase
          .from("campaigns")
          .update({ status: effective, status_updated_at: now.toISOString() })
          .eq("id", c.id);

        const notifType =
          effective === "live"     ? "went_live"  :
          effective === "closed"   ? "closed"     :
          effective === "archived" ? "archived"   : null;

        if (notifType) {
          const campaignName = `${c.brand_name} – ${c.campaign_name}`;
          const messages: Record<string, string> = {
            went_live: `"${campaignName}" automatically went Live.`,
            closed:    `"${campaignName}" automatically closed.`,
            archived:  `"${campaignName}" was automatically archived.`,
          };
          await supabaseAdmin.from("campaign_notifications").insert({
            campaign_id:   c.id,
            campaign_name: campaignName,
            type:          notifType,
            message:       messages[notifType],
          });
        }
      }

      return {
        ...c,
        effective_status:   effective,
        status_reason:      reason,
        is_auto_transition: isAutoTransition,
        response_count:     responseCount,
        effective_survey_id,
        effective_start_date,
        effective_end_date,
        effective_target_responses,
        effective_archive_after_days: effectiveArchiveAfterDays,
        effective_tags,
        effective_creative_design,
        inherited,
      };
    })
  );

  // Filter out soft-deleted campaigns in JS (backward-compat: if the
  // deleted_at column doesn't exist yet, the field is undefined = falsy = kept)
  const visible = enriched.filter(c => !(c as Record<string, unknown>).deleted_at);

  return NextResponse.json({ data: visible });
}

export async function POST(req: NextRequest) {
  try {
    await requireSession(req, ["admin"]);
  } catch (err) {
    return err as Response;
  }

  const body = await req.json();

  // Strip any soft-delete / computed fields that should never be set on create
  const {
    deleted_at: _da, deleted_by: _db, delete_reason: _dr,
    effective_status: _es, status_reason: _sr, is_auto_transition: _iat, response_count: _rc,
    // API-only resolved-inheritance fields (added to the GET response for the
    // Research Project override UI) — never real columns on campaigns.
    effective_survey_id: _esi, effective_start_date: _esd, effective_end_date: _eed,
    effective_target_responses: _etr, effective_archive_after_days: _ead,
    effective_tags: _et, effective_creative_design: _ecd, inherited: _inh,
    ...safe
  } = body;

  const { data, error } = await supabase
    .from("campaigns")
    .insert([{ ...safe, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
