// Per-source extraction: "what did THIS source find?" — the bounded unit the
// jobs framework runs one of per source. Each extractor reads the rich structures
// that already exist (computed survey observations, approved Library analyses,
// classified mentions) and returns discrete, citable SourceFindingDrafts. None of
// them calls a model, so no extractor can recreate the reasoning timeout.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentAnalysis } from "@/lib/library-documents/analysis-store";
import { surveyObservations, type SurveyResponseRow } from "@/lib/analysis/survey-observations";
import { conversationObservations, type Mention } from "@/lib/analysis/source-findings/conversation-observations";
import type { SourceFindingDraft, EvidenceStrength } from "@/lib/analysis/source-findings/types";
import type { LocalisedQuestion } from "@/lib/survey-locale";

/** The response population for a survey, counted the way the PLATFORM counts it —
 *  by campaign membership — not by the fragile `responses.survey_id`.
 *
 *  Campaign-embed responses were historically stored with `survey_id = NULL` (the
 *  embed identifies the survey by campaign slug), so a `survey_id = evidence_id`
 *  query sees only the fully-attributed subset and undercounts — which is why
 *  every question read the same 196 instead of the true, declining per-question
 *  counts. The project total avoids this by counting on `campaign_id`
 *  (vw_campaign_stats), and so must this: gather the project's campaigns whose
 *  effective survey (campaign.survey_id, else the project's survey_id) is this
 *  evidence survey, and read every response under them, unioned with any rows
 *  directly attributed to the survey. Deduped by response id. */
async function surveyResponses(surveyId: string, projectId: string, isSimulated: boolean): Promise<SurveyResponseRow[]> {
  const { data: project } = await supabaseAdmin
    .from("research_projects").select("survey_id").eq("id", projectId).maybeSingle();
  const projectSurveyId = (project?.survey_id as string | null) ?? null;

  const { data: campaigns } = await supabaseAdmin
    .from("campaigns").select("campaign_id, survey_id")
    .eq("research_project_id", projectId)
    .is("deleted_at", null);
  const campaignSlugs = (campaigns ?? [])
    .filter(c => (((c.survey_id as string | null) ?? projectSurveyId) === surveyId))
    .map(c => c.campaign_id as string)
    .filter(Boolean);

  const seen = new Set<string>();
  const out: SurveyResponseRow[] = [];
  const take = (rows: Record<string, unknown>[] | null) => {
    for (const r of rows ?? []) {
      const id = r.id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        q1: (r.q1 as string | null) ?? null, q2: (r.q2 as string | null) ?? null, q3: (r.q3 as string | null) ?? null,
        country: (r.country as string | null) ?? null, fan_segment: (r.fan_segment as string | null) ?? null,
      });
    }
  };

  const cols = "id, q1, q2, q3, country, fan_segment";
  // Directly-attributed rows (non-campaign embeds, and backfilled campaign rows).
  const { data: bySurvey } = await supabaseAdmin
    .from("responses").select(cols).eq("survey_id", surveyId).eq("is_demo", isSimulated).limit(50000);
  take(bySurvey as Record<string, unknown>[] | null);
  // Campaign-attributed rows, whatever their survey_id (incl. NULL).
  if (campaignSlugs.length > 0) {
    const { data: byCampaign } = await supabaseAdmin
      .from("responses").select(cols).in("campaign_id", campaignSlugs).eq("is_demo", isSimulated).limit(50000);
    take(byCampaign as Record<string, unknown>[] | null);
  }
  return out;
}

/** Survey findings from the full computed distributions (minorities, market and
 *  segment differences included) — the same lib/analysis/survey-observations.ts
 *  the intake layer uses, so nothing meaningful is dropped. Evidence is counted
 *  PER QUESTION: each finding carries the number of valid answers to the question
 *  that produced it, never a generic completed-survey total, and a respondent who
 *  answered one question but not another still counts toward the one they
 *  answered. The per-question reliability floor lives in survey-observations. */
export async function extractSurveyFindings(surveyId: string, projectId: string): Promise<SourceFindingDraft[]> {
  const { data: survey } = await supabaseAdmin
    .from("surveys").select("name, questions, is_simulated").eq("id", surveyId).maybeSingle();
  if (!survey) return [];

  const responses = await surveyResponses(surveyId, projectId, survey.is_simulated as boolean);
  if (responses.length === 0) return [];

  const questions = ((survey.questions ?? []) as LocalisedQuestion[]).slice(0, 3);
  const name = survey.name as string;

  return surveyObservations({ surveyName: name, questions, responses }).map(o => ({
    sourceKind: "survey" as const,
    sourceRef: surveyId,
    sourceLabel: name,
    statement: o.content,
    scope: o.scope,
    evidenceStrength: (o.validResponses >= 100 ? "moderate" : "limited") as EvidenceStrength,
    citations: [{ snippet: o.content, provenance: o.provenance }],
  }));
}

const STRENGTH_FROM_QUALITY: Record<string, EvidenceStrength> = {
  robust: "strong", directional: "moderate", limited: "limited",
};

/** Research Library findings from a document's APPROVED analysis (its key
 *  findings and statistics). Requires the document to be library-approved, which
 *  happens automatically on successful processing (migration 130). */
export async function extractDocumentFindings(libraryDocumentId: string): Promise<SourceFindingDraft[]> {
  const { data: doc } = await supabaseAdmin
    .from("library_documents").select("status, title").eq("id", libraryDocumentId).maybeSingle();
  if (!doc || doc.status !== "approved") return [];
  const analysis = await getCurrentAnalysis(libraryDocumentId);
  if (!analysis) return [];

  const content = analysis.edited_content ?? analysis.content;
  const title = content.title || (doc.title as string | null) || "Document";
  const strength = STRENGTH_FROM_QUALITY[content.research_quality?.evidence_strength ?? ""] ?? "moderate";
  const authorship = content.author_perspective?.independence_note ? "an interested party" : null;
  const scope = authorship ? `${title} (${authorship})` : title;

  const findings = content.key_findings.map(f => ({ text: f.text }));
  const stats = content.statistics.map(s => ({ text: s.value ? `${s.value}: ${s.text}` : s.text }));

  return [...findings, ...stats].map(e => ({
    sourceKind: "document" as const,
    sourceRef: libraryDocumentId,
    sourceLabel: title,
    statement: e.text,
    scope,
    evidenceStrength: strength,
    citations: [{ snippet: e.text, provenance: title }],
  }));
}

/** Conversation / News / YouTube / Bluesky findings, computed deterministically
 *  from a search's classified mentions. One search yields findings across
 *  whatever platform buckets its mentions belong to. */
export async function extractConversationFindings(searchId: string): Promise<SourceFindingDraft[]> {
  const { data: search } = await supabaseAdmin
    .from("social_searches").select("name").eq("id", searchId).maybeSingle();
  const label = (search?.name as string | null) ?? "Conversation search";

  const { data: rows } = await supabaseAdmin
    .from("social_mentions")
    .select("content, sentiment, topic, market, platform, content_kind")
    .eq("search_id", searchId)
    .eq("excluded", false)
    .not("sentiment", "is", null)
    .limit(5000);

  const mentions = (rows ?? []).map((r): Mention => ({
    content: (r.content as string | null) ?? null,
    sentiment: (r.sentiment as string | null) ?? null,
    topic: (r.topic as string | null) ?? null,
    market: (r.market as string | null) ?? null,
    platform: (r.platform as string | null) ?? null,
    contentKind: (r.content_kind as string | null) ?? null,
  }));

  return conversationObservations(mentions).map(f => ({
    sourceKind: f.bucket,
    sourceRef: searchId,
    sourceLabel: label,
    statement: f.statement,
    scope: f.scope,
    evidenceStrength: f.strength,
    citations: [f.citation],
  }));
}
