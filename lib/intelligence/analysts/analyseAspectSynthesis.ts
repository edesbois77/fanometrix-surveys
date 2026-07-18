// Aspect Synthesis — the first synthesis layer of Analysis.
//
// Structured evidence (conversations today; surveys/documents later feed the
// SAME shape) is grouped by its AI-assigned research_aspect, and each aspect is
// synthesised into { summary, key_findings, recommended_actions }. Every key
// finding carries the ids of the evidence rows that support it, so the reader
// can expand a finding and show the exact conversations behind it — the
// Evidence → Aspect → Finding chain.
//
// Deliberately SOURCE-AGNOSTIC: the analyst reasons over a generic Evidence[]
// list. Only `gatherConversationEvidence` knows about social_mentions; adding a
// survey/document gatherer later means concatenating more Evidence items, with
// no change to the synthesis prompt or the stored shape (EvidenceRef.type is the
// only place source identity survives, for the UI to resolve the right rows).
//
// Pure generation — never persists. The route decides storage via store.ts.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { getSummary } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import { clampReferences } from "@/lib/intelligence/validate-references";
import { getApprovedProjectSocialSearchIds } from "@/lib/research-sources/project-searches";
import { classifyAspects, type AspectClassifyInput } from "@/lib/intelligence/aspect-classify";
import type { LocalisedQuestion } from "@/lib/survey-locale";
import type { DocumentIntelligenceReport } from "@/lib/intelligence/analysts/analyseDocumentForProject";
import type { ProvenanceRef } from "@/lib/library-documents/analysis-schema";

// The relevance floor for lazily-classified survey/document evidence — the
// equivalent of a conversation search's relevance_threshold. Below this, an item
// doesn't materially answer the research question, so it never enters synthesis.
const NON_CONVERSATION_RELEVANCE_FLOOR = 0.5;
const MAX_ITEMS_PER_DOCUMENT = 40;  // bound the lazy classification cost per document

// Context every lazily-classified source shares, so aspects align across sources.
type AspectCtx = { researchQuestion: string | null; primarySubject: string | null; candidateAspects: string[] };

// The subject the evidence must engage to be relevant — reused from the project's
// conversation Search Strategy (its primary_entity), so survey/document relevance
// is judged against the same anchor conversations use. Null when no strategy set.
async function getProjectPrimarySubject(projectId: string): Promise<string | null> {
  const ids = await getApprovedProjectSocialSearchIds(projectId);
  if (ids.length === 0) return null;
  const { data } = await supabaseAdmin
    .from("social_searches").select("search_strategy").in("id", ids);
  for (const row of data ?? []) {
    const term = (row.search_strategy as { primary_entity?: { term?: string } } | null)?.primary_entity?.term?.trim();
    if (term) return term;
  }
  return null;
}

export type EvidenceSourceType = "conversation" | "survey" | "document";
export type EvidenceRef = { type: EvidenceSourceType; id: string };

// The synthesis MERGES FINDINGS, never evidence: a finding cites its supporting
// evidence, and each cited item keeps its full source identity + provenance so
// the reader can expand a finding and show it grouped by source ("4 conversation
// items · 2 survey findings · 3 document findings"), each traceable back to
// exactly where it came from. This snapshot is captured at synthesis time, which
// is also what makes a finding reproducible. (docs/analysis-workspace-blueprint.md
// §11 step-3 decisions: preserve source identity throughout.)
export type EvidenceItemRef = {
  type: EvidenceSourceType;
  id: string;                    // item id (mention id / survey stat locator / document finding id)
  source_id: string;             // parent producer: search / survey / document id
  source_label: string;          // human name of that producer
  snippet: string;               // the evidence text, for rendering
  provenance: string | null;     // e.g. "YouTube · UK", a survey question, or "p.12"
  relevance: number | null;      // 0–1, for the finding's derived confidence
  confidence: string | null;     // classifier confidence: High | Medium | Low
  sentiment: string | null;      // Positive | Neutral | Negative | null
};

export type AspectKeyFinding = { finding: string; evidence: EvidenceItemRef[] };
export type AspectRecommendedAction = { action: string; rationale: string; based_on_findings: number[] };
export type AspectSection = {
  aspect: string;
  summary: string;
  key_findings: AspectKeyFinding[];
  recommended_actions: AspectRecommendedAction[];
  evidence_count: number;
  sentiment: { positive_pct: number; neutral_pct: number; negative_pct: number };
  sources: string[];             // distinct platforms (conversations)
  source_types: EvidenceSourceType[]; // distinct evidence source types feeding this aspect
};
export type AspectSynthesisReport = {
  aspects: AspectSection[];
  generated_at: string;
  evidence_total: number;
  aspects_found: number;   // distinct aspects present before capping
  omitted_note: string | null;
};

// The generic evidence unit the synthesis reasons over. Source-agnostic: a
// conversation, a survey statistic and a document finding all become one of these.
type Evidence = {
  ref: EvidenceRef;
  source_id: string;        // parent producer id (search / survey / document)
  source_label: string;     // producer name
  content: string;
  aspect: string;
  sentiment: string | null;
  market: string | null;
  platform: string | null;  // conversations only
  provenance: string | null;// display provenance (page / question / platform·market)
  why: string | null;       // "why this matters"
  relevance: number;        // 0–1
  confidence: string | null;// classifier confidence label
};

const MIN_EVIDENCE_PER_ASPECT = 3;   // below this, an aspect is noise, not a section
const MAX_ASPECTS = 8;               // keep the page focused; smaller aspects roll up elsewhere
const MAX_EVIDENCE_PER_ASPECT = 40;  // token bound — cite from the most relevant

// ── Source gatherer: conversations ───────────────────────────────────────────
// The ONLY source-aware code. Returns relevant, aspect-classified conversations
// as generic Evidence. Relevance uses each search's own threshold, matching what
// the Evidence view shows (low-relevance evidence never enters synthesis).
async function gatherConversationEvidence(projectId: string): Promise<Evidence[]> {
  // Evidence Validation gate: only APPROVED searches and INCLUDED (not excluded)
  // conversations feed synthesis. (docs/evidence-validation-blueprint.md)
  const searchIds = await getApprovedProjectSocialSearchIds(projectId);
  if (searchIds.length === 0) return [];

  const { data: searches } = await supabaseAdmin
    .from("social_searches").select("id, name, relevance_threshold").in("id", searchIds);
  const thresholdBySearch = new Map((searches ?? []).map(s => [s.id as string, (s.relevance_threshold as number | null) ?? 50]));
  const nameBySearch = new Map((searches ?? []).map(s => [s.id as string, (s.name as string | null) ?? "Conversation search"]));

  const { data: rows } = await supabaseAdmin
    .from("social_mentions")
    .select("id, search_id, content, research_aspect, relevance_score, relevance_rationale, relevance_confidence, sentiment, market, platform")
    .in("search_id", searchIds)
    .eq("excluded", false)
    .not("research_aspect", "is", null)
    .not("relevance_score", "is", null)
    .limit(5000);

  const out: Evidence[] = [];
  for (const r of (rows ?? []) as {
    id: string; search_id: string | null; content: string | null; research_aspect: string | null;
    relevance_score: number | null; relevance_rationale: string | null; relevance_confidence: string | null;
    sentiment: string | null; market: string | null; platform: string | null;
  }[]) {
    const aspect = r.research_aspect?.trim();
    if (!aspect || aspect.toLowerCase() === "off-topic") continue;
    if (!r.content?.trim()) continue;
    const threshold = (thresholdBySearch.get(r.search_id ?? "") ?? 50) / 100;
    if (typeof r.relevance_score !== "number" || r.relevance_score < threshold) continue;
    const provenance = [r.platform, r.market].filter(Boolean).join(" · ") || null;
    out.push({
      ref: { type: "conversation", id: r.id },
      source_id: r.search_id ?? "",
      source_label: nameBySearch.get(r.search_id ?? "") ?? "Conversation search",
      content: r.content.trim(),
      aspect,
      sentiment: r.sentiment,
      market: r.market,
      platform: r.platform,
      provenance,
      why: r.relevance_rationale,
      relevance: r.relevance_score,
      confidence: r.relevance_confidence,
    });
  }
  return out;
}

// ── Source gatherer: surveys ─────────────────────────────────────────────────
// Surveys carry no free text — the classifiable unit is a question-option
// statistic (the same statements Key Findings already computes). Each is
// classified into a Research Aspect lazily, against the project's question and
// the aspects conversations already discovered, so quantitative survey evidence
// merges into the same aspects.
async function gatherSurveyEvidence(projectId: string, ctx: AspectCtx): Promise<Evidence[]> {
  const { data: links } = await supabaseAdmin
    .from("research_project_evidence").select("evidence_id")
    .eq("research_project_id", projectId).eq("evidence_type", "survey");
  const surveyIds = (links ?? []).map(l => l.evidence_id as string).filter(Boolean);
  if (surveyIds.length === 0) return [];

  type Stat = { surveyId: string; surveyName: string; question: string; qIndex: number; text: string };
  const stats: Stat[] = [];

  for (const surveyId of surveyIds) {
    const { data: survey } = await supabaseAdmin
      .from("surveys").select("name, questions, is_simulated").eq("id", surveyId).single();
    if (!survey) continue;
    const { data: responses } = await supabaseAdmin
      .from("responses").select("q1, q2, q3").eq("survey_id", surveyId).eq("is_demo", survey.is_simulated);
    const all = responses ?? [];
    if (all.length < 50) continue;   // MIN_SURVEY_RESPONSES — not enough to be evidence

    const questions = ((survey.questions ?? []) as LocalisedQuestion[]).slice(0, 3);
    const qKeys = ["q1", "q2", "q3"] as const;
    questions.forEach((q, i) => {
      if (!q) return;
      const counts: Record<string, number> = {};
      let answered = 0;
      for (const r of all) {
        const raw = (r as Record<string, string | null>)[qKeys[i]];
        if (raw == null || raw === "") continue;
        const label = q.options.find(o => o.id === Number(raw))?.text.en ?? String(raw);
        counts[label] = (counts[label] ?? 0) + 1; answered++;
      }
      Object.entries(counts).sort((a, b) => b[1] - a[1])
        .map(([label, count]) => ({ label, pct: answered ? Math.round((count / answered) * 100) : 0 }))
        .filter(o => o.pct >= 15).slice(0, 4)   // NOTABLE_OPTION_PCT
        .forEach(o => stats.push({
          surveyId, surveyName: (survey.name as string) ?? "Survey", qIndex: i,
          question: q.text.en ?? `Question ${i + 1}`,
          text: `${o.pct}% of respondents said "${o.label}" for "${q.text.en ?? `Question ${i + 1}`}".`,
        }));
    });
  }
  if (stats.length === 0) return [];

  const toInput = (s: Stat): AspectClassifyInput => ({
    text: s.text, unitLabel: "a statistic from a fan survey",
    researchQuestion: ctx.researchQuestion, primarySubject: ctx.primarySubject, candidateAspects: ctx.candidateAspects,
  });
  const classified = await classifyAspects(stats, toInput);

  const out: Evidence[] = [];
  for (const s of stats) {
    const c = classified.get(s);
    const aspect = c?.research_aspect?.trim();
    if (!aspect || aspect.toLowerCase() === "off-topic") continue;
    if (typeof c?.relevance !== "number" || c.relevance < NON_CONVERSATION_RELEVANCE_FLOOR) continue;
    out.push({
      ref: { type: "survey", id: `${s.surveyId}#q${s.qIndex}#${out.length}` },
      source_id: s.surveyId, source_label: s.surveyName,
      content: s.text, aspect, sentiment: null, market: null, platform: null,
      provenance: s.question, why: c.why_this_matters, relevance: c.relevance, confidence: c.confidence,
    });
  }
  return out;
}

// ── Source gatherer: documents ───────────────────────────────────────────────
// Reads each attached document's already-approved, project-specific Document
// Intelligence (findings + statistics — quotes stay as supporting material, not
// independently classified) and classifies each into a Research Aspect.
function provenanceLabel(prov: ProvenanceRef[] | undefined): string | null {
  const p = prov?.[0];
  if (!p) return null;
  if (p.printed_page_label) return `p.${p.printed_page_label}`;
  if (typeof p.page_start === "number") return p.page_end && p.page_end !== p.page_start ? `pp.${p.page_start}–${p.page_end}` : `p.${p.page_start}`;
  return p.section_label ?? null;
}

async function gatherDocumentEvidence(projectId: string, ctx: AspectCtx): Promise<Evidence[]> {
  const { data: links } = await supabaseAdmin
    .from("research_project_evidence").select("id, evidence_id")
    .eq("research_project_id", projectId).eq("evidence_type", "document");
  const rows = (links ?? []) as { id: string; evidence_id: string }[];
  if (rows.length === 0) return [];

  type DocItem = { rowId: string; title: string; id: string; text: string; provenance: string | null };
  const items: DocItem[] = [];

  for (const row of rows) {
    const summary = await getSummary<DocumentIntelligenceReport>("document_project", row.id, "research_summary");
    if (!summary || (summary.status !== "approved" && summary.status !== "published")) continue;
    const content = summary.edited_content ?? summary.content;
    const title = content.document_summary.title;
    const findings = content.key_findings.map(f => ({ id: f.id, text: f.text, provenance: provenanceLabel(f.provenance) }));
    const statistics = content.statistics.map(s => ({ id: s.id, text: s.value ? `${s.value}: ${s.text}` : s.text, provenance: provenanceLabel(s.provenance) }));
    for (const it of [...findings, ...statistics].slice(0, MAX_ITEMS_PER_DOCUMENT)) {
      items.push({ rowId: row.id, title, id: it.id, text: it.text, provenance: it.provenance });
    }
  }
  if (items.length === 0) return [];

  const toInput = (it: DocItem): AspectClassifyInput => ({
    text: it.text, unitLabel: "a finding from a research document",
    researchQuestion: ctx.researchQuestion, primarySubject: ctx.primarySubject, candidateAspects: ctx.candidateAspects,
  });
  const classified = await classifyAspects(items, toInput);

  const out: Evidence[] = [];
  for (const it of items) {
    const c = classified.get(it);
    const aspect = c?.research_aspect?.trim();
    if (!aspect || aspect.toLowerCase() === "off-topic") continue;
    if (typeof c?.relevance !== "number" || c.relevance < NON_CONVERSATION_RELEVANCE_FLOOR) continue;
    out.push({
      ref: { type: "document", id: it.id },
      source_id: it.rowId, source_label: it.title,
      content: it.text, aspect, sentiment: null, market: null, platform: null,
      provenance: it.provenance, why: c.why_this_matters, relevance: c.relevance, confidence: c.confidence,
    });
  }
  return out;
}

function sentimentSplit(items: Evidence[]): { positive_pct: number; neutral_pct: number; negative_pct: number } {
  const n = items.length || 1;
  const c = (s: string) => items.filter(i => i.sentiment === s).length;
  return {
    positive_pct: Math.round((c("Positive") / n) * 100),
    neutral_pct:  Math.round((c("Neutral") / n) * 100),
    negative_pct: Math.round((c("Negative") / n) * 100),
  };
}

const SOURCE_WORD: Record<EvidenceSourceType, string> = { conversation: "conversation", survey: "survey", document: "document" };

function buildAspectPrompt(aspect: string, researchQuestion: string | null, items: Evidence[]): string {
  const list = items.map((e, i) =>
    `[${i}] (${SOURCE_WORD[e.ref.type]}${e.sentiment ? `, ${e.sentiment}` : ""}${e.market ? `, ${e.market}` : ""}) "${e.content.slice(0, 300)}"`
  ).join("\n");
  const types = Array.from(new Set(items.map(i => i.ref.type)));
  const multi = types.length > 1;
  return `You are a senior research analyst writing the "${aspect}" section of a research analysis.
${researchQuestion ? `Overall research question: "${researchQuestion}"\n` : ""}
You are given evidence classified under "${aspect}", drawn from ${multi ? `multiple sources (${types.map(t => SOURCE_WORD[t]).join(", ")})` : `${SOURCE_WORD[types[0]]} evidence`}. Each item is tagged with its source type. Synthesise it into a section a client would read in a professional research report — grounded ONLY in this evidence, never invented.

Evidence (index in brackets):
${list}

Return ONLY valid JSON:
{
  "summary": "2–4 sentences: what the evidence for this aspect shows overall.",
  "key_findings": [
    { "finding": "a specific, evidence-backed finding (one sentence)", "evidence": [array of the evidence indices above that support THIS finding] }
  ],
  "recommended_actions": [
    { "action": "a concrete action this aspect's evidence supports", "rationale": "why the evidence supports it", "based_on_findings": [indices into key_findings] }
  ]
}

Rules:
- Ground every finding in the evidence shown. Each finding MUST cite the indices of the evidence items that support it; never cite an index not shown above.
${multi ? "- Where sources agree, a finding backed by more than one source type is stronger — cite all supporting items. Where survey/document/conversation evidence points in DIFFERENT directions, do not average it away; state the finding the evidence supports and let the divergence stand.\n" : ""}- 2–5 key findings — only what the evidence genuinely supports; do not pad.
- 0–3 recommended actions — omit rather than invent. An action must follow from the findings, not restate them.
- Do not generalise a single voice into "fans" plural; if only one or two items raise something specific, say so or describe the broader theme.
- Write in plain, confident analyst prose. No hedging boilerplate, no mention of AI, prompts or scores.`;
}

type RawAspectOut = {
  summary?: unknown;
  key_findings?: { finding?: unknown; evidence?: unknown }[];
  recommended_actions?: { action?: unknown; rationale?: unknown; based_on_findings?: unknown }[];
};

async function synthesiseAspect(aspect: string, researchQuestion: string | null, items: Evidence[]): Promise<AspectSection> {
  // Feed the most relevant items (bounded); findings cite from what's shown.
  const shown = [...items].sort((a, b) => b.relevance - a.relevance).slice(0, MAX_EVIDENCE_PER_ASPECT);
  const raw = await completeJSON<RawAspectOut>({ prompt: buildAspectPrompt(aspect, researchQuestion, shown), maxTokens: 1600 });

  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const intArr = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : []);

  const key_findings: AspectKeyFinding[] = (raw.key_findings ?? [])
    .map(f => ({
      finding: str(f?.finding),
      evidence: clampReferences(intArr(f?.evidence), shown.length).map(i => toItemRef(shown[i])),
    }))
    .filter(f => f.finding.length > 0);

  const recommended_actions: AspectRecommendedAction[] = (raw.recommended_actions ?? [])
    .map(a => ({
      action: str(a?.action),
      rationale: str(a?.rationale),
      based_on_findings: clampReferences(intArr(a?.based_on_findings), key_findings.length),
    }))
    .filter(a => a.action.length > 0);

  return {
    aspect,
    summary: str(raw.summary),
    key_findings,
    recommended_actions,
    evidence_count: items.length,
    sentiment: sentimentSplit(items),
    sources: Array.from(new Set(items.map(i => i.platform).filter((p): p is string => !!p))),
    source_types: (["conversation", "survey", "document"] as EvidenceSourceType[]).filter(t => items.some(i => i.ref.type === t)),
  };
}

// Snapshot an Evidence item into the stored, provenance-preserving ref the reader
// renders. Captured at synthesis time so the finding is reproducible and every
// item stays traceable to its source.
function toItemRef(e: Evidence): EvidenceItemRef {
  return {
    type: e.ref.type, id: e.ref.id,
    source_id: e.source_id, source_label: e.source_label,
    snippet: e.content, provenance: e.provenance,
    relevance: e.relevance, confidence: e.confidence, sentiment: e.sentiment,
  };
}

// Staleness watermark: how many relevant conversations entered the base AFTER a
// given moment (the synthesis's generated_at). Evidence is append-only, so
// first_seen_at is stable — a duplicate-only or metadata-only run adds no rows
// with a newer first_seen_at, so it never marks a synthesis stale. Mirrors the
// same relevance filter gatherConversationEvidence uses.
export async function countRelevantEvidenceSince(projectId: string, since: string): Promise<number> {
  const searchIds = await getApprovedProjectSocialSearchIds(projectId);
  if (searchIds.length === 0) return 0;
  const { data: searches } = await supabaseAdmin
    .from("social_searches").select("id, relevance_threshold").in("id", searchIds);
  const thresholdBySearch = new Map((searches ?? []).map(s => [s.id as string, (s.relevance_threshold as number | null) ?? 50]));

  const { data: rows } = await supabaseAdmin
    .from("social_mentions")
    .select("search_id, research_aspect, relevance_score, first_seen_at")
    .in("search_id", searchIds)
    .eq("excluded", false)
    .not("research_aspect", "is", null)
    .not("relevance_score", "is", null)
    .gt("first_seen_at", since)
    .limit(5000);

  let n = 0;
  for (const r of (rows ?? []) as { search_id: string | null; research_aspect: string | null; relevance_score: number | null }[]) {
    const aspect = r.research_aspect?.trim();
    if (!aspect || aspect.toLowerCase() === "off-topic") continue;
    const threshold = (thresholdBySearch.get(r.search_id ?? "") ?? 50) / 100;
    if (typeof r.relevance_score !== "number" || r.relevance_score < threshold) continue;
    n++;
  }
  return n;
}

export async function analyseAspectSynthesis(projectId: string): Promise<AspectSynthesisReport> {
  const { data: proj } = await supabaseAdmin
    .from("research_projects").select("research_question").eq("id", projectId).maybeSingle();
  const researchQuestion = (proj?.research_question as string | null)?.trim() || null;
  const primarySubject = await getProjectPrimarySubject(projectId);

  // Source-agnostic assembly. Conversations (aspect-classified at collection)
  // come first and seed the aspect vocabulary; surveys and documents are then
  // classified lazily AGAINST those existing aspects, so evidence from every
  // source merges into the SAME aspects instead of inventing near-duplicates.
  const conversationEvidence = await gatherConversationEvidence(projectId);
  const candidateAspects = Array.from(new Set(conversationEvidence.map(e => e.aspect)));
  const ctx: AspectCtx = { researchQuestion, primarySubject, candidateAspects };

  const surveyEvidence = await gatherSurveyEvidence(projectId, ctx);
  // Documents align to conversation + survey aspects discovered so far.
  ctx.candidateAspects = Array.from(new Set([...candidateAspects, ...surveyEvidence.map(e => e.aspect)]));
  const documentEvidence = await gatherDocumentEvidence(projectId, ctx);

  const evidence = [...conversationEvidence, ...surveyEvidence, ...documentEvidence];

  if (evidence.length === 0) {
    throw new IntelligenceError(422, "No relevant classified evidence yet. Collect and approve conversations, or attach surveys/documents with approved intelligence, then synthesise.");
  }

  // Group by aspect; keep the substantive ones, most-evidenced first.
  const byAspect = new Map<string, Evidence[]>();
  for (const e of evidence) {
    const arr = byAspect.get(e.aspect) ?? [];
    arr.push(e);
    byAspect.set(e.aspect, arr);
  }
  const ranked = Array.from(byAspect.entries())
    .filter(([, items]) => items.length >= MIN_EVIDENCE_PER_ASPECT)
    .sort((a, b) => b[1].length - a[1].length);

  if (ranked.length === 0) {
    throw new IntelligenceError(422, `Not enough classified evidence per aspect to synthesise yet (need at least ${MIN_EVIDENCE_PER_ASPECT} relevant evidence items sharing a research aspect). Collect or attach more, then synthesise.`);
  }

  const selected = ranked.slice(0, MAX_ASPECTS);
  const aspects = await Promise.all(selected.map(([aspect, items]) => synthesiseAspect(aspect, researchQuestion, items)));

  const omitted = ranked.length - selected.length;
  return {
    aspects: aspects.filter(a => a.summary || a.key_findings.length > 0),
    generated_at: new Date().toISOString(),
    evidence_total: evidence.length,
    aspects_found: byAspect.size,
    omitted_note: omitted > 0 ? `${omitted} smaller aspect${omitted === 1 ? "" : "s"} with less evidence ${omitted === 1 ? "is" : "are"} rolled into the project Key Findings rather than shown as ${omitted === 1 ? "its own section" : "their own sections"}.` : null,
  };
}
