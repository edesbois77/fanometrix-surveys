import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth-server";
import { canAccess } from "@/lib/access";
import { getCompletedLanguages, type LocalisedQuestion, type LocalisedText } from "@/lib/survey-locale";
import { getSummary } from "@/lib/intelligence/store";
import type { KeyFindingsReport } from "@/lib/intelligence/analysts/analyseKeyFindings";
import type { Conclusion } from "@/lib/intelligence/analysts/analyseConclusion";
import type { ExecutiveReport } from "@/lib/intelligence/analysts/analyseExecutiveReport";
import type { EditorialArticle } from "@/lib/intelligence/analysts/analyseEditorialArticle";
import type { FullResearchReport } from "@/lib/intelligence/analysts/analyseFullResearchReport";
import { logActivity } from "@/lib/research-project-activity";
import { getSocialMentionStatsBySearchIds } from "@/lib/social-stats";
import { deleteSimulatedProject } from "@/lib/simulation/delete-simulated-project";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireUser(req, ["admin", "brand", "agency", "publisher"]);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("research_projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });

  if (session.role !== "admin" && !(await canAccess(session, "research_project", data.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Same rollup the list endpoint exposes (vw_research_project_stats), keyed
  // by project_id — kept in sync here so the detail page never has to
  // re-derive deployment/response totals from raw campaigns itself.
  const [{ data: stats }, { data: survey }, { data: surveyStats }, intelligence, executiveReport, keyFindings, conclusion, editorialArticle, fullResearchReport, { data: ownerUser }, { data: activity }, { data: evidenceRows }] = await Promise.all([
    supabaseAdmin.from("vw_research_project_stats").select("*").eq("project_id", data.project_id).maybeSingle(),
    data.survey_id
      ? supabaseAdmin.from("surveys").select("id, name, status, questions, thank_you_title, thank_you_body").eq("id", data.survey_id).single()
      : Promise.resolve({ data: null }),
    data.survey_id
      ? supabaseAdmin.from("vw_survey_stats").select("response_count").eq("id", data.survey_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // Survey Intelligence's own status — deliberately not a generic
    // project-level "intelligence_status": each AI service will resolve
    // its own status this same way once it ships, rather than sharing one
    // column that can't represent multiple independent lifecycles.
    data.survey_id
      ? getSummary("survey", data.survey_id, "research_summary")
      : Promise.resolve(null),
    // The Executive Report (Phase 4) — its own independent status, same
    // reasoning as Survey Intelligence's status above.
    getSummary<ExecutiveReport>("research_project", id, "executive_report"),
    // Key Findings — same "does a row already have content" question
    // Survey/Conversation Intelligence already answer, so the Intelligence
    // section's row can label its button "Generate" vs "Open" instead of
    // always showing "Open" for something that doesn't exist yet.
    getSummary<KeyFindingsReport>("research_project", id, "key_findings"),
    // Conclusion (Phase 1 of the Research Experience restructure) — its own
    // independent status, same reasoning as Survey Intelligence/Executive
    // Report above. Also the content itself, not just status: Knowledge
    // surfaces the published Conclusion directly, so the Workspace needs it
    // here rather than a second round-trip once it's published.
    getSummary<Conclusion>("research_project", id, "conclusion"),
    // Editorial Article — its own independent status, same reasoning as
    // Executive Report/Conclusion above.
    getSummary<EditorialArticle>("research_project", id, "editorial_article"),
    // Full Research Report — its own independent status, same reasoning as
    // Executive Report/Conclusion/Editorial Article above.
    getSummary<FullResearchReport>("research_project", id, "full_research_report"),
    data.created_by
      ? supabaseAdmin.from("users").select("first_name, last_name").eq("work_email", data.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from("research_project_activity").select("*").eq("research_project_id", id).order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("research_project_evidence").select("*").eq("research_project_id", id).order("added_at", { ascending: true }),
  ]);

  // Simulation Information — only ever relevant for a simulated project.
  // Resolves the most recent evidence_simulations run plus, per source,
  // how much synthetic evidence it actually produced — read straight from
  // responses/social_mentions via evidence_simulation_id, the same link
  // Reset scopes its own cleanup by, rather than trusting the run's own
  // target numbers (which are what was asked for, not what was made).
  let simulationInfo = null;
  if (data.research_mode === "simulated") {
    const { data: run } = await supabaseAdmin
      .from("evidence_simulations")
      .select("id, label, status, generated_at, source_config, scenario_template_id")
      .eq("research_project_id", id)
      // Legacy project-wide runs only (migration 095's per-source "Run
      // Research" rows are scoped by research_project_evidence_id, never
      // NULL) — keeps this project-level summary exactly as before.
      .is("research_project_evidence_id", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (run) {
      const config = (run.source_config ?? {}) as { sources?: string[]; survey_response_target?: number; mention_target?: number };
      const sources = config.sources ?? [];
      const [{ count: responseCount }, { count: mentionCount }, { data: template }] = await Promise.all([
        sources.includes("survey")
          ? supabaseAdmin.from("responses").select("id", { count: "exact", head: true }).eq("evidence_simulation_id", run.id)
          : Promise.resolve({ count: null }),
        sources.includes("conversation_search")
          ? supabaseAdmin.from("social_mentions").select("id", { count: "exact", head: true }).eq("evidence_simulation_id", run.id)
          : Promise.resolve({ count: null }),
        run.scenario_template_id
          ? supabaseAdmin.from("scenario_templates").select("name").eq("id", run.scenario_template_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      simulationInfo = {
        scenarioName: template?.name ?? null,
        label: run.label,
        status: run.status,
        generatedAt: run.generated_at,
        surveyResponseCount: sources.includes("survey") ? (responseCount ?? 0) : null,
        mentionCount: sources.includes("conversation_search") ? (mentionCount ?? 0) : null,
        // Targets — the "how much are we aiming for" half of the Research
        // Sources mini-workspace cards' progress bars. Real (non-simulated)
        // searches have no equivalent mention-target concept yet, so this
        // stays null there (a placeholder in the UI, not zero progress).
        surveyResponseTarget: sources.includes("survey") ? (config.survey_response_target ?? null) : null,
        mentionTarget: sources.includes("conversation_search") ? (config.mention_target ?? null) : null,
      };
    }
  }

  const totalResponses = stats?.total_responses ?? 0;
  const target = data.target_responses ?? null;
  const completionPct = target && target > 0 ? Math.round((totalResponses / target) * 100) : null;
  const ownerName = ownerUser?.first_name ? `${ownerUser.first_name} ${ownerUser.last_name ?? ""}`.trim() : data.created_by;

  // Per-source "Run Research" state (migration 095) — keyed by the
  // research_project_evidence row's own id, never by evidence_id alone
  // (the same survey could be attached to a different project with its
  // own separate run). Absence of a row here means "Not Started" — no
  // separate status value for that, it's simply not present in this map.
  const evidenceRowIds = (evidenceRows ?? []).map(e => e.id);
  const { data: runRows } = evidenceRowIds.length
    ? await supabaseAdmin
        .from("evidence_simulations")
        .select("research_project_evidence_id, status, error_message")
        .in("research_project_evidence_id", evidenceRowIds)
    : { data: [] as { research_project_evidence_id: string; status: string; error_message: string | null }[] };
  const runByEvidenceRowId = new Map((runRows ?? []).map(r => [r.research_project_evidence_id, r]));

  // Evidence — grouped by type on the client, never a "Primary/Supporting"
  // split here; research_projects.survey_id (above, as `survey`) remains a
  // purely internal pointer to whichever survey powers Generate
  // Deployments/Deployment Readiness/Survey Intelligence.
  const surveyEvidenceIds = (evidenceRows ?? []).filter(e => e.evidence_type === "survey").map(e => e.evidence_id);
  const [{ data: evidenceSurveys }, { data: surveyEvidenceSummaries }, { data: surveyEvidenceStats }] = await Promise.all([
    surveyEvidenceIds.length
      ? supabaseAdmin
          .from("surveys")
          .select("id, name, status, questions, thank_you_title, thank_you_body, brand_org_id, agency_org_id, created_at")
          .in("id", surveyEvidenceIds)
      : Promise.resolve({ data: [] as { id: string; name: string; status: string; questions: LocalisedQuestion[]; thank_you_title: LocalisedText; thank_you_body: LocalisedText; brand_org_id: string | null; agency_org_id: string | null; created_at: string }[] }),
    // Per-evidence-item Survey Intelligence status — mirrors the
    // Conversation Search block below. Distinct from `intelligence` above,
    // which only resolves the legacy single survey_id pointer; a project
    // with multiple attached surveys needs every one's own status for the
    // Executive Report's readiness/coverage check to be correct.
    surveyEvidenceIds.length
      ? supabaseAdmin
          .from("research_summaries")
          .select("source_id, status, generated_at")
          .eq("source_type", "survey").eq("output_type", "research_summary")
          .in("source_id", surveyEvidenceIds)
      : Promise.resolve({ data: [] as { source_id: string; status: string; generated_at: string }[] }),
    // Per-evidence-item response_count — mirrors mention_count on the
    // Conversation Search side below. Distinct from the project-level
    // `surveyStats` above (which only covers the legacy single survey_id),
    // needed so Dashboard/Research Sources/Intelligence can show each
    // attached survey's own progress once they render as a collection.
    surveyEvidenceIds.length
      ? supabaseAdmin.from("vw_survey_stats").select("id, response_count").in("id", surveyEvidenceIds)
      : Promise.resolve({ data: [] as { id: string; response_count: number }[] }),
  ]);
  const surveySummaryBySurveyId = new Map((surveyEvidenceSummaries ?? []).map(s => [s.source_id, s]));
  const surveyStatsBySurveyId = new Map((surveyEvidenceStats ?? []).map(s => [s.id, s]));
  // Research Target / Creative Design / "when target reached" (migration
  // 094) — survey-scoped, living on the evidence row itself rather than
  // the project. evidenceRows already carries these (select("*") above).
  const evidenceRowBySurveyId = new Map(
    (evidenceRows ?? []).filter(e => e.evidence_type === "survey").map(e => [e.evidence_id, e])
  );

  const evidenceOrgIds = Array.from(new Set(
    (evidenceSurveys ?? []).flatMap(s => [s.brand_org_id, s.agency_org_id]).filter((x): x is string => !!x)
  ));
  const { data: evidenceOrgs } = evidenceOrgIds.length
    ? await supabaseAdmin.from("organisations").select("id, name").in("id", evidenceOrgIds)
    : { data: [] as { id: string; name: string }[] };
  const evidenceOrgNameById = new Map((evidenceOrgs ?? []).map(o => [o.id, o.name]));

  const evidenceSurveyById = new Map((evidenceSurveys ?? []).map(s => {
    const summary = surveySummaryBySurveyId.get(s.id);
    const evidenceRow = evidenceRowBySurveyId.get(s.id);
    return [s.id, {
      id: s.id, name: s.name, status: s.status,
      question_count: (s.questions ?? []).length,
      completed_languages: getCompletedLanguages({
        questions: s.questions ?? [],
        thank_you_title: s.thank_you_title,
        thank_you_body: s.thank_you_body,
      }),
      brand_name: s.brand_org_id ? evidenceOrgNameById.get(s.brand_org_id) ?? null : null,
      agency_name: s.agency_org_id ? evidenceOrgNameById.get(s.agency_org_id) ?? null : null,
      created_at: s.created_at,
      response_count: surveyStatsBySurveyId.get(s.id)?.response_count ?? 0,
      summary_status: summary?.status ?? null,
      generated_at: summary?.generated_at ?? null,
      target_responses: evidenceRow?.target_responses ?? null,
      creative_design: evidenceRow?.creative_design ?? null,
      target_reached_action: evidenceRow?.target_reached_action ?? null,
    }];
  }));
  // Conversation Search evidence — same "resolve all attached ids in one
  // batch" shape as Survey evidence above. Conversation Search has no
  // single-pointer equivalent to research_projects.survey_id (no
  // Campaigns/deployment concept needs to inherit from it), so every
  // attached search is resolved and shipped, never just one.
  const socialSearchEvidenceIds = (evidenceRows ?? []).filter(e => e.evidence_type === "social_search").map(e => e.evidence_id);
  const [{ data: evidenceSocialSearches }, mentionStatsBySearchId, { data: conversationSummaries }] = await Promise.all([
    socialSearchEvidenceIds.length
      ? supabaseAdmin
          .from("social_searches")
          .select("id, name, status, entity_type, markets, platforms, reddit_collection_status, reddit_last_collected_at, social_keywords(keyword, keyword_type)")
          .in("id", socialSearchEvidenceIds)
      : Promise.resolve({ data: [] as { id: string; name: string; status: string; entity_type: string; markets: string[]; platforms: string[]; reddit_collection_status: string; reddit_last_collected_at: string | null; social_keywords: { keyword: string; keyword_type: string }[] }[] }),
    getSocialMentionStatsBySearchIds(socialSearchEvidenceIds),
    socialSearchEvidenceIds.length
      ? supabaseAdmin
          .from("research_summaries")
          .select("source_id, status, generated_at")
          .eq("source_type", "conversation_search").eq("output_type", "research_summary")
          .in("source_id", socialSearchEvidenceIds)
      : Promise.resolve({ data: [] as { source_id: string; status: string; generated_at: string }[] }),
  ]);
  const conversationSummaryBySearchId = new Map((conversationSummaries ?? []).map(s => [s.source_id, s]));
  const conversationSearchById = new Map((evidenceSocialSearches ?? []).map(s => {
    const stats = mentionStatsBySearchId.get(s.id);
    const summary = conversationSummaryBySearchId.get(s.id);
    return [s.id, {
      id: s.id, name: s.name, status: s.status, entity_type: s.entity_type,
      keywords: (s.social_keywords ?? []).map(k => k.keyword),
      markets: s.markets ?? [], platforms: s.platforms ?? [],
      reddit_collection_status: s.reddit_collection_status,
      reddit_last_collected_at: s.reddit_last_collected_at,
      mention_count: stats?.total ?? 0,
      positive_pct: stats?.positive_pct ?? 0, neutral_pct: stats?.neutral_pct ?? 0, negative_pct: stats?.negative_pct ?? 0,
      summary_status: summary?.status ?? null,
      generated_at: summary?.generated_at ?? null,
    }];
  }));

  // Document evidence — resolved like Survey/Conversation Search above,
  // with one deliberate difference: Document Intelligence's research_summaries
  // row is keyed by the research_project_evidence row's OWN id (migration
  // 102), not by evidence_id (library_documents.id) — the same document
  // attached to two projects gets two independent summaries. So the
  // summary lookup below is keyed by evidence row id, never evidence_id.
  const documentEvidenceRows = (evidenceRows ?? []).filter(e => e.evidence_type === "document");
  const documentEvidenceIds = documentEvidenceRows.map(e => e.evidence_id);
  const documentEvidenceRowIds = documentEvidenceRows.map(e => e.id);
  const [{ data: evidenceDocuments }, { data: documentSummaries }] = await Promise.all([
    documentEvidenceIds.length
      ? supabaseAdmin.from("library_documents").select("id, title, author, document_type, status, page_count, uploaded_at, tags").in("id", documentEvidenceIds)
      : Promise.resolve({ data: [] as { id: string; title: string; author: string | null; document_type: string; status: string; page_count: number | null; uploaded_at: string; tags: string[] }[] }),
    documentEvidenceRowIds.length
      ? supabaseAdmin
          .from("research_summaries")
          .select("source_id, status, generated_at")
          .eq("source_type", "document_project").eq("output_type", "research_summary")
          .in("source_id", documentEvidenceRowIds)
      : Promise.resolve({ data: [] as { source_id: string; status: string; generated_at: string }[] }),
  ]);
  const evidenceDocumentByLibraryId = new Map((evidenceDocuments ?? []).map(d => [d.id, d]));
  const documentSummaryByEvidenceRowId = new Map((documentSummaries ?? []).map(s => [s.source_id, s]));

  const evidence = (evidenceRows ?? []).map(e => {
    const run = runByEvidenceRowId.get(e.id);
    const doc = e.evidence_type === "document" ? evidenceDocumentByLibraryId.get(e.evidence_id) : undefined;
    const docSummary = e.evidence_type === "document" ? documentSummaryByEvidenceRowId.get(e.id) : undefined;
    return {
      id: e.id,
      evidence_type: e.evidence_type as "survey" | "social_search" | "document",
      evidence_id: e.evidence_id,
      added_at: e.added_at,
      survey: e.evidence_type === "survey" ? evidenceSurveyById.get(e.evidence_id) ?? null : null,
      conversationSearch: e.evidence_type === "social_search" ? conversationSearchById.get(e.evidence_id) ?? null : null,
      document: doc ? {
        id: doc.id, name: doc.title, author: doc.author, document_type: doc.document_type,
        library_status: doc.status, page_count: doc.page_count, uploaded_at: doc.uploaded_at, tags: doc.tags ?? [],
        summary_status: docSummary?.status ?? null,
        generated_at: docSummary?.generated_at ?? null,
      } : null,
      // "Run Research" per-source state (migration 095) — absence of a row
      // is "not_started", never a separate stored value.
      run_status: (run?.status ?? "not_started") as "not_started" | "generating" | "ready" | "failed",
      run_error: run?.error_message ?? null,
    };
  });

  // Staleness: the Executive Report snapshots the Research Question it was
  // generated against (research_question on its content) — comparing that
  // snapshot to the project's current one flags "this no longer answers
  // what's actually being asked" without re-running anything. A missing
  // snapshot (reports generated before this field existed) is treated as
  // unknown, never as stale, so it never false-flags older reports. Only
  // needed here for the Reports card, which shows a status summary without
  // fetching the report's own content — Conclusion always renders its full
  // content inline and computes the same check directly from what it
  // already has.
  const currentQuestion = (data.research_question ?? "").trim();
  const executiveReportContent = executiveReport ? (executiveReport.edited_content ?? executiveReport.content) : null;
  const reportSnapshot = executiveReportContent?.research_question ?? null;
  const report_stale = !!reportSnapshot && reportSnapshot.trim() !== currentQuestion;

  return NextResponse.json({
    data: {
      ...data,
      deployment_count: stats?.deployment_count ?? 0,
      publisher_count: stats?.publisher_count ?? 0,
      country_count: stats?.country_count ?? 0,
      total_responses: totalResponses,
      completion_pct: completionPct,
      last_response_at: stats?.last_response_at ?? null,
      owner_name: ownerName,
      survey_intelligence_status: intelligence?.status ?? null,
      report_status: executiveReport?.status ?? null,
      report_stale,
      key_findings_status: keyFindings ? "ready" : null,
      key_findings_count: keyFindings ? (keyFindings.edited_content ?? keyFindings.content).findings.length : null,
      conclusion_status: conclusion?.status ?? null,
      article_status: editorialArticle?.status ?? null,
      full_research_report_status: fullResearchReport?.status ?? null,
      // Only the published form is ever exposed here — Knowledge is a
      // library of published entries, not a preview of drafts in progress.
      published_conclusion: conclusion?.status === "published" ? (conclusion.edited_content ?? conclusion.content) : null,
      activity: activity ?? [],
      evidence,
      simulation_info: simulationInfo,
      // Server-resolved regardless of the caller's own survey ownership —
      // access to this survey summary is granted by the research project
      // access check above, not by /api/surveys' organisation scoping
      // (which would otherwise hide it from brand/agency viewers). Only the
      // derived completed_languages ships, not the raw question content —
      // the Workspace's Deployment Readiness step needs the former, never
      // the latter.
      survey: survey ? {
        id: survey.id, name: survey.name, status: survey.status,
        response_count: surveyStats?.response_count ?? 0,
        completed_languages: getCompletedLanguages({
          questions: survey.questions ?? [],
          thank_you_title: survey.thank_you_title,
          thank_you_body: survey.thank_you_body,
        }),
      } : null,
    },
  });
}

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
  const now = new Date().toISOString();

  if (body._action === "undelete") {
    const { data, error } = await supabaseAdmin
      .from("research_projects")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null, updated_at: now })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  const {
    _action: _a,
    deleted_at: _da, deleted_by: _db, delete_reason: _dr,
    deployment_count: _dc, publisher_count: _pc, country_count: _cc,
    total_responses: _tr, completion_pct: _cp, created_by_admin: _cba,
    created_by: _cb,
    // research_mode is permanent (DB trigger enforces this too — see
    // migration 075) — stripped here so a mismatched attempt gets a clear
    // 400-shaped no-op instead of surfacing the trigger's raw exception.
    research_mode: _rm,
    ...safeBody
  } = body;

  // A publisher can never retarget a project to a different publisher,
  // even their own edit requests get this pinned server-side.
  if (session.role === "publisher") {
    safeBody.publisher_org_ids = session.organisationId ? [session.organisationId] : [];
  }

  // Changing the target or its reached-action re-arms the write-path
  // auto-transition check (lib/research-project-target-check.ts) — a
  // crossing already handled under the old target shouldn't silently apply
  // to a newly-raised one, or a newly-chosen action, without being
  // re-evaluated on the next response.
  if ("target_responses" in safeBody || "target_reached_action" in safeBody) {
    safeBody.target_reached_at = null;
  }

  // Fetched before the update purely to diff against afterward, so the
  // activity log can tell "a new survey was attached as evidence" apart
  // from every other kind of edit.
  const { data: before } = await supabaseAdmin.from("research_projects").select("survey_id").eq("id", id).single();

  // Changing which survey this project points to (attaching, replacing, or
  // removing) is blocked while deployments already exist — same threshold
  // the project-delete guard below uses ("any non-deleted campaign"), so a
  // survey can't be pulled out from under live campaigns that still expect
  // to inherit it.
  if ("survey_id" in safeBody && safeBody.survey_id !== before?.survey_id) {
    const { count } = await supabaseAdmin
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .eq("research_project_id", id)
      .is("deleted_at", null);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `This project has ${count} deployment(s). Archive or delete them before changing its survey.` },
        { status: 409 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("research_projects")
    .update({ ...safeBody, updated_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A research project with this Project ID already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if ("survey_id" in safeBody && safeBody.survey_id && safeBody.survey_id !== before?.survey_id) {
    const { data: survey } = await supabaseAdmin.from("surveys").select("name").eq("id", safeBody.survey_id).single();
    await logActivity(id, "research_source_added", `Survey "${survey?.name ?? "Untitled"}" attached as evidence.`, session.workEmail);
  } else if ("survey_id" in safeBody && !safeBody.survey_id && before?.survey_id) {
    await logActivity(id, "project_updated", "Survey removed as evidence.", session.workEmail);
  } else {
    await logActivity(id, "project_updated", describeChanges(safeBody), session.workEmail);
  }

  return NextResponse.json({ data });
}

/** Small, route-local formatter — not shared, since it's just picking a human description for this one PUT. */
function describeChanges(safeBody: Record<string, unknown>): string {
  if (safeBody.archived_at) return "Project archived.";
  if ("archived_at" in safeBody && !safeBody.archived_at) return "Project restored.";
  if (safeBody.completed_at) return "Research closed.";
  if ("completed_at" in safeBody && !safeBody.completed_at) return "Research reopened.";
  if ("publisher_org_ids" in safeBody || "country_codes" in safeBody) return "Publishers and countries updated.";
  if ("status" in safeBody) return `Default campaign status updated to ${safeBody.status}.`;
  if ("target_responses" in safeBody || "target_reached_action" in safeBody) return "Research Target updated.";
  if ("confidentiality" in safeBody || "version" in safeBody) return "Project Information updated.";
  const briefFields = ["research_question", "objective", "topic", "study_type", "research_subject", "brand_org_id", "agency_org_id", "tags"];
  if (briefFields.some(f => f in safeBody)) return "Research Brief updated.";
  return "Project details updated.";
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    // No role allowlist here — real projects are still gated by role +
    // canAccess below; simulated projects are gated by the capability
    // flag instead, which isn't tied to a specific role (see the branch
    // below). requireUser() alone just confirms an active session.
    session = await requireUser(req);
  } catch (err) {
    return err as Response;
  }

  const { id } = await params;

  const { data: project } = await supabaseAdmin
    .from("research_projects")
    .select("research_mode")
    .eq("id", id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Simulated projects aren't org-scoped client data (see GET's list
  // handler for the same reasoning) — gated by the capability flag,
  // never by the org-scoped canAccess() real projects use below.
  if (project.research_mode === "simulated") {
    if (session.role !== "admin" && !session.canPresentSimulations) {
      return NextResponse.json({ error: "You don't have access to Product Walkthrough." }, { status: 403 });
    }
  } else if (
    !(session.role === "admin" || session.role === "publisher") ||
    (session.role !== "admin" && !(await canAccess(session, "research_project", id)))
  ) {
    // A publisher can only ever delete projects they can see — admin-created
    // ones are already fully hidden from them (lib/access.ts), so this is
    // effectively "their own projects only". Mirrors the original
    // requireUser(["admin","publisher"]) role restriction, now checked
    // here instead, since real and simulated projects need different
    // gates on the same route.
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Simulated projects: genuine hard delete (blueprint §07/§14 — a
  // simulated project can never contain a real row, so there's no
  // is_simulated filter that could be wrong; the project boundary IS
  // the safety boundary). No "active deployment" confirmation step —
  // its one campaign is simulated by construction, never a real
  // deployment someone could lose track of.
  if (project?.research_mode === "simulated") {
    try {
      const { rowCounts } = await deleteSimulatedProject(id, session.workEmail);
      return NextResponse.json({ success: true, deleted: rowCounts });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to delete the walkthrough." }, { status: 500 });
    }
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get("force") === "true";
  const now = new Date().toISOString();

  const { count } = await supabaseAdmin
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("research_project_id", id)
    .is("deleted_at", null);

  if ((count ?? 0) > 0 && !force) {
    return NextResponse.json(
      { error: `This project has ${count} active deployment(s). Confirm to delete anyway.` },
      { status: 409 }
    );
  }

  const { error } = await supabaseAdmin
    .from("research_projects")
    .update({ deleted_at: now, deleted_by: session.workEmail, updated_at: now })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
