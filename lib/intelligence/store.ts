// Server-only. Reads and writes research_summaries rows — the persisted,
// reviewable form of an analyst function's output. Deliberately thin and
// mechanical: it doesn't decide *when* a draft may be overwritten or a
// summary may be approved/published — that workflow validation lives in
// the route handlers that call it, same as everywhere else in this app.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  IntelligenceSourceType, IntelligenceOutputType, ResearchSummaryRow,
} from "@/lib/intelligence/types";
import { SOURCE_TYPE_TABLE } from "@/lib/research-sources/registry";

export async function getSummary<Content = unknown>(
  sourceType: IntelligenceSourceType, sourceId: string, outputType: IntelligenceOutputType
): Promise<ResearchSummaryRow<Content> | null> {
  const { data } = await supabaseAdmin
    .from("research_summaries")
    .select("*")
    .eq("source_type", sourceType).eq("source_id", sourceId).eq("output_type", outputType)
    .maybeSingle();
  return data as ResearchSummaryRow<Content> | null;
}

/** Resolves is_simulated/evidence_simulation_id from the summarised
 * source itself — never accepted from a caller, so a generated summary
 * can never be mislabelled by a bug in the route that requested it.
 * Mirrors the same resolution the Workspace and delete helper already use
 * (survey/social_search/research_project/document_project). The survey and
 * conversation_search branches are one generic lookup driven by
 * SOURCE_TYPE_TABLE (lib/research-sources/registry.ts) — a source type
 * whose own is_simulated concept lives on a table row keyed by this same
 * source_id is one registry entry, not a new branch here. document_project
 * is the one exception, kept as its own explicit branch below rather than
 * forced into that shape: its source_id is the research_project_evidence
 * row's own id (migration 102), not a row in any evidence table, and
 * documents are never simulated content regardless. */
async function resolveProvenance(
  sourceType: IntelligenceSourceType, sourceId: string
): Promise<{ isSimulated: boolean; evidenceSimulationId: string | null }> {
  const table = SOURCE_TYPE_TABLE[sourceType];
  if (table) {
    const { data } = await supabaseAdmin.from(table).select("is_simulated").eq("id", sourceId).single();
    return { isSimulated: !!data?.is_simulated, evidenceSimulationId: null };
  }
  if (sourceType === "document_project") {
    // Uploaded documents are never simulated content, and this source_id is
    // the research_project_evidence row's own id (migration 102), not a row
    // in any evidence table — there's nothing to look up here, unlike the
    // research_project case below.
    return { isSimulated: false, evidenceSimulationId: null };
  }
  // research_project — the Executive Report's own source_id is the project itself.
  const { data } = await supabaseAdmin.from("research_projects").select("research_mode").eq("id", sourceId).single();
  const isSimulated = data?.research_mode === "simulated";
  let evidenceSimulationId: string | null = null;
  if (isSimulated) {
    const { data: run } = await supabaseAdmin
      .from("evidence_simulations").select("id").eq("research_project_id", sourceId)
      // Legacy project-wide run only — a per-source "Run Research" row
      // (migration 095) is never what a project-level artifact (Executive
      // Report/Key Findings/Conclusion) gets tagged with.
      .is("research_project_evidence_id", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    evidenceSimulationId = run?.id ?? null;
  }
  return { isSimulated, evidenceSimulationId };
}

export async function saveDraft<Content>(opts: {
  sourceType:  IntelligenceSourceType;
  sourceId:    string;
  outputType:  IntelligenceOutputType;
  content:     Content;
  model:       string;
  generatedBy: string;
}): Promise<ResearchSummaryRow<Content>> {
  const { isSimulated, evidenceSimulationId } = await resolveProvenance(opts.sourceType, opts.sourceId);

  const { data, error } = await supabaseAdmin
    .from("research_summaries")
    .upsert({
      source_type:    opts.sourceType,
      source_id:      opts.sourceId,
      output_type:    opts.outputType,
      content:        opts.content,
      edited_content: null,
      status:         "draft",
      model:          opts.model,
      generated_at:   new Date().toISOString(),
      generated_by:   opts.generatedBy,
      reviewed_by:    null,
      reviewed_at:    null,
      published_at:   null,
      is_simulated:           isSimulated,
      evidence_simulation_id: evidenceSimulationId,
    }, { onConflict: "source_type,source_id,output_type" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ResearchSummaryRow<Content>;
}

export async function saveEdit<Content>(id: string, editedContent: Content): Promise<ResearchSummaryRow<Content>> {
  // Editing invalidates any prior sign-off — an approval/publish applied
  // to different content than what's now stored, so both are cleared
  // rather than left stale next to a status that no longer matches them.
  const { data, error } = await supabaseAdmin
    .from("research_summaries")
    .update({
      edited_content: editedContent,
      status:         "edited",
      reviewed_by:    null,
      reviewed_at:    null,
      published_at:   null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ResearchSummaryRow<Content>;
}

export async function approve<Content = unknown>(id: string, reviewedBy: string): Promise<ResearchSummaryRow<Content>> {
  const { data, error } = await supabaseAdmin
    .from("research_summaries")
    .update({ status: "approved", reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ResearchSummaryRow<Content>;
}

export async function publish<Content = unknown>(id: string): Promise<ResearchSummaryRow<Content>> {
  const { data, error } = await supabaseAdmin
    .from("research_summaries")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ResearchSummaryRow<Content>;
}
