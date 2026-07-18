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
import { IntelligenceError } from "@/lib/intelligence/types";
import { clampReferences } from "@/lib/intelligence/validate-references";
import { getApprovedProjectSocialSearchIds } from "@/lib/research-sources/project-searches";

// A conversation the model is allowed to cite is either a survey response, a
// conversation or a document passage — the type is all the UI needs to resolve
// the row back to its home view.
export type EvidenceRef = { type: "conversation" | "survey" | "document"; id: string };

export type AspectKeyFinding = { finding: string; evidence: EvidenceRef[] };
export type AspectRecommendedAction = { action: string; rationale: string; based_on_findings: number[] };
export type AspectSection = {
  aspect: string;
  summary: string;
  key_findings: AspectKeyFinding[];
  recommended_actions: AspectRecommendedAction[];
  evidence_count: number;
  sentiment: { positive_pct: number; neutral_pct: number; negative_pct: number };
  sources: string[];
};
export type AspectSynthesisReport = {
  aspects: AspectSection[];
  generated_at: string;
  evidence_total: number;
  aspects_found: number;   // distinct aspects present before capping
  omitted_note: string | null;
};

// The generic evidence unit the synthesis reasons over.
type Evidence = {
  ref: EvidenceRef;
  content: string;
  aspect: string;
  sentiment: string | null;
  market: string | null;
  platform: string | null;
  why: string | null;       // "why this matters"
  relevance: number;        // 0–1
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
    .from("social_searches").select("id, relevance_threshold").in("id", searchIds);
  const thresholdBySearch = new Map((searches ?? []).map(s => [s.id as string, (s.relevance_threshold as number | null) ?? 50]));

  const { data: rows } = await supabaseAdmin
    .from("social_mentions")
    .select("id, search_id, content, research_aspect, relevance_score, relevance_rationale, sentiment, market, platform")
    .in("search_id", searchIds)
    .eq("excluded", false)
    .not("research_aspect", "is", null)
    .not("relevance_score", "is", null)
    .limit(5000);

  const out: Evidence[] = [];
  for (const r of (rows ?? []) as {
    id: string; search_id: string | null; content: string | null; research_aspect: string | null;
    relevance_score: number | null; relevance_rationale: string | null; sentiment: string | null;
    market: string | null; platform: string | null;
  }[]) {
    const aspect = r.research_aspect?.trim();
    if (!aspect || aspect.toLowerCase() === "off-topic") continue;
    if (!r.content?.trim()) continue;
    const threshold = (thresholdBySearch.get(r.search_id ?? "") ?? 50) / 100;
    if (typeof r.relevance_score !== "number" || r.relevance_score < threshold) continue;
    out.push({
      ref: { type: "conversation", id: r.id },
      content: r.content.trim(),
      aspect,
      sentiment: r.sentiment,
      market: r.market,
      platform: r.platform,
      why: r.relevance_rationale,
      relevance: r.relevance_score,
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

function buildAspectPrompt(aspect: string, researchQuestion: string | null, items: Evidence[]): string {
  const list = items.map((e, i) =>
    `[${i}] (${e.sentiment ?? "?"}${e.market ? `, ${e.market}` : ""}) "${e.content.slice(0, 300)}"`
  ).join("\n");
  return `You are a senior research analyst writing the "${aspect}" section of a research analysis.
${researchQuestion ? `Overall research question: "${researchQuestion}"\n` : ""}
You are given the collected evidence classified under "${aspect}". Synthesise it into a section a client would read in a professional research report — grounded ONLY in this evidence, never invented.

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
- Ground every finding in the evidence shown. Each finding MUST cite the indices of the conversations that support it; never cite an index not shown above.
- 2–5 key findings — only what the evidence genuinely supports; do not pad.
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
      evidence: clampReferences(intArr(f?.evidence), shown.length).map(i => shown[i].ref),
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
  // Source-agnostic assembly — concatenate every source's evidence here.
  const evidence = [
    ...await gatherConversationEvidence(projectId),
    // ...await gatherSurveyEvidence(projectId),   // future
    // ...await gatherDocumentEvidence(projectId), // future
  ];

  if (evidence.length === 0) {
    throw new IntelligenceError(422, "No relevant classified evidence yet. Run collection so conversations are judged for relevance and research aspect, then synthesise.");
  }

  const { data: proj } = await supabaseAdmin
    .from("research_projects").select("research_question").eq("id", projectId).maybeSingle();
  const researchQuestion = (proj?.research_question as string | null)?.trim() || null;

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
    throw new IntelligenceError(422, `Not enough classified evidence per aspect to synthesise yet (need at least ${MIN_EVIDENCE_PER_ASPECT} relevant conversations sharing a research aspect). Collect more, then synthesise.`);
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
