// "Run Research" — generates simulated evidence for ONE attached Survey or
// Conversation Search, inside a Product Walkthrough only. Reuses the
// existing generators (generateSurveyResponses/generateConversationMentions)
// unchanged; the only new thing here is scoping a run to a single attached
// source (research_project_evidence row) with an atomic claim so
// double-clicks/concurrent requests can't double-generate, and clean
// failure/retry handling so a retry never stacks a second set of rows on
// top of a partial failed one. See migration 095.
//
// research_project_evidence_id — never a client-supplied
// {evidence_type, evidence_id} pair — is the only thing the caller
// provides; the source's type, underlying id, and provenance are always
// resolved server-side from that row.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { logActivity } from "@/lib/research-project-activity";
import { generateSurveyResponses } from "@/lib/simulation/generate-survey-responses";
import { generateConversationMentions } from "@/lib/simulation/generate-conversation-mentions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }
  if (session.role !== "admin" && !session.canPresentSimulations) {
    return NextResponse.json({ error: "You don't have access to Product Walkthrough." }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { research_project_evidence_id: evidenceRowId } = body;
  if (!evidenceRowId) {
    return NextResponse.json({ error: "research_project_evidence_id is required." }, { status: 400 });
  }

  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("id, research_mode, survey_id, research_question, project_name")
    .eq("id", id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.research_mode !== "simulated") {
    return NextResponse.json({ error: "Run Research is only available for Product Walkthroughs." }, { status: 403 });
  }

  const { data: evidenceRow } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id, evidence_type, evidence_id, research_project_id")
    .eq("id", evidenceRowId)
    .single();
  if (!evidenceRow || evidenceRow.research_project_id !== id) {
    return NextResponse.json({ error: "This research source isn't attached to this project." }, { status: 404 });
  }
  if (evidenceRow.evidence_type !== "survey" && evidenceRow.evidence_type !== "social_search") {
    return NextResponse.json({ error: "Run Research isn't available for this source type yet." }, { status: 400 });
  }

  // Resolve the live-precondition and generation inputs server-side from
  // the evidence row's own resolved type/id — never from client input.
  let generate: (evidenceSimulationId: string) => Promise<{ inserted: number }>;

  if (evidenceRow.evidence_type === "survey") {
    const { data: surveyEvidence } = await supabaseAdmin
      .from("research_project_evidence")
      .select("target_responses")
      .eq("id", evidenceRowId)
      .single();
    if (!surveyEvidence?.target_responses) {
      return NextResponse.json({ error: "Set a Research Target for this survey before running research." }, { status: 400 });
    }

    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("campaign_id, survey_id, status")
      .eq("research_project_id", id)
      .is("deleted_at", null);
    const liveCampaign = (campaigns ?? []).find(
      c => (c.survey_id ?? project.survey_id) === evidenceRow.evidence_id && c.status === "live"
    );
    if (!liveCampaign) {
      return NextResponse.json({ error: "This survey needs a live campaign before you can run research." }, { status: 400 });
    }

    generate = (evidenceSimulationId: string) => generateSurveyResponses({
      campaignId: liveCampaign.campaign_id,
      surveyId: evidenceRow.evidence_id,
      evidenceSimulationId,
      count: surveyEvidence.target_responses!,
      tonePreset: "balanced",
    });
  } else {
    const { data: search } = await supabaseAdmin
      .from("social_searches")
      .select("status, markets")
      .eq("id", evidenceRow.evidence_id)
      .single();
    if (!search || search.status !== "Active") {
      return NextResponse.json({ error: "This conversation search needs to be Active before you can run research." }, { status: 400 });
    }

    const topic = project.research_question || project.project_name || "Fan sentiment";
    generate = (evidenceSimulationId: string) => generateConversationMentions({
      searchId: evidenceRow.evidence_id,
      evidenceSimulationId,
      count: 50,
      tonePreset: "balanced",
      topic,
      markets: search.markets ?? [],
    });
  }

  // ── Atomic claim ───────────────────────────────────────────────────────
  const { data: existing } = await supabaseAdmin
    .from("evidence_simulations")
    .select("id, status")
    .eq("research_project_evidence_id", evidenceRowId)
    .maybeSingle();

  let evidenceSimulationId: string;

  if (!existing) {
    const { data: created, error: insertError } = await supabaseAdmin
      .from("evidence_simulations")
      .insert([{ research_project_id: id, research_project_evidence_id: evidenceRowId, status: "generating", source_config: {} }])
      .select("id")
      .single();
    if (insertError || !created) {
      // Unique-index conflict — a concurrent request already claimed this
      // source. Re-fetch and fall through to the "already exists" handling.
      const { data: refetched } = await supabaseAdmin
        .from("evidence_simulations")
        .select("id, status")
        .eq("research_project_evidence_id", evidenceRowId)
        .maybeSingle();
      if (!refetched) return NextResponse.json({ error: insertError?.message ?? "Failed to start research." }, { status: 500 });
      if (refetched.status === "generating") return NextResponse.json({ error: "Research is already running." }, { status: 409 });
      return NextResponse.json({ data: { status: refetched.status } });
    }
    evidenceSimulationId = created.id;
  } else if (existing.status === "generating") {
    return NextResponse.json({ error: "Research is already running." }, { status: 409 });
  } else if (existing.status === "ready") {
    return NextResponse.json({ data: { status: "ready" } });
  } else {
    // Retry — existing.status === "failed". Conditional claim: only
    // proceed if it's still "failed" at the moment of this UPDATE (a
    // concurrent request may have already claimed it).
    const { data: claimed } = await supabaseAdmin
      .from("evidence_simulations")
      .update({ status: "generating", error_message: null })
      .eq("id", existing.id)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (!claimed) {
      const { data: refetched } = await supabaseAdmin
        .from("evidence_simulations").select("status").eq("id", existing.id).single();
      if (refetched?.status === "generating") return NextResponse.json({ error: "Research is already running." }, { status: 409 });
      return NextResponse.json({ data: { status: refetched?.status ?? "ready" } });
    }
    evidenceSimulationId = existing.id;

    // Clean up whatever the failed run partially wrote before regenerating
    // — a retry must never stack a second set of rows on top of the first.
    await Promise.all([
      supabaseAdmin.from("responses").delete().eq("evidence_simulation_id", evidenceSimulationId),
      supabaseAdmin.from("social_mentions").delete().eq("evidence_simulation_id", evidenceSimulationId),
    ]);
  }

  // ── Generate ─────────────────────────────────────────────────────────
  try {
    const { inserted } = await generate(evidenceSimulationId);
    // "Ready" means presentable — a run that produced zero rows is not
    // ready, it's failed, matching the same rule
    // lib/simulation/run-simulation-generation.ts's own project-wide path
    // already enforces. Never let this run's own status claim success
    // when nothing was actually written.
    if (inserted === 0) {
      await supabaseAdmin
        .from("evidence_simulations")
        .update({ status: "failed", error_message: "Generated 0 rows.", generated_at: null })
        .eq("id", evidenceSimulationId);
      return NextResponse.json({ error: "Research generated no usable evidence.", data: { status: "failed" } }, { status: 500 });
    }
    await supabaseAdmin
      .from("evidence_simulations")
      .update({ status: "ready", generated_at: new Date().toISOString(), error_message: null })
      .eq("id", evidenceSimulationId);
    await logActivity(id, "simulation_evidence_generated", `Run Research generated ${inserted} row(s).`, session.workEmail);
    return NextResponse.json({ data: { status: "ready" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await supabaseAdmin
      .from("evidence_simulations")
      .update({ status: "failed", error_message: message })
      .eq("id", evidenceSimulationId);
    return NextResponse.json({ error: message, data: { status: "failed" } }, { status: 500 });
  }
}
