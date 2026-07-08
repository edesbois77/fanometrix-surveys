// Server-only. Reads and writes research_summaries rows — the persisted,
// reviewable form of an analyst function's output. Deliberately thin and
// mechanical: it doesn't decide *when* a draft may be overwritten or a
// summary may be approved/published — that workflow validation lives in
// the route handlers that call it, same as everywhere else in this app.
import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  IntelligenceSourceType, IntelligenceOutputType, ResearchSummaryRow,
} from "@/lib/intelligence/types";

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

export async function saveDraft<Content>(opts: {
  sourceType:  IntelligenceSourceType;
  sourceId:    string;
  outputType:  IntelligenceOutputType;
  content:     Content;
  model:       string;
  generatedBy: string;
}): Promise<ResearchSummaryRow<Content>> {
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
