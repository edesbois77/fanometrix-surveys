// Attach/remove a Research Project's Evidence — the only place
// research_project_evidence (dormant since Phase 0, migration 069) is
// written. research_projects.survey_id is kept in sync as a purely internal
// pointer to "the survey that currently powers Generate Deployments /
// Deployment Readiness / Survey Intelligence" — it is never exposed to the
// client as a "Primary" status; the Evidence section just lists every
// attached item grouped by type.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";
import { logActivity } from "@/lib/research-project-activity";
import { getSourceTable } from "@/lib/research-sources/registry";
import { canAttachDocumentToProject, type GovernedDocument } from "@/lib/library-documents/governance";

const EVIDENCE_TYPES = ["survey", "social_search", "document"] as const;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    // No role allowlist — real vs simulated projects are gated
    // differently below, matching DELETE's pattern on the parent route.
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("research_mode, brand_org_id, agency_org_id, publisher_org_ids")
    .eq("id", id).single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (project.research_mode === "simulated") {
    if (session.role !== "admin" && !session.canPresentSimulations) {
      return NextResponse.json({ error: "You don't have access to Product Walkthrough." }, { status: 403 });
    }
  } else if (
    !(session.role === "admin" || session.role === "publisher") ||
    (session.role !== "admin" && !(await canAccess(session, "research_project", id)))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { evidence_type, evidence_id, source } = body;

  if (!EVIDENCE_TYPES.includes(evidence_type)) {
    return NextResponse.json({ error: "Invalid evidence type." }, { status: 400 });
  }
  if (!evidence_id) {
    return NextResponse.json({ error: "evidence_id is required." }, { status: 400 });
  }

  // Flag-match check ahead of insert — gives a legible error; the
  // migration-078 trigger is the non-bypassable backstop underneath
  // this, in case a caller ever reaches the table another way.
  {
    const table = getSourceTable(evidence_type);
    if (table) {
      const { data: evidenceRow } = await supabaseAdmin.from(table).select("is_simulated").eq("id", evidence_id).single();
      const expectedSimulated = project.research_mode === "simulated";
      if (evidenceRow && evidenceRow.is_simulated !== expectedSimulated) {
        return NextResponse.json(
          { error: expectedSimulated
              ? "This is a Simulated project, only simulated sources can be attached."
              : "This is a Real project, simulated sources can't be attached." },
          { status: 409 }
        );
      }
    }
  }

  // Governance gate — an NDA-restricted / organisation-scoped document may only
  // be attached to a project belonging to its owning organisation (Chapter 8 /
  // docs/governance-model.md). This is the single non-bypassable point that keeps
  // one client's confidential document out of another client's project.
  if (evidence_type === "document") {
    const { data: doc } = await supabaseAdmin
      .from("library_documents")
      .select("owner, owner_org_id, confidentiality, visibility, learning_permission, ai_access")
      .eq("id", evidence_id).is("deleted_at", null).maybeSingle();
    if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    if (!canAttachDocumentToProject(doc as GovernedDocument, project)) {
      return NextResponse.json(
        { error: "This document is restricted to its owning organisation and can't be attached to this project." },
        { status: 403 }
      );
    }
  }

  // Duplicate attach is a no-op — the existing unique index on
  // (research_project_id, evidence_type, evidence_id) makes this safe.
  const { error } = await supabaseAdmin
    .from("research_project_evidence")
    .upsert(
      [{ research_project_id: id, evidence_type, evidence_id, is_simulated: project?.research_mode === "simulated", added_by: session.workEmail }],
      { onConflict: "research_project_id,evidence_type,evidence_id", ignoreDuplicates: true }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (evidence_type === "survey") {
    // Only ever auto-set when nothing powers deployments yet — never
    // re-points an already-set project onto a newly-attached survey.
    const { data: project } = await supabaseAdmin.from("research_projects").select("survey_id").eq("id", id).single();
    if (project && !project.survey_id) {
      await supabaseAdmin
        .from("research_projects")
        .update({ survey_id: evidence_id, updated_at: new Date().toISOString() })
        .eq("id", id);
    }

    const { data: survey } = await supabaseAdmin.from("surveys").select("name").eq("id", evidence_id).single();
    const label = source === "existing" ? "Existing survey" : "Survey";
    await logActivity(id, "research_source_added", `${label} "${survey?.name ?? "Untitled"}" attached as evidence.`, session.workEmail);
  }

  if (evidence_type === "social_search") {
    const { data: search } = await supabaseAdmin.from("social_searches").select("name").eq("id", evidence_id).single();
    const label = source === "existing" ? "Existing conversation search" : "Conversation search";
    await logActivity(id, "research_source_added", `${label} "${search?.name ?? "Untitled"}" attached as evidence.`, session.workEmail);
  }

  if (evidence_type === "document") {
    const { data: doc } = await supabaseAdmin.from("library_documents").select("title").eq("id", evidence_id).single();
    await logActivity(id, "research_source_added", `Document "${doc?.title ?? "Untitled"}" attached as evidence.`, session.workEmail);
  }

  return NextResponse.json({ success: true });
}

// Updates the survey-scoped Research Target / Creative Design / "when
// target reached" fields on one attached survey's own evidence row
// (migration 094) — the only place these are ever written now.
// research_projects.target_responses/creative_design/target_reached_action
// are deliberately never touched here — deprecated, kept only for
// backwards compatibility, no longer driving anything.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const body = await req.json();
  const { evidence_id, target_responses, creative_design, target_reached_action } = body;

  if (!evidence_id) {
    return NextResponse.json({ error: "evidence_id is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("research_project_evidence")
    .update({ target_responses, creative_design, target_reached_action })
    .eq("research_project_id", id)
    .eq("evidence_type", "survey")
    .eq("evidence_id", evidence_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "This survey isn't attached to this project." }, { status: 404 });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("research_mode, brand_org_id, agency_org_id, publisher_org_ids")
    .eq("id", id).single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (project.research_mode === "simulated") {
    if (session.role !== "admin" && !session.canPresentSimulations) {
      return NextResponse.json({ error: "You don't have access to Product Walkthrough." }, { status: 403 });
    }
  } else if (
    !(session.role === "admin" || session.role === "publisher") ||
    (session.role !== "admin" && !(await canAccess(session, "research_project", id)))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const evidenceType = searchParams.get("evidence_type");
  const evidenceId = searchParams.get("evidence_id");

  if (!evidenceType || !evidenceId) {
    return NextResponse.json({ error: "evidence_type and evidence_id are required." }, { status: 400 });
  }

  if (evidenceType === "survey") {
    const [{ data: project }, { data: campaigns }] = await Promise.all([
      supabaseAdmin.from("research_projects").select("survey_id").eq("id", id).single(),
      supabaseAdmin.from("campaigns").select("id, survey_id").eq("research_project_id", id).is("deleted_at", null),
    ]);
    // A campaign "uses" a survey either by explicit override or by
    // inheriting the project's survey_id (null campaign.survey_id) — same
    // resolution /api/campaigns already computes as effective_survey_id.
    const usedByDeployment = (campaigns ?? []).some(c => (c.survey_id ?? project?.survey_id) === evidenceId);
    if (usedByDeployment) {
      return NextResponse.json(
        { error: "This survey is still used by one or more deployments. Remove or reassign them first." },
        { status: 409 }
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("research_project_evidence")
    .delete()
    .eq("research_project_id", id)
    .eq("evidence_type", evidenceType)
    .eq("evidence_id", evidenceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (evidenceType === "survey") {
    const { data: project } = await supabaseAdmin.from("research_projects").select("survey_id").eq("id", id).single();
    if (project?.survey_id === evidenceId) {
      // Re-point at another remaining survey (most recently added), or clear it.
      const { data: remaining } = await supabaseAdmin
        .from("research_project_evidence")
        .select("evidence_id")
        .eq("research_project_id", id)
        .eq("evidence_type", "survey")
        .order("added_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await supabaseAdmin
        .from("research_projects")
        .update({ survey_id: remaining?.evidence_id ?? null, updated_at: new Date().toISOString() })
        .eq("id", id);
    }
    await logActivity(id, "project_updated", "Survey removed as evidence.", session.workEmail);
  }

  if (evidenceType === "social_search") {
    await logActivity(id, "project_updated", "Conversation search removed as evidence.", session.workEmail);
  }

  if (evidenceType === "document") {
    await logActivity(id, "project_updated", "Document removed as evidence.", session.workEmail);
  }

  return NextResponse.json({ success: true });
}
