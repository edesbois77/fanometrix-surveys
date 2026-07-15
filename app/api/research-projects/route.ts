import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { visibleResourceIds } from "@/lib/access";
import { logActivity } from "@/lib/research-project-activity";
import { createSimulatedProject, createEmptySimulatedProject } from "@/lib/simulation/create-simulated-project";
import { runSimulationGeneration } from "@/lib/simulation/run-simulation-generation";
import type { SimulationSourceConfig } from "@/lib/simulation/types";
import { getSocialMentionStatsBySearchIds } from "@/lib/social-stats";

type ProjectStats = {
  project_id: string;
  deployment_count: number;
  publisher_count: number;
  country_count: number;
  total_responses: number;
  last_response_at: string | null;
  has_active_campaign: boolean;
};

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireUser(req, ["admin", "brand", "agency", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const researchModeFilter = req.nextUrl.searchParams.get("research_mode"); // "real" | "simulated" | null (both)

  let query = supabaseAdmin
    .from("research_projects")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (researchModeFilter === "real" || researchModeFilter === "simulated") {
    query = query.eq("research_mode", researchModeFilter);
  }

  const [{ data: projects, error }, { data: stats }] = await Promise.all([
    query,
    supabaseAdmin.from("vw_research_project_stats").select("*"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const statsMap: Record<string, ProjectStats> = {};
  for (const s of (stats ?? []) as ProjectStats[]) statsMap[s.project_id] = s;

  // Simulated projects aren't org-scoped client data — they're an
  // internal sales/demo tool, so visibility is flat: any admin or
  // can_present_simulations holder sees every Demo Project, never
  // filtered by the org-matching rules real projects use below (a
  // simulated project typically has no brand/agency/publisher org at
  // all, so reusing that logic unchanged would make Demo Projects
  // invisible to every non-admin by default).
  const all = projects ?? [];
  const real = all.filter(p => p.research_mode !== "simulated");
  const simulated = all.filter(p => p.research_mode === "simulated");

  let visibleReal = real;
  if (session.role !== "admin") {
    const ids = await visibleResourceIds(session, "research_project");
    if (ids !== null) {
      const allowed = new Set(ids);
      visibleReal = visibleReal.filter(p => allowed.has(p.id));
    }
  }
  const visibleSimulated = (session.role === "admin" || session.canPresentSimulations) ? simulated : [];
  const visible = [...visibleReal, ...visibleSimulated];

  // Showroom gallery info — a handful of batched queries for every visible
  // simulated project's most recent evidence_simulations run, never N+1
  // per row. Response/mention counts are computed by fetching the (small,
  // synthetic-volume) id column and counting in JS rather than a grouped
  // SQL count, since Supabase JS has no ad hoc GROUP BY without a
  // migration-defined RPC — fine at V1's expected showroom size; revisit
  // with a DB view if the Showroom's row volume ever grows materially
  // (logged as a Phase 12 note, not a blocker).
  const simInfoByProject: Record<string, {
    status: string; presentedCount: number; topic: string | null; tonePreset: string | null;
    sources: string[]; templateName: string | null; label: string | null; generatedAt: string | null;
    ownerName: string | null; responseCount: number | null; mentionCount: number | null;
    responseTarget: number | null; mentionTarget: number | null;
  }> = {};
  if (visibleSimulated.length > 0) {
    const { data: sims } = await supabaseAdmin
      .from("evidence_simulations")
      .select("id, research_project_id, scenario_template_id, label, source_config, status, presented_count, generated_at, created_at")
      .in("research_project_id", visibleSimulated.map(p => p.id))
      // Legacy project-wide runs only — migration 095's per-source "Run
      // Research" rows must never be picked up by this "most recent row
      // per project" dedupe below, which assumes exactly this shape.
      .is("research_project_evidence_id", null)
      .order("created_at", { ascending: false });

    const templateIds = [...new Set((sims ?? []).map(s => s.scenario_template_id).filter((id): id is string => !!id))];
    const { data: templates } = templateIds.length
      ? await supabaseAdmin.from("scenario_templates").select("id, name").in("id", templateIds)
      : { data: [] as { id: string; name: string }[] };
    const templateNameById = Object.fromEntries((templates ?? []).map(t => [t.id, t.name]));

    // Owner names — same resolution the single-project route already uses
    // ("Created by {first} {last}", falling back to the raw email), so a
    // Showroom card never shows a bare email address where the rest of the
    // product shows a person's name.
    const creatorEmails = [...new Set(visibleSimulated.map(p => p.created_by).filter((e): e is string => !!e))];
    const { data: creators } = creatorEmails.length
      ? await supabaseAdmin.from("users").select("work_email, first_name, last_name").in("work_email", creatorEmails)
      : { data: [] as { work_email: string; first_name: string | null; last_name: string | null }[] };
    const ownerNameByEmail = Object.fromEntries(
      (creators ?? []).map(u => [u.work_email, u.first_name ? `${u.first_name} ${u.last_name ?? ""}`.trim() : null])
    );

    const evidenceSimIds = (sims ?? []).map(s => s.id);
    const [{ data: responseRows }, { data: mentionRows }] = evidenceSimIds.length
      ? await Promise.all([
          supabaseAdmin.from("responses").select("evidence_simulation_id").in("evidence_simulation_id", evidenceSimIds),
          supabaseAdmin.from("social_mentions").select("evidence_simulation_id").in("evidence_simulation_id", evidenceSimIds),
        ])
      : [{ data: [] as { evidence_simulation_id: string }[] }, { data: [] as { evidence_simulation_id: string }[] }];
    const responseCountBySim: Record<string, number> = {};
    for (const r of responseRows ?? []) responseCountBySim[r.evidence_simulation_id] = (responseCountBySim[r.evidence_simulation_id] ?? 0) + 1;
    const mentionCountBySim: Record<string, number> = {};
    for (const m of mentionRows ?? []) mentionCountBySim[m.evidence_simulation_id] = (mentionCountBySim[m.evidence_simulation_id] ?? 0) + 1;

    for (const s of sims ?? []) {
      if (simInfoByProject[s.research_project_id]) continue; // rows are ordered desc — first hit per project is the most recent
      const config = (s.source_config ?? {}) as SimulationSourceConfig;
      const project = visibleSimulated.find(p => p.id === s.research_project_id);
      simInfoByProject[s.research_project_id] = {
        status: s.status,
        presentedCount: s.presented_count ?? 0,
        topic: config.topic ?? null,
        tonePreset: config.tone_preset ?? null,
        sources: config.sources ?? [],
        templateName: s.scenario_template_id ? (templateNameById[s.scenario_template_id] ?? null) : null,
        label: s.label,
        generatedAt: s.generated_at,
        ownerName: project?.created_by ? (ownerNameByEmail[project.created_by] ?? null) : null,
        responseCount: config.sources?.includes("survey") ? (responseCountBySim[s.id] ?? 0) : null,
        mentionCount: config.sources?.includes("conversation_search") ? (mentionCountBySim[s.id] ?? 0) : null,
        responseTarget: config.sources?.includes("survey") ? (config.survey_response_target ?? null) : null,
        mentionTarget: config.sources?.includes("conversation_search") ? (config.mention_target ?? null) : null,
      };
    }
  }

  // Per-source Research Source summaries — independent of simulation_info
  // above, which only understands the old one-shot scenario-template flow.
  // A walkthrough built the newer way (attach a source, run it individually
  // inside the workspace) has no project-wide evidence_simulations row at
  // all, so this is the only way the gallery card can show what's actually
  // been added and how much data each source has collected. Mirrors the
  // exact same per-evidence-item enrichment the single-project route
  // already does, just batched across every visible simulated project.
  const researchSourcesByProject: Record<string, {
    type: "survey" | "social_search"; name: string; current: number; target: number | null;
  }[]> = {};
  if (visibleSimulated.length > 0) {
    const { data: sourceEvidenceRows } = await supabaseAdmin
      .from("research_project_evidence")
      .select("research_project_id, evidence_type, evidence_id, target_responses")
      .in("research_project_id", visibleSimulated.map(p => p.id))
      .in("evidence_type", ["survey", "social_search"])
      .order("added_at", { ascending: true });

    const sourceSurveyIds = (sourceEvidenceRows ?? []).filter(e => e.evidence_type === "survey").map(e => e.evidence_id);
    const sourceSearchIds = (sourceEvidenceRows ?? []).filter(e => e.evidence_type === "social_search").map(e => e.evidence_id);

    const [{ data: sourceSurveys }, { data: sourceSurveyStats }, { data: sourceSearches }, sourceMentionStatsBySearchId] = await Promise.all([
      sourceSurveyIds.length
        ? supabaseAdmin.from("surveys").select("id, name").in("id", sourceSurveyIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      sourceSurveyIds.length
        ? supabaseAdmin.from("vw_survey_stats").select("id, response_count").in("id", sourceSurveyIds)
        : Promise.resolve({ data: [] as { id: string; response_count: number }[] }),
      sourceSearchIds.length
        ? supabaseAdmin.from("social_searches").select("id, name").in("id", sourceSearchIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      getSocialMentionStatsBySearchIds(sourceSearchIds),
    ]);
    const sourceSurveyNameById = new Map((sourceSurveys ?? []).map(s => [s.id, s.name]));
    const sourceSurveyResponseCountById = new Map((sourceSurveyStats ?? []).map(s => [s.id, s.response_count]));
    const sourceSearchNameById = new Map((sourceSearches ?? []).map(s => [s.id, s.name]));

    for (const e of sourceEvidenceRows ?? []) {
      const list = researchSourcesByProject[e.research_project_id] ?? (researchSourcesByProject[e.research_project_id] = []);
      if (e.evidence_type === "survey") {
        list.push({
          type: "survey",
          name: sourceSurveyNameById.get(e.evidence_id) ?? "Survey",
          current: sourceSurveyResponseCountById.get(e.evidence_id) ?? 0,
          target: e.target_responses ?? null,
        });
      } else {
        list.push({
          type: "social_search",
          name: sourceSearchNameById.get(e.evidence_id) ?? "Conversation Search",
          current: sourceMentionStatsBySearchId.get(e.evidence_id)?.total ?? 0,
          target: null,
        });
      }
    }
  }

  const data = visible.map(p => {
    const s = statsMap[p.project_id];
    const totalResponses = s?.total_responses ?? 0;
    const target = p.target_responses ?? null;
    const completionPct = target && target > 0 ? Math.round((totalResponses / target) * 100) : null;
    return {
      ...p,
      deployment_count: s?.deployment_count ?? 0,
      publisher_count: s?.publisher_count ?? 0,
      country_count: s?.country_count ?? 0,
      total_responses: totalResponses,
      completion_pct: completionPct,
      last_response_at: s?.last_response_at ?? null,
      has_active_campaign: s?.has_active_campaign ?? false,
      simulation_info: p.research_mode === "simulated" ? (simInfoByProject[p.id] ?? null) : undefined,
      research_sources: p.research_mode === "simulated" ? (researchSourcesByProject[p.id] ?? []) : undefined,
    };
  });

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const researchMode: "real" | "simulated" = body.research_mode === "simulated" ? "simulated" : "real";

  if (researchMode === "simulated") {
    return createSimulated(req, body);
  }

  let session;
  try {
    session = await requireUser(req, ["admin", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  // The research question is the whole point of a Research Project now —
  // every piece of evidence gathered on it is meant to answer this.
  // Required for new projects; existing rows created before this field
  // existed are left alone (research_question stays nullable in the DB).
  if (!body.research_question?.trim()) {
    return NextResponse.json({ error: "A research question is required." }, { status: 400 });
  }

  // Strip computed/soft-delete fields that should never be set on create
  const {
    deleted_at: _da, deleted_by: _db, delete_reason: _dr,
    deployment_count: _dc, publisher_count: _pc, country_count: _cc,
    total_responses: _tr, completion_pct: _cp, created_by_admin: _cba,
    created_by: _cb,
    ...safe
  } = body;

  // Publisher accounts can only ever target their own organisation —
  // enforced here regardless of what the UI sent.
  if (session.role === "publisher") {
    safe.publisher_org_ids = session.organisationId ? [session.organisationId] : [];
  }
  safe.created_by_admin = session.role === "admin";
  // Owner — same pattern surveys/insights already use ("Created by {email}").
  safe.created_by = session.workEmail;

  const { data, error } = await supabaseAdmin
    .from("research_projects")
    .insert([{ ...safe, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A research project with this Project ID already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(data.id, "project_created", "Research Project created.", session.workEmail);

  return NextResponse.json({ data }, { status: 201 });
}

/**
 * Product Walkthrough creation. Two shapes land here:
 *  - No scenario_template_id and no source_config at all → the Library's
 *    only creation path: an empty walkthrough container (name + optional
 *    research_question/client_label/internal_notes), nothing generated.
 *    Everything about what the walkthrough contains — adding a Survey or
 *    Conversation Search, configuring it, generating its evidence — is
 *    built inside the workspace itself, step by step; the Library never
 *    front-loads any of that.
 *  - scenario_template_id or source_config given → the existing
 *    instant-generation path (kept dormant for reuse once the in-workspace
 *    "Add Survey"/"Add Conversation Search" steps exist, not currently
 *    reachable from the Library's own creation flow). Returns immediately
 *    with status "generating"; the actual writes happen after the response
 *    is sent (next/server's after()) — the client polls GET
 *    /api/research-projects/[id] until the evidence_simulations status
 *    flips to ready|failed.
 */
async function createSimulated(req: NextRequest, body: Record<string, unknown>): Promise<Response> {
  let session;
  try {
    // No role allowlist — capability-gated below, not role-gated, since
    // can_present_simulations is a grant on any existing account.
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  if (session.role !== "admin" && !session.canPresentSimulations) {
    return NextResponse.json({ error: "You don't have access to create Product Walkthroughs." }, { status: 403 });
  }

  const scenarioTemplateId = typeof body.scenario_template_id === "string" ? body.scenario_template_id : null;
  const hasSourceConfig = !!body.source_config && typeof body.source_config === "object";

  if (!scenarioTemplateId && !hasSourceConfig) {
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
    if (!name) {
      return NextResponse.json({ error: "Walkthrough name is required." }, { status: 400 });
    }
    try {
      const result = await createEmptySimulatedProject({
        name,
        researchQuestion: typeof body.research_question === "string" ? body.research_question : null,
        clientLabel: typeof body.client_label === "string" ? body.client_label : null,
        internalNotes: typeof body.internal_notes === "string" ? body.internal_notes : null,
        actor: session.workEmail,
      });
      return NextResponse.json({ data: { id: result.projectId } }, { status: 201 });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create the walkthrough." }, { status: 500 });
    }
  }

  let config: SimulationSourceConfig;
  let templateName: string | null = null;

  if (scenarioTemplateId) {
    const { data: template, error } = await supabaseAdmin
      .from("scenario_templates")
      .select("name, source_config, is_active")
      .eq("id", scenarioTemplateId)
      .single();
    if (error || !template || !template.is_active) {
      return NextResponse.json({ error: "Scenario template not found." }, { status: 404 });
    }
    config = template.source_config as SimulationSourceConfig;
    templateName = template.name;
  } else if (body.source_config && typeof body.source_config === "object") {
    config = body.source_config as SimulationSourceConfig;
  } else {
    return NextResponse.json({ error: "scenario_template_id or source_config is required." }, { status: 400 });
  }

  if (!Array.isArray(config.sources) || config.sources.length === 0) {
    return NextResponse.json({ error: "source_config.sources must include at least one of: survey, conversation_search." }, { status: 400 });
  }

  // Server-side bounds mirroring the Custom wizard's own clamped inputs —
  // survey generation is cheap (no LLM), so its ceiling is generous;
  // conversation generation calls the real OpenAI API per mention, so a
  // malformed or bypassed request can't accidentally trigger a runaway
  // generation cost.
  config.survey_response_target = Math.min(1000, Math.max(0, Number(config.survey_response_target) || 0));
  config.mention_target = Math.min(300, Math.max(0, Number(config.mention_target) || 0));

  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : templateName;
  if (!name) {
    return NextResponse.json({ error: "name is required when creating from a custom source_config." }, { status: 400 });
  }

  let result;
  try {
    result = await createSimulatedProject({
      name,
      researchQuestion: typeof body.research_question === "string" ? body.research_question : undefined,
      label: typeof body.label === "string" ? body.label : null,
      scenarioTemplateId,
      config,
      actor: session.workEmail,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create the walkthrough." }, { status: 500 });
  }

  after(() => runSimulationGeneration({
    researchProjectId: result.projectId,
    evidenceSimulationId: result.evidenceSimulationId,
    config,
    campaignId: result.campaignId,
    surveyId: result.surveyId,
    searchId: result.searchId,
    actor: session.workEmail,
  }));

  return NextResponse.json({
    data: { id: result.projectId, evidence_simulation_id: result.evidenceSimulationId, status: "generating" },
  }, { status: 201 });
}
