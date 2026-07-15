// Reusable analyst: turns a Survey's raw responses into a structured,
// client-ready intelligence report — the survey-side counterpart to
// analyseConversation.ts, same shape (fetch context → aggregate → build
// prompt → completeJSON() → return typed report), same "pure generation
// only, never persists" contract.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { completeJSON } from "@/lib/intelligence/openai";
import { IntelligenceError } from "@/lib/intelligence/types";
import { clampReferences } from "@/lib/intelligence/validate-references";
import type { LocalisedQuestion } from "@/lib/survey-locale";
import type { StructuredEvidenceBlock } from "@/lib/intelligence/structured-evidence";

// Below this, a synthesized narrative claim reads as more authoritative
// than the evidence supports — worst-case (p=0.5) 95% margin of error is
// ~14% at n=50 vs ~18% at the app's existing "Medium confidence" floor
// (app/components/InsightsEngine.tsx uses n>=30). Chosen deliberately
// higher than that existing floor: a generated narrative is a heavier
// claim than a single flagged statistic, so it earns a stronger bar.
const MIN_RESPONSES = 50;

export type SurveyIntelligenceReport = {
  headline:            string;
  executive_summary:   string;
  key_findings:        string[];
  notable_differences: { finding: string; segments: string[] }[];
  recommended_actions: {
    action: string;
    rationale: string;
    /** AI-tagged 0-based indices into key_findings — same evidence-to-action
     * trace Executive Report recommendations already carry. A recommendation
     * with no finding behind it doesn't belong in this report. */
    based_on_findings: number[];
  }[];
  generated_at:        string;
  response_count:      number;
  // Computed directly from the response rows, never model-generated —
  // "where did this evidence actually come from," not an LLM's own
  // account of it. Stored on the report so it stays accurate to the
  // exact data this specific generation ran against, even if the
  // survey's campaigns/publishers change later.
  sources_summary: {
    publishers:  string[];               // top publisher names, most responses first
    countries:   string[];               // top country names, most responses first
    date_range:  { from: string; to: string } | null;
  };
  /** Exact, frozen quantitative data exposed through the shared
   * lib/intelligence/structured-evidence.ts contract — for downstream
   * exact-statistic citation and charting (Editorial Article today)
   * without a consumer needing to know this survey's own aggregation
   * logic. See that file's header for why the shape is deliberately flat. */
  structured_evidence: StructuredEvidenceBlock[];
};

type QuestionSummary = { text: string; options: { label: string; count: number; pct: number }[] };
type GroupCount       = { label: string; count: number };
type CountryBreakdown = { country: string; options: { label: string; pct: number }[] };

function buildSurveyPrompt(
  survey: { name: string; topic: string | null; study_type: string },
  summary: {
    total: number;
    questions: QuestionSummary[];
    byCountry: GroupCount[];
    byFanSegment: GroupCount[];
    byPublisher: GroupCount[];
    countryBreakdown: CountryBreakdown[];
  }
): string {
  return `You are a senior football fan intelligence analyst at Fanometrix. You are writing a client-ready intelligence report for a brand, club or agency based on survey responses.

Survey: "${survey.name}"
Topic: ${survey.topic ?? "General fan research"}
Study type: ${survey.study_type}

DATA SUMMARY
Total responses analysed: ${summary.total}

${summary.questions.map((q, i) => `Question ${i + 1}: "${q.text}"\n${q.options.map(o => `- ${o.label}: ${o.count} (${o.pct}%)`).join("\n")}`).join("\n\n")}

By Country:
${summary.byCountry.map(c => `- ${c.label}: ${c.count} responses`).join("\n") || "- (not recorded)"}

By Fan Segment:
${summary.byFanSegment.map(f => `- ${f.label}: ${f.count} responses`).join("\n") || "- (not recorded)"}

By Publisher:
${summary.byPublisher.map(p => `- ${p.label}: ${p.count} responses`).join("\n") || "- (not recorded)"}

Question 1 answer breakdown by country:
${summary.countryBreakdown.map(cb => `${cb.country}: ${cb.options.map(o => `${o.label} ${o.pct}%`).join(", ")}`).join("\n") || "- (not enough country spread)"}

YOUR TASK:
Write a structured intelligence report. Use polished, senior, client-ready language suitable for presentation to a major brand, agency, publisher or rights holder. Ground every finding in the actual data above — cite the specific percentage or count that supports it, never a bare qualitative claim with no number behind it.

Each field has a distinct job, do not blur them together:
- "key_findings" is the evidence itself, what the data shows.
- "notable_differences" is a segment/market contrast, only include it if it adds a comparison not already stated in key_findings, do not restate a key finding with a segment tag attached.
- "recommended_actions" is what the client should do about it, every action must cite "based_on_findings", the 0-based index/indices into key_findings that justify it. Do not invent a recommendation that has no finding behind it.

EVIDENCE SPECIFICITY, non-negotiable — the options above are what respondents actually chose between, nothing more specific than that:
- Every recommendation must pass a test before it can name a specific execution (a particular initiative, format or programme): does the data above show respondents actually chose or responded to that specific thing, not just a broader option? If yes, name it, and say so plainly in the rationale. If the data only shows a broader option, a problem or an opportunity (e.g. respondents favour "matchday experiences" as an option, or dislike is high in one country) without establishing what specific execution would work, do not invent one, recommend that the client investigate, test or validate specific approaches instead. A specific recommendation is valuable and encouraged when the evidence genuinely supports it, this rule exists to stop invented specificity, not to make every recommendation vague.
- Every percentage above is scoped to the exact question and option it was computed for, or, for Question 1, to the specific country in "answer breakdown by country" if you're citing that. "By Fan Segment" and "By Publisher" are response counts only, with no percentage broken out for them. Never attach a question's overall percentage to a specific segment, publisher or country as if it were measured for that narrower group, unless that group's own percentage is what's actually shown above (e.g. the per-country breakdown for Question 1).
- "By Country", "By Fan Segment" and "By Publisher" show how many responses came from each group, that is sample composition, not evidence of audience size, popularity or value. Never describe the group with the most responses as "most popular", "most valuable" or a "priority" audience/segment/publisher on response count alone, more responses from a group only means more of that group happened to answer this survey. A popularity, value or priority claim must come from what that group actually said (its own percentages), never from how many of them are in the sample.

Return ONLY valid JSON:
{
  "headline": "One punchy, specific headline summarising the most important finding (max 15 words)",
  "executive_summary": "2-3 sentences. The single most important story in this data. What does this mean for the client?",
  "key_findings": [
    "3-5 specific findings, each citing the real percentage or count it's based on. E.g. '68% of fans favoured matchday experiences over digital content (vs. 22% for app features), suggesting investment in physical activations will outperform app features.'"
  ],
  "notable_differences": [
    {
      "finding": "A specific, actionable difference between segments, markets, fan segments or publishers, not already covered in key_findings. E.g. 'Indian fans significantly prioritise streaming access over UK fans, who focus on matchday experience.'",
      "segments": ["IN", "GB"]
    }
  ],
  "recommended_actions": [
    {
      "action": "A specific action if the data directly supports one, otherwise a recommendation to investigate, test or validate specific approaches",
      "rationale": "Why, based on the data",
      "based_on_findings": [0, 2]
    }
  ]
}

Write as a senior analyst. Be specific, insightful and commercially relevant. Never write generic observations.`;
}

export async function analyseSurvey(surveyId: string): Promise<SurveyIntelligenceReport> {
  const { data: survey } = await supabaseAdmin
    .from("surveys")
    .select("name, topic, study_type, questions, is_simulated")
    .eq("id", surveyId)
    .single();

  if (!survey) throw new IntelligenceError(404, "Survey not found");

  // is_demo is overloaded: for a REAL survey it means "test/QA noise,
  // exclude it" (the Phase 0 fix). For a SIMULATED survey, every
  // legitimate response is is_demo=true by design (migration 084's
  // asymmetric trigger requires it) — filtering those out would leave a
  // simulated survey with zero analysable evidence. The two survey
  // types need opposite filters on the same column, not the same one.
  const { data: responses } = await supabaseAdmin
    .from("responses")
    .select("q1, q2, q3, country, fan_segment, publisher, created_at")
    .eq("survey_id", surveyId)
    .eq("is_demo", survey.is_simulated);

  const all = responses ?? [];
  if (all.length < MIN_RESPONSES) {
    throw new IntelligenceError(
      400,
      `At least ${MIN_RESPONSES} responses are required for a reliable summary (${all.length} collected so far).`
    );
  }

  // Questions are stored as one JSONB array on the survey; responses store
  // each answer as the selected option's stable numeric id (not its text),
  // positionally against q1/q2/q3 — resolve id -> English option label.
  const questions = ((survey.questions ?? []) as LocalisedQuestion[]).slice(0, 3);

  function resolveLabel(question: LocalisedQuestion | undefined, raw: string | null): string | null {
    if (!question || raw == null || raw === "") return null;
    const optionId = Number(raw);
    const option = question.options.find(o => o.id === optionId);
    return option?.text.en ?? raw;
  }

  function tallyQuestion(question: LocalisedQuestion | undefined, key: "q1" | "q2" | "q3"): QuestionSummary | null {
    if (!question) return null;
    const counts: Record<string, number> = {};
    let answered = 0;
    for (const r of all) {
      const label = resolveLabel(question, r[key] as string | null);
      if (!label) continue;
      counts[label] = (counts[label] ?? 0) + 1;
      answered++;
    }
    const options = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ label, count, pct: answered ? Math.round((count / answered) * 100) : 0 }));
    return { text: question.text.en ?? "", options };
  }

  const questionKeys = ["q1", "q2", "q3"] as const;
  const questionSummaries = questions
    .map((q, i) => tallyQuestion(q, questionKeys[i]))
    .filter((q): q is QuestionSummary => q !== null);

  function tallyGroup(field: "country" | "fan_segment" | "publisher"): GroupCount[] {
    const counts: Record<string, number> = {};
    for (const r of all) {
      const v = r[field] as string | null;
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, count]) => ({ label, count }));
  }

  const byCountry    = tallyGroup("country");
  const byFanSegment = tallyGroup("fan_segment");
  const byPublisher  = tallyGroup("publisher");

  // First question's answer distribution split by country gives the model
  // concrete cross-tab data to write "notable differences" from —
  // mirrors analyseConversation's per-market sentiment breakdown.
  const firstQuestion = questions[0];
  const countryBreakdown: CountryBreakdown[] = firstQuestion
    ? byCountry.slice(0, 4).map(({ label: country }) => {
        const countryResponses = all.filter(r => r.country === country);
        const counts: Record<string, number> = {};
        let answered = 0;
        for (const r of countryResponses) {
          const label = resolveLabel(firstQuestion, r.q1 as string | null);
          if (!label) continue;
          counts[label] = (counts[label] ?? 0) + 1;
          answered++;
        }
        const options = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([label, count]) => ({ label, pct: answered ? Math.round((count / answered) * 100) : 0 }));
        return { country, options };
      })
    : [];

  const summary = {
    total: all.length,
    questions: questionSummaries,
    byCountry, byFanSegment, byPublisher,
    countryBreakdown,
  };

  const report = await completeJSON<Omit<SurveyIntelligenceReport, "generated_at" | "response_count" | "sources_summary" | "structured_evidence">>({
    prompt: buildSurveyPrompt(
      { name: survey.name, topic: survey.topic, study_type: survey.study_type },
      summary
    ),
    model:       "gpt-4o",
    temperature: 0.3,
    maxTokens:   2048,
  });

  const dates = all.map(r => r.created_at as string).filter(Boolean).sort();
  const sourcesSummary = {
    publishers: byPublisher.map(p => p.label),
    countries:  byCountry.map(c => c.label),
    date_range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
  };

  // Reshapes numbers already computed above (never re-derived, never
  // model-generated) into the shared structured-evidence contract — this
  // is the "smallest correct implementation" for downstream exact-statistic
  // reuse: freeze what's already sitting in memory instead of discarding it.
  const structured_evidence: StructuredEvidenceBlock[] = [
    ...questionSummaries.map((q, i): StructuredEvidenceBlock => ({
      id:                    `q${i + 1}`,
      source_type:           "survey",
      source_id:             surveyId,
      source_label:          survey.name,
      title:                 q.text,
      unit:                  "percent",
      suggested_chart_type:  "pie",
      series:                q.options.map(o => ({ label: o.label, value: o.pct })),
    })),
    ...countryBreakdown.map((cb): StructuredEvidenceBlock => ({
      id:                    `q1_by_${cb.country}`,
      source_type:           "survey",
      source_id:             surveyId,
      source_label:          survey.name,
      title:                 firstQuestion?.text.en ?? "Question 1",
      subtitle:              "By country",
      scope:                 cb.country,
      unit:                  "percent",
      suggested_chart_type:  "bar",
      series:                cb.options.map(o => ({ label: o.label, value: o.pct })),
    })),
    ...(byCountry.length ? [{
      id:                    "responses_by_country",
      source_type:           "survey" as const,
      source_id:             surveyId,
      source_label:          survey.name,
      title:                 "Responses by country",
      unit:                  "count" as const,
      suggested_chart_type:  "bar" as const,
      series:                byCountry.map(c => ({ label: c.label, value: c.count })),
    }] : []),
  ];

  // A hallucinated or out-of-range based_on_findings index must never
  // reach storage or the screen as if it were real evidence.
  const recommended_actions = report.recommended_actions.map(a => ({
    ...a,
    based_on_findings: clampReferences(a.based_on_findings, report.key_findings.length),
  }));

  return {
    ...report,
    recommended_actions,
    generated_at: new Date().toISOString(),
    response_count: all.length,
    sources_summary: sourcesSummary,
    structured_evidence,
  };
}
