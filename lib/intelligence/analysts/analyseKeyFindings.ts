// Key Findings — deliberately NOT another narrative report. Sits above
// Survey/Conversation/Document Intelligence in the Workspace's Intelligence
// section: a flat, downloadable list of plain, attributable facts pulled
// from every eligible attached source, with zero interpretation layered on
// top. Two kinds of finding:
//   "direct"   — one real percentage/count/fact read straight off the
//                 source, computed in code (Survey/Conversation) or
//                 carried through unchanged from an already-validated
//                 upstream analysis (Document), never freely re-typed by
//                 a model here.
//   "combined" — 2+ genuinely related data points from the SAME
//                 question/breakdown, summed into one stat (Survey/
//                 Conversation only — Document findings are already
//                 whatever granularity the Library analysis settled on,
//                 nothing to combine further here). The model is asked
//                 ONLY to pick which options/topics/markets belong
//                 together (a semantic judgement call it's actually good
//                 at) — every combined percentage is then computed here,
//                 in code, from the real underlying counts, never typed
//                 out by the model itself. An earlier version asked the
//                 model to state the combined number directly; live
//                 validation caught it silently reusing one source's
//                 percentage instead of correctly combining two
//                 different-sized groups (e.g. claiming "92%" for a
//                 92%-and-77% pairing) — LLM arithmetic across
//                 differently-sized samples isn't reliable enough for a
//                 feature whose entire point is "trustworthy facts."
//
// Source aggregation is a pluggable dispatch table (KEY_FINDINGS_COLLECTORS
// below), keyed by EvidenceTypeId — adding a new Research Source type that
// should contribute Key Findings is one new collector function and one new
// map entry, never a change to analyseKeyFindings() itself. Survey and
// Conversation Search read live, raw data and compute facts in code (see
// the "direct"/"combined" split above); Document is structurally
// different — it never re-reads the source PDF or raw chunks, it reads
// the already-approved, already-validated project-specific Document
// Intelligence (analyseDocumentForProject.ts's output), carrying its
// key_findings/statistics through verbatim, provenance included, the same
// "derived, not freeform" discipline as everywhere else Document evidence
// is consumed.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { getSummary } from "@/lib/intelligence/store";
import { IntelligenceError } from "@/lib/intelligence/types";
import type { LocalisedQuestion } from "@/lib/survey-locale";
import type { EvidenceTypeId } from "@/lib/research-sources/registry";
import type { DocumentIntelligenceReport } from "@/lib/intelligence/analysts/analyseDocumentForProject";
import type { ProvenanceRef } from "@/lib/library-documents/analysis-schema";

export type KeyFinding = {
  source:       EvidenceTypeId;
  source_label: string;
  kind:         "direct" | "combined";
  text:         string;
  /** Page/chunk-level citation — only ever present for source types with
   * a real provenance concept (Document today). Survey/Conversation
   * findings are freshly computed from raw data on every generation and
   * have no equivalent citation to carry. */
  provenance?:  ProvenanceRef[];
};

export type KeyFindingsReport = {
  findings:     KeyFinding[];
  generated_at: string;
};

// Same floor Survey Intelligence already uses (analyseSurvey.ts) — a
// bare percentage is exactly as unreliable below this sample size as a
// narrative claim would be, so it earns the same bar, not a lighter one
// just because there's no prose around it.
const MIN_SURVEY_RESPONSES = 50;
// A finding naming a specific topic/market needs enough mentions behind
// it to not be "100% of 1 mention" — Conversation Intelligence itself
// has no such floor (only "> 0"), so this is scoped to individual
// finding buckets, not a gate on generating at all.
const MIN_BUCKET_COUNT = 5;
// Notable-option floor for direct survey findings — options below this
// share are real but not "key," so they're left out rather than
// producing a long tail of near-noise facts.
const NOTABLE_OPTION_PCT = 15;

const GROUPING_RULES = `
RULES, read carefully:
- Your only job is to pick which items belong together. Do not state a percentage, do not do any arithmetic, do not write a sentence, the combined number is computed separately from the raw data, not from anything you say here.
- Only group items from the exact same question or the exact same breakdown, never mix different questions, or topics with markets.
- Never propose a group of every option/item in a breakdown, that's meaningless. Only genuinely related subsets.
- Return at most 5 groups. If nothing genuinely groups together, return an empty array, do not force it.`;

async function findingsForSurvey(surveyId: string): Promise<KeyFinding[]> {
  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select("name, questions, is_simulated")
    .eq("id", surveyId)
    .single();
  if (!survey) return [];

  const { data: responses } = await supabaseAdmin
    .from("responses")
    .select("q1, q2, q3")
    .eq("survey_id", surveyId)
    .eq("is_demo", survey.is_simulated);

  const all = responses ?? [];
  if (all.length < MIN_SURVEY_RESPONSES) return [];

  const questions = ((survey.questions ?? []) as LocalisedQuestion[]).slice(0, 3);
  const questionKeys = ["q1", "q2", "q3"] as const;

  function resolveLabel(question: LocalisedQuestion | undefined, raw: string | null): string | null {
    if (!question || raw == null || raw === "") return null;
    const option = question.options.find(o => o.id === Number(raw));
    return option?.text.en ?? raw;
  }

  const tallied = questions.map((q, i) => {
    if (!q) return null;
    const counts: Record<string, number> = {};
    let answered = 0;
    for (const r of all) {
      const label = resolveLabel(q, r[questionKeys[i]] as string | null);
      if (!label) continue;
      counts[label] = (counts[label] ?? 0) + 1;
      answered++;
    }
    const options = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: answered ? Math.round((count / answered) * 100) : 0 }));
    return { text: q.text.en ?? `Question ${i + 1}`, options };
  }).filter((q): q is { text: string; options: { label: string; count: number; pct: number }[] } => q !== null);

  const direct: KeyFinding[] = [];
  for (const q of tallied) {
    for (const o of q.options.filter(o => o.pct >= NOTABLE_OPTION_PCT).slice(0, 4)) {
      direct.push({
        source: "survey", source_label: survey.name, kind: "direct",
        text: `${o.pct}% of respondents said "${o.label}" for "${q.text}".`,
      });
    }
  }

  const combinable = tallied.filter(q => q.options.length >= 2);
  let combined: KeyFinding[] = [];
  if (combinable.length > 0) {
    const prompt = `You are given the option breakdown for each question in a fan survey (indexed from 0). Identify any groups of 2 or more options WITHIN THE SAME QUESTION that share an underlying meaning (e.g. several options that all lean toward acceptance, or several that all lean toward concern) and are not already the single largest option on their own.
${GROUPING_RULES}

DATA
${combinable.map((q, i) => `Question ${i}: "${q.text}"\n${q.options.map(o => `- "${o.label}": ${o.pct}%`).join("\n")}`).join("\n\n")}

Return ONLY valid JSON: { "groups": [ { "question_index": 0, "option_labels": ["...", "..."] } ] }`;
    try {
      const result = await completeJSON<{ groups: { question_index: number; option_labels: string[] }[] }>({ prompt, model: "gpt-4o", temperature: 0.2, maxTokens: 500 });
      for (const g of result.groups ?? []) {
        const q = combinable[g.question_index];
        if (!q) continue;
        const matched = q.options.filter(o => g.option_labels.includes(o.label));
        if (matched.length < 2) continue;
        // Every option in a question shares the same "answered" base, so
        // summing counts (not the model's stated percentages) is valid
        // arithmetic, computed here rather than trusted from the prompt.
        const totalAnswered = q.options.reduce((s, o) => s + o.count, 0);
        const matchedCount  = matched.reduce((s, o) => s + o.count, 0);
        const pct = totalAnswered ? Math.round((matchedCount / totalAnswered) * 100) : 0;
        // Counts, not each option's independently-rounded percentage, so
        // the parenthetical always sums to exactly matchedCount — three
        // percentages that individually round to 25/24/21 can total 70
        // while the true combined figure rounds to 71, which reads as a
        // typo even though neither number is wrong. Counts can't do that.
        const breakdown = matched.map(o => `${o.count}`).join(" + ");
        combined.push({
          source: "survey", source_label: survey.name, kind: "combined",
          text: `${pct}% of respondents chose ${matched.map(o => `"${o.label}"`).join(", ")} for "${q.text}" (${breakdown} of ${totalAnswered} respondents).`,
        });
      }
    } catch {
      combined = []; // a failed combined-findings call is never fatal to the direct findings already computed
    }
  }

  return [...direct, ...combined];
}

async function findingsForSearch(searchId: string): Promise<KeyFinding[]> {
  const { data: search } = await supabaseAdmin.from("social_searches").select("name, is_simulated").eq("id", searchId).single();
  if (!search) return [];

  const { data: mentions } = await supabaseAdmin
    .from("social_mentions")
    .select("sentiment, topic, market")
    .eq("search_id", searchId)
    .not("sentiment", "is", null)
    .neq("import_source", "synthetic");

  const all = mentions ?? [];
  if (all.length === 0) return [];

  function bucketStats(field: "topic" | "market"): { key: string; count: number; positive_pct: number; negative_pct: number }[] {
    const keys = [...new Set(all.map(m => m[field]).filter(Boolean))] as string[];
    return keys.map(key => {
      const bucket = all.filter(m => m[field] === key);
      const pos = bucket.filter(m => m.sentiment === "Positive").length;
      const neg = bucket.filter(m => m.sentiment === "Negative").length;
      return { key, count: bucket.length, positive_pct: Math.round((pos / bucket.length) * 100), negative_pct: Math.round((neg / bucket.length) * 100) };
    }).filter(b => b.count >= MIN_BUCKET_COUNT).sort((a, b) => b.count - a.count);
  }

  const byTopic = bucketStats("topic");
  const byMarket = bucketStats("market");

  const direct: KeyFinding[] = [];
  for (const t of byTopic.slice(0, 6)) {
    if (t.positive_pct >= NOTABLE_OPTION_PCT) direct.push({ source: "social_search", source_label: search.name, kind: "direct", text: `${t.positive_pct}% of mentions about ${t.key} were positive.` });
    if (t.negative_pct >= NOTABLE_OPTION_PCT) direct.push({ source: "social_search", source_label: search.name, kind: "direct", text: `${t.negative_pct}% of mentions about ${t.key} were negative.` });
  }
  for (const m of byMarket.slice(0, 6)) {
    if (m.positive_pct >= NOTABLE_OPTION_PCT) direct.push({ source: "social_search", source_label: search.name, kind: "direct", text: `${m.positive_pct}% of mentions from ${m.key} were positive.` });
    if (m.negative_pct >= NOTABLE_OPTION_PCT) direct.push({ source: "social_search", source_label: search.name, kind: "direct", text: `${m.negative_pct}% of mentions from ${m.key} were negative.` });
  }

  let combined: KeyFinding[] = [];
  if (byTopic.length >= 2 || byMarket.length >= 2) {
    const prompt = `You are given sentiment breakdowns for a social conversation search, by topic and by market. Identify any groups of 2 or more topics OR 2 or more markets (never mixing topics with markets) that share a notable pattern worth combining into one summary stat (e.g. two topics that are both strongly positive).
${GROUPING_RULES}

DATA
By topic:
${byTopic.map(t => `- ${t.key}: ${t.count} mentions, ${t.positive_pct}% positive, ${t.negative_pct}% negative`).join("\n")}

By market:
${byMarket.map(m => `- ${m.key}: ${m.count} mentions, ${m.positive_pct}% positive, ${m.negative_pct}% negative`).join("\n")}

Return ONLY valid JSON: { "groups": [ { "dimension": "topic", "keys": ["...", "..."] } ] }, "dimension" is either "topic" or "market".`;
    try {
      const result = await completeJSON<{ groups: { dimension: "topic" | "market"; keys: string[] }[] }>({ prompt, model: "gpt-4o", temperature: 0.2, maxTokens: 500 });
      for (const g of result.groups ?? []) {
        if (g.dimension !== "topic" && g.dimension !== "market") continue;
        if ((g.keys ?? []).length < 2) continue;
        // Recomputed from the real mentions in the combined group, never
        // averaged or added from the two source percentages — a market
        // at 93% and one at 77% can't be validly stated as either number
        // for their union, only a fresh count over the actual union.
        const field = g.dimension;
        const union = all.filter(m => g.keys.includes(m[field] as string));
        if (union.length < MIN_BUCKET_COUNT) continue;
        const pos = union.filter(m => m.sentiment === "Positive").length;
        const pct = Math.round((pos / union.length) * 100);
        const noun = g.dimension === "market" ? "from" : "about";
        combined.push({
          source: "social_search", source_label: search.name, kind: "combined",
          text: `${pct}% of mentions ${noun} ${g.keys.join(" and ")} were positive (${union.length} combined mentions).`,
        });
      }
    } catch {
      combined = [];
    }
  }

  return [...direct, ...combined];
}

/** Document — reads the already-approved, project-specific Document
 * Intelligence (analyseDocumentForProject.ts's output), never the source
 * PDF or raw chunks again. Its own key_findings/statistics are already
 * the full, provenance-tracked evidence pool (reordered by relevance to
 * this project's Research Question, never filtered — see that file's
 * header comment), so this carries them through verbatim: same text,
 * same provenance, "kind: direct" since there's no further combining to
 * do here. Silently contributes nothing if Document Intelligence for this
 * attachment hasn't been generated/approved yet — same "not enough data
 * yet, no error, just fewer findings" convention findingsForSurvey/
 * findingsForSearch already use. `evidenceRowId` (research_project_evidence.id)
 * is required, not evidenceId (library_documents.id) — Document
 * Intelligence's own source_id is the evidence row's id (migration 102). */
async function findingsForDocument(_evidenceId: string, evidenceRowId: string): Promise<KeyFinding[]> {
  const summary = await getSummary<DocumentIntelligenceReport>("document_project", evidenceRowId, "research_summary");
  if (!summary || (summary.status !== "approved" && summary.status !== "published")) return [];

  const content = summary.edited_content ?? summary.content;
  const sourceLabel = content.document_summary.title;

  const findings: KeyFinding[] = content.key_findings.map(f => ({
    source: "document", source_label: sourceLabel, kind: "direct",
    text: f.text, provenance: f.provenance,
  }));
  const statistics: KeyFinding[] = content.statistics.map(s => ({
    source: "document", source_label: sourceLabel, kind: "direct",
    text: s.value ? `${s.value}: ${s.text}` : s.text, provenance: s.provenance,
  }));

  return [...findings, ...statistics];
}

/** One collector per eligible EvidenceTypeId — the only place a new
 * Research Source type needs to be added for it to start contributing Key
 * Findings. analyseKeyFindings() itself never branches on evidence_type. */
const KEY_FINDINGS_COLLECTORS: Partial<Record<EvidenceTypeId, (evidenceId: string, evidenceRowId: string) => Promise<KeyFinding[]>>> = {
  survey: (evidenceId) => findingsForSurvey(evidenceId),
  social_search: (evidenceId) => findingsForSearch(evidenceId),
  document: findingsForDocument,
};

export async function analyseKeyFindings(researchProjectId: string): Promise<KeyFindingsReport> {
  const { data: evidenceRows } = await supabaseAdmin
    .from("research_project_evidence")
    .select("id, evidence_type, evidence_id")
    .eq("research_project_id", researchProjectId);

  const rows = (evidenceRows ?? []) as { id: string; evidence_type: string; evidence_id: string }[];
  const relevant = rows.filter(
    (e): e is { id: string; evidence_type: EvidenceTypeId; evidence_id: string } => e.evidence_type in KEY_FINDINGS_COLLECTORS
  );

  if (relevant.length === 0) {
    throw new IntelligenceError(400, "No Research Sources attached to this project yet.");
  }

  const findings: KeyFinding[] = [];
  for (const row of relevant) {
    const collector = KEY_FINDINGS_COLLECTORS[row.evidence_type]!;
    findings.push(...await collector(row.evidence_id, row.id));
  }

  if (findings.length === 0) {
    throw new IntelligenceError(400, "Not enough data yet to produce Key Findings, attach a survey with at least 50 responses, a conversation search with classified mentions, or a document with approved Document Intelligence.");
  }

  return { findings, generated_at: new Date().toISOString() };
}
