// Per-source extraction: "what did THIS source find?" — the bounded unit the
// jobs framework runs one of per source. Each extractor reads the rich structures
// that already exist (computed survey observations, approved Library analyses,
// classified mentions) and returns discrete, citable SourceFindingDrafts. None of
// them calls a model, so no extractor can recreate the reasoning timeout.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentAnalysis } from "@/lib/library-documents/analysis-store";
import { surveyObservations } from "@/lib/analysis/survey-observations";
import { projectSurveyResponseRows } from "@/lib/analysis/source-findings/survey-population";
import { conversationObservations, type Mention } from "@/lib/analysis/source-findings/conversation-observations";
import type { SourceFindingDraft, EvidenceStrength } from "@/lib/analysis/source-findings/types";
import type { LocalisedQuestion } from "@/lib/survey-locale";

/** Survey findings for a PROJECT, counted per question from the raw response rows
 *  of the project's survey-deployment campaigns (partials included) — never a
 *  completed-survey total and never a report figure. There is no single survey
 *  denominator: Q1 findings count every valid Q1 answer, Q2 every valid Q2, Q3
 *  every valid Q3 (survey-observations.ts computes each independently), so a
 *  652 / 317 / 274 funnel is reflected exactly.
 *
 *  Project-scoped because the deployment population is project-scoped (its
 *  survey_id-null partials cannot be attributed to one survey version). Question
 *  labels come from the project's default survey. */
export async function extractProjectSurveyFindings(projectId: string): Promise<SourceFindingDraft[]> {
  const { data: project } = await supabaseAdmin
    .from("research_projects").select("survey_id").eq("id", projectId).maybeSingle();
  const surveyId = (project?.survey_id as string | null) ?? null;
  if (!surveyId) return [];

  const { data: survey } = await supabaseAdmin
    .from("surveys").select("name, questions").eq("id", surveyId).maybeSingle();
  if (!survey) return [];

  const responses = await projectSurveyResponseRows(projectId);
  if (responses.length === 0) return [];

  const questions = ((survey.questions ?? []) as LocalisedQuestion[]).slice(0, 3);
  const name = survey.name as string;

  return surveyObservations({ surveyName: name, questions, responses }).map(o => ({
    sourceKind: "survey" as const,
    // One survey source per project (the deployment population).
    sourceRef: projectId,
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
