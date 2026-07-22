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
import { stripEmDash } from "@/lib/strip-em-dash";
import type { EngagementContext } from "@/lib/engagement-context";
import type { Brief } from "@/lib/brief";
import {
  type EvidenceRole, asEvidenceRole, EVIDENCE_ROLE_LABEL, EVIDENCE_ROLE_ATTRIBUTION_RULE,
} from "@/lib/evidence-role";
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
  // WHAT KIND of evidence this is. Travels from collection so a finding can never
  // silently attribute a competitor's conversation to the client. Optional so
  // previously stored syntheses keep rendering (they predate the role).
  evidence_role?: EvidenceRole;
};

// DETERMINISTIC quantification for a finding, computed AFTER generation from the
// evidence the model actually cited. The model is never asked to count: it may
// only reuse figures we supply, and these are the true ones. This is what keeps
// consultancy-grade prose from drifting into invented frequency claims.
export type FindingSupport = {
  items: number;          // evidence items cited by this finding
  of_total: number;       // out of the aspect's total evidence
  strong: number;         // cited items that materially answer the question
  positive: number; neutral: number; negative: number;
  source_types: EvidenceSourceType[];
};

// `support` is optional so previously stored syntheses keep rendering.
export type AspectKeyFinding = { finding: string; evidence: EvidenceItemRef[]; support?: FindingSupport };
export type AspectRecommendedAction = { action: string; rationale: string; based_on_findings: number[] };

// A contradiction is SURFACED, never averaged away — where evidence genuinely
// diverges (e.g. survey approval vs negative conversations), each side keeps its
// own evidence so the disagreement is traceable. Derived from the same synthesis
// pass; the model describes the detected divergence, it does not resolve it.
export type AspectContradictionSide = { position: string; evidence: EvidenceItemRef[] };
export type AspectContradiction = { tension: string; sides: AspectContradictionSide[] };

// A gap is what's MISSING — computed deterministically from source coverage +
// evidence strength, so Analysis says "we don't yet know" instead of inferring.
export type AspectGap = { kind: "missing_source" | "low_confidence"; message: string; suggested_action: string };

export type AspectSection = {
  aspect: string;
  summary: string;
  key_findings: AspectKeyFinding[];
  contradictions: AspectContradiction[];
  gaps: AspectGap[];
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
  role: EvidenceRole;       // direct | comparative | strategic
};

const MIN_EVIDENCE_PER_ASPECT = 3;   // below this, an aspect is noise, not a section
const MAX_ASPECTS = 8;               // keep the page focused; smaller aspects roll up elsewhere
// Fewer, FULLER items synthesise better than more fragments: a truncated post
// produces a finding built on half a thought. Trading breadth for depth, and
// making room for each item's "why this matters" note.
const MAX_EVIDENCE_PER_ASPECT = 25;
const EVIDENCE_CHARS = 600;
const WHY_CHARS = 220;
const STRONG_RELEVANCE = 0.7;        // an item that materially answers the question

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
    .select("id, search_id, content, research_aspect, relevance_score, relevance_rationale, relevance_confidence, sentiment, market, platform, evidence_role")
    .in("search_id", searchIds)
    .eq("excluded", false)
    .not("research_aspect", "is", null)
    .not("relevance_score", "is", null)
    .limit(5000);

  const out: Evidence[] = [];
  for (const r of (rows ?? []) as {
    id: string; search_id: string | null; content: string | null; research_aspect: string | null;
    relevance_score: number | null; relevance_rationale: string | null; relevance_confidence: string | null;
    sentiment: string | null; market: string | null; platform: string | null; evidence_role: string | null;
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
      role: asEvidenceRole(r.evidence_role),
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
      role: "direct",
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
      role: "direct",
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

// ── Research Aspects as stable knowledge objects ─────────────────────────────
// Free-generated aspect labels fragment ("Sponsorship Awareness" vs "Sponsor
// Awareness"), which splits one theme into several thin ones, each then dropped
// by MIN_EVIDENCE_PER_ASPECT — evidence disappears silently. Canonicalisation is
// DETERMINISTIC and deliberately MECHANICAL (case, punctuation, simple plurals).
// It must never merge genuinely different aspects, so there is no semantic
// matching here: "Brand Perception" and "Brand Fit" stay apart, by design.
const singular = (w: string): string =>
  w.endsWith("ss") ? w : w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("s") ? w.slice(0, -1) : w;

export function canonicalAspectKey(label: string): string {
  return label.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/).filter(Boolean)
    .map(singular)
    .join(" ");
}

// An aspect earns its place by MATERIALLY CONTRIBUTING TO THE RESEARCH QUESTION,
// not by being the loudest. relevance_score is judged at classification time
// against the question / information needs, so mean relevance IS the
// contribution signal. Volume is included only as saturating weight-of-evidence,
// so a large weak aspect never outranks a smaller decisive one.
export function aspectContribution(items: Evidence[]): number {
  const n = items.length || 1;
  const meanRel = items.reduce((s, i) => s + i.relevance, 0) / n;
  const strongShare = items.filter(i => i.relevance >= STRONG_RELEVANCE).length / n;
  const volume = Math.min(1, Math.log10(1 + n) / Math.log10(1 + 12));
  return meanRel * 0.6 + strongShare * 0.25 + volume * 0.15;
}

// The engagement lens. Analysis must reason from the commission, not merely
// summarise evidence — the same discipline commissioning uses.
function serialiseLens(rq: string | null, ec: EngagementContext | null, brief: Brief | null): string {
  const line = (label: string, v: string | null | undefined) => (v && v.trim() ? `- ${label}: ${v.trim()}` : "");
  return [
    line("THE RESEARCH QUESTION (everything below must help answer this)", rq),
    line("Engagement type", ec?.engagement_type),
    line("Organisation", ec?.organisation ?? brief?.client),
    line("Commissioned by", ec?.commissioner ?? brief?.commissioned_by),
    line("The decision the client must make", ec?.decision),
    line("Commercial objective", ec?.commercial_objective),
    line("Strategic tension", ec?.strategic_tension),
    ec?.decisive_factors?.length ? `- What will decide success: ${ec.decisive_factors.join("; ")}` : "",
    line("Market", ec?.market ?? brief?.geography),
    line("Audience", ec?.intended_audience ?? brief?.audience),
  ].filter(Boolean).join("\n");
}

// Every number the model is permitted to use, computed here. Nothing else.
function aspectFacts(all: Evidence[], shown: Evidence[]): string {
  const n = all.length;
  const s = sentimentSplit(all);
  const strong = all.filter(i => i.relevance >= STRONG_RELEVANCE).length;
  const byType = (["conversation", "survey", "document"] as EvidenceSourceType[])
    .map(t => ({ t, c: all.filter(i => i.ref.type === t).length })).filter(x => x.c > 0);
  const markets = Array.from(new Set(all.map(i => i.market).filter(Boolean)));
  return [
    `- Evidence items for this aspect: ${n} (the ${shown.length} most relevant are shown below)`,
    `- Items that materially answer the research question (relevance ${STRONG_RELEVANCE}+): ${strong} of ${n}`,
    `- Sentiment across the aspect: ${s.positive_pct}% positive, ${s.neutral_pct}% neutral, ${s.negative_pct}% negative`,
    `- Sources: ${byType.map(x => `${x.c} ${SOURCE_WORD[x.t]}${x.c === 1 ? "" : "s"}`).join(", ")}`,
    `- Evidence by role: ${(["direct", "comparative", "strategic"] as EvidenceRole[])
      .map(r => ({ r, c: all.filter(i => i.role === r).length })).filter(x => x.c > 0)
      .map(x => `${x.c} ${EVIDENCE_ROLE_LABEL[x.r].toLowerCase()}`).join(", ")}`,
    markets.length ? `- Markets represented: ${markets.join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

function buildAspectPrompt(aspect: string, lens: string, facts: string, items: Evidence[]): string {
  const list = items.map((e, i) =>
    `[${i}] (${EVIDENCE_ROLE_LABEL[e.role].toUpperCase()} · ${SOURCE_WORD[e.ref.type]}${e.sentiment ? `, ${e.sentiment}` : ""}${e.market ? `, ${e.market}` : ""}) "${e.content.slice(0, EVIDENCE_CHARS)}"${e.why ? `\n     analyst note: ${e.why.slice(0, WHY_CHARS)}` : ""}`
  ).join("\n");
  const types = Array.from(new Set(items.map(i => i.ref.type)));
  const multi = types.length > 1;
  // Attribution rules for exactly the roles present. This is what stops a
  // competitor's conversation becoming "fans think the client is...".
  const rolesPresent = Array.from(new Set(items.map(i => i.role)));
  const attribution = rolesPresent
    .map(r => `- ${EVIDENCE_ROLE_LABEL[r].toUpperCase()} evidence ${EVIDENCE_ROLE_ATTRIBUTION_RULE[r]}`)
    .join("\n");
  return `You are a senior research consultant writing the "${aspect}" section of a client analysis. Your job is NOT to summarise conversations. It is to move the client closer to answering their research question, and to do it in a way that stands up to scrutiny.

THE ENGAGEMENT (reason from this throughout, never merely describe the evidence):
${lens || "- (no engagement context recorded; reason from the evidence alone)"}

THE EVIDENCE classified under "${aspect}"${multi ? `, drawn from multiple sources (${types.map(t => SOURCE_WORD[t]).join(", ")})` : ""}. Each item carries an analyst note recorded when it was judged relevant. Use those notes as INPUT to your thinking, they tell you why the item was kept, but never quote or restate them:
${list}

EVIDENCE ROLES AND ATTRIBUTION. Each item is tagged with the ROLE it was collected for. This governs what you are allowed to say about it, and it is not negotiable:
${attribution}
Never blend roles into a single claim about the client. If a judgement rests on comparative or strategic evidence, say whose evidence it is ("among rival sponsors", "in this audience generally"), and never phrase it as what fans think about the client.

THE FACTS (computed, exact). These are the ONLY figures you may state. Never count, estimate or infer a number yourself:
${facts}

Return ONLY valid JSON:
{
  "summary": "2–4 sentences: what this aspect contributes to ANSWERING the research question, and how far it gets us.",
  "key_findings": [
    { "finding": "a consultancy judgement (1–2 sentences)", "evidence": [array of the evidence indices above that support THIS finding] }
  ],
  "contradictions": [
    { "tension": "one sentence naming the disagreement and what it suggests", "sides": [ { "position": "what this side of the evidence shows", "evidence": [indices supporting this side] }, { "position": "what the other side shows", "evidence": [indices supporting it] } ] }
  ],
  "recommended_actions": [
    { "action": "a concrete action this aspect's evidence supports", "rationale": "why the evidence supports it", "based_on_findings": [indices into key_findings] }
  ]
}

WHAT A FINDING MUST BE. Not a description of what people said, a JUDGEMENT about what it means. Every finding must do all four:
 1. LEAD WITH THE JUDGEMENT. First clause states what you conclude, not what was observed.
 2. ANSWER PART OF THE RESEARCH QUESTION. Say what it settles, or narrows, for the decision on the table.
 3. SAY WHY IT MATTERS commercially, tied to the objective or the decision above.
 4. STAY EVIDENCE-GROUNDED. Cite the indices that support it; never cite an index not shown.

WEAK (a description, rejected): "Fans express frustration about matchday experience."
STRONG (a judgement): "Matchday experience is the strongest barrier to sponsor appreciation in this evidence: it is raised unprompted more than any other theme, and it is the only one where negative sentiment outweighs positive. That matters commercially because the sponsorship is being judged on an experience the sponsor does not control."

QUANTIFICATION, strictly: you may only use figures given in THE FACTS, verbatim. Do NOT invent counts, percentages or proportions. Do NOT make a comparative or superlative claim ("most", "strongest", "consistently") unless THE FACTS support that comparison; if they do not, make the judgement without the comparative.

HONESTY OVER COMPLETENESS: if this evidence does not answer part of the research question, say so plainly in the summary. Never stretch thin evidence into an answer. A narrow, well-supported finding beats a broad, weakly-supported one.

Other rules:
- 2–5 key findings, only what the evidence genuinely supports; do not pad.
${multi ? "- Where sources agree, a finding backed by more than one source type is stronger, cite all supporting items. Where sources point in DIFFERENT directions, do not average it away; state the finding the evidence supports and let the divergence stand.\n" : ""}- CONTRADICTIONS: only when the evidence GENUINELY DIVERGES, one body pointing one way while another points the opposite (e.g. survey approval vs largely negative conversations). Give both sides, each citing its own indices, and name what the divergence suggests (e.g. prompted opinion vs unsolicited discussion). Do NOT invent a contradiction where evidence is merely thin, and never resolve one by averaging. Empty array if there is none.
- 0–3 recommended actions. Each must serve THE DECISION named above and be specific enough to act on. Omit rather than invent; an action must follow from the findings, not restate them.
- Do not generalise a single voice into "fans" plural; if only one or two items raise something, say so.
- BANNED as filler: "authentic engagement", "emotional connection", "deeper connection", "meaningful engagement", "cultural resonance", "resonate with", "tap into", "leverage", "in today's landscape". Replace with the concrete thing you actually mean.
- VOICE: plain, confident consultant prose. No hedging ("it seems", "perhaps"), no throat-clearing, no mention of AI, prompts, scores or classification. PUNCTUATION: use commas; NEVER use em-dashes or any long dash; always a comma instead.`;
}

type RawAspectOut = {
  summary?: unknown;
  key_findings?: { finding?: unknown; evidence?: unknown }[];
  contradictions?: { tension?: unknown; sides?: { position?: unknown; evidence?: unknown }[] }[];
  recommended_actions?: { action?: unknown; rationale?: unknown; based_on_findings?: unknown }[];
};

const GAP_COPY: Record<EvidenceSourceType, { message: string; action: string }> = {
  survey:       { message: "No survey evidence yet",       action: "Run a survey to measure this directly, rather than inferring it." },
  conversation: { message: "No conversation evidence yet", action: "Collect conversations to hear how people discuss this unprompted." },
  document:     { message: "No published research yet",    action: "Add a research document or desk research to corroborate." },
};

// Research gaps — DETERMINISTIC, from source coverage + evidence strength. No AI:
// Analysis states what is missing rather than inferring an answer.
function computeAspectGaps(items: Evidence[]): AspectGap[] {
  const present = new Set(items.map(i => i.ref.type));
  const gaps: AspectGap[] = [];
  for (const t of ["survey", "conversation", "document"] as EvidenceSourceType[]) {
    if (!present.has(t)) gaps.push({ kind: "missing_source", message: GAP_COPY[t].message, suggested_action: GAP_COPY[t].action });
  }
  const meanRel = items.length ? items.reduce((s, i) => s + i.relevance, 0) / items.length : 0;
  if (items.length < 5 || meanRel < 0.6) {
    gaps.push({
      kind: "low_confidence",
      message: `Evidence for this aspect is ${items.length < 5 ? "thin" : "moderate"} (${items.length} item${items.length === 1 ? "" : "s"}${meanRel < 0.6 ? ", lower average relevance" : ""})`,
      suggested_action: "Gather more evidence before relying heavily on this aspect.",
    });
  }
  return gaps;
}

// True quantification for a finding, from the evidence it actually cites.
function findingSupport(evidence: EvidenceItemRef[], totalItems: number): FindingSupport {
  const c = (s: string) => evidence.filter(e => e.sentiment === s).length;
  return {
    items: evidence.length,
    of_total: totalItems,
    strong: evidence.filter(e => (e.relevance ?? 0) >= STRONG_RELEVANCE).length,
    positive: c("Positive"), neutral: c("Neutral"), negative: c("Negative"),
    source_types: (["conversation", "survey", "document"] as EvidenceSourceType[]).filter(t => evidence.some(e => e.type === t)),
  };
}

async function synthesiseAspect(aspect: string, lens: string, items: Evidence[]): Promise<AspectSection> {
  // Feed the most relevant items (bounded); findings cite from what's shown.
  const shown = [...items].sort((a, b) => b.relevance - a.relevance).slice(0, MAX_EVIDENCE_PER_ASPECT);
  const raw = await completeJSON<RawAspectOut>({
    prompt: buildAspectPrompt(aspect, lens, aspectFacts(items, shown), shown), maxTokens: 1900,
  });

  const str = (v: unknown): string => stripEmDash(typeof v === "string" ? v.trim() : "");
  const intArr = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n)) : []);

  const key_findings: AspectKeyFinding[] = (raw.key_findings ?? [])
    .map(f => {
      const evidence = clampReferences(intArr(f?.evidence), shown.length).map(i => toItemRef(shown[i]));
      return { finding: str(f?.finding), evidence, support: findingSupport(evidence, items.length) };
    })
    .filter(f => f.finding.length > 0);

  // Contradictions: only keep a genuine two-sided divergence where each side has
  // its own evidence — never a one-sided "contradiction".
  const contradictions: AspectContradiction[] = (raw.contradictions ?? [])
    .map(c => ({
      tension: str(c?.tension),
      sides: (c?.sides ?? [])
        .map(s => ({ position: str(s?.position), evidence: clampReferences(intArr(s?.evidence), shown.length).map(i => toItemRef(shown[i])) }))
        .filter(s => s.position.length > 0 && s.evidence.length > 0),
    }))
    .filter(c => c.tension.length > 0 && c.sides.length >= 2);

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
    contradictions,
    gaps: computeAspectGaps(items),
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
    evidence_role: e.role,
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
    .from("research_projects").select("research_question, engagement_context, brief").eq("id", projectId).maybeSingle();
  const researchQuestion = (proj?.research_question as string | null)?.trim() || null;
  // The engagement lens. Analysis reasons from the commission, not just the
  // evidence. Null on projects commissioned before the lens existed, in which
  // case synthesis degrades to reasoning from the research question alone.
  const lens = serialiseLens(
    researchQuestion,
    (proj?.engagement_context as EngagementContext | null) ?? null,
    (proj?.brief as Brief | null) ?? null,
  );
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

  // Group by CANONICAL aspect key, so near-duplicate labels contribute to one
  // knowledge object instead of fragmenting into thin sections that then fall
  // below MIN_EVIDENCE_PER_ASPECT and vanish. Display label = the most common
  // original spelling, so canonicalisation never changes what the reader sees.
  const byAspect = new Map<string, { label: string; labels: Map<string, number>; items: Evidence[] }>();
  for (const e of evidence) {
    const key = canonicalAspectKey(e.aspect);
    if (!key) continue;
    const entry = byAspect.get(key) ?? { label: e.aspect, labels: new Map<string, number>(), items: [] };
    entry.items.push(e);
    entry.labels.set(e.aspect, (entry.labels.get(e.aspect) ?? 0) + 1);
    byAspect.set(key, entry);
  }
  for (const entry of byAspect.values()) {
    entry.label = Array.from(entry.labels.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }

  // Rank by CONTRIBUTION TO THE RESEARCH QUESTION, not by volume: an aspect
  // earns its section because it materially helps answer the question, not
  // because it is the loudest theme in the evidence.
  const ranked = Array.from(byAspect.values())
    .filter(a => a.items.length >= MIN_EVIDENCE_PER_ASPECT)
    .sort((a, b) => aspectContribution(b.items) - aspectContribution(a.items));

  if (ranked.length === 0) {
    throw new IntelligenceError(422, `Not enough classified evidence per aspect to synthesise yet (need at least ${MIN_EVIDENCE_PER_ASPECT} relevant evidence items sharing a research aspect). Collect or attach more, then synthesise.`);
  }

  const selected = ranked.slice(0, MAX_ASPECTS);
  const aspects = await Promise.all(selected.map(a => synthesiseAspect(a.label, lens, a.items)));

  const omitted = ranked.length - selected.length;
  return {
    aspects: aspects.filter(a => a.summary || a.key_findings.length > 0),
    generated_at: new Date().toISOString(),
    evidence_total: evidence.length,
    aspects_found: byAspect.size,
    omitted_note: omitted > 0 ? `${omitted} smaller aspect${omitted === 1 ? "" : "s"} with less evidence ${omitted === 1 ? "is" : "are"} rolled into the project Key Findings rather than shown as ${omitted === 1 ? "its own section" : "their own sections"}.` : null,
  };
}
