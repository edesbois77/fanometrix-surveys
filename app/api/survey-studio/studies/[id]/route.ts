// ── Survey Studio — a single Study (detail + status) ─────────────────────────
// Admin/operator only. Returns the Study + its constituent Surveys (batched
// operational summary). No Study analytics (deferred).
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { canCurateStudies, isStudyStatus } from "@/lib/studio/study";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  if (!canCurateStudies(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: study } = await supabaseAdmin.from("studies").select("*").eq("id", id).single();
  if (!study) return NextResponse.json({ error: "Study not found" }, { status: 404 });

  // Constituent Surveys + batched operational stats (no per-survey loop).
  const { data: surveyRows } = await supabaseAdmin
    .from("surveys").select("id, name, status").eq("study_id", id).is("deleted_at", null)
    .order("created_at", { ascending: true });
  const surveys = surveyRows ?? [];
  const { data: statRows } = surveys.length
    ? await supabaseAdmin.from("vw_survey_stats").select("id, response_count, campaign_count, live_campaign_count, last_response_at").in("id", surveys.map((s) => s.id as string))
    : { data: [] as { id: string; response_count: number; campaign_count: number; live_campaign_count: number; last_response_at: string | null }[] };
  const statById = new Map((statRows ?? []).map((s) => [s.id as string, s]));

  const constituent = surveys.map((s) => {
    const st = statById.get(s.id as string);
    return {
      id: s.id, name: s.name, status: s.status,
      completedResponses: Number(st?.response_count ?? 0) || 0,
      campaignCount: Number(st?.campaign_count ?? 0) || 0,
      liveCampaigns: Number(st?.live_campaign_count ?? 0) || 0,
    };
  });
  const totals = {
    surveyCount: constituent.length,
    campaignCount: constituent.reduce((n, c) => n + c.campaignCount, 0),
    completedResponses: constituent.reduce((n, c) => n + c.completedResponses, 0),
  };

  return NextResponse.json({ study, surveys: constituent, totals });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let session;
  try { session = await requireUser(req); } catch (err) { return err as Response; }
  if (!canCurateStudies(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if ("objective" in body) patch.objective = typeof body.objective === "string" && body.objective.trim() ? body.objective.trim() : null;
  if ("status" in body) {
    if (!isStudyStatus(body.status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    patch.status = body.status;
  }
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("studies").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Study not found" }, { status: 404 });
  return NextResponse.json({ study: data });
}
